"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useMap, useMapEvents, GeoJSON } from "react-leaflet";
import L from "leaflet";
import { calculateVisibleTiles, DEBOUNCE_MS } from "../utils/tileGrid";

const MAX_CONCURRENT_FETCHES = 4;

const MIN_ZOOM = 10;
const DETAIL_ZOOM = 12; // Use full detail tiles at this zoom and above
const INTERACTIVE_ZOOM = 13;

// Base style for rivers
const BASE_STYLE = {
  color: "#0e7490",
  weight: 3,
  opacity: 0.5,
};

// Highlighted style for selected river
const SELECTED_STYLE = {
  color: "#06b6d4",
  weight: 6,
  opacity: 1.0,
};

// Hover style
const HOVER_STYLE = {
  color: "#22d3ee",
  weight: 5,
  opacity: 0.85,
};

// Dimmed style for non-selected rivers when one is selected
const DIMMED_STYLE = {
  opacity: 0.3,
};

// Style variants based on river form
const FORM_STYLES = {
  inlandRiver: { color: "#0e7490" },
  tidalRiver: { color: "#0d5c6d" },
  lake: { color: "#0284c7" },
  canal: { color: "#0e7490", dashArray: "5, 5" },
};

// Human-readable form labels
const FORM_LABELS = {
  inlandRiver: "Inland River",
  tidalRiver: "Tidal River",
  lake: "Lake",
  canal: "Canal",
};

function getFeatureStyle(feature, selectedRiver = null) {
  const form = feature.properties?.form;
  const name = feature.properties?.watercourse_name;
  const formStyle = FORM_STYLES[form] || {};
  
  // If a river is selected
  if (selectedRiver) {
    if (name === selectedRiver) {
      // This segment belongs to the selected river
      return { ...BASE_STYLE, ...formStyle, ...SELECTED_STYLE };
    } else {
      // Dim other rivers
      return { ...BASE_STYLE, ...formStyle, ...DIMMED_STYLE };
    }
  }
  
  return { ...BASE_STYLE, ...formStyle };
}

function getHoverStyle(feature, selectedRiver = null) {
  const name = feature.properties?.watercourse_name;

  // If this river is selected, keep the selected style
  if (selectedRiver && name === selectedRiver) {
    return getFeatureStyle(feature, selectedRiver);
  }

  const form = feature.properties?.form;
  const formStyle = FORM_STYLES[form] || {};

  return {
    ...BASE_STYLE,
    ...formStyle,
    ...HOVER_STYLE,
  };
}

/**
 * River info panel component
 */
function RiverInfoPanel({ riverName, stats, onClose }) {
  if (!riverName || !stats) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(4rem + 12px)",
        right: 16,
        zIndex: 1100,
        background: "white",
        padding: "16px 20px",
        borderRadius: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
        minWidth: 220,
        maxWidth: 300,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#0e7490" }}>
            {riverName}
          </h3>
          {stats.forms.length > 0 && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              {stats.forms.join(" • ")}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            color: "#94a3b8",
            fontSize: 18,
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      
      <div style={{ marginTop: 12, display: "flex", gap: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#334155" }}>
            {stats.segmentCount}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase" }}>
            segments
          </div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#334155" }}>
            {stats.totalLengthKm}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase" }}>
            km (loaded)
          </div>
        </div>
      </div>

      <div style={{ 
        marginTop: 12, 
        paddingTop: 12, 
        borderTop: "1px solid #e2e8f0",
        fontSize: 11, 
        color: "#94a3b8", 
        fontStyle: "italic" 
      }}>
        Water quality data coming soon
      </div>
    </div>
  );
}

export default function RiverLayer() {
  const map = useMap();
  
  // Refs for persistent data across re-renders
  // Keys are prefixed: "s_54_-2" for simplified, "f_54_-2" for full detail
  const tilesRef = useRef(new Map()); // Map<prefixedKey, FeatureCollection>
  const loadedKeysRef = useRef(new Set()); // Set<prefixedKey> - includes 404s
  const debounceTimerRef = useRef(null);
  const fetchQueueRef = useRef([]);
  const activeFetchesRef = useRef(0);
  const abortControllerRef = useRef(null);
  
  // State to trigger re-renders when tiles change
  const [visibleKeys, setVisibleKeys] = useState([]);
  const [tileVersion, setTileVersion] = useState(0);
  const [useSimplified, setUseSimplified] = useState(true);
  
  // Selected river state
  const [selectedRiver, setSelectedRiver] = useState(null);

  /**
   * Fetch a single tile, handling 404s gracefully
   */
  const fetchTile = useCallback(async (tileKey, simplified, signal) => {
    const [lat, lng] = tileKey.split("_");
    const prefix = simplified ? "s" : "f";
    const prefixedKey = `${prefix}_${tileKey}`;
    const folder = simplified ? "river_tiles_simplified" : "river_tiles";
    const url = `/data/${folder}/rivers_${lat}_${lng}.geojson`;

    try {
      const res = await fetch(url, { signal });
      
      if (res.status === 404) {
        // Mark as loaded but don't store data
        loadedKeysRef.current.add(prefixedKey);
        return null;
      }
      
      if (!res.ok) {
        console.warn(`Failed to load river tile ${prefixedKey}: ${res.status}`);
        loadedKeysRef.current.add(prefixedKey);
        return null;
      }

      const geojson = await res.json();
      tilesRef.current.set(prefixedKey, geojson);
      loadedKeysRef.current.add(prefixedKey);
      return geojson;
    } catch (err) {
      if (err.name === "AbortError") return null;
      console.warn(`Error loading river tile ${prefixedKey}:`, err);
      loadedKeysRef.current.add(prefixedKey);
      return null;
    }
  }, []);

  /**
   * Process the fetch queue with concurrency limit
   */
  const processFetchQueue = useCallback(async () => {
    const signal = abortControllerRef.current?.signal;
    
    while (fetchQueueRef.current.length > 0 && activeFetchesRef.current < MAX_CONCURRENT_FETCHES) {
      const item = fetchQueueRef.current.shift();
      if (!item) continue;
      
      const { tileKey, simplified } = item;
      const prefix = simplified ? "s" : "f";
      const prefixedKey = `${prefix}_${tileKey}`;
      
      if (loadedKeysRef.current.has(prefixedKey)) continue;
      
      activeFetchesRef.current++;
      
      fetchTile(tileKey, simplified, signal).then(() => {
        activeFetchesRef.current--;
        setTileVersion((v) => v + 1);
        processFetchQueue();
      });
    }
  }, [fetchTile]);

  /**
   * Queue tiles for fetching
   */
  const queueTiles = useCallback((tileKeys, simplified) => {
    const prefix = simplified ? "s" : "f";
    const newItems = tileKeys
      .filter((key) => !loadedKeysRef.current.has(`${prefix}_${key}`))
      .map((tileKey) => ({ tileKey, simplified }));
    
    if (newItems.length === 0) return;
    
    fetchQueueRef.current.push(...newItems);
    processFetchQueue();
  }, [processFetchQueue]);

  /**
   * Handle viewport changes (debounced)
   */
  const updateVisibleTiles = useCallback(() => {
    const zoom = map.getZoom();
    
    if (zoom < MIN_ZOOM) {
      setVisibleKeys([]);
      return;
    }

    const simplified = zoom < DETAIL_ZOOM;
    setUseSimplified(simplified);

    const bounds = map.getBounds();
    const tiles = calculateVisibleTiles(bounds);
    
    setVisibleKeys(tiles);
    queueTiles(tiles, simplified);
  }, [map, queueTiles]);

  /**
   * Debounced viewport handler
   */
  const debouncedUpdate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(updateVisibleTiles, DEBOUNCE_MS);
  }, [updateVisibleTiles]);

  /**
   * Clear river selection
   */
  const clearSelection = useCallback(() => {
    setSelectedRiver(null);
  }, []);

  // Listen to map events
  useMapEvents({
    moveend: debouncedUpdate,
    zoomend: debouncedUpdate,
    click: () => {
      // Clear selection when clicking map background (not a river)
      // The river click handler will stop propagation
      clearSelection();
    },
  });

  // Handle Escape key to clear selection
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        clearSelection();
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection]);

  // Initial load on mount
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    
    // Small delay to ensure map is ready
    const timer = setTimeout(updateVisibleTiles, 100);
    
    return () => {
      clearTimeout(timer);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      abortControllerRef.current?.abort();
    };
  }, [updateVisibleTiles]);

  // Combine visible tiles into a single GeoJSON
  const combinedGeoJSON = useMemo(() => {
    const features = [];
    const prefix = useSimplified ? "s" : "f";
    
    for (const key of visibleKeys) {
      const prefixedKey = `${prefix}_${key}`;
      const tile = tilesRef.current.get(prefixedKey);
      if (tile?.features) {
        features.push(...tile.features);
      }
    }

    return {
      type: "FeatureCollection",
      features,
    };
  }, [visibleKeys, tileVersion, useSimplified]);

  // Calculate stats for selected river
  const riverStats = useMemo(() => {
    if (!selectedRiver) return null;
    
    let segmentCount = 0;
    let totalLength = 0;
    const forms = new Set();
    
    for (const feature of combinedGeoJSON.features) {
      if (feature.properties?.watercourse_name === selectedRiver) {
        segmentCount++;
        totalLength += feature.properties?.length || 0;
        if (feature.properties?.form) {
          forms.add(FORM_LABELS[feature.properties.form] || feature.properties.form);
        }
      }
    }
    
    return {
      segmentCount,
      totalLengthKm: (totalLength / 1000).toFixed(1),
      forms: Array.from(forms),
    };
  }, [selectedRiver, combinedGeoJSON]);

  // Style function for GeoJSON - uses selectedRiver from closure
  const styleFunction = useCallback((feature) => {
    return getFeatureStyle(feature, selectedRiver);
  }, [selectedRiver]);

  // Ref to track selected river in event handlers without stale closures
  const selectedRiverRef = useRef(selectedRiver);
  selectedRiverRef.current = selectedRiver;

  // Handler for river features - hover highlight and click selection
  const onEachFeature = useCallback((feature, layer) => {
    const zoom = map.getZoom();
    const name = feature.properties?.watercourse_name;

    if (zoom < INTERACTIVE_ZOOM) {
      layer.options.interactive = false;
      return;
    }

    layer.on({
      mouseover: () => {
        layer.setStyle(getHoverStyle(feature, selectedRiverRef.current));
        layer.bringToFront();
      },
      mouseout: () => {
        layer.setStyle(getFeatureStyle(feature, selectedRiverRef.current));
      },
      click: (e) => {
        L.DomEvent.stopPropagation(e);
        if (name) {
          setSelectedRiver(name);
        }
      },
    });
  }, [map]);

  // Don't render anything if no features or zoomed out
  if (visibleKeys.length === 0 || combinedGeoJSON.features.length === 0) {
    return null;
  }

  // Generate a stable key based on visible tiles, version, LOD level, and selected river
  // Including these forces re-render when they change
  const geoJSONKey = `rivers-${useSimplified ? "s" : "f"}-${visibleKeys.sort().join("-")}-${tileVersion}-${selectedRiver || "none"}`;

  return (
    <>
      <GeoJSON
        key={geoJSONKey}
        data={combinedGeoJSON}
        style={styleFunction}
        onEachFeature={onEachFeature}
      />
      <RiverInfoPanel 
        riverName={selectedRiver} 
        stats={riverStats} 
        onClose={clearSelection}
      />
    </>
  );
}
