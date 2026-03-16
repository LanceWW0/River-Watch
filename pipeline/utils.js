/**
 * Shared utilities for the EA Water Quality pre-processing pipeline.
 * - Fetch with retry/backoff
 * - BNG (EPSG:27700) → WGS84 coordinate conversion
 * - Progress logging
 */

import proj4 from "proj4";

// ── Coordinate conversion ────────────────────────────────────────────────────

// British National Grid (EPSG:27700) definition
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 " +
    "+x_0=400000 +y_0=-100000 +ellps=airy " +
    "+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs"
);

const bngToWgs84 = proj4("EPSG:27700", "EPSG:4326");

/**
 * Convert BNG easting/northing to WGS84 [lng, lat].
 * Returns null if inputs are missing or invalid.
 */
export function convertBNG(easting, northing) {
  if (easting == null || northing == null) return null;
  const e = Number(easting);
  const n = Number(northing);
  if (isNaN(e) || isNaN(n) || e === 0 || n === 0) return null;
  try {
    const [lng, lat] = bngToWgs84.forward([e, n]);
    if (lat < 49 || lat > 61 || lng < -9 || lng > 3) return null;
    return [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
  } catch {
    return null;
  }
}

// ── Fetch with retry ─────────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1000;

/**
 * Fetch a URL with exponential backoff retry on transient errors.
 * Returns the parsed JSON response.
 */
export async function fetchWithRetry(
  url,
  { maxRetries = DEFAULT_MAX_RETRIES, baseDelay = DEFAULT_BASE_DELAY_MS } = {}
) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);

      if (res.status === 429) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`  ⏳ Rate limited (429), retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
        continue;
      }

      if (res.status >= 500) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(
          `  ⚠️  Server error (${res.status}), retrying in ${Math.round(delay)}ms...`
        );
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${url}`);
      }

      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.name !== "Error" || !err.message.startsWith("HTTP")) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        if (attempt < maxRetries) {
          console.warn(
            `  🔄 Network error, retrying in ${Math.round(delay)}ms: ${err.message}`
          );
          await sleep(delay);
          continue;
        }
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// ── Paginated fetch ──────────────────────────────────────────────────────────

/**
 * Fetch all pages from an EA Water Quality API endpoint.
 * The EA Water Quality API uses ?skip=N&limit=250 for pagination.
 * Calls onPage(items, pageIndex) after each page.
 * Returns the total number of items fetched.
 */
export async function fetchAllPages(
  baseUrl,
  { limit = 250, onPage, delayBetweenPages = 150 } = {}
) {
  let skip = 0;
  let pageIndex = 0;
  let totalFetched = 0;
  const separator = baseUrl.includes("?") ? "&" : "?";

  while (true) {
    const url = `${baseUrl}${separator}skip=${skip}&limit=${limit}`;
    const data = await fetchWithRetry(url);

    const items = data?.items ?? data?.result?.items ?? [];
    if (items.length === 0) break;

    if (onPage) await onPage(items, pageIndex);

    totalFetched += items.length;
    pageIndex++;

    if (items.length < limit) break;

    skip += limit;
    if (delayBetweenPages > 0) await sleep(delayBetweenPages);
  }

  return totalFetched;
}

// ── Progress logging ─────────────────────────────────────────────────────────

export function createProgress(label, total = null) {
  let current = 0;
  const start = Date.now();

  return {
    increment(n = 1) {
      current += n;
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const totalStr = total ? ` / ${total}` : "";
      const pctStr = total ? ` (${((current / total) * 100).toFixed(1)}%)` : "";
      process.stdout.write(
        `\r  ${label}: ${current}${totalStr}${pctStr} — ${elapsed}s elapsed`
      );
    },
    done(message) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stdout.write(`\r  ${label}: ${message} in ${elapsed}s\n`);
    },
    get current() {
      return current;
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function asyncPool(tasks, concurrency = 6) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}