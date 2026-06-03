export type Coordinates = {
  lat: number;
  lon: number;
};

export function getFiniteCoords(lat: number | null | undefined, lon: number | null | undefined): Coordinates | null {
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export function hasCoords(lat: number | null | undefined, lon: number | null | undefined): boolean {
  return getFiniteCoords(lat, lon) !== null;
}

export function formatCoords(lat: number | null | undefined, lon: number | null | undefined, precision = 6): string | null {
  const coords = getFiniteCoords(lat, lon);
  return coords ? `${coords.lat.toFixed(precision)}, ${coords.lon.toFixed(precision)}` : null;
}
