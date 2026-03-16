#!/usr/bin/env node

/**
 * Script 2: Fetch Observations
 *
 * Reads the points.geojson produced by Script 1, then for each sampling
 * point fetches all observations from the EA API. Observations are
 * stripped to essential fields, grouped by determinand, sorted by date,
 * and written to individual files: data/observations/{notation}.json
 *
 * Features:
 * - Resumable: skips points that already have output files (use --force to override)
 * - Controlled concurrency: processes N points in parallel (default 4)
 * - Graceful rate limiting with exponential backoff
 * - Progress logging with ETA
 *
 * Usage:
 *   node fetch-observations.js                    # process all points
 *   node fetch-observations.js --force            # re-fetch even if file exists
 *   node fetch-observations.js --concurrency 2    # fewer parallel requests
 *   node fetch-observations.js --limit 100        # only process first 100 points
 *   node fetch-observations.js --filter "active"  # only active points
 */

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { fetchAllPages, sleep } from "./utils.js";

// ── Config ───────────────────────────────────────────────────────────────────

const EA_BASE = "https://environment.data.gov.uk/water-quality/sampling-point";
const POINTS_FILE = "data/points.geojson";
const OUTPUT_DIR = "data/observations";

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] ?? defaultVal;
}
const FORCE = args.includes("--force");
const CONCURRENCY = parseInt(getArg("concurrency", "4"), 10);
const LIMIT = getArg("limit", null) ? parseInt(getArg("limit", null), 10) : null;
const STATUS_FILTER = getArg("filter", null);

// ── Extract observation fields ───────────────────────────────────────────────

function extractObservation(item) {
  // Determinand
  const detRaw = item?.determinand;
  const determinand =
    typeof detRaw === "object"
      ? detRaw?.notation ?? detRaw?.label ?? detRaw?.["@id"]?.split("/").pop()
      : detRaw;
  if (!determinand) return null;

  const detLabel =
    typeof detRaw === "object" ? detRaw?.label ?? determinand : determinand;

  // Unit
  const unitRaw = item?.determinand?.unit;
  const unit =
    typeof unitRaw === "object"
      ? unitRaw?.label ?? unitRaw?.["@id"]?.split("/").pop() ?? ""
      : unitRaw ?? "";

  // Value — prefer numericValue, fall back to result (which may include upperBound)
  let value = null;
  const resultRaw = item?.result;
  if (typeof resultRaw === "object") {
    value = resultRaw?.numericValue ?? resultRaw?.value ?? null;
    if (value == null && resultRaw?.upperBound != null) {
      value = resultRaw.upperBound;
    }
  } else if (resultRaw != null) {
    value = resultRaw;
  }

  if (value != null) {
    value = Number(value);
    if (isNaN(value)) value = null;
  }

  // Date
  const date = item?.sample?.dateTime ?? item?.sample?.date ?? item?.dateTime ?? null;
  if (!date) return null;

  return {
    d: date,
    v: value,
    det: determinand,
    detLabel,
    unit,
  };
}

// ── Process a single sampling point ──────────────────────────────────────────

async function processPoint(notation) {
  const outputFile = `${OUTPUT_DIR}/${notation}.json`;

  // Check if already processed (resume support)
  if (!FORCE) {
    try {
      await access(outputFile);
      return { notation, status: "skipped", observations: 0 };
    } catch {
      // File doesn't exist, proceed
    }
  }

  const url = `${EA_BASE}/${notation}/observation`;
  const allObs = [];

  try {
    await fetchAllPages(url, {
      limit: 250,
      delayBetweenPages: 100,
      onPage(items) {
        for (const item of items) {
          const obs = extractObservation(item);
          if (obs) allObs.push(obs);
        }
      },
    });
  } catch (err) {
    console.warn(`\n  ❌ Failed to fetch observations for ${notation}: ${err.message}`);
    return { notation, status: "error", observations: 0, error: err.message };
  }

  if (allObs.length === 0) {
    return { notation, status: "empty", observations: 0 };
  }

  // Group by determinand
  const grouped = {};
  for (const obs of allObs) {
    if (!grouped[obs.det]) {
      grouped[obs.det] = {
        determinand: obs.det,
        label: obs.detLabel,
        unit: obs.unit,
        readings: [],
      };
    }
    grouped[obs.det].readings.push({
      d: obs.d,
      v: obs.v,
    });
  }

  // Sort each determinand's readings by date
  for (const det of Object.values(grouped)) {
    det.readings.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  }

  const output = {
    notation,
    fetchedAt: new Date().toISOString(),
    totalObservations: allObs.length,
    determinands: Object.values(grouped),
  };

  await writeFile(outputFile, JSON.stringify(output), "utf-8");

  return { notation, status: "ok", observations: allObs.length };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  EA Water Quality — Fetch Observations");
  console.log("═══════════════════════════════════════════════════════\n");

  // Load points
  console.log(`📂 Loading ${POINTS_FILE}...`);
  let geojson;
  try {
    const raw = await readFile(POINTS_FILE, "utf-8");
    geojson = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Could not read ${POINTS_FILE}: ${err.message}`);
    console.error(`   Run fetch-points.js first to generate it.`);
    process.exit(1);
  }

  let points = geojson.features.map((f) => ({
    notation: f.properties.n,
    status: f.properties.s,
  }));

  // Apply filters
  if (STATUS_FILTER) {
    const before = points.length;
    points = points.filter((p) =>
      p.status.toLowerCase().includes(STATUS_FILTER.toLowerCase())
    );
    console.log(
      `   Filtered by status "${STATUS_FILTER}": ${points.length} of ${before}`
    );
  }

  if (LIMIT) {
    points = points.slice(0, LIMIT);
    console.log(`   Limited to first ${LIMIT} points`);
  }

  console.log(`   ${points.length} points to process\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log(
    `📡 Fetching observations (concurrency: ${CONCURRENCY}, force: ${FORCE})...\n`
  );

  const stats = { ok: 0, skipped: 0, empty: 0, error: 0, totalObs: 0 };
  const startTime = Date.now();
  let processed = 0;

  const total = points.length;

  async function worker(workerPoints) {
    for (const point of workerPoints) {
      const result = await processPoint(point.notation);

      stats[result.status] = (stats[result.status] || 0) + 1;
      stats.totalObs += result.observations;
      processed++;

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = ((total - processed) / rate).toFixed(0);
      const pct = ((processed / total) * 100).toFixed(1);

      const statusIcon =
        result.status === "ok"
          ? "✅"
          : result.status === "skipped"
            ? "⏭️ "
            : result.status === "empty"
              ? "📭"
              : "❌";

      process.stdout.write(
        `\r  ${statusIcon} ${processed}/${total} (${pct}%) | ` +
          `${result.notation} → ${result.observations} obs | ` +
          `ETA: ${remaining}s | ` +
          `ok:${stats.ok} skip:${stats.skipped} empty:${stats.empty} err:${stats.error}`
      );

      await sleep(50);
    }
  }

  // Split points across workers
  const chunks = Array.from({ length: CONCURRENCY }, () => []);
  points.forEach((p, i) => chunks[i % CONCURRENCY].push(p));

  await Promise.all(chunks.map((chunk) => worker(chunk)));

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n\n✅ Done in ${totalTime}s!`);
  console.log(`   📊 ${stats.ok} points with data`);
  console.log(`   📭 ${stats.empty} points with no observations`);
  console.log(`   ⏭️  ${stats.skipped} skipped (already existed)`);
  console.log(`   ❌ ${stats.error} errors`);
  console.log(`   📈 ${stats.totalObs.toLocaleString()} total observations written`);
  console.log(`   📁 Output: ${OUTPUT_DIR}/\n`);
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});