import { useState, useEffect, useRef } from "react";
import { GeoJSON } from "react-leaflet";

const SSSI_STYLE = {
  fillColor: "#16a34a",
  fillOpacity: 0.15,
  color: "#15803d",
  weight: 1.5,
  opacity: 0.6,
};

export default function SSSILayer() {
  const [data, setData] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    fetch("/data/sssi_sites.geojson", { signal: controller.signal })
      .then((res) => res.json())
      .then((geojson) => setData(geojson))
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Failed to load SSSI data:", err);
      });

    return () => controller.abort();
  }, []);

  if (!data) return null;

  return (
    <GeoJSON
      data={data}
      style={SSSI_STYLE}
      interactive={false}
    />
  );
}
