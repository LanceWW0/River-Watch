#!/usr/bin/env node

/**
 * Script 1: Fetch Sampling Points
 *
 * Fetches all ~65,000 EA water quality sampling points,
 * converts BNG coordinates to WGS84, strips to essential fields,
 * and outputs a GeoJSON FeatureCollection to data/points.geojson.
 *
 * Usage: node fetch-points.js
 *
 * Expected output: ~8-10MB raw, ~2-3MB gzipped.
 * Runtime: ~5-10 minutes depending on API responsiveness.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { convertBNG, fetchAllPages, createProgress } from "./utils.js";

// ── Config ───────────────────────────────────────────────────────────────────

const EA_BASE =
  "https://environment.data.gov.uk/water-quality/sampling-point";
const OUTPUT_DIR = "data";
const OUTPUT_FILE = `${OUTPUT_DIR}/points.geojson`;

// ── Extract fields from raw API item ─────────────────────────────────────────

function extractPoint(item) {
  const notation = item?.notation ?? item?.["@id"]?.split("/").pop();
  if (!notation) return null;

  const label = item?.label ?? item?.comment ?? notation;

  // Status: active, closed, etc.
  const statusRaw = item?.status;
  const status =
    typeof statusRaw === "object"
      ? statusRaw?.label ?? statusRaw?.["@id"]?.split("/").pop() ?? "unknown"
      : statusRaw ?? "unknown";

  // Type: river, lake, coastal, groundwater, etc.
  const typeRaw = item?.samplingPointType;
  const type =
    typeof typeRaw === "object"
      ? typeRaw?.label ?? typeRaw?.["@id"]?.split("/").pop() ?? "unknown"
      : typeRaw ?? "unknown";

  // Area / region
  const areaRaw = item?.area;
  const area =
    typeof areaRaw === "object"
      ? areaRaw?.label ?? areaRaw?.notation ?? null
      : areaRaw ?? null;

  // Coordinates — BNG easting/northing
  const easting = item?.easting;
  const northing = item?.northing;
  const coords = convertBNG(easting, northing);

  // Also check if lat/long already provided
  const lat = item?.lat ?? item?.latitude;
  const lng = item?.long ?? item?.longitude;

  let finalCoords = coords;
  if (!finalCoords && lat != null && lng != null) {
    const la = Number(lat);
    const ln = Number(lng);
    if (!isNaN(la) && !isNaN(ln)) {
      finalCoords = [Math.round(ln * 1e6) / 1e6, Math.round(la * 1e6) / 1e6];
    }
  }

  return {
    notation,
    label,
    status,
    type,
    area,
    coords: finalCoords,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  EA Water Quality — Fetch Sampling Points");
  console.log("═══════════════════════════════════════════════════════\n");

  await mkdir(OUTPUT_DIR, { recursive: true });

  const allPoints = [];
  const seenNotations = new Set();
  let skippedNoCoords = 0;
  let skippedDuplicate = 0;

  const progress = createProgress("Points fetched");

  console.log(`📡 Fetching from ${EA_BASE}...\n`);

  const totalFetched = await fetchAllPages(EA_BASE, {
    limit: 250,
    delayBetweenPages: 150,
    onPage(items) {
      for (const item of items) {
        const point = extractPoint(item);
        if (!point) continue;

        if (seenNotations.has(point.notation)) {
          skippedDuplicate++;
          continue;
        }
        seenNotations.add(point.notation);

        if (!point.coords) {
          skippedNoCoords++;
          continue;
        }

        allPoints.push(point);
      }
      progress.increment(items.length);
    },
  });

  progress.done(`${totalFetched} fetched, ${allPoints.length} valid`);

  // ── Build GeoJSON ────────────────────────────────────────────────────────

  console.log("\n📦 Building GeoJSON...");

  const geojson = {
    type: "FeatureCollection",
    metadata: {
      source: "Environment Agency Water Quality Archive",
      generated: new Date().toISOString(),
      totalFeatures: allPoints.length,
    },
    features: allPoints.map((p) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: p.coords,
      },
      properties: {
        n: p.notation,
        l: p.label,
        s: p.status,
        t: p.type,
        a: p.area,
      },
    })),
  };

  const json = JSON.stringify(geojson);
  await writeFile(OUTPUT_FILE, json, "utf-8");

  const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);

  console.log(`\n✅ Done!`);
  console.log(`   📁 ${OUTPUT_FILE} (${sizeMB} MB)`);
  console.log(`   📊 ${allPoints.length} sampling points`);
  console.log(`   ⚠️  ${skippedNoCoords} skipped (no coordinates)`);
  console.log(`   🔁 ${skippedDuplicate} skipped (duplicates)`);
  console.log(
    `\n💡 Tip: gzip this file for serving — should compress to ~2-3MB\n`
  );
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});