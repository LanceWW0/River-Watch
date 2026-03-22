#!/usr/bin/env node

/**
 * Process EA Freshwater Fish Counts CSV into:
 *   1. fish_sites.geojson — one point per unique site (for map markers)
 *   2. fish_observations/{SITE_ID}.json — species counts over time per site
 *
 * Usage: node process-fish.js
 *
 * The observation files are structured to match the water quality observation
 * format so the same chart components can render them:
 *   {
 *     siteId: "41826",
 *     siteName: "Bottisham Lode Pumping Station",
 *     waterbody: "...",
 *     totalSurveys: 5,
 *     species: [
 *       {
 *         code: "Bleak",
 *         name: "Bleak (Alburnus alburnus)",
 *         unit: "count",
 *         data: [
 *           { timestamp: 1329955200000, value: 3 },
 *           ...
 *         ]
 *       },
 *       ...
 *     ]
 *   }
 */

import { createReadStream, writeFileSync, mkdirSync, existsSync } from "fs";
import { createInterface } from "readline";
import proj4 from "proj4";

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs"
);

const INPUT = "fish/raw/FW_Fish_Counts.csv";
const OUTPUT_DIR = "fish/processed";
const SITES_FILE = `${OUTPUT_DIR}/fish_sites.geojson`;
const OBS_DIR = `${OUTPUT_DIR}/fish_observations`;

function parseDate(dateStr) {
  // Handle DD/MM/YYYY format
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return new Date(`${year}-${month}-${day}T00:00:00Z`).getTime();
  }
  // Try ISO format
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

async function main() {
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  EA Fish Counts — Process & Convert`);
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`📂 Input: ${INPUT}\n`);

  // Ensure output dirs exist
  mkdirSync(OBS_DIR, { recursive: true });

  const rl = createInterface({
    input: createReadStream(INPUT, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  // Accumulate data by site
  // sites: Map<siteId, { siteName, waterbody, region, area, easting, northing, surveys: Map<surveyDate, Set>, species: Map<speciesName, { latin, counts: [{ date, value }] }> }>
  const sites = new Map();
  const coordCache = new Map();

  let headerMap = null;
  let totalRows = 0;
  let skippedNoCoords = 0;
  let skippedNoDate = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    const fields = line.split(",");

    if (!headerMap) {
      headerMap = {};
      for (let i = 0; i < fields.length; i++) {
        headerMap[fields[i].trim().replace(/\r/g, "")] = i;
      }
      console.log(`✅ Found ${Object.keys(headerMap).length} columns\n`);
      continue;
    }

    totalRows++;

    const get = (col) =>
      (fields[headerMap[col]] || "").trim().replace(/\r/g, "");

    const siteId = get("SITE_ID");
    if (!siteId) continue;

    const easting = parseFloat(get("SURVEY_RANKED_EASTING"));
    const northing = parseFloat(get("SURVEY_RANKED_NORTHING"));

    if (isNaN(easting) || isNaN(northing)) {
      skippedNoCoords++;
      continue;
    }

    const dateStr = get("EVENT_DATE");
    const timestamp = parseDate(dateStr);
    if (!timestamp) {
      skippedNoDate++;
      continue;
    }

    const speciesName = get("SPECIES_NAME");
    const latinName = get("LATIN_NAME");
    const allRuns = parseInt(get("ALL_RUNS"), 10);
    const count = isNaN(allRuns) ? 0 : allRuns;

    // Get or create site
    if (!sites.has(siteId)) {
      sites.set(siteId, {
        siteName: get("SITE_NAME"),
        waterbody: get("GEO_WATERBODY"),
        region: get("REGION"),
        area: get("AREA"),
        easting,
        northing,
        surveyDates: new Set(),
        species: new Map(),
      });
    }

    const site = sites.get(siteId);
    site.surveyDates.add(dateStr);

    // Accumulate species data
    if (speciesName) {
      if (!site.species.has(speciesName)) {
        site.species.set(speciesName, {
          latin: latinName,
          counts: [],
        });
      }
      site.species.get(speciesName).counts.push({
        timestamp,
        value: count,
      });
    }

    if (totalRows % 200000 === 0) {
      console.log(
        `  ⏳ ${totalRows.toLocaleString()} rows processed, ${sites.size.toLocaleString()} sites found...`
      );
    }
  }

  console.log(
    `\n📊 Parsed ${totalRows.toLocaleString()} rows → ${sites.size.toLocaleString()} unique sites\n`
  );

  // ── Build GeoJSON for map markers ──────────────────────────

  console.log(`📍 Building fish_sites.geojson...`);

  const features = [];

  for (const [siteId, site] of sites) {
    const [lng, lat] = convertCoords(site.easting, site.northing, coordCache);

    // Sort survey dates to get first and last
    const sortedDates = [...site.surveyDates].sort((a, b) => {
      return parseDate(a) - parseDate(b);
    });

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
      properties: {
        siteId,
        name: site.siteName,
        waterbody: site.waterbody || null,
        region: site.region,
        area: site.area,
        totalSurveys: site.surveyDates.size,
        speciesCount: site.species.size,
        firstSurvey: sortedDates[0] || null,
        lastSurvey: sortedDates[sortedDates.length - 1] || null,
      },
    });
  }

  const geojson = {
    type: "FeatureCollection",
    features,
  };

  writeFileSync(SITES_FILE, JSON.stringify(geojson), "utf-8");

  const sitesMB = (Buffer.byteLength(JSON.stringify(geojson)) / 1e6).toFixed(2);
  console.log(`   ✅ ${SITES_FILE} (${sitesMB} MB, ${features.length} sites)\n`);

  // ── Build per-site observation files ───────────────────────

  console.log(`📈 Writing per-site observation files...`);

  let filesWritten = 0;

  for (const [siteId, site] of sites) {
    const speciesArray = [];

    for (const [speciesName, speciesData] of site.species) {
      // Sort counts by date
      speciesData.counts.sort((a, b) => a.timestamp - b.timestamp);

      // Aggregate: if multiple entries for same date (multiple runs/surveys),
      // sum them
      const byDate = new Map();
      for (const c of speciesData.counts) {
        const existing = byDate.get(c.timestamp) || 0;
        byDate.set(c.timestamp, existing + c.value);
      }

      const data = [...byDate.entries()]
        .map(([timestamp, value]) => ({ timestamp, value }))
        .sort((a, b) => a.timestamp - b.timestamp);

      speciesArray.push({
        code: speciesName,
        name: `${speciesName} (${speciesData.latin})`,
        unit: "count",
        data,
      });
    }

    // Sort species alphabetically
    speciesArray.sort((a, b) => a.code.localeCompare(b.code));

    const output = {
      siteId,
      siteName: site.siteName,
      waterbody: site.waterbody || null,
      totalSurveys: site.surveyDates.size,
      species: speciesArray,
    };

    writeFileSync(
      `${OBS_DIR}/${siteId}.json`,
      JSON.stringify(output),
      "utf-8"
    );
    filesWritten++;
  }

  console.log(`   ✅ ${filesWritten.toLocaleString()} observation files written\n`);

  // ── Summary ────────────────────────────────────────────────

  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`  Done!`);
  console.log(`   📊 ${totalRows.toLocaleString()} input rows`);
  console.log(`   📍 ${sites.size.toLocaleString()} unique sites`);
  console.log(`   📁 ${SITES_FILE} (${sitesMB} MB)`);
  console.log(`   📂 ${OBS_DIR}/ (${filesWritten} files)`);
  console.log(`   ⚠️  ${skippedNoCoords.toLocaleString()} skipped (no coordinates)`);
  console.log(`   ⚠️  ${skippedNoDate.toLocaleString()} skipped (no date)`);
  console.log(`═══════════════════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});