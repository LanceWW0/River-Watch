import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-markercluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-markercluster/styles";
import SidePanel from "./SidePanel";
import RiverLayer from "./RiverLayer";
import LayerToggle from "./LayerToggle";
import avatarImg from "../assets/me_snow.jpeg";

// Layer configuration with emojis and colors
const LAYER_STYLES = {
  waterQuality: {
    emoji: "💧",
    color: "#3b82f6",
    bgColor: "rgba(59, 130, 246, 0.15)",
    borderColor: "#2563eb",
  },
  fish: {
    emoji: "🐟",
    color: "#16a34a",
    bgColor: "rgba(22, 163, 74, 0.15)",
    borderColor: "#15803d",
  },
  invertebrates: {
    emoji: "🦐",
    color: "#d97706",
    bgColor: "rgba(217, 119, 6, 0.15)",
    borderColor: "#b45309",
  },
};

// Create custom icon for individual markers
function createEmojiIcon(emoji, isSelected = false, healthColor = null) {
  const size = isSelected ? 36 : 28;
  const fontSize = isSelected ? 20 : 16;
  
  // Health indicator dot for invertebrates
  const healthDot = healthColor
    ? `<div style="
        position: absolute;
        bottom: -2px;
        right: -2px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: ${healthColor};
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      "></div>`
    : "";

  return L.divIcon({
    className: "emoji-marker",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${fontSize}px;
        background: white;
        border-radius: 50%;
        box-shadow: ${isSelected ? "0 0 0 3px rgba(59, 130, 246, 0.4)," : ""} 0 2px 8px rgba(0,0,0,0.2);
        cursor: pointer;
        position: relative;
        transition: transform 0.15s;
      ">
        ${emoji}
        ${healthDot}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Create custom cluster icon
function createClusterIcon(cluster, emoji, color, bgColor) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 44 : count < 100 ? 52 : 60;
  const fontSize = count < 10 ? 20 : count < 100 ? 18 : 16;
  
  return L.divIcon({
    className: "emoji-cluster",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      ">
        <div style="
          position: absolute;
          inset: 0;
          background: ${bgColor};
          border: 2px solid ${color};
          border-radius: 50%;
          opacity: 0.9;
        "></div>
        <span style="
          position: relative;
          font-size: ${fontSize}px;
          z-index: 1;
        ">${emoji}</span>
        <div style="
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 20px;
          height: 20px;
          padding: 0 5px;
          background: ${color};
          color: white;
          font-size: 11px;
          font-weight: 700;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          z-index: 2;
        ">${count.toLocaleString()}</div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

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

        {/* Water Quality Layer - 💧 markers */}
        {layerVisibility.waterQuality && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            iconCreateFunction={(cluster) =>
              createClusterIcon(
                cluster,
                LAYER_STYLES.waterQuality.emoji,
                LAYER_STYLES.waterQuality.color,
                LAYER_STYLES.waterQuality.bgColor
              )
            }
          >
            {points.map((point, i) => {
              const coords = point.coords;
              if (!coords) return null;

              const isSelected =
                selectedItem?.type === "water-quality" &&
                selectedItem?.data?.notation === point.notation;

              return (
                <Marker
                  key={`wq-${point.notation || i}`}
                  position={coords}
                  icon={createEmojiIcon(
                    LAYER_STYLES.waterQuality.emoji,
                    isSelected
                  )}
                  eventHandlers={{
                    click: () =>
                      setSelectedItem({ type: "water-quality", data: point }),
                  }}
                />
              );
            })}
          </MarkerClusterGroup>
        )}

        {/* Fish Survey Layer - 🐟 markers */}
        {layerVisibility.fish && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            iconCreateFunction={(cluster) =>
              createClusterIcon(
                cluster,
                LAYER_STYLES.fish.emoji,
                LAYER_STYLES.fish.color,
                LAYER_STYLES.fish.bgColor
              )
            }
          >
            {fishSites.map((site, i) => {
              const coords = site.coords;
              if (!coords) return null;

              const isSelected =
                selectedItem?.type === "fish" &&
                selectedItem?.data?.siteId === site.siteId;

              return (
                <Marker
                  key={`fish-${site.siteId || i}`}
                  position={coords}
                  icon={createEmojiIcon(LAYER_STYLES.fish.emoji, isSelected)}
                  eventHandlers={{
                    click: () => setSelectedItem({ type: "fish", data: site }),
                  }}
                />
              );
            })}
          </MarkerClusterGroup>
        )}

        {/* Invertebrate Layer - 🦐 markers with BMWP health indicator */}
        {layerVisibility.invertebrates && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            iconCreateFunction={(cluster) =>
              createClusterIcon(
                cluster,
                LAYER_STYLES.invertebrates.emoji,
                LAYER_STYLES.invertebrates.color,
                LAYER_STYLES.invertebrates.bgColor
              )
            }
          >
            {invSites.map((site, i) => {
              const coords = site.coords;
              if (!coords) return null;

              const isSelected =
                selectedItem?.type === "invertebrates" &&
                selectedItem?.data?.siteId === site.siteId;

              // BMWP health indicator color
              let healthColor = null;
              if (site.latestBmwp != null) {
                if (site.latestBmwp >= 100) {
                  healthColor = "#22c55e"; // Green - good
                } else if (site.latestBmwp >= 50) {
                  healthColor = "#eab308"; // Yellow - moderate
                } else {
                  healthColor = "#ef4444"; // Red - poor
                }
              }

              return (
                <Marker
                  key={`inv-${site.siteId || i}`}
                  position={coords}
                  icon={createEmojiIcon(
                    LAYER_STYLES.invertebrates.emoji,
                    isSelected,
                    healthColor
                  )}
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
