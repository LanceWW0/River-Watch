#!/usr/bin/env python3
"""
simplify_sites.py
================
Takes an already-downloaded SSSI GeoJSON (or Shapefile) from Natural England's
Open Data Geoportal and optimises it for use in a web map.

Download the source file from:
  https://naturalengland-defra.opendata.arcgis.com/datasets/sites-of-special-scientific-interest-england

  Click "Download" → choose GeoJSON (or Shapefile).

Requirements:
    pip install geopandas shapely

Usage:
    python simplify_sites.py SSSI_England.geojson

    # Custom tolerance (default 0.0005 ≈ ~50m)
    python simplify_sites.py SSSI_England.geojson --tolerance 0.001

    # From a shapefile instead
    python simplify_sites.py SSSI_England.shp

    # Custom output path
    python simplify_sites.py SSSI_England.geojson -o ./public/data/sssi.geojson
"""

import argparse
import json
import os
import sys
import time

try:
    import geopandas as gpd
except ImportError:
    print("ERROR: geopandas is required. Install with:")
    print("  pip install geopandas")
    sys.exit(1)

from shapely.validation import make_valid


# Fields to keep in the output — everything else gets dropped
FIELDS_TO_KEEP = [
    "SSSI_NAME",
    "SSSI_AREA",        # area in hectares
    "NOTIFICATION",     # notification date
    "STATUS",           # e.g. "Notified"
]


def main():
    parser = argparse.ArgumentParser(
        description="Simplify SSSI boundaries for web mapping"
    )
    parser.add_argument(
        "input",
        help="Path to downloaded SSSI file (.geojson, .shp, .gpkg)",
    )
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="Output file path (default: sssi_simplified.geojson)",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.0005,
        help="Simplification tolerance in degrees (~0.0005 ≈ 50m). Default: 0.0005",
    )
    parser.add_argument(
        "--no-simplify",
        action="store_true",
        help="Skip geometry simplification (just strip fields & reproject)",
    )
    parser.add_argument(
        "--coord-precision",
        type=int,
        default=5,
        help="Decimal places for coordinates (5 ≈ 1.1m). Default: 5",
    )
    args = parser.parse_args()

    if args.output is None:
        base = os.path.splitext(os.path.basename(args.input))[0]
        args.output = f"{base}_simplified.geojson"

    # ------------------------------------------------------------------
    # Step 1: Load the source data
    # ------------------------------------------------------------------
    print(f"Loading {args.input}...")
    t0 = time.time()
    gdf = gpd.read_file(args.input)
    print(f"  Loaded {len(gdf)} features in {time.time() - t0:.1f}s")
    print(f"  CRS: {gdf.crs}")
    print(f"  Columns: {list(gdf.columns)}\n")

    # ------------------------------------------------------------------
    # Step 2: Reproject to WGS84 if needed
    # ------------------------------------------------------------------
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        print("Reprojecting to WGS84 (EPSG:4326)...")
        gdf = gdf.to_crs(epsg=4326)
        print("  Done\n")

    # ------------------------------------------------------------------
    # Step 3: Strip unnecessary columns
    # ------------------------------------------------------------------
    # Match fields case-insensitively since column names can vary
    col_map = {c.upper(): c for c in gdf.columns}
    keep = []
    for field in FIELDS_TO_KEEP:
        if field.upper() in col_map:
            keep.append(col_map[field.upper()])
        elif field in gdf.columns:
            keep.append(field)

    # Always keep geometry
    drop_cols = [c for c in gdf.columns if c not in keep and c != "geometry"]
    if drop_cols:
        print(f"Dropping {len(drop_cols)} unnecessary columns:")
        print(f"  {', '.join(drop_cols[:10])}{'...' if len(drop_cols) > 10 else ''}")
        gdf = gdf.drop(columns=drop_cols)
        print()

    # Standardise column names to uppercase for consistency
    rename = {}
    for c in gdf.columns:
        if c != "geometry" and c.upper() != c:
            rename[c] = c.upper()
    if rename:
        gdf = gdf.rename(columns=rename)

    # ------------------------------------------------------------------
    # Step 4: Fix invalid geometries
    # ------------------------------------------------------------------
    print("Fixing invalid geometries...")
    invalid_count = (~gdf.geometry.is_valid).sum()
    if invalid_count > 0:
        print(f"  Found {invalid_count} invalid geometries, repairing...")
        gdf.geometry = gdf.geometry.apply(
            lambda g: make_valid(g) if g is not None and not g.is_valid else g
        )
    else:
        print("  All geometries valid")
    print()

    # ------------------------------------------------------------------
    # Step 5: Simplify geometries
    # ------------------------------------------------------------------
    if not args.no_simplify:
        print(f"Simplifying geometries (tolerance={args.tolerance})...")
        original_size = gdf.geometry.apply(lambda g: len(str(g))).sum()
        gdf.geometry = gdf.geometry.simplify(args.tolerance, preserve_topology=True)
        simplified_size = gdf.geometry.apply(lambda g: len(str(g))).sum()

        # Drop any features that became empty
        empty_mask = gdf.geometry.is_empty
        if empty_mask.any():
            print(f"  Dropped {empty_mask.sum()} features (empty after simplification)")
            gdf = gdf[~empty_mask]

        reduction = (1 - simplified_size / original_size) * 100
        print(f"  Geometry complexity reduced by ~{reduction:.0f}%")
        print()

    # ------------------------------------------------------------------
    # Step 6: Write output
    # ------------------------------------------------------------------
    print(f"Writing to {args.output}...")
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)

    gdf.to_file(
        args.output,
        driver="GeoJSON",
        coordinate_precision=args.coord_precision,
    )

    file_size = os.path.getsize(args.output) / (1024 * 1024)
    print(f"  Output: {args.output} ({file_size:.1f} MB)")
    print(f"  Features: {len(gdf)}")

    # ------------------------------------------------------------------
    # Advice
    # ------------------------------------------------------------------
    print(f"""
{'=' * 60}
Output: {args.output} ({file_size:.1f} MB, {len(gdf)} features)
{'=' * 60}

Tips if the file is still too large for your web app:

  • Increase tolerance:
      python {os.path.basename(__file__)} {args.input} --tolerance 0.001

  • Use Mapshaper for interactive simplification:
      https://mapshaper.org  (drag & drop, adjust the slider)

  • For production: convert to vector tiles (PMTiles/MBTiles)
      with tippecanoe for best performance at any zoom level.

  • Or serve via the ArcGIS REST API dynamically — see the
      addSSSILayerDynamic() function in sssi-layer.js.
""")


if __name__ == "__main__":
    main()