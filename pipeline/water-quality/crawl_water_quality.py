#!/usr/bin/env python3
"""
crawl_water_quality.py
======================
Downloads water quality observations from the EA API for all sampling
points in your existing point_tiles GeoJSON files.

Now with CONCURRENT requests for much faster downloads.

Requirements:
    pip install requests

Usage:
    # Full download with 5 concurrent workers (recommended)
    python crawl_water_quality.py --tiles-dir ./public/data/point_tiles --workers 5

    # More aggressive (watch for rate limiting)
    python crawl_water_quality.py --tiles-dir ./public/data/point_tiles --workers 10

    # Resume after interruption (automatic — skips existing CSVs)
    python crawl_water_quality.py --tiles-dir ./public/data/point_tiles --workers 5

    # Test with a few points first
    python crawl_water_quality.py --tiles-dir ./public/data/point_tiles --workers 5 --max-points 50
"""

import argparse
import csv
import json
import os
import sys
import time
import glob
import threading
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

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

# Thread-safe stats
stats_lock = threading.Lock()
stats = {
    "downloaded": 0,
    "skipped_empty": 0,
    "errors": 0,
    "total_observations": 0,
    "completed": 0,
}


def load_sampling_points(tiles_dir, surface_only=False):
    points = []
    tile_files = glob.glob(os.path.join(tiles_dir, "points_*.geojson"))

    if not tile_files:
        print(f"ERROR: No point tile files found in {tiles_dir}")
        sys.exit(1)

    for tile_file in sorted(tile_files):
        with open(tile_file, "r") as f:
            data = json.load(f)

        for feature in data.get("features", []):
            props = feature.get("properties", {})
            notation = props.get("n")
            if not notation:
                continue

            if surface_only:
                point_type = (props.get("t") or "").upper()
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


def fetch_observations(notation):
    all_observations = []
    skip = 0
    total_items = None

    while True:
        url = f"{EA_API_BASE}/{notation}/observation"
        params = {"skip": skip, "limit": PAGE_LIMIT}
        headers = {"accept": "application/ld+json", "API-Version": "1"}

        BACKOFFS = [2, 10, 30]
        data = None

        for attempt in range(len(BACKOFFS) + 1):
            try:
                resp = requests.get(url, params=params, headers=headers, timeout=30)

                if resp.status_code == 404:
                    return []
                elif resp.status_code == 429:
                    time.sleep(30)
                    continue
                elif resp.status_code >= 500:
                    if attempt < len(BACKOFFS):
                        time.sleep(BACKOFFS[attempt])
                        continue
                    else:
                        return all_observations

                resp.raise_for_status()
                data = resp.json()
                break

            except requests.exceptions.RequestException:
                if attempt < len(BACKOFFS):
                    time.sleep(BACKOFFS[attempt])
                    continue
                return all_observations

        if data is None:
            return all_observations

        if total_items is None:
            total_items = data.get("totalItems", 0)
            if total_items == 0:
                return []

        items = data.get("member", data.get("items", []))

        for item in items:
            det = item.get("observedProperty", {})
            det_notation = det.get("notation", "")

            if det_notation not in KEY_DETERMINANDS:
                continue

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
                    unit = (unit_obj.get("altLabel") or unit_obj.get("prefLabel")
                            or unit_obj.get("notation") or "")
                elif isinstance(unit_obj, str):
                    unit = unit_obj

            if result == "":
                raw = str(item.get("hasSimpleResult", "")).strip()
                if raw.startswith("<") or raw.startswith(">"):
                    result_qualifier = raw[0]
                    raw = raw[1:].strip()
                result = raw

            if unit == "":
                top_unit = item.get("hasUnit", "")
                if isinstance(top_unit, dict):
                    unit = (top_unit.get("altLabel") or top_unit.get("prefLabel")
                            or top_unit.get("notation") or "")
                elif isinstance(top_unit, str):
                    unit = top_unit

            if result == "":
                continue

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

        skip += PAGE_LIMIT
        if skip >= total_items:
            break

        time.sleep(0.05)

    return all_observations


def safe_filename(notation):
    """Sanitise notation for use as a filename — replace / with _."""
    return notation.replace("/", "_").replace("\\", "_")


def save_point_csv(observations, notation, output_dir):
    filepath = os.path.join(output_dir, f"{safe_filename(notation)}.csv")
    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(observations)


def process_point(point, output_dir, total_remaining):
    notation = point["notation"]

    try:
        observations = fetch_observations(notation)
        save_point_csv(observations, notation, output_dir)

        with stats_lock:
            stats["completed"] += 1
            completed = stats["completed"]

            if observations:
                stats["downloaded"] += 1
                stats["total_observations"] += len(observations)
                print(f"  [{completed}/{total_remaining}] {notation}: "
                      f"{len(observations)} observations")
            else:
                stats["skipped_empty"] += 1
                if completed % 100 == 0:
                    print(f"  [{completed}/{total_remaining}] (progress — "
                          f"{stats['downloaded']} with data, "
                          f"{stats['skipped_empty']} empty)")

    except Exception as e:
        with stats_lock:
            stats["errors"] += 1
            stats["completed"] += 1
            print(f"  [{stats['completed']}/{total_remaining}] {notation}: ERROR — {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Download water quality observations from EA API (concurrent)"
    )
    parser.add_argument(
        "--tiles-dir", required=True,
        help="Path to public/data/point_tiles/ directory",
    )
    parser.add_argument(
        "-o", "--output-dir", default="./raw_observations",
        help="Output directory for CSV files. Default: ./raw_observations",
    )
    parser.add_argument(
        "--max-points", type=int, default=None,
        help="Limit number of points to download (for testing)",
    )
    parser.add_argument(
        "--surface-only", action="store_true",
        help="Only download surface water / river sampling points",
    )
    parser.add_argument(
        "--workers", type=int, default=5,
        help="Number of concurrent download workers. Default: 5",
    )
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    print("Loading sampling points from tile files...")
    points = load_sampling_points(args.tiles_dir, args.surface_only)
    print(f"  Found {len(points):,} sampling points")

    if args.max_points:
        points = points[:args.max_points]
        print(f"  Limited to {len(points)} points (--max-points)")

    # Resume check — match sanitised filenames back to notations
    already_done = set()
    for f in os.listdir(args.output_dir):
        if f.endswith(".csv"):
            already_done.add(f.replace(".csv", ""))

    remaining = [p for p in points if safe_filename(p["notation"]) not in already_done]
    print(f"  Already downloaded: {len(already_done):,}")
    print(f"  Remaining: {len(remaining):,}")

    if not remaining:
        print("\nAll points already downloaded! Nothing to do.")
        return

    print(f"\n{'=' * 60}")
    print(f"Starting download at {datetime.now().strftime('%H:%M:%S')}")
    print(f"  Workers: {args.workers}")
    print(f"  Remaining points: {len(remaining):,}")
    print(f"{'=' * 60}\n")

    start_time = time.time()

    try:
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(process_point, point, args.output_dir, len(remaining)): point
                for point in remaining
            }

            for future in as_completed(futures):
                try:
                    future.result()
                except Exception:
                    pass

                with stats_lock:
                    if stats["completed"] % 500 == 0 and stats["completed"] > 0:
                        elapsed = time.time() - start_time
                        rate = stats["completed"] / elapsed * 3600
                        remaining_est = (len(remaining) - stats["completed"]) / rate
                        print(f"\n  === Progress: {stats['completed']}/{len(remaining)} "
                              f"({stats['downloaded']:,} with data, "
                              f"{stats['skipped_empty']:,} empty, "
                              f"{stats['errors']:,} errors)")
                        print(f"  === Rate: {rate:.0f} points/hour, "
                              f"~{remaining_est:.1f} hours remaining")
                        print(f"  === Observations: {stats['total_observations']:,}\n")

    except KeyboardInterrupt:
        print(f"\n\nInterrupted! Progress saved — run again to resume.")
        print(f"  Completed: {stats['completed']:,}")
        print(f"  Downloaded: {stats['downloaded']:,}")
        print(f"  Observations: {stats['total_observations']:,}")
        sys.exit(0)

    elapsed = time.time() - start_time
    elapsed_str = str(timedelta(seconds=int(elapsed)))

    print(f"""
{'=' * 60}
DOWNLOAD COMPLETE
{'=' * 60}

  Time taken:         {elapsed_str}
  Workers:            {args.workers}
  Points with data:   {stats['downloaded']:,}
  Points empty:       {stats['skipped_empty']:,}
  Errors:             {stats['errors']:,}
  Total observations: {stats['total_observations']:,}

  Output directory:   {args.output_dir}/

Next step: run the processing pipeline:
  python process_water_quality.py {args.output_dir}/ -o ./public/data/wq
""")

    summary_path = os.path.join(args.output_dir, "_summary.json")
    with open(summary_path, "w") as f:
        json.dump({
            "completed_at": datetime.now().isoformat(),
            "elapsed_seconds": int(elapsed),
            "workers": args.workers,
            "points_with_data": stats["downloaded"],
            "points_empty": stats["skipped_empty"],
            "errors": stats["errors"],
            "total_observations": stats["total_observations"],
        }, f, indent=2)


if __name__ == "__main__":
    main()