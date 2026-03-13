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
import { bngToLatLng } from "../utils/coords";
import SidePanel from "./SidePanel";
import avatarImg from "../assets/me_snow.jpeg";

function MapEvents({ onBoundsChange }) {
  const map = useMap();
  const timeoutRef = useRef(null);
  const hasFired = useRef(false);

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

export default function MapView() {
  const [points, setPoints] = useState({});
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("Initialising map…");
  const [selectedPoint, setSelectedPoint] = useState(null);
  const abortRef = useRef(null);

  const fetchPoints = useCallback(async (map) => {
    const zoom = map.getZoom();

    if (zoom < 8) {
      setLoading(false);
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
      40,
    );

    if (radius < 1) return;

    setLoading(true);
    setProgress("0%");

    try {
      const firstRes = await fetch(
        `/api/sampling-point?latitude=${center.lat}&longitude=${center.lng}&radius=${radius}&skip=0&limit=250`,
        { signal: controller.signal },
      );

      console.log(firstRes);

      if (!firstRes.ok) {
        const text = await firstRes.text();
        console.error("API error:", firstRes.status, text);
        setLoading(false);
        setProgress("");
        return;
      }

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
                `/api/sampling-point?latitude=${center.lat}&longitude=${center.lng}&radius=${radius}&skip=${skip}&limit=250`,
                {
                  headers: {
                    accept: "application/ld+json",
                    "API-Version": "1",
                  },
                  signal: controller.signal,
                },
              ).then((r) => r.json()),
            ),
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
    <div
      style={{
        height: "100vh",
        width: "100%",
        position: "relative",
        paddingTop: "4rem",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {(loading || progress) && (
        <div
          style={{
            position: "absolute",
            top: "calc(4rem + 12px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1100,
            background: "white",
            padding: "10px 20px",
            borderRadius: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
            fontSize: 14,
            minWidth: 80,
            textAlign: "center",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#334155",
          }}
        >
          {loading && (
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              style={{ flexShrink: 0 }}
            >
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="2.5"
              />
              <circle
                cx="10"
                cy="10"
                r="8"
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="32 18"
                style={{
                  animation: "geolumen-spin 0.8s linear infinite",
                  transformOrigin: "center",
                }}
              />
            </svg>
          )}
          <span>
            {progress.endsWith("%")
              ? `Loading sampling points… ${progress}`
              : progress || "Loading…"}
          </span>
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
            const wkt = point?.geometry?.asWKT;
            const coords = bngToLatLng(wkt);
            if (!coords) return null;

            const isOpen = point.samplingPointStatus?.notation !== "C";
            const isSelected = selectedPoint?.notation === point.notation;

            return (
              <CircleMarker
                key={point.notation || i}
                center={coords}
                radius={isSelected ? 9 : 6}
                color={isSelected ? "#1d4ed8" : isOpen ? "#2563eb" : "#9ca3af"}
                fillColor={
                  isSelected ? "#2563eb" : isOpen ? "#3b82f6" : "#d1d5db"
                }
                fillOpacity={isSelected ? 1 : 0.7}
                weight={isSelected ? 3 : 1}
                eventHandlers={{
                  click: () => setSelectedPoint(point),
                }}
              />
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>

      <SidePanel point={selectedPoint} onClose={() => setSelectedPoint(null)} />

      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          zIndex: 1000,
          background: "white",
          padding: "6px 12px 6px 6px",
          borderRadius: 9999,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: "#475569",
        }}
      >
        <img
          src={avatarImg}
          alt="Laurence Wayne"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
        Made with <span style={{ color: "#ef4444" }}>♥</span> by{" "}
        <a
          href="https://laurence-wayne.com/about"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#0d9488", textDecoration: "none", fontWeight: 500 }}
        >
          Laurence
        </a>
      </div>
    </div>
  );
}
