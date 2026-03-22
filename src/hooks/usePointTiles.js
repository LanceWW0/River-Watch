import { useEffect, useRef, useState, useCallback } from "react";
import { useMapEvents } from "react-leaflet";
import {
  calculateVisibleTiles,
  DEBOUNCE_MS,
  MAX_CONCURRENT_FETCHES,
} from "../utils/tileGrid";

/**
 * Hook that loads point data from tiled GeoJSON files based on the current
 * map viewport. Tiles are cached permanently once loaded.
 *
 * @param {Object} options
 * @param {string} options.tileDir - Directory under /data/ (e.g. "point_tiles")
 * @param {string} options.filePrefix - Filename prefix (e.g. "points")
 * @param {boolean} options.enabled - Whether this layer is visible
 * @param {function} options.transformFeature - Converts a GeoJSON feature to a marker data object
 * @returns {{ points: Array, totalCount: number }}
 */
export default function usePointTiles({
  tileDir,
  filePrefix,
  enabled,
  transformFeature,
}) {
  // Cached tile data: Map<tileKey, transformedPoints[]>
  const tilesRef = useRef(new Map());
  const loadedKeysRef = useRef(new Set());
  const debounceTimerRef = useRef(null);
  const fetchQueueRef = useRef([]);
  const activeFetchesRef = useRef(0);
  const abortControllerRef = useRef(null);
  const manifestRef = useRef(null);

  const [points, setPoints] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  // Rebuild the merged points array from all cached tiles
  const rebuildPoints = useCallback(() => {
    const all = [];
    for (const arr of tilesRef.current.values()) {
      all.push(...arr);
    }
    setPoints(all);
  }, []);

  // Fetch a single tile
  const fetchTile = useCallback(
    async (tileKey, signal) => {
      const [lat, lng] = tileKey.split("_");
      const url = `/data/${tileDir}/${filePrefix}_${lat}_${lng}.geojson`;

      try {
        const res = await fetch(url, { signal });

        if (res.status === 404) {
          loadedKeysRef.current.add(tileKey);
          return;
        }

        if (!res.ok) {
          loadedKeysRef.current.add(tileKey);
          return;
        }

        const geojson = await res.json();
        const transformed = geojson.features.map(transformFeature);
        tilesRef.current.set(tileKey, transformed);
        loadedKeysRef.current.add(tileKey);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn(`Error loading tile ${tileDir}/${tileKey}:`, err);
        loadedKeysRef.current.add(tileKey);
      }
    },
    [tileDir, filePrefix, transformFeature]
  );

  // Process fetch queue with concurrency limit
  const processFetchQueue = useCallback(() => {
    const signal = abortControllerRef.current?.signal;

    while (
      fetchQueueRef.current.length > 0 &&
      activeFetchesRef.current < MAX_CONCURRENT_FETCHES
    ) {
      const tileKey = fetchQueueRef.current.shift();
      if (!tileKey || loadedKeysRef.current.has(tileKey)) continue;

      activeFetchesRef.current++;

      fetchTile(tileKey, signal).then(() => {
        activeFetchesRef.current--;
        rebuildPoints();
        processFetchQueue();
      });
    }
  }, [fetchTile, rebuildPoints]);

  // Queue tiles for fetching
  const queueTiles = useCallback(
    (tileKeys) => {
      const newKeys = tileKeys.filter(
        (key) => !loadedKeysRef.current.has(key)
      );
      if (newKeys.length === 0) return;

      fetchQueueRef.current.push(...newKeys);
      processFetchQueue();
    },
    [processFetchQueue]
  );

  // Update visible tiles based on current viewport
  const updateVisibleTiles = useCallback(
    (map) => {
      if (!enabled) return;

      const bounds = map.getBounds();
      const tiles = calculateVisibleTiles(bounds);

      // Only queue tiles that exist in the manifest
      if (manifestRef.current) {
        const validTiles = tiles.filter(
          (key) => key in manifestRef.current.tiles
        );
        queueTiles(validTiles);
      } else {
        queueTiles(tiles);
      }
    },
    [enabled, queueTiles]
  );

  // Debounced viewport handler
  const debouncedUpdate = useCallback(
    (map) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(
        () => updateVisibleTiles(map),
        DEBOUNCE_MS
      );
    },
    [updateVisibleTiles]
  );

  // Listen to map events
  const map = useMapEvents({
    moveend: () => debouncedUpdate(map),
    zoomend: () => debouncedUpdate(map),
  });

  // Fetch manifest and do initial tile load on mount
  useEffect(() => {
    abortControllerRef.current = new AbortController();

    async function init() {
      try {
        const res = await fetch(`/data/${tileDir}/manifest.json`, {
          signal: abortControllerRef.current.signal,
        });
        if (res.ok) {
          const manifest = await res.json();
          manifestRef.current = manifest;
          setTotalCount(manifest.totalFeatures);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn(`Failed to load manifest for ${tileDir}:`, err);
        }
      }

      // Initial load for current viewport
      if (enabled) {
        // Small delay to ensure map is ready
        setTimeout(() => updateVisibleTiles(map), 100);
      }
    }

    init();

    return () => {
      abortControllerRef.current?.abort();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [tileDir]); // Only re-run if tileDir changes

  // When layer is toggled on, load visible tiles and rebuild points
  useEffect(() => {
    if (enabled) {
      rebuildPoints();
      updateVisibleTiles(map);
    }
  }, [enabled]);

  return { points, totalCount };
}
