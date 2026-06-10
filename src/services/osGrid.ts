import OsGridRef, { LatLon } from "geodesy/osgridref.js";

export const OS_GRID_INVALID_MESSAGE = "Enter a valid OS grid reference (e.g. TF 394 049)";

export type ParsedOsGridRef = {
  lat: number;
  lon: number;
};

export function isInGreatBritainBounds(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (typeof lat !== "number" || typeof lon !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= 49.8 && lat <= 60.9 && lon >= -8.2 && lon <= 2.0;
}

export function formatOsGridRef(lat: number | null | undefined, lon: number | null | undefined, digits = 8): string | null {
  if (!isInGreatBritainBounds(lat, lon)) return null;
  try {
    const point = new LatLon(lat as number, lon as number);
    return point.toOsGrid().toString(digits);
  } catch {
    return null;
  }
}

export function parseOsGridRef(input: string): ParsedOsGridRef {
  const trimmed = input.trim();
  if (!trimmed) throw new Error(OS_GRID_INVALID_MESSAGE);
  try {
    const grid = OsGridRef.parse(trimmed);
    const point = grid.toLatLon();
    const lat = Number(point.lat);
    const lon = Number(point.lon);
    if (!isInGreatBritainBounds(lat, lon)) throw new Error(OS_GRID_INVALID_MESSAGE);
    return { lat, lon };
  } catch {
    throw new Error(OS_GRID_INVALID_MESSAGE);
  }
}
