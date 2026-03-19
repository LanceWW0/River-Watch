import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-markercluster";
import "leaflet/dist/leaflet.css";
import "react-leaflet-markercluster/styles";
import SidePanel from "./SidePanel";
import RiverLayer from "./RiverLayer";
import avatarImg from "../assets/me_snow.jpeg";

export default function MapView() {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("Loading sampling points…");
  const [selectedPoint, setSelectedPoint] = useState(null);

  useEffect(() => {
    async function loadPoints() {
      try {
        const res = await fetch("/data/points.geojson");
        if (!res.ok) {
          console.error("Failed to load points:", res.status);
          setProgress("Failed to load sampling points");
          setLoading(false);
          return;
        }

        const geojson = await res.json();
        
        // Transform GeoJSON features to the format expected by the app
        const transformed = geojson.features.map((feature) => {
          const props = feature.properties;
          const [lng, lat] = feature.geometry.coordinates;
          return {
            notation: props.n,
            prefLabel: props.l,
            coords: [lat, lng], // Flip to [lat, lng] for Leaflet
            samplingPointStatus: { notation: props.s === "OPEN" ? "A" : "C" },
            samplingPointType: { prefLabel: props.t },
            region: { prefLabel: props.a },
          };
        });

        setPoints(transformed);
        setLoading(false);
        setProgress("");
      } catch (err) {
        console.error("Error loading points:", err);
        setProgress("Failed to load sampling points");
        setLoading(false);
      }
    }

    loadPoints();
  }, []);

  const pointsArray = points;

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
        <RiverLayer />
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={60}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
        >
          {pointsArray.map((point, i) => {
            const coords = point.coords;
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
