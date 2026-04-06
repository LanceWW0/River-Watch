import MapClient from "./map-client";

export const metadata = {
  title: "Explore the Map",
  description:
    "Interactive map of 111,000+ water quality sampling points, fish survey sites, and invertebrate monitoring stations across England's rivers, lakes, and estuaries.",
  alternates: {
    canonical: "https://riverwatch.earth/map",
  },
  openGraph: {
    title: "Explore the Map | River Watch",
    description:
      "Interactive map of 111,000+ water quality sampling points across England's rivers, lakes, and estuaries.",
    url: "https://riverwatch.earth/map",
  },
};

export default function MapPage() {
  return <MapClient />;
}
