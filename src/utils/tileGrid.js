/**
 * Shared utilities for viewport-based 1°×1° grid tile loading.
 * Used by RiverLayer and usePointTiles.
 */

export const DEBOUNCE_MS = 300;
export const MAX_CONCURRENT_FETCHES = 3;

/**
 * Calculate which 1°×1° grid tiles are visible in the current map bounds.
 * Returns array of tile keys like ["54_-2", "54_-1", "55_-2", "55_-1"].
 */
export function calculateVisibleTiles(bounds) {
  const south = Math.floor(bounds.getSouth());
  const north = Math.floor(bounds.getNorth());
  const west = Math.floor(bounds.getWest());
  const east = Math.floor(bounds.getEast());

  const tiles = [];
  for (let lat = south; lat <= north; lat++) {
    for (let lng = west; lng <= east; lng++) {
      tiles.push(`${lat}_${lng}`);
    }
  }
  return tiles;
}
