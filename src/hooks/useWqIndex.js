import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Hook that loads the preprocessed water quality index and config,
 * and provides on-demand tile detail fetching.
 *
 * @returns {{
 *   wqPoints: Array,
 *   wqLookup: Map<string, object>,
 *   wqConfig: object|null,
 *   totalCount: number,
 *   getPointDetail: (id: string, lat: number, lon: number) => Promise<object|null>,
 *   loading: boolean,
 * }}
 */
export default function useWqIndex() {
  const [wqPoints, setWqPoints] = useState([]);
  const [wqConfig, setWqConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const lookupRef = useRef(new Map());
  const tileCacheRef = useRef(new Map());

  // Load index + config on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [indexRes, configRes] = await Promise.all([
          fetch("/data/wq/wq_index.json"),
          fetch("/data/wq/wq_config.json"),
        ]);

        if (cancelled) return;

        if (indexRes.ok && configRes.ok) {
          const index = await indexRes.json();
          const config = await configRes.json();

          const lookup = new Map();
          for (const pt of index) {
            lookup.set(pt.id, pt);
          }

          lookupRef.current = lookup;
          if (!cancelled) {
            setWqPoints(index);
            setWqConfig(config);
          }
        }
      } catch (err) {
        console.warn("Failed to load WQ index/config:", err);
      }
      if (!cancelled) setLoading(false);
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Fetch a tile detail file (cached)
  const fetchTileDetail = useCallback(async (latInt, lonInt) => {
    const key = `${latInt}_${lonInt}`;
    if (tileCacheRef.current.has(key)) {
      return tileCacheRef.current.get(key);
    }

    try {
      const res = await fetch(`/data/wq/tiles/wq_${latInt}_${lonInt}.json`);
      if (!res.ok) {
        tileCacheRef.current.set(key, null);
        return null;
      }
      const data = await res.json();
      tileCacheRef.current.set(key, data);
      return data;
    } catch {
      tileCacheRef.current.set(key, null);
      return null;
    }
  }, []);

  // Get detail for a specific point from its tile
  const getPointDetail = useCallback(async (id, lat, lon) => {
    const latInt = Math.floor(lat);
    const lonInt = Math.floor(lon);
    const tile = await fetchTileDetail(latInt, lonInt);
    if (!tile) return null;
    return tile.find((p) => p.id === id) || null;
  }, [fetchTileDetail]);

  return {
    wqPoints,
    wqLookup: lookupRef.current,
    wqConfig,
    totalCount: wqConfig?.total_points || 0,
    getPointDetail,
    loading,
  };
}
