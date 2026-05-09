"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import { Search, X, MapPin } from "lucide-react";

/**
 * Search bar with debounced Nominatim place lookup.
 * Renders absolute-positioned in the top-left of the map.
 * Dropdown closes on outside click or after selecting a result.
 */
export default function SearchBar() {
  const map = useMap();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Click-outside to close dropdown
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced Nominatim search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&countrycodes=gb&limit=6&addressdetails=1`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setOpen(true);
        }
      } catch (err) {
        console.warn("Search failed:", err);
      }
      setLoading(false);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSelect = (result) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    if (result.boundingbox && result.boundingbox.length === 4) {
      const [south, north, west, east] = result.boundingbox.map(parseFloat);
      map.flyToBounds(
        [
          [south, west],
          [north, east],
        ],
        { duration: 1.2, maxZoom: 14 }
      );
    } else if (!isNaN(lat) && !isNaN(lon)) {
      map.flyTo([lat, lon], 13, { duration: 1.2 });
    }

    // Show shortened name in the input
    const shortName = result.display_name.split(",")[0];
    setQuery(shortName);
    setOpen(false);
    if (inputRef.current) inputRef.current.blur();
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    if (inputRef.current) inputRef.current.focus();
  };

  // Format display name to show primary + secondary
  const formatResult = (result) => {
    const parts = result.display_name.split(",").map((s) => s.trim());
    const primary = parts[0];
    const secondary = parts.slice(1, 3).join(", ");
    return { primary, secondary };
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 1001,
        width: 260,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "white",
          borderRadius: 10,
          boxShadow:
            "0 2px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
          padding: "0 10px",
          height: 40,
          gap: 8,
        }}
      >
        <Search size={16} color="#64748b" style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="Search places…"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 13,
            color: "#1e293b",
            background: "transparent",
            minWidth: 0,
          }}
        />
        {loading && (
          <div
            style={{
              width: 12,
              height: 12,
              border: "2px solid #e2e8f0",
              borderTopColor: "#3b82f6",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              flexShrink: 0,
            }}
          />
        )}
        {query && !loading && (
          <button
            onClick={handleClear}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              display: "flex",
              alignItems: "center",
              color: "#94a3b8",
              flexShrink: 0,
            }}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div
          style={{
            marginTop: 4,
            background: "white",
            borderRadius: 10,
            boxShadow:
              "0 4px 20px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.08)",
            overflow: "hidden",
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {results.map((result) => {
            const { primary, secondary } = formatResult(result);
            return (
              <button
                key={result.place_id}
                onClick={() => handleSelect(result)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  background: "white",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#f8fafc")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "white")
                }
              >
                <MapPin
                  size={14}
                  color="#64748b"
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#1e293b",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {primary}
                  </div>
                  {secondary && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {secondary}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty results state */}
      {open && !loading && query.trim().length >= 2 && results.length === 0 && (
        <div
          style={{
            marginTop: 4,
            background: "white",
            borderRadius: 10,
            boxShadow:
              "0 4px 20px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.08)",
            padding: "12px 14px",
            fontSize: 12,
            color: "#94a3b8",
            textAlign: "center",
          }}
        >
          No places found for "{query}"
        </div>
      )}
    </div>
  );
}
