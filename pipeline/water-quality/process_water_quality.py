#!/usr/bin/env python3
"""
process_water_quality.py
========================
Processes the per-point CSV files produced by crawl_water_quality.py
into tiered summary files for the riverwatch.earth web app.

Requirements:
    pip install pandas pyproj

Usage:
    python process_water_quality.py ./raw_observations -o ./public/data/wq

    # Only process points with enough data
    python process_water_quality.py ./raw_observations --min-samples 5
"""

import argparse
import csv
import json
import os
import sys
import time
import glob
from collections import defaultdict

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas is required. Install with: pip install pandas")
    sys.exit(1)


# ======================================================================
# WFD THRESHOLDS AND SCORING
# ======================================================================

KEY_DETERMINANDS = {
    "0076": {"name": "temperature",    "label": "Temperature",                     "unit": "°C"},
    "0117": {"name": "nitrate",        "label": "Nitrate as N",                    "unit": "mg/l"},
    "0135": {"name": "ss",             "label": "Suspended Solids at 105C",        "unit": "mg/l"},
    "0111": {"name": "ammonia",        "label": "Ammoniacal Nitrogen as N",        "unit": "mg/l"},
    "9901": {"name": "do_percent",     "label": "Dissolved Oxygen (% sat)",        "unit": "%"},
    "0180": {"name": "phosphate",      "label": "Orthophosphate, reactive as P",   "unit": "mg/l"},
    "0085": {"name": "bod",            "label": "BOD 5 Day ATU",                   "unit": "mg/l"},
    "0061": {"name": "ph",             "label": "pH",                              "unit": "pH"},
    "0101": {"name": "conductivity",   "label": "Conductivity at 25C",             "unit": "µS/cm"},
    "0062": {"name": "ss_alt",         "label": "Suspended Solids (alt)",          "unit": "mg/l"},
    "0116": {"name": "total_oxidised_n","label": "Nitrogen, Total Oxidised as N",  "unit": "mg/l"},
}

WFD_THRESHOLDS = {
    "phosphate": {
        "boundaries": [0.036, 0.12, 0.25, 1.0],
        "direction": "lower_is_better",
    },
    "ammonia": {
        "boundaries": [0.3, 0.6, 1.1, 2.5],
        "direction": "lower_is_better",
    },
    "do_percent": {
        "boundaries": [80, 70, 54, 45],
        "direction": "higher_is_better",
    },
    "bod": {
        "boundaries": [4.0, 5.0, 6.5, 9.0],
        "direction": "lower_is_better",
    },
    "ph": {
        "range_good": [6.0, 9.0],
        "range_high": [6.5, 8.5],
        "direction": "range",
    },
}

STATUS_CONFIG = {
    "High":     {"color": "#2563eb", "score": 5},
    "Good":     {"color": "#16a34a", "score": 4},
    "Moderate": {"color": "#f59e0b", "score": 3},
    "Poor":     {"color": "#f97316", "score": 2},
    "Bad":      {"color": "#dc2626", "score": 1},
}


def classify_value(value, determinand_name):
    if determinand_name not in WFD_THRESHOLDS:
        return None
    config = WFD_THRESHOLDS[determinand_name]

    if config["direction"] == "range":
        if config["range_high"][0] <= value <= config["range_high"][1]:
            return "High"
        elif config["range_good"][0] <= value <= config["range_good"][1]:
            return "Good"
        else:
            return "Poor"

    boundaries = config["boundaries"]
    if config["direction"] == "lower_is_better":
        for i, b in enumerate(boundaries):
            if value <= b:
                return ["High", "Good", "Moderate", "Poor"][i]
        return "Bad"
    else:
        for i, b in enumerate(boundaries):
            if value >= b:
                return ["High", "Good", "Moderate", "Poor"][i]
        return "Bad"


def overall_status(statuses):
    score_map = {s: c["score"] for s, c in STATUS_CONFIG.items()}
    worst = min(statuses, key=lambda s: score_map.get(s, 5))
    return worst


def compute_trend(yearly_means):
    if len(yearly_means) < 4:
        return "insufficient_data"
    years = sorted(yearly_means.keys())
    mid = len(years) // 2
    early = sum(yearly_means[y] for y in years[:mid]) / mid
    late = sum(yearly_means[y] for y in years[mid:]) / (len(years) - mid)
    if early == 0:
        return "stable"
    pct = (late - early) / early * 100
    if abs(pct) < 5:
        return "stable"
    return "increasing" if pct > 0 else "decreasing"


def interpret_trend(raw_trend, det_name):
    if raw_trend in ("stable", "insufficient_data"):
        return raw_trend
    if det_name not in WFD_THRESHOLDS:
        return raw_trend
    direction = WFD_THRESHOLDS[det_name]["direction"]
    if direction == "higher_is_better":
        return "improving" if raw_trend == "increasing" else "declining"
    elif direction == "lower_is_better":
        return "improving" if raw_trend == "decreasing" else "declining"
    return raw_trend


def load_point_coordinates(tiles_dir):
    coords = {}
    tile_files = glob.glob(os.path.join(tiles_dir, "points_*.geojson"))
    for tile_file in tile_files:
        with open(tile_file, "r") as f:
            data = json.load(f)
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            notation = props.get("n")
            if not notation:
                continue
            geom = feature.get("geometry", {})
            coord = geom.get("coordinates", [None, None])
            coords[notation] = {
                "lon": coord[0],
                "lat": coord[1],
                "label": props.get("l", ""),
                "type": props.get("t", ""),
            }
    return coords


def main():
    parser = argparse.ArgumentParser(
        description="Process crawled water quality data into web-ready summaries"
    )
    parser.add_argument(
        "input_dir",
        help="Directory containing per-point CSV files from crawl_water_quality.py",
    )
    parser.add_argument(
        "--tiles-dir",
        default=None,
        help="Path to public/data/point_tiles/ for coordinates",
    )
    parser.add_argument(
        "-o", "--output-dir",
        default="./wq_output",
        help="Output directory. Default: ./wq_output",
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=3,
        help="Minimum observations needed to score a point. Default: 3",
    )
    parser.add_argument(
        "--recent-years",
        type=int,
        default=5,
        help="Years to use for 'current' status scoring. Default: 5",
    )
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    ts_dir = os.path.join(args.output_dir, "timeseries")
    tiles_dir_out = os.path.join(args.output_dir, "tiles")
    os.makedirs(ts_dir, exist_ok=True)
    os.makedirs(tiles_dir_out, exist_ok=True)

    # ------------------------------------------------------------------
    # Step 1: Load point coordinates
    # ------------------------------------------------------------------
    print("Loading sampling point coordinates...")
    tiles_path = args.tiles_dir
    if not tiles_path:
        for c in ["./public/data/point_tiles", "../public/data/point_tiles",
                   "../../public/data/point_tiles"]:
            if os.path.isdir(c):
                tiles_path = c
                break
    if not tiles_path or not os.path.isdir(tiles_path):
        print("ERROR: Could not find point_tiles directory.")
        print("  Specify with --tiles-dir /path/to/public/data/point_tiles")
        sys.exit(1)

    coords = load_point_coordinates(tiles_path)
    print(f"  Loaded coordinates for {len(coords):,} points\n")

    # ------------------------------------------------------------------
    # Step 2: Process each point's CSV
    # ------------------------------------------------------------------
    csv_files = glob.glob(os.path.join(args.input_dir, "*.csv"))
    csv_files = [f for f in csv_files if not os.path.basename(f).startswith("_")]

    print(f"Processing {len(csv_files):,} point files...")

    current_year = pd.Timestamp.now().year
    recent_cutoff = current_year - args.recent_years + 1

    point_summaries = {}
    status_counts = defaultdict(int)
    processed = 0
    skipped_empty = 0
    skipped_no_coords = 0

    for i, csv_file in enumerate(csv_files):
        # Filename may be sanitised (/ replaced with _) so check both
        raw_notation = os.path.basename(csv_file).replace(".csv", "")
        # Try the raw filename first, then with / restored
        notation = None
        if raw_notation in coords:
            notation = raw_notation
        else:
            # Try restoring _ back to / for notations like SW-GWW16/05
            for original, meta in coords.items():
                if original.replace("/", "_") == raw_notation:
                    notation = original
                    break

        if notation is None:
            skipped_no_coords += 1
            continue

        try:
            df = pd.read_csv(csv_file, dtype=str)
        except Exception:
            continue

        if df.empty or len(df) == 0:
            skipped_empty += 1
            continue

        # Handle below-detection-limit values like "<0.5", ">100"
        # Strip the qualifier and use the numeric value (conservative estimate)
        df["result_clean"] = df["result"].astype(str).str.replace(r'^[<>]', '', regex=True)
        df["value"] = pd.to_numeric(df["result_clean"], errors="coerce")
        df["date"] = pd.to_datetime(df["sample_date"], errors="coerce", format="mixed")
        df["year"] = df["date"].dt.year
        df = df.dropna(subset=["value", "date"])

        if len(df) < args.min_samples:
            skipped_empty += 1
            continue

        df["det_name"] = df["determinand_notation"].map(
            {k: v["name"] for k, v in KEY_DETERMINANDS.items()}
        )
        df = df.dropna(subset=["det_name"])

        if df.empty:
            skipped_empty += 1
            continue

        meta = coords[notation]

        # --- Time series (Tier 3) ---
        ts_data = {}
        for det_name, det_group in df.groupby("det_name"):
            records = det_group.sort_values("date")
            ts_data[det_name] = {
                "dates": [str(d.date()) for d in records["date"]],
                "values": [round(v, 4) for v in records["value"]],
            }

        if ts_data:
            safe_name = notation.replace("/", "_").replace("\\", "_")
            ts_path = os.path.join(ts_dir, f"{safe_name}.json")
            with open(ts_path, "w") as f:
                json.dump(ts_data, f, separators=(",", ":"))

        # --- Summary (Tier 2) ---
        recent = df[df["year"] >= recent_cutoff]
        if recent.empty:
            recent = df

        summary = {
            "id": notation,
            "label": meta["label"],
            "lat": round(meta["lat"], 5) if meta["lat"] else None,
            "lon": round(meta["lon"], 5) if meta["lon"] else None,
            "type": meta["type"],
            "determinands": {},
            "statuses": {},
            "sample_count": len(recent),
            "total_samples": len(df),
            "earliest_sample": str(df["date"].min().date()),
            "latest_sample": str(df["date"].max().date()),
        }

        for det_name, det_group in recent.groupby("det_name"):
            values = det_group["value"]
            mean_val = round(values.mean(), 4)
            status = classify_value(mean_val, det_name)

            full_det = df[df["det_name"] == det_name]
            yearly = full_det.groupby("year")["value"].mean().to_dict()
            raw_trend = compute_trend(yearly)
            trend = interpret_trend(raw_trend, det_name)

            det_info = next(
                (v for v in KEY_DETERMINANDS.values() if v["name"] == det_name), {}
            )

            summary["determinands"][det_name] = {
                "mean": mean_val,
                "min": round(values.min(), 4),
                "max": round(values.max(), 4),
                "latest": round(det_group.sort_values("date")["value"].iloc[-1], 4),
                "n_samples": len(values),
                "unit": det_info.get("unit", ""),
                "label": det_info.get("label", det_name),
            }
            if status:
                summary["statuses"][det_name] = status
                summary["determinands"][det_name]["status"] = status
                summary["determinands"][det_name]["trend"] = trend

        if summary["statuses"]:
            summary["overall_status"] = overall_status(summary["statuses"].values())
            summary["worst_determinand"] = min(
                summary["statuses"].items(),
                key=lambda x: STATUS_CONFIG.get(x[1], {}).get("score", 5)
            )[0]
        else:
            summary["overall_status"] = "Unknown"
            summary["worst_determinand"] = None

        point_summaries[notation] = summary
        status_counts[summary["overall_status"]] += 1
        processed += 1

        if (i + 1) % 2000 == 0:
            print(f"  Processed {i + 1}/{len(csv_files)} files ({processed:,} with data)")

    print(f"\n  Processed: {processed:,} points with data")
    print(f"  Empty/insufficient: {skipped_empty:,}")
    print(f"  No coordinates: {skipped_no_coords:,}")
    print(f"\n  Status distribution:")
    for status in ["High", "Good", "Moderate", "Poor", "Bad", "Unknown"]:
        if status in status_counts:
            print(f"    {status}: {status_counts[status]:,}")

    # ------------------------------------------------------------------
    # Step 3: Tiled summaries
    # ------------------------------------------------------------------
    print(f"\nWriting tiled summaries...")
    tiles = defaultdict(list)
    for sp in point_summaries.values():
        if sp["lat"] is None or sp["lon"] is None:
            continue
        tile_lat = int(sp["lat"])
        tile_lon = int(sp["lon"]) if sp["lon"] >= 0 else int(sp["lon"]) - 1
        tiles[(tile_lat, tile_lon)].append(sp)

    for (tile_lat, tile_lon), points in tiles.items():
        tile_file = os.path.join(tiles_dir_out, f"wq_{tile_lat}_{tile_lon}.json")
        with open(tile_file, "w") as f:
            json.dump(points, f, separators=(",", ":"))
    print(f"  Wrote {len(tiles)} tile files")

    # ------------------------------------------------------------------
    # Step 4: National index
    # ------------------------------------------------------------------
    print(f"\nWriting national index...")
    point_index = []
    for sp in point_summaries.values():
        if sp["lat"] is None:
            continue
        point_index.append({
            "id": sp["id"],
            "lat": sp["lat"],
            "lon": sp["lon"],
            "s": sp["overall_status"][0],
            "w": sp.get("worst_determinand", ""),
            "n": sp["sample_count"],
            "d": sp.get("latest_sample", ""),
        })

    index_path = os.path.join(args.output_dir, "wq_index.json")
    with open(index_path, "w") as f:
        json.dump(point_index, f, separators=(",", ":"))

    index_kb = os.path.getsize(index_path) / 1024
    print(f"  wq_index.json: {index_kb:.0f} KB ({len(point_index)} points)")

    # ------------------------------------------------------------------
    # Step 5: Config
    # ------------------------------------------------------------------
    config = {
        "statuses": {k: {"color": v["color"], "label": k, "score": v["score"]}
                     for k, v in STATUS_CONFIG.items()},
        "determinands": {v["name"]: {"label": v["label"], "unit": v["unit"]}
                         for v in KEY_DETERMINANDS.values()},
        "thresholds": WFD_THRESHOLDS,
        "total_points": len(point_summaries),
        "processed_at": pd.Timestamp.now().isoformat(),
    }

    config_path = os.path.join(args.output_dir, "wq_config.json")
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    total_size = 0
    for root, dirs, files in os.walk(args.output_dir):
        for fname in files:
            total_size += os.path.getsize(os.path.join(root, fname))

    print(f"""
{'=' * 60}
DONE! Output: {args.output_dir}/
{'=' * 60}

  wq_index.json         {index_kb:.0f} KB (load on map init, powers filtering)
  tiles/                 {len(tiles)} files (load per viewport)
  timeseries/            {processed:,} files (load on click, replaces EA API)
  wq_config.json         (frontend config)

  Total: {total_size / (1024*1024):.1f} MB

  Status filter codes: H=High, G=Good, M=Moderate, P=Poor, B=Bad
""")


if __name__ == "__main__":
    main()