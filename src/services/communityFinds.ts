import { supabase } from "./supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://YOUR_PROJECT_ID.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_ANON_KEY";
const REQUEST_TIMEOUT_MS = 8000;

export type CommunityFind = {
  id: string;
  taxon: string;
  locationName: string;
  formation?: string;
  member?: string;
  sharedAt: string;
  photos: string[];
  lat: number | null;
  lon: number | null;
  locationPrecision?: "exact" | "100m" | "1km" | "locality";
  verificationStatus?: "community" | "verified" | "research_grade";
};

type RawCommunityFind = Record<string, unknown>;

export async function getRecentCommunityFinds(limit = 10): Promise<CommunityFind[]> {
  if (supabaseUrl.includes("YOUR_PROJECT_ID") || supabaseAnonKey === "YOUR_ANON_KEY") {
    throw new Error("Supabase is not configured.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { data, error } = await supabase
      .from("shared_finds")
      .select("*")
      .not("is_deleted", "eq", true)
      .order("shared_at", { ascending: false })
      .limit(limit)
      .abortSignal(controller.signal);

    if (error) throw error;
    return dedupeRawFinds(data ?? []).map(mapRawFind).filter((find): find is CommunityFind => !!find);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The public registry did not respond in time.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function dedupeRawFinds(rawData: RawCommunityFind[]) {
  const unique = new Map<string, RawCommunityFind>();
  for (const row of rawData) {
    const key = normalise(row.hrid) || normalise(row.fossilmap_id) || normalise(row.id);
    if (key && !unique.has(key)) unique.set(key, row);
  }
  return Array.from(unique.values());
}

function mapRawFind(row: RawCommunityFind): CommunityFind | null {
  if (row.is_deleted === true) return null;
  const id = normalise(row.hrid) || normalise(row.fossilmap_id) || normalise(row.id);
  const taxon = normalise(row.taxon);
  if (!id || !taxon) return null;

  const display = displayPublicCoords(row);

  return {
    id,
    taxon,
    locationName: normalise(row.location_name) || "Unknown locality",
    formation: normalise(row.formation) || undefined,
    member: normalise(row.member) || undefined,
    sharedAt: normalise(row.shared_at) || new Date().toISOString(),
    photos: Array.isArray(row.photos) ? row.photos.filter((item): item is string => typeof item === "string") : [],
    lat: display.lat,
    lon: display.lon,
    locationPrecision: precisionValue(row.location_precision),
    verificationStatus: verificationValue(row.verification_status),
  };
}

function displayPublicCoords(row: RawCommunityFind): { lat: number | null; lon: number | null } {
  const publicLat = numberValue(row.public_latitude);
  const publicLon = numberValue(row.public_longitude);
  const exactLat = numberValue(row.latitude);
  const exactLon = numberValue(row.longitude);
  const precision = precisionValue(row.location_precision) ?? "exact";
  const precisionLocked = booleanValue(row.precision_locked);
  const coordinatesReleased = booleanValue(row.coordinates_released);
  const hasPublicPin = publicLat != null && publicLon != null && !(publicLat === 0 && publicLon === 0);

  if (coordinatesReleased === true && exactLat != null && exactLon != null) {
    return { lat: exactLat, lon: exactLon };
  }

  if (precision !== "exact") {
    return hasPublicPin
      ? roundedCoords(publicLat, publicLon, precision)
      : roundedCoords(exactLat, exactLon, precision);
  }

  if (precisionLocked === true) {
    return hasPublicPin ? { lat: publicLat, lon: publicLon } : { lat: null, lon: null };
  }

  return {
    lat: publicLat ?? exactLat,
    lon: publicLon ?? exactLon,
  };
}

function roundedCoords(
  lat: number | null,
  lon: number | null,
  precision: CommunityFind["locationPrecision"],
): { lat: number | null; lon: number | null } {
  if (lat == null || lon == null) return { lat: null, lon: null };
  if (precision === "100m") {
    return {
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
    };
  }
  if (precision === "1km" || precision === "locality") {
    return {
      lat: Math.round(lat * 100) / 100,
      lon: Math.round(lon * 100) / 100,
    };
  }
  return { lat, lon };
}

function normalise(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function numberValue(value: unknown) {
  const next = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(next) ? next : null;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && /^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  return undefined;
}

function precisionValue(value: unknown): CommunityFind["locationPrecision"] | undefined {
  return value === "exact" || value === "100m" || value === "1km" || value === "locality" ? value : undefined;
}

function verificationValue(value: unknown): CommunityFind["verificationStatus"] | undefined {
  return value === "community" || value === "verified" || value === "research_grade" ? value : undefined;
}
