#!/usr/bin/env python3
"""
crawl_water_quality.py
======================
Downloads water quality observations from the EA API for all sampling
points in your existing point_tiles GeoJSON files.

Reads sampling point notations from public/data/point_tiles/*.geojson,
then fetches all observations for each point from the EA API, filtering
to key determinands. Saves raw data as one CSV per sampling point.

This is designed to run overnight for a full historical download (~10-15
hours for all points, all years). It saves progress as it goes, so you
can safely interrupt and resume — it skips points that already have data.

Requirements:
    pip install requests

Usage:
    # Full download (all points, all history)
    python crawl_water_quality.py --tiles-dir ./public/data/point_tiles

    # Test with a small number of points first
    python crawl_water_quality.py --tiles-dir ./public/data/point_tiles --max-points 50

    # Resume after interruption (skips already-downloaded points)
    python crawl_water_quality.py --tiles-dir ./public/data/point_tiles

    # Only surface water points
    python crawl_water_quality.py --tiles-dir ./public/data/point_tiles --surface-only

    # Custom output directory
    python crawl_water_quality.py --tiles-dir ./public/data/point_tiles -o ./data/raw_observations

    # Adjust request rate (default: 3 per second)
    python crawl_water_quality.py --tiles-dir ./public/data/point_tiles --rate 2
"""

import argparse
import csv
import json
import os
import sys
import time
import glob
from datetime import datetime, timedelta

try:
    import requests
except ImportError:
    print("ERROR: requests is required. Install with: pip install requests")
    sys.exit(1)


# ======================================================================
# CONFIGURATION
# ======================================================================

EA_API_BASE = "https://environment.data.gov.uk/water-quality/sampling-point"
PAGE_LIMIT = 250

# Key determinand notations we care about
KEY_DETERMINANDS = {
    "0076",  # Temperature
    "0117",  # Nitrate as N
    "0135",  # Suspended Solids at 105C
    "0111",  # Ammoniacal Nitrogen as N
    "9901",  # Dissolved Oxygen % saturation
    "0180",  # Orthophosphate, reactive as P
    "0085",  # BOD 5 Day ATU
    "0061",  # pH
    "0101",  # Conductivity at 25C
    "0062",  # Suspended Solids (alternative code)
    "0116",  # Nitrogen, Total Oxidised as N
}

# CSV output columns
CSV_COLUMNS = [
    "notation",
    "sample_date",
    "determinand_notation",
    "determinand_label",
    "result",
    "result_qualifier",
    "unit",
    "material_type",
]


def load_sampling_points(tiles_dir, surface_only=False):
    """Load all sampling point notations from the tile GeoJSON files."""
    points = []
    tile_files = glob.glob(os.path.join(tiles_dir, "points_*.geojson"))

    if not tile_files:
        print(f"ERROR: No point tile files found in {tiles_dir}")
        print(f"  Expected files like points_52_-2.geojson")
        sys.exit(1)

    for tile_file in sorted(tile_files):
        with open(tile_file, "r") as f:
            data = json.load(f)

        for feature in data.get("features", []):
            props = feature.get("properties", {})
            notation = props.get("n")
            if not notation:
                continue

            # Filter to surface water types if requested
            if surface_only:
                point_type = (props.get("t") or "").upper()
                # Keep river/surface water types, skip groundwater/sewage
                surface_types = {"RIVER", "LAKE", "SURFACE", "CANAL", "STREAM",
                                "RIVER / RUNNING SURFACE WATER",
                                "LAKE / STANDING WATER"}
                if point_type and not any(st in point_type for st in surface_types):
                    continue

            points.append({
                "notation": notation,
                "label": props.get("l", ""),
                "type": props.get("t", ""),
                "status": props.get("s", ""),
            })

    return points


def fetch_observations(notation, rate_delay, verbose=True):
    """
    Fetch all observations for a sampling point from the EA API.
    Paginates through all results. Filters to key determinands.
    Returns list of observation dicts.
    """
    all_observations = []
    skip = 0
    total_items = None
    page = 0

    while True:
        url = f"{EA_API_BASE}/{notation}/observation"
        params = {
            "skip": skip,
            "limit": PAGE_LIMIT,
        }
        headers = {
            "accept": "application/ld+json",
            "API-Version": "1",
        }

        if verbose:
            print(f"    Fetching page {page + 1} (skip={skip})...", end="", flush=True)

        # Fetch with retries on transient failures (5xx, network errors).
        # Backoff schedule: 2s, 10s, 30s before giving up on this page.
        BACKOFFS = [2, 10, 30]
        data = None
        last_err = None
        for attempt in range(len(BACKOFFS) + 1):
            try:
                resp = requests.get(url, params=params, headers=headers, timeout=30)

                if resp.status_code == 404:
                    if verbose:
                        print(f" 404 — not found in API")
                    return []
                elif resp.status_code == 429:
                    print(f" RATE LIMITED, waiting 30s...")
                    time.sleep(30)
                    continue  # retry immediately, doesn't count against attempts
                elif resp.status_code >= 500:
                    last_err = f"server error {resp.status_code}"
                    if attempt < len(BACKOFFS):
                        wait = BACKOFFS[attempt]
                        print(f" {last_err}, retrying in {wait}s (attempt {attempt + 1}/{len(BACKOFFS)})...")
                        time.sleep(wait)
                        continue
                    else:
                        print(f" {last_err} — giving up on this page")
                        return all_observations

                resp.raise_for_status()
                data = resp.json()
                break

            except requests.exceptions.RequestException as e:
                last_err = str(e)
                if attempt < len(BACKOFFS):
                    wait = BACKOFFS[attempt]
                    print(f" network error ({last_err}), retrying in {wait}s...")
                    time.sleep(wait)
                    continue
                print(f" FAILED after {len(BACKOFFS) + 1} attempts: {last_err}")
                return all_observations

        if data is None:
            return all_observations

        # Get total count on first page
        if total_items is None:
            total_items = data.get("totalItems", 0)
            if verbose:
                print(f" {total_items} total observations", end="", flush=True)
            if total_items == 0:
                print()
                return []

        # Extract observations
        # New API uses SOSA ontology:
        #   observedProperty.notation           = determinand code
        #   observedProperty.prefLabel          = determinand label
        #   phenomenonTime                      = sample datetime
        #   hasResult.numericValue              = the value (plain readings)
        #   hasResult.upperBound                = the value (for "<X" below-LOD readings)
        #   hasResult.hasUnit.prefLabel         = unit label
        #   hasSimpleResult                     = fallback flat string, may include "<"/">" + unit
        #   hasSample.sampleMaterialType.prefLabel = material type
        items = data.get("member", data.get("items", []))
        kept = 0
        for item in items:
            det = item.get("observedProperty", {})
            det_notation = det.get("notation", "")

            if det_notation not in KEY_DETERMINANDS:
                continue

            # ---- Result + qualifier ----
            # Prefer structured hasResult (numericValue / upperBound).
            # Fall back to parsing hasSimpleResult for a leading "<" or ">".
            result = ""
            result_qualifier = ""
            unit = ""

            hr = item.get("hasResult")
            if isinstance(hr, dict):
                numeric = hr.get("numericValue")
                upper = hr.get("upperBound")
                if numeric is not None:
                    result = str(numeric)
                elif upper is not None:
                    result = str(upper)
                    result_qualifier = "<"

                unit_obj = hr.get("hasUnit")
                if isinstance(unit_obj, dict):
                    unit = (
                        unit_obj.get("altLabel")
                        or unit_obj.get("prefLabel")
                        or unit_obj.get("notation")
                        or ""
                    )
                elif isinstance(unit_obj, str):
                    unit = unit_obj

            # Fallback: flat hasSimpleResult string
            if result == "":
                raw = str(item.get("hasSimpleResult", "")).strip()
                if raw.startswith("<") or raw.startswith(">"):
                    result_qualifier = raw[0]
                    raw = raw[1:].strip()
                result = raw

            # Fallback for unit: top-level hasUnit (sometimes a string, sometimes a dict)
            if unit == "":
                top_unit = item.get("hasUnit", "")
                if isinstance(top_unit, dict):
                    unit = (
                        top_unit.get("altLabel")
                        or top_unit.get("prefLabel")
                        or top_unit.get("notation")
                        or ""
                    )
                elif isinstance(top_unit, str):
                    unit = top_unit

            # Skip rows with no usable result
            if result == "":
                continue

            # Get material type
            sample = item.get("hasSample", {})
            material_type = ""
            if isinstance(sample, dict):
                mat = sample.get("sampleMaterialType", {})
                if isinstance(mat, dict):
                    material_type = mat.get("prefLabel", "")

            obs = {
                "notation": notation,
                "sample_date": item.get("phenomenonTime", ""),
                "determinand_notation": det_notation,
                "determinand_label": det.get("prefLabel", det.get("altLabel", "")),
                "result": result,
                "result_qualifier": result_qualifier,
                "unit": unit,
                "material_type": material_type,
            }
            all_observations.append(obs)
            kept += 1

        if verbose:
            print(f" → {len(items)} items, {kept} kept")

        skip += PAGE_LIMIT
        page += 1

        if skip >= total_items:
            break

        time.sleep(rate_delay)

    return all_observations


def save_point_csv(observations, notation, output_dir):
    """Save observations for a single point as CSV."""
    filepath = os.path.join(output_dir, f"{notation}.csv")
    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(observations)
    return filepath


def main():
    parser = argparse.ArgumentParser(
        description="Download water quality observations from EA API"
    )
    parser.add_argument(
        "--tiles-dir",
        required=True,
        help="Path to public/data/point_tiles/ directory",
    )
    parser.add_argument(
        "-o", "--output-dir",
        default="./raw_observations",
        help="Output directory for CSV files. Default: ./raw_observations",
    )
    parser.add_argument(
        "--max-points",
        type=int,
        default=None,
        help="Limit number of points to download (for testing)",
    )
    parser.add_argument(
        "--surface-only",
        action="store_true",
        help="Only download surface water / river sampling points",
    )
    parser.add_argument(
        "--rate",
        type=float,
        default=3.0,
        help="Requests per second. Default: 3 (be polite to the EA API)",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        default=True,
        help="Skip points that already have downloaded data (default: True)",
    )
    args = parser.parse_args()

    rate_delay = 1.0 / args.rate
    os.makedirs(args.output_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Step 1: Load sampling points from tiles
    # ------------------------------------------------------------------
    print("Loading sampling points from tile files...")
    points = load_sampling_points(args.tiles_dir, args.surface_only)
    print(f"  Found {len(points):,} sampling points")

    if args.max_points:
        points = points[:args.max_points]
        print(f"  Limited to {len(points)} points (--max-points)")

    # ------------------------------------------------------------------
    # Step 2: Check what's already downloaded (for resume)
    # ------------------------------------------------------------------
    already_done = set()
    if args.resume:
        for f in os.listdir(args.output_dir):
            if f.endswith(".csv"):
                already_done.add(f.replace(".csv", ""))

    remaining = [p for p in points if p["notation"] not in already_done]
    print(f"  Already downloaded: {len(already_done):,}")
    print(f"  Remaining: {len(remaining):,}")

    if not remaining:
        print("\nAll points already downloaded! Nothing to do.")
        print(f"  Data is in: {args.output_dir}/")
        return

    # Estimate time
    # Rough estimate: average 3 pages per point, at rate_delay per page
    est_pages = len(remaining) * 3
    est_seconds = est_pages * rate_delay
    est_hours = est_seconds / 3600
    print(f"\n  Estimated time: {est_hours:.1f} hours")
    print(f"  (This is rough — actual time depends on data volume per point)")

    # ------------------------------------------------------------------
    # Step 3: Crawl
    # ------------------------------------------------------------------
    print(f"\n{'=' * 60}")
    print(f"Starting download at {datetime.now().strftime('%H:%M:%S')}")
    print(f"{'=' * 60}\n")

    stats = {
        "downloaded": 0,
        "skipped_empty": 0,
        "errors": 0,
        "total_observations": 0,
        "start_time": time.time(),
    }

    for i, point in enumerate(remaining):
        notation = point["notation"]
        progress = f"[{i + 1}/{len(remaining)}]"

        try:
            observations = fetch_observations(notation, rate_delay)

            if observations:
                save_point_csv(observations, notation, args.output_dir)
                stats["downloaded"] += 1
                stats["total_observations"] += len(observations)
                print(f"  {progress} {notation}: {len(observations)} observations")
            else:
                # Save empty file so we don't re-fetch on resume
                save_point_csv([], notation, args.output_dir)
                stats["skipped_empty"] += 1
                if (i + 1) % 100 == 0:
                    print(f"  {progress} {notation}: no key determinand data")

        except KeyboardInterrupt:
            print(f"\n\nInterrupted! Progress saved — run again to resume.")
            print(f"  Downloaded so far: {stats['downloaded']:,} points")
            print(f"  Total observations: {stats['total_observations']:,}")
            sys.exit(0)

        except Exception as e:
            stats["errors"] += 1
            print(f"  {progress} {notation}: ERROR — {e}")

        # Progress summary every 500 points
        if (i + 1) % 500 == 0:
            elapsed = time.time() - stats["start_time"]
            rate_actual = (i + 1) / elapsed * 3600
            remaining_est = (len(remaining) - i - 1) / (rate_actual / 3600) / 3600
            print(f"\n  --- Progress: {i + 1}/{len(remaining)} "
                  f"({stats['downloaded']:,} with data, "
                  f"{stats['skipped_empty']:,} empty, "
                  f"{stats['errors']:,} errors)")
            print(f"  --- Rate: {rate_actual:.0f} points/hour, "
                  f"~{remaining_est:.1f} hours remaining")
            print(f"  --- Total observations: {stats['total_observations']:,}\n")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    elapsed = time.time() - stats["start_time"]
    elapsed_str = str(timedelta(seconds=int(elapsed)))

    print(f"""
{'=' * 60}
DOWNLOAD COMPLETE
{'=' * 60}

  Time taken:        {elapsed_str}
  Points with data:  {stats['downloaded']:,}
  Points empty:      {stats['skipped_empty']:,}
  Errors:            {stats['errors']:,}
  Total observations:{stats['total_observations']:,}

  Output directory:  {args.output_dir}/

Next step: run the processing pipeline:
  python process_water_quality.py {args.output_dir}/ -o ./public/data/wq
""")

    # Save summary
    summary_path = os.path.join(args.output_dir, "_summary.json")
    with open(summary_path, "w") as f:
        json.dump({
            "completed_at": datetime.now().isoformat(),
            "elapsed_seconds": int(elapsed),
            "points_with_data": stats["downloaded"],
            "points_empty": stats["skipped_empty"],
            "errors": stats["errors"],
            "total_observations": stats["total_observations"],
        }, f, indent=2)


if __name__ == "__main__":
    main()