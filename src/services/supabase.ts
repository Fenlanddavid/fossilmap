import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/** Mirrors the shared_finds table column names exactly. Keep in sync with FossilMapped's SharedFind type. */
export interface SharedFindPayload {
  id: string;
  hrid: string;
  collectorName: string;
  collectorEmail: string;
  taxon: string;
  element: string;
  period: string;
  stage: string;
  formation: string;
  member: string;
  bed: string;
  verification_status: 'community' | 'verified' | 'research_grade';
  locationName: string;
  latitude: number;
  longitude: number;
  publicLatitude: number;
  publicLongitude: number;
  locationPrecision: 'exact' | '100m' | '1km' | 'locality';
  precisionLocked: boolean;
  dateCollected: string;
  photos: string[];
  measurements: { length?: number | null; width?: number | null; thickness?: number | null; weight?: number | null };
  repository: string;
  accession_id: string | null;
  quality_score: number;
  notes: string;
  sharedAt: string;
}

export async function uploadSharedFind(payload: SharedFindPayload): Promise<void> {
  if (supabaseUrl.includes('YOUR_PROJECT_ID')) {
    throw new Error("Supabase configuration is missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  // upsert without .select() — avoids a TypeError if RLS blocks the read-back.
  // The write itself is what matters; callers don't use the returned row.
  const { error } = await supabase
    .from('shared_finds')
    .upsert([{
        fossilmap_id: payload.id,
        hrid: payload.hrid,
        collector_name: payload.collectorName,
        collector_email: payload.collectorEmail,
        taxon: payload.taxon,
        period: payload.period || "Unknown",
        stage: payload.stage || "",
        formation: payload.formation || "",
        member: payload.member || "",
        bed: payload.bed || "",
        element: payload.element,
        location_name: payload.locationName,
        latitude: payload.latitude,
        longitude: payload.longitude,
        public_latitude: payload.publicLatitude,
        public_longitude: payload.publicLongitude,
        location_precision: payload.locationPrecision,
        precision_locked: payload.precisionLocked,
        date_collected: payload.dateCollected,
        photos: payload.photos,
        measurements: payload.measurements,
        repository: payload.repository || "Private",
        accession_id: payload.accession_id,
        quality_score: payload.quality_score ?? 0,
        verification_status: payload.verification_status || 'community',
        notes: payload.notes,
        shared_at: payload.sharedAt
    }], { onConflict: 'fossilmap_id' })

  if (error) throw error
}

export async function deleteSharedFind(fossilmapId: string) {
  // Soft delete — preserves the record for research provenance
  const { error } = await supabase
    .from('shared_finds')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('fossilmap_id', fossilmapId)

  if (error) throw error
}

export async function updateSharedFindPrecision(
  fossilmapId: string,
  unlock: boolean,
  publicLatitude: number,
  publicLongitude: number
) {
  if (supabaseUrl.includes('YOUR_PROJECT_ID')) {
    throw new Error("Supabase configuration is missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  const { error } = await supabase
    .from('shared_finds')
    .update({
      precision_locked: !unlock,
      public_latitude: publicLatitude,
      public_longitude: publicLongitude,
    })
    .eq('fossilmap_id', fossilmapId)

  if (error) throw error
}
