import { useEffect, useState, useCallback, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-markercluster";
import "leaflet/dist/leaflet.css";
import "react-leaflet-markercluster/styles";
import { bngToLatLng } from "./utils/coords";

function MapEvents({ onBoundsChange }) {
  const map = useMap();
  const timeoutRef = useRef(null);
  const hasFired = useRef(false);

  // Fire on initial load
  useEffect(() => {
    if (!hasFired.current) {
      hasFired.current = true;
      onBoundsChange(map);
    }
  }, [map, onBoundsChange]);

  useMapEvents({
    moveend: (e) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => onBoundsChange(e.target), 400);
    },
  });

  return null;
}

function App() {
  const [points, setPoints] = useState({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const abortRef = useRef(null);

  const fetchPoints = useCallback(async (map) => {
    const zoom = map.getZoom();

    if (zoom < 8) {
      setProgress("Zoom in to see sampling points");
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const center = map.getCenter();
    const bounds = map.getBounds();
    const radius = Math.min(
      Math.round(center.distanceTo(bounds.getNorthEast()) / 1000),
      40
    );

    if (radius < 1) return;

    setLoading(true);
    setProgress("0%");

    try {
      const firstRes = await fetch(
        `/api/ea/water-quality/sampling-point?latitude=${center.lat}&longitude=${center.lng}&radius=${radius}&skip=0&limit=250`,
        {
          headers: {
            accept: "application/ld+json",
            "API-Version": "1",
          },
          signal: controller.signal,
        }
      );
      const firstData = await firstRes.json();
      const total = firstData.totalItems || 0;
      let allMembers = [...(firstData.member || [])];

      if (total === 0) {
        setLoading(false);
        setProgress("No sampling points in this area");
        setTimeout(() => setProgress(""), 2000);
        return;
      }

      setProgress(`${Math.round((allMembers.length / total) * 100)}%`);

      if (total > 250) {
        const offsets = [];
        for (let skip = 250; skip < total; skip += 250) {
          offsets.push(skip);
        }

        const batchSize = 6;
        for (let i = 0; i < offsets.length; i += batchSize) {
          const batch = offsets.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map((skip) =>
              fetch(
                `/api/ea/water-quality/sampling-point?latitude=${center.lat}&longitude=${center.lng}&radius=${radius}&skip=${skip}&limit=250`,
                {
                  headers: {
                    accept: "application/ld+json",
                    "API-Version": "1",
                  },
                  signal: controller.signal,
                }
              ).then((r) => r.json())
            )
          );

          for (const data of results) {
            allMembers = [...allMembers, ...(data.member || [])];
          }

          setProgress(`${Math.round((allMembers.length / total) * 100)}%`);
        }
      }

      setPoints((prev) => {
        const merged = { ...prev };
        for (const p of allMembers) {
          if (p.notation) merged[p.notation] = p;
        }
        return merged;
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Fetch error:", err);
      }
    }

    setLoading(false);
    setProgress("");
  }, []);

  const pointsArray = Object.values(points);

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      {progress && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "white",
            padding: "8px 16px",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            fontSize: 14,
            minWidth: 60,
            textAlign: "center",
          }}
        >
          {progress.endsWith("%") ? `Loading… ${progress}` : progress}
        </div>
      )}
      <MapContainer
        center={[54.97, -1.61]}
        zoom={10}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapEvents onBoundsChange={fetchPoints} />
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={60}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
        >
          {pointsArray.map((point, i) => {
            const coords = bngToLatLng(point.geometry?.asWKT);
            if (!coords) return null;

            const isOpen = point.samplingPointStatus?.notation !== "C";

            return (
              <CircleMarker
                key={point.notation || i}
                center={coords}
                radius={6}
                color={isOpen ? "#2563eb" : "#9ca3af"}
                fillColor={isOpen ? "#3b82f6" : "#d1d5db"}
                fillOpacity={0.7}
              >
                <Popup>
                  <strong>{point.prefLabel || point.altLabel}</strong>
                  <br />
                  {point.samplingPointType?.prefLabel}
                  <br />
                  <em>{isOpen ? "Active" : "Closed"}</em>
                </Popup>
              </CircleMarker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}

export default App;