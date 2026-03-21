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
import LayerToggle from "./LayerToggle";
import avatarImg from "../assets/me_snow.jpeg";

export default function MapView() {
  const [points, setPoints] = useState([]);
  const [fishSites, setFishSites] = useState([]);
  const [invSites, setInvSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("Loading sampling points…");
  const [selectedItem, setSelectedItem] = useState(null);
  const [layerVisibility, setLayerVisibility] = useState({
    rivers: false,
    waterQuality: true,
    fish: true,
    invertebrates: true,
  });

  useEffect(() => {
    async function loadAllData() {
      try {
        // Load all three GeoJSON files in parallel
        const [pointsRes, fishRes, invRes] = await Promise.all([
          fetch("/data/points.geojson"),
          fetch("/data/fish_sites.geojson"),
          fetch("/data/inv_sites.geojson"),
        ]);

        // Process water quality points
        if (pointsRes.ok) {
          const geojson = await pointsRes.json();
          const transformed = geojson.features.map((feature) => {
            const props = feature.properties;
            const [lng, lat] = feature.geometry.coordinates;
            return {
              notation: props.n,
              prefLabel: props.l,
              coords: [lat, lng],
              samplingPointStatus: { notation: props.s === "OPEN" ? "A" : "C" },
              samplingPointType: { prefLabel: props.t },
              region: { prefLabel: props.a },
            };
          });
          setPoints(transformed);
        }

        // Process fish survey sites
        if (fishRes.ok) {
          const geojson = await fishRes.json();
          const transformed = geojson.features.map((feature) => {
            const props = feature.properties;
            const [lng, lat] = feature.geometry.coordinates;
            return {
              siteId: props.siteId,
              name: props.name,
              waterbody: props.waterbody,
              region: props.region,
              area: props.area,
              totalSurveys: props.totalSurveys,
              speciesCount: props.speciesCount,
              firstSurvey: props.firstSurvey,
              lastSurvey: props.lastSurvey,
              coords: [lat, lng],
            };
          });
          setFishSites(transformed);
        }

        // Process invertebrate sites
        if (invRes.ok) {
          const geojson = await invRes.json();
          const transformed = geojson.features.map((feature) => {
            const props = feature.properties;
            const [lng, lat] = feature.geometry.coordinates;
            return {
              siteId: props.siteId,
              name: props.name,
              catchment: props.catchment,
              area: props.area,
              totalSamples: props.totalSamples,
              firstSample: props.firstSample,
              lastSample: props.lastSample,
              latestBmwp: props.latestBmwp,
              indicesAvailable: props.indicesAvailable,
              coords: [lat, lng],
            };
          });
          setInvSites(transformed);
        }

        setLoading(false);
        setProgress("");
      } catch (err) {
        console.error("Error loading data:", err);
        setProgress("Failed to load data");
        setLoading(false);
      }
    }

    loadAllData();
  }, []);

  const handleLayerToggle = (layerKey) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerKey]: !prev[layerKey],
    }));
  };

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
        {layerVisibility.rivers && <RiverLayer />}

        {/* Water Quality Layer - Blue markers */}
        {layerVisibility.waterQuality && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
          >
            {points.map((point, i) => {
              const coords = point.coords;
              if (!coords) return null;

              const isOpen = point.samplingPointStatus?.notation !== "C";
              const isSelected =
                selectedItem?.type === "water-quality" &&
                selectedItem?.data?.notation === point.notation;

              return (
                <CircleMarker
                  key={`wq-${point.notation || i}`}
                  center={coords}
                  radius={isSelected ? 9 : 6}
                  color={isSelected ? "#1d4ed8" : isOpen ? "#2563eb" : "#9ca3af"}
                  fillColor={
                    isSelected ? "#2563eb" : isOpen ? "#3b82f6" : "#d1d5db"
                  }
                  fillOpacity={isSelected ? 1 : 0.7}
                  weight={isSelected ? 3 : 1}
                  eventHandlers={{
                    click: () =>
                      setSelectedItem({ type: "water-quality", data: point }),
                  }}
                />
              );
            })}
          </MarkerClusterGroup>
        )}

        {/* Fish Survey Layer - Green markers */}
        {layerVisibility.fish && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
          >
            {fishSites.map((site, i) => {
              const coords = site.coords;
              if (!coords) return null;

              const isSelected =
                selectedItem?.type === "fish" &&
                selectedItem?.data?.siteId === site.siteId;

              return (
                <CircleMarker
                  key={`fish-${site.siteId || i}`}
                  center={coords}
                  radius={isSelected ? 9 : 6}
                  color={isSelected ? "#15803d" : "#16a34a"}
                  fillColor={isSelected ? "#16a34a" : "#22c55e"}
                  fillOpacity={isSelected ? 1 : 0.7}
                  weight={isSelected ? 3 : 1}
                  eventHandlers={{
                    click: () => setSelectedItem({ type: "fish", data: site }),
                  }}
                />
              );
            })}
          </MarkerClusterGroup>
        )}

        {/* Invertebrate Layer - Orange markers */}
        {layerVisibility.invertebrates && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
          >
            {invSites.map((site, i) => {
              const coords = site.coords;
              if (!coords) return null;

              const isSelected =
                selectedItem?.type === "invertebrates" &&
                selectedItem?.data?.siteId === site.siteId;

              // Color-code by BMWP score if available
              let markerColor = "#d97706";
              let fillColor = "#f59e0b";
              if (site.latestBmwp != null) {
                if (site.latestBmwp >= 100) {
                  markerColor = "#16a34a";
                  fillColor = "#22c55e";
                } else if (site.latestBmwp >= 50) {
                  markerColor = "#d97706";
                  fillColor = "#f59e0b";
                } else {
                  markerColor = "#dc2626";
                  fillColor = "#ef4444";
                }
              }

              return (
                <CircleMarker
                  key={`inv-${site.siteId || i}`}
                  center={coords}
                  radius={isSelected ? 9 : 6}
                  color={isSelected ? "#b45309" : markerColor}
                  fillColor={isSelected ? "#d97706" : fillColor}
                  fillOpacity={isSelected ? 1 : 0.7}
                  weight={isSelected ? 3 : 1}
                  eventHandlers={{
                    click: () =>
                      setSelectedItem({ type: "invertebrates", data: site }),
                  }}
                />
              );
            })}
          </MarkerClusterGroup>
        )}
      </MapContainer>

      {/* Layer Toggle Control */}
      <LayerToggle
        layers={layerVisibility}
        onToggle={handleLayerToggle}
        counts={{
          waterQuality: points.length,
          fish: fishSites.length,
          invertebrates: invSites.length,
        }}
      />

      <SidePanel
        selectedItem={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

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
