#!/usr/bin/env node

/**
 * Splits monolithic GeoJSON point files into 1°×1° grid tiles
 * for viewport-based lazy loading on the map.
 *
 * Reads from public/data/ and writes tiles + manifest to:
 *   public/data/point_tiles/
 *   public/data/fish_tiles/
 *   public/data/inv_tiles/
 *
 * Usage: node pipeline/tile-points.js
 */

import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dirname, "..", "public", "data");

const DATASETS = [
  {
    input: "points.geojson",
    outputDir: "point_tiles",
    prefix: "points",
  },
  {
    input: "fish_sites.geojson",
    outputDir: "fish_tiles",
    prefix: "fish",
  },
  {
    input: "inv_sites.geojson",
    outputDir: "inv_tiles",
    prefix: "inv",
  },
];

function tileDataset({ input, outputDir, prefix }) {
  const inputPath = join(DATA_DIR, input);
  const outPath = join(DATA_DIR, outputDir);

  console.log(`\nProcessing ${input}...`);

  const raw = readFileSync(inputPath, "utf-8");
  const geojson = JSON.parse(raw);
  const features = geojson.features;

  console.log(`  ${features.length.toLocaleString()} features`);

  // Group features by 1° grid tile
  const tiles = new Map();

  for (const feature of features) {
    const [lng, lat] = feature.geometry.coordinates;
    const tileKey = `${Math.floor(lat)}_${Math.floor(lng)}`;

    if (!tiles.has(tileKey)) {
      tiles.set(tileKey, []);
    }
    tiles.get(tileKey).push(feature);
  }

  console.log(`  ${tiles.size} tiles`);

  // Clean and recreate output directory
  rmSync(outPath, { recursive: true, force: true });
  mkdirSync(outPath, { recursive: true });

  // Write each tile
  const manifest = { tiles: {}, totalFeatures: features.length };

  for (const [tileKey, tileFeatures] of tiles) {
    const filename = `${prefix}_${tileKey}.geojson`;
    const fc = {
      type: "FeatureCollection",
      features: tileFeatures,
    };
    writeFileSync(join(outPath, filename), JSON.stringify(fc));
    manifest.tiles[tileKey] = tileFeatures.length;
  }

  // Write manifest
  writeFileSync(
    join(outPath, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`  Written to ${outputDir}/`);
}

// Run all datasets
for (const dataset of DATASETS) {
  tileDataset(dataset);
}

console.log("\nDone!");
