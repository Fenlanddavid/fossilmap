import { supabase } from "./supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://YOUR_PROJECT_ID.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_ANON_KEY";

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

  const { data, error } = await supabase
    .from("shared_finds")
    .select("*")
    .not("is_deleted", "eq", true)
    .order("shared_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return dedupeRawFinds(data ?? []).map(mapRawFind).filter((find): find is CommunityFind => !!find);
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

  const publicLat = numberValue(row.public_latitude);
  const publicLon = numberValue(row.public_longitude);
  const exactLat = numberValue(row.latitude);
  const exactLon = numberValue(row.longitude);

  return {
    id,
    taxon,
    locationName: normalise(row.location_name) || "Unknown locality",
    formation: normalise(row.formation) || undefined,
    member: normalise(row.member) || undefined,
    sharedAt: normalise(row.shared_at) || new Date().toISOString(),
    photos: Array.isArray(row.photos) ? row.photos.filter((item): item is string => typeof item === "string") : [],
    lat: publicLat ?? exactLat,
    lon: publicLon ?? exactLon,
    locationPrecision: precisionValue(row.location_precision),
    verificationStatus: verificationValue(row.verification_status),
  };
}

function normalise(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function numberValue(value: unknown) {
  const next = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(next) ? next : null;
}

function precisionValue(value: unknown): CommunityFind["locationPrecision"] | undefined {
  return value === "exact" || value === "100m" || value === "1km" || value === "locality" ? value : undefined;
}

function verificationValue(value: unknown): CommunityFind["verificationStatus"] | undefined {
  return value === "community" || value === "verified" || value === "research_grade" ? value : undefined;
}
