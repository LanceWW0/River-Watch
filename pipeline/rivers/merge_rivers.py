#!/usr/bin/env python3
"""
merge_rivers.py
===============
Merges OS Open Rivers line segments into whole-river features so that
hovering/clicking in Leaflet highlights the entire river, not just
one tiny segment.

The OS Open Rivers dataset splits each river into many small "link"
segments. This script groups them by river name and merges the
geometries into single MultiLineString features.

Download OS Open Rivers from:
  https://osdatahub.os.uk/downloads/open/OpenRivers

Requirements:
    pip install geopandas shapely

Usage:
    python merge_rivers.py WatercourseLink.shp
    python merge_rivers.py WatercourseLink.geojson

    # Custom output path
    python merge_rivers.py WatercourseLink.shp -o ./public/data/rivers_merged.geojson

    # Simplify geometry to reduce file size
    python merge_rivers.py WatercourseLink.shp --tolerance 0.0003

    # Filter to a specific region (bounding box: west,south,east,north)
    python merge_rivers.py WatercourseLink.shp --bbox -2.5,54.5,-1.0,55.5
"""

import argparse
import os
import sys
import time

try:
    import geopandas as gpd
    from shapely.ops import linemerge
    from shapely.geometry import MultiLineString
    from shapely.validation import make_valid
except ImportError:
    print("ERROR: geopandas and shapely are required. Install with:")
    print("  pip install geopandas shapely")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Merge OS Open Rivers segments into whole-river features"
    )
    parser.add_argument(
        "input",
        help="Path to OS Open Rivers WatercourseLink file (.shp, .geojson, .gpkg)",
    )
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="Output file path (default: rivers_merged.geojson)",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=None,
        help="Optional simplification tolerance in degrees (e.g. 0.0003 ≈ ~30m)",
    )
    parser.add_argument(
        "--bbox",
        type=str,
        default=None,
        help="Optional bounding box filter: west,south,east,north (in WGS84 degrees)",
    )
    parser.add_argument(
        "--coord-precision",
        type=int,
        default=5,
        help="Decimal places for coordinates. Default: 5",
    )
    parser.add_argument(
        "--name-field",
        type=str,
        default=None,
        help="Name of the river name column (auto-detected if not set)",
    )
    args = parser.parse_args()

    if args.output is None:
        args.output = "rivers_merged.geojson"

    # ------------------------------------------------------------------
    # Step 1: Load
    # ------------------------------------------------------------------
    print(f"Loading {args.input}...")
    t0 = time.time()
    gdf = gpd.read_file(args.input)
    print(f"  Loaded {len(gdf)} segments in {time.time() - t0:.1f}s")
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
    # Step 3: Apply bounding box filter if provided
    # ------------------------------------------------------------------
    if args.bbox:
        west, south, east, north = [float(x) for x in args.bbox.split(",")]
        print(f"Filtering to bbox: [{west}, {south}, {east}, {north}]...")
        gdf = gdf.cx[west:east, south:north]
        print(f"  {len(gdf)} segments remaining\n")

    # ------------------------------------------------------------------
    # Step 4: Detect the river name field
    # ------------------------------------------------------------------
    if args.name_field:
        name_col = args.name_field
    else:
        # OS Open Rivers typically uses 'name1' or 'NAME1' or 'name'
        candidates = ["name1", "NAME1", "name", "NAME", "watercourse_name",
                       "WATERCOURSE_NAME", "WatercourseN", "name1_lang"]
        name_col = None
        for c in candidates:
            if c in gdf.columns:
                name_col = c
                break

        if name_col is None:
            # Try case-insensitive match
            col_lower = {c.lower(): c for c in gdf.columns}
            for c in candidates:
                if c.lower() in col_lower:
                    name_col = col_lower[c.lower()]
                    break

        if name_col is None:
            print("ERROR: Could not auto-detect river name column.")
            print(f"  Available columns: {list(gdf.columns)}")
            print(f"  Please specify with --name-field <column_name>")
            sys.exit(1)

    print(f"Using '{name_col}' as the river name field")

    # Check how many have names vs unnamed
    named = gdf[name_col].notna() & (gdf[name_col] != "")
    print(f"  {named.sum()} named segments, {(~named).sum()} unnamed\n")

    # ------------------------------------------------------------------
    # Step 5: Handle unnamed segments
    # ------------------------------------------------------------------
    # Give unnamed segments a unique identifier so they don't all
    # merge into one giant blob. We use 'unnamed_<index>' as the key.
    gdf = gdf.copy()
    gdf["_merge_key"] = gdf[name_col].copy()

    unnamed_mask = gdf["_merge_key"].isna() | (gdf["_merge_key"] == "")
    gdf.loc[unnamed_mask, "_merge_key"] = [
        f"_unnamed_{i}" for i in range(unnamed_mask.sum())
    ]

    # ------------------------------------------------------------------
    # Step 6: Merge segments by river name
    # ------------------------------------------------------------------
    print("Merging segments by river name...")
    t0 = time.time()

    def merge_group(group):
        """Merge all segments in a group into a single geometry."""
        geoms = list(group.geometry)

        # Try linemerge first — it joins contiguous lines end-to-end
        try:
            merged = linemerge(geoms)
        except Exception:
            merged = MultiLineString(geoms)

        # If linemerge produced a single line, that's great.
        # If not, we still have a MultiLineString which is fine.
        name = group[name_col].iloc[0]
        if name and not str(name).startswith("_unnamed_"):
            return {"name": name, "geometry": merged}
        else:
            return {"name": None, "geometry": merged}

    # Group and merge
    results = []
    groups = gdf.groupby("_merge_key")
    total_groups = len(groups)

    for i, (key, group) in enumerate(groups):
        if (i + 1) % 500 == 0 or i == 0:
            print(f"  Processing group {i + 1}/{total_groups}...")
        result = merge_group(group)
        results.append(result)

    merged_gdf = gpd.GeoDataFrame(results, crs="EPSG:4326")
    print(f"  Merged {len(gdf)} segments → {len(merged_gdf)} rivers in {time.time() - t0:.1f}s\n")

    # ------------------------------------------------------------------
    # Step 7: Simplify if requested
    # ------------------------------------------------------------------
    if args.tolerance:
        print(f"Simplifying geometries (tolerance={args.tolerance})...")
        merged_gdf.geometry = merged_gdf.geometry.simplify(
            args.tolerance, preserve_topology=True
        )
        empty_mask = merged_gdf.geometry.is_empty
        if empty_mask.any():
            print(f"  Dropped {empty_mask.sum()} empty features")
            merged_gdf = merged_gdf[~empty_mask]
        print()

    # ------------------------------------------------------------------
    # Step 8: Write output
    # ------------------------------------------------------------------
    print(f"Writing to {args.output}...")
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)

    merged_gdf.to_file(
        args.output,
        driver="GeoJSON",
        coordinate_precision=args.coord_precision,
    )

    file_size = os.path.getsize(args.output) / (1024 * 1024)
    print(f"  Output: {args.output} ({file_size:.1f} MB)")
    print(f"  Features: {len(merged_gdf)}")

    named_count = merged_gdf["name"].notna().sum()
    unnamed_count = merged_gdf["name"].isna().sum()
    print(f"  Named rivers: {named_count}")
    print(f"  Unnamed watercourses: {unnamed_count}")

    print(f"""
{'=' * 60}
Done! {len(gdf)} segments → {len(merged_gdf)} features ({file_size:.1f} MB)
{'=' * 60}

Now when you hover/click in Leaflet, the entire river will
highlight as one feature instead of individual segments.

Leaflet tip — use onEachFeature to show the river name:

  onEachFeature: (feature, layer) => {{
    const name = feature.properties.name;
    if (name) {{
      layer.bindTooltip(name, {{ sticky: true }});
    }}
    layer.on('mouseover', () => {{
      layer.setStyle({{ weight: 4, color: '#0066ff' }});
    }});
    layer.on('mouseout', () => {{
      layer.setStyle({{ weight: 2, color: '#4a90d9' }});
    }});
  }}
""")


if __name__ == "__main__":
    main()