"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("../../src/components/MapView"), {
  ssr: false,
});

export default function MapClient() {
  return <MapView />;
}
