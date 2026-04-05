import { useEffect, useCallback, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  ZoomControl,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-markercluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-markercluster/styles";
import SidePanel from "./SidePanel";
import RiverLayer from "./RiverLayer";
import SSSILayer from "./SSSILayer";
import LayerToggle from "./LayerToggle";
import usePointTiles from "../hooks/usePointTiles";
import avatarImg from "../assets/me_snow.jpeg";

// Layer configuration with emojis and colors
const LAYER_STYLES = {
  waterQuality: {
    emoji: "💧",
    label: "Water Quality",
    color: "#3b82f6",
    bgColor: "rgba(59, 130, 246, 0.15)",
    borderColor: "#2563eb",
  },
  fish: {
    emoji: "🐟",
    label: "Fish",
    color: "#16a34a",
    bgColor: "rgba(22, 163, 74, 0.15)",
    borderColor: "#15803d",
  },
  invertebrates: {
    emoji: "🦐",
    label: "Invertebrates",
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

// Tooltip content renderer
function tooltipContent(name, layerKey, region) {
  const style = LAYER_STYLES[layerKey];
  return `
    <div style="
      background: white;
      border-radius: 10px;
      padding: 8px 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      font-family: 'DM Sans', system-ui, sans-serif;
      min-width: 120px;
      max-width: 240px;
    ">
      <div style="
        font-size: 13px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 6px;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      ">${name || "Unknown Site"}</div>
      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
        <span style="
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 500;
          color: ${style.color};
          background: ${style.bgColor};
          border: 1px solid ${style.bgColor.replace("0.15", "0.35")};
          padding: 2px 8px;
          border-radius: 99px;
          white-space: nowrap;
        ">${style.emoji} ${style.label}</span>
        ${region ? `<span style="
          font-size: 11px;
          font-weight: 500;
          color: #64748b;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          padding: 2px 8px;
          border-radius: 99px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 160px;
        ">${region}</span>` : ""}
      </div>
    </div>
  `;
}

// Transform functions for each dataset
const transformWaterQuality = (feature) => {
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
};

const transformFish = (feature) => {
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
};

const transformInvertebrates = (feature) => {
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
};

/**
 * Inner component that lives inside MapContainer and has access to useMap/useMapEvents.
 * Loads point tiles based on viewport and renders MarkerClusterGroups.
 */
function MapContents({ layerVisibility, selectedItem, setSelectedItem, onCountsChange }) {
  const { points, totalCount: wqTotal } = usePointTiles({
    tileDir: "point_tiles",
    filePrefix: "points",
    enabled: layerVisibility.waterQuality,
    transformFeature: transformWaterQuality,
  });

  const { points: fishSites, totalCount: fishTotal } = usePointTiles({
    tileDir: "fish_tiles",
    filePrefix: "fish",
    enabled: layerVisibility.fish,
    transformFeature: transformFish,
  });

  const { points: invSites, totalCount: invTotal } = usePointTiles({
    tileDir: "inv_tiles",
    filePrefix: "inv",
    enabled: layerVisibility.invertebrates,
    transformFeature: transformInvertebrates,
  });

  // Pass total counts up to parent for LayerToggle
  useEffect(() => {
    onCountsChange({ waterQuality: wqTotal, fish: fishTotal, invertebrates: invTotal });
  }, [wqTotal, fishTotal, invTotal, onCountsChange]);

  return (
    <>
      {layerVisibility.sssi && <SSSILayer />}
      {layerVisibility.rivers && <RiverLayer />}

      {/* Water Quality Layer */}
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
              >
                <Tooltip
                  direction="top"
                  offset={[0, -16]}
                  className="site-tooltip"
                  permanent={false}
                >
                  <div dangerouslySetInnerHTML={{ __html: tooltipContent(
                    point.prefLabel,
                    "waterQuality",
                    point.region?.prefLabel
                  ) }} />
                </Tooltip>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      )}

      {/* Fish Survey Layer */}
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
              >
                <Tooltip
                  direction="top"
                  offset={[0, -16]}
                  className="site-tooltip"
                  permanent={false}
                >
                  <div dangerouslySetInnerHTML={{ __html: tooltipContent(
                    site.name,
                    "fish",
                    site.region
                  ) }} />
                </Tooltip>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      )}

      {/* Invertebrate Layer with BMWP health indicator */}
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
              >
                <Tooltip
                  direction="top"
                  offset={[0, -16]}
                  className="site-tooltip"
                  permanent={false}
                >
                  <div dangerouslySetInnerHTML={{ __html: tooltipContent(
                    site.name,
                    "invertebrates",
                    site.area
                  ) }} />
                </Tooltip>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      )}

    </>
  );
}

export default function MapView() {
  const [selectedItem, setSelectedItem] = useState(null);
  const [layerVisibility, setLayerVisibility] = useState({
    rivers: false,
    sssi: false,
    waterQuality: true,
    fish: true,
    invertebrates: true,
  });
  const [layerCounts, setLayerCounts] = useState({
    waterQuality: 0,
    fish: 0,
    invertebrates: 0,
  });

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
      <MapContainer
        center={[54.97, -1.61]}
        zoom={10}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <ZoomControl position="topright" />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapContents
          layerVisibility={layerVisibility}
          selectedItem={selectedItem}
          setSelectedItem={setSelectedItem}
          onCountsChange={setLayerCounts}
        />
      </MapContainer>

      {/* Layer Toggle Control */}
      <LayerToggle
        layers={layerVisibility}
        onToggle={handleLayerToggle}
        counts={layerCounts}
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
