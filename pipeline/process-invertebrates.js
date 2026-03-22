#!/usr/bin/env node

/**
 * Process EA Freshwater Macroinvertebrate Survey Data into:
 *   1. invert_sites.geojson — one point per unique site (for map markers)
 *   2. invert_observations/{SITE_ID}.json — health indices over time per site
 *
 * Requires two input files:
 *   - The main survey data CSV (with BMWP scores etc)
 *   - The sites lookup CSV (with coordinates)
 *
 * Usage: node process-invertebrates.js
 *
 * Output observation files match the water quality / fish format:
 *   {
 *     siteId: "56182",
 *     siteName: "ABBOTSLEY BROOK",
 *     waterbody: "WBRV",
 *     totalSamples: 18,
 *     determinands: [
 *       {
 *         code: "BMWP_TOTAL",
 *         name: "BMWP Score (River Health)",
 *         unit: "score",
 *         data: [
 *           { timestamp: 1329955200000, value: 28 },
 *           ...
 *         ]
 *       },
 *       ...
 *     ]
 *   }
 */

import { createReadStream, writeFileSync, mkdirSync } from "fs";
import { createInterface } from "readline";
import proj4 from "proj4";

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs"
);

const SURVEYS_FILE = "inv/raw/INV_SURVEYS.csv";
const SITES_FILE = "inv/raw/INV_SITES.csv";
const OUTPUT_DIR = "inv/processed";
const GEOJSON_FILE = `${OUTPUT_DIR}/inv_sites.geojson`;
const OBS_DIR = `${OUTPUT_DIR}/inv_observations`;

// The headline indices to extract — these are the ones meaningful to the public
const INDICES = [
  {
    field: "BMWP_TOTAL",
    code: "BMWP_TOTAL",
    name: "BMWP Score (River Health)",
    unit: "score",
    description: "Biological Monitoring Working Party total. Higher = healthier. Above 100 is good, below 50 is poor.",
  },
  {
    field: "BMWP_ASPT",
    code: "BMWP_ASPT",
    name: "BMWP Avg Score Per Taxon",
    unit: "score",
    description: "Average sensitivity of species found. Above 6 suggests clean water.",
  },
  {
    field: "BMWP_N_TAXA",
    code: "BMWP_N_TAXA",
    name: "BMWP Number of Taxa",
    unit: "count",
    description: "Number of invertebrate families found. More diversity = healthier.",
  },
  {
    field: "WHPT_ASPT",
    code: "WHPT_ASPT",
    name: "WHPT Avg Score Per Taxon",
    unit: "score",
    description: "Modern replacement for BMWP. Higher = cleaner water.",
  },
  {
    field: "WHPT_TOTAL",
    code: "WHPT_TOTAL",
    name: "WHPT Total Score",
    unit: "score",
    description: "Walley Hawkes Paisley Trigg total score. Higher = healthier river.",
  },
  {
    field: "LIFE_FAMILY_INDEX",
    code: "LIFE_FAMILY_INDEX",
    name: "LIFE Index (Flow Sensitivity)",
    unit: "score",
    description: "Lotic-invertebrate Index for Flow Evaluation. Detects drought and abstraction impacts.",
  },
  {
    field: "PSI_FAMILY_SCORE",
    code: "PSI_FAMILY_SCORE",
    name: "PSI Score (Sediment Sensitivity)",
    unit: "score",
    description: "Proportion of Sediment-sensitive Invertebrates. Lower = more siltation.",
  },
  {
    field: "DEHLI",
    code: "DEHLI",
    name: "DEHLI (Headwater Health)",
    unit: "score",
    description: "Dragonfly and other headwater species index.",
  },
];

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return new Date(`${year}-${month}-${day}T00:00:00Z`).getTime();
  }
  const t = new Date(dateStr).getTime();
  return isNaN(t) ? null : t;
}

function convertCoords(easting, northing, cache) {
  const key = `${easting},${northing}`;
  if (cache.has(key)) return cache.get(key);
  const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [easting, northing]);
  const result = [
    Math.round(lng * 1e6) / 1e6,
    Math.round(lat * 1e6) / 1e6,
  ];
  cache.set(key, result);
  return result;
}

function parseCsvLine(line) {
  // Handle quoted fields with commas
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim().replace(/\r/g, ""));
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim().replace(/\r/g, ""));
  return fields;
}

async function readCsv(filepath, onRow) {
  const rl = createInterface({
    input: createReadStream(filepath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let headerMap = null;
  let count = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);

    if (!headerMap) {
      headerMap = {};
      for (let i = 0; i < fields.length; i++) {
        headerMap[fields[i].trim()] = i;
      }
      continue;
    }

    const get = (col) => {
      const idx = headerMap[col];
      if (idx === undefined) return "";
      return (fields[idx] || "").trim();
    };

    await onRow(get, count);
    count++;
  }

  return count;
}

async function main() {
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  EA Macroinvertebrate Data — Process & Convert`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  mkdirSync(OBS_DIR, { recursive: true });

  // ── Step 1: Read sites lookup ────────────────────────────

  console.log(`📍 Reading sites from ${SITES_FILE}...`);

  const siteLookup = new Map();

  const sitesCount = await readCsv(SITES_FILE, (get) => {
    const siteId = get("SITE_ID");
    if (!siteId) return;

    const easting = parseFloat(get("FULL_EASTING") || get("EASTING"));
    const northing = parseFloat(get("FULL_NORTHING") || get("NORTHING"));

    if (isNaN(easting) || isNaN(northing)) return;

    siteLookup.set(siteId, {
      name: get("WATER_BODY") || get("SITE_ID"),
      waterbody: get("WATERBODY_TYPE") || "",
      waterbodyDesc: get("WATERBODY_TYPE_DESCRIPTION") || "",
      catchment: get("CATCHMENT") || "",
      area: get("AGENCY_AREA") || "",
      altitude: get("ALTITUDE") || null,
      easting,
      northing,
    });
  });

  console.log(`   ✅ ${siteLookup.size.toLocaleString()} sites loaded\n`);

  // ── Step 2: Read survey data ─────────────────────────────

  console.log(`📊 Reading survey data from ${SURVEYS_FILE}...`);

  // Accumulate per site: { siteId -> { dates: Set, indices: { code -> [{ timestamp, value }] } } }
  const siteData = new Map();
  let totalRows = 0;
  let skippedNoSite = 0;
  let skippedNoDate = 0;

  const surveysCount = await readCsv(SURVEYS_FILE, (get, rowIdx) => {
    totalRows++;

    const siteId = get("SITE_ID");
    if (!siteId || !siteLookup.has(siteId)) {
      skippedNoSite++;
      return;
    }

    const dateStr = get("SAMPLE_DATE");
    const timestamp = parseDate(dateStr);
    if (!timestamp) {
      skippedNoDate++;
      return;
    }

    if (!siteData.has(siteId)) {
      siteData.set(siteId, {
        dates: new Set(),
        indices: {},
      });
    }

    const site = siteData.get(siteId);
    site.dates.add(dateStr);

    // Extract each index
    for (const idx of INDICES) {
      const raw = get(idx.field);
      if (!raw) continue;
      const value = parseFloat(raw);
      if (isNaN(value)) continue;

      if (!site.indices[idx.code]) {
        site.indices[idx.code] = [];
      }

      site.indices[idx.code].push({ timestamp, value });
    }

    if (totalRows % 200000 === 0) {
      console.log(
        `   ⏳ ${totalRows.toLocaleString()} rows processed, ${siteData.size.toLocaleString()} sites with data...`
      );
    }
  });

  console.log(
    `\n   📊 ${totalRows.toLocaleString()} rows → ${siteData.size.toLocaleString()} sites with data\n`
  );

  // ── Step 3: Build GeoJSON ────────────────────────────────

  console.log(`🗺️  Building invert_sites.geojson...`);

  const coordCache = new Map();
  const features = [];

  for (const [siteId, data] of siteData) {
    const siteInfo = siteLookup.get(siteId);
    if (!siteInfo) continue;

    const [lng, lat] = convertCoords(siteInfo.easting, siteInfo.northing, coordCache);

    const sortedDates = [...data.dates].sort(
      (a, b) => parseDate(a) - parseDate(b)
    );

    // Get latest BMWP for a quick health indicator on the map
    const bmwpData = data.indices["BMWP_TOTAL"] || [];
    const latestBmwp =
      bmwpData.length > 0
        ? bmwpData.sort((a, b) => b.timestamp - a.timestamp)[0].value
        : null;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
      properties: {
        siteId,
        name: siteInfo.name,
        catchment: siteInfo.catchment,
        area: siteInfo.area,
        totalSamples: data.dates.size,
        firstSample: sortedDates[0] || null,
        lastSample: sortedDates[sortedDates.length - 1] || null,
        latestBmwp,
        indicesAvailable: Object.keys(data.indices).length,
      },
    });
  }

  const geojson = { type: "FeatureCollection", features };
  writeFileSync(GEOJSON_FILE, JSON.stringify(geojson), "utf-8");

  const sitesMB = (Buffer.byteLength(JSON.stringify(geojson)) / 1e6).toFixed(2);
  console.log(`   ✅ ${GEOJSON_FILE} (${sitesMB} MB, ${features.length} sites)\n`);

  // ── Step 4: Write per-site observation files ─────────────

  console.log(`📈 Writing per-site observation files...`);

  let filesWritten = 0;

  for (const [siteId, data] of siteData) {
    const siteInfo = siteLookup.get(siteId);
    if (!siteInfo) continue;

    const determinands = [];

    for (const idx of INDICES) {
      const readings = data.indices[idx.code];
      if (!readings || readings.length === 0) continue;

      // Sort by timestamp and deduplicate same-date entries (take latest)
      const byDate = new Map();
      for (const r of readings) {
        byDate.set(r.timestamp, r.value);
      }

      const sortedData = [...byDate.entries()]
        .map(([timestamp, value]) => ({ timestamp, value }))
        .sort((a, b) => a.timestamp - b.timestamp);

      determinands.push({
        code: idx.code,
        name: idx.name,
        unit: idx.unit,
        description: idx.description,
        data: sortedData,
      });
    }

    if (determinands.length === 0) continue;

    const output = {
      siteId,
      siteName: siteInfo.name,
      catchment: siteInfo.catchment,
      waterbody: siteInfo.waterbody,
      totalSamples: data.dates.size,
      determinands,
    };

    writeFileSync(
      `${OBS_DIR}/${siteId}.json`,
      JSON.stringify(output),
      "utf-8"
    );
    filesWritten++;
  }

  console.log(`   ✅ ${filesWritten.toLocaleString()} observation files written\n`);

  // ── Summary ──────────────────────────────────────────────

  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`  Done!`);
  console.log(`   📊 ${totalRows.toLocaleString()} survey rows processed`);
  console.log(`   📍 ${siteData.size.toLocaleString()} sites with data`);
  console.log(`   🗺️  ${GEOJSON_FILE} (${sitesMB} MB, ${features.length} sites)`);
  console.log(`   📂 ${OBS_DIR}/ (${filesWritten} files)`);
  console.log(`   ⚠️  ${skippedNoSite.toLocaleString()} rows skipped (site not found in lookup)`);
  console.log(`   ⚠️  ${skippedNoDate.toLocaleString()} rows skipped (no date)`);
  console.log(`═══════════════════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});