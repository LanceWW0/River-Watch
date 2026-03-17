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
 * - Controlled concurrency: processes N points in parallel (default 5)
 * - Graceful rate limiting with exponential backoff
 * - Progress logging with ETA
 *
 * Usage:
 *   node fetch-observations.js                    # process all points
 *   node fetch-observations.js --force            # re-fetch even if file exists
 *   node fetch-observations.js --concurrency 2    # fewer parallel requests
 *   node fetch-observations.js --limit 100        # only process first 100 points
 *   node fetch-observations.js --filter "active"  # only active points
 *   node fetch-observations.js --open-only        # skip CLOSED points
 */

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { execSync } from "node:child_process";
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
const OPEN_ONLY = args.includes("--open-only");
const CONCURRENCY = parseInt(getArg("concurrency", "5"), 10);
const LIMIT = getArg("limit", null)
  ? parseInt(getArg("limit", null), 10)
  : null;
const STATUS_FILTER = getArg("filter", null);
const PROGRESS_INTERVAL = 100; // Log summary every N points

// ── Extract observation fields ───────────────────────────────────────────────

function extractObservation(item) {
  // Determinand
  const detRaw = item?.observedProperty;
  const determinand = detRaw?.notation;
  if (!determinand) return null;
  const detLabel = detRaw?.prefLabel ?? detRaw?.altLabel ?? determinand;

  // Unit
  const unitRaw = item?.hasResult?.hasUnit;
  const unit = unitRaw?.altLabel ?? unitRaw?.prefLabel ?? item?.hasUnit ?? "";

  // Value — prefer numericValue, fall back to upperBound (for "<X" readings)
  let value = item?.hasResult?.numericValue ?? null;
  if (value == null) {
    value = item?.hasResult?.upperBound ?? null;
  }
  if (value != null) {
    value = Number(value);
    if (isNaN(value)) value = null;
  }

  // Date
  const date = item?.phenomenonTime ?? null;
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
      delayBetweenPages: 50,
      onPage(items) {
        for (const item of items) {
          const obs = extractObservation(item);
          if (obs) allObs.push(obs);
        }
      },
    });
  } catch (err) {
    console.warn(
      `\n  ❌ Failed to fetch observations for ${notation}: ${err.message}`,
    );
    return { notation, status: "error", observations: 0, error: err.message };
  }

  if (allObs.length === 0) {
    return { notation, status: "empty", observations: 0 };
  }

  // Group by determinand
  // Group by determinand
  const grouped = {};
  for (const obs of allObs) {
    if (!grouped[obs.det]) {
      grouped[obs.det] = {
        code: obs.det,
        name: obs.detLabel,
        unit: obs.unit,
        data: [],
      };
    }
    grouped[obs.det].data.push({
      timestamp: new Date(obs.d).getTime(),
      value: obs.v,
    });
  }

  // Sort each determinand's data by timestamp
  for (const det of Object.values(grouped)) {
    det.data.sort((a, b) => a.timestamp - b.timestamp);
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

function getDiskUsage(dir) {
  try {
    const output = execSync(`du -sh "${dir}" 2>/dev/null`, { encoding: "utf-8" });
    return output.split("\t")[0].trim();
  } catch {
    return "unknown";
  }
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

  // Apply --open-only filter (skip CLOSED points)
  if (OPEN_ONLY) {
    const before = points.length;
    points = points.filter((p) => p.status !== "CLOSED");
    console.log(`   --open-only: ${points.length} of ${before} points (skipped ${before - points.length} CLOSED)`);
  }

  // Apply status filter
  if (STATUS_FILTER) {
    const before = points.length;
    points = points.filter((p) =>
      p.status.toLowerCase().includes(STATUS_FILTER.toLowerCase()),
    );
    console.log(`   Filtered by status "${STATUS_FILTER}": ${points.length} of ${before}`);
  }

  if (LIMIT) {
    points = points.slice(0, LIMIT);
    console.log(`   Limited to first ${LIMIT} points`);
  }

  console.log(`   ${points.length} points to process\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log(`📡 Fetching observations (concurrency: ${CONCURRENCY}, force: ${FORCE})...\n`);

  const stats = { ok: 0, skipped: 0, empty: 0, error: 0, totalObs: 0 };
  const startTime = Date.now();
  let processed = 0;
  let lastProgressLog = 0;

  const total = points.length;

  // Process points in batches of CONCURRENCY
  for (let i = 0; i < points.length; i += CONCURRENCY) {
    const batch = points.slice(i, i + CONCURRENCY);
    
    // Process batch in parallel
    const results = await Promise.all(batch.map((p) => processPoint(p.notation)));

    // Update stats
    for (const result of results) {
      stats[result.status] = (stats[result.status] || 0) + 1;
      stats.totalObs += result.observations;
      processed++;

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (total - processed) / rate;
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
          `ETA: ${formatDuration(remaining)} | ` +
          `ok:${stats.ok} skip:${stats.skipped} empty:${stats.empty} err:${stats.error}   `,
      );
    }

    // Print progress summary every PROGRESS_INTERVAL points
    if (processed >= lastProgressLog + PROGRESS_INTERVAL) {
      lastProgressLog = Math.floor(processed / PROGRESS_INTERVAL) * PROGRESS_INTERVAL;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (total - processed) / rate;
      
      console.log(`\n\n  ─── Progress Summary (${processed}/${total}) ───`);
      console.log(`  ⏱️  Elapsed: ${formatDuration(elapsed)} | ETA: ${formatDuration(remaining)} | Rate: ${rate.toFixed(1)} pts/s`);
      console.log(`  ✅ OK: ${stats.ok} | 📭 Empty: ${stats.empty} | ⏭️  Skipped: ${stats.skipped} | ❌ Errors: ${stats.error}`);
      console.log(`  📈 Observations so far: ${stats.totalObs.toLocaleString()}\n`);
    }

    // Small delay between batches to avoid overwhelming the API
    if (i + CONCURRENCY < points.length) {
      await sleep(50);
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;
  const diskUsage = getDiskUsage(OUTPUT_DIR);

  console.log(`\n\n═══════════════════════════════════════════════════════`);
  console.log(`  Final Summary`);
  console.log(`═══════════════════════════════════════════════════════\n`);
  console.log(`  ⏱️  Total time: ${formatDuration(totalTime)}`);
  console.log(`  📊 Points with data: ${stats.ok}`);
  console.log(`  📭 Points with no observations: ${stats.empty}`);
  console.log(`  ⏭️  Skipped (already existed): ${stats.skipped}`);
  console.log(`  ❌ Errors: ${stats.error}`);
  console.log(`  📈 Total observations written: ${stats.totalObs.toLocaleString()}`);
  console.log(`  📁 Output: ${OUTPUT_DIR}/`);
  console.log(`  💾 Disk usage: ${diskUsage}\n`);
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
