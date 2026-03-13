import proj4 from "proj4";

// Step 1 — define the two coordinate systems
// EPSG:27700 is British National Grid
// EPSG:4326 is standard WGS84 lat/long
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs",
);

export function bngToLatLng(wkt) {
  // Guard against undefined or null
  if (!wkt || typeof wkt !== 'string') return null

  // Step 1 - Extract the two numbers from e.g. "POINT(514360 294016) <http://...>"
  const match = wkt.match(/POINT\(([0-9.]+)\s+([0-9.]+)\)/);
  if (!match) return null;

  // Step 2 — parse the WKT string to extract the two numbers
  const easting = parseFloat(match[1]);
  const northing = parseFloat(match[2]);


  // Step 3 — convert from BNG to lat/long
  // proj4 returns [longitude, latitude] — Leaflet wants [latitude, longitude]
  const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [easting, northing]);
  return [lat, lng];
}
