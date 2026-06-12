import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'
const sharedFindWriteFunctionName = (
  (import.meta.env.VITE_SHARED_FINDS_WRITE_FUNCTION as string | undefined) ||
  (import.meta.env.VITE_SHARED_FINDS_ADMIN_FUNCTION as string | undefined) ||
  ''
).trim()

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export function canEditSharedFinds() {
  return Boolean(sharedFindWriteFunctionName)
}

async function invokeSharedFindWrite(action: string, payload: Record<string, unknown>) {
  if (!sharedFindWriteFunctionName) {
    throw new Error('Shared find edits require a trusted Supabase Edge Function. Set VITE_SHARED_FINDS_WRITE_FUNCTION before enabling remove or precision changes.')
  }

  const { data, error } = await supabase.functions.invoke(sharedFindWriteFunctionName, {
    body: { action, ...payload },
  })

  if (error) throw error
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error))
  }
}

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
  coordinatesReleased: boolean;
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

  // Insert without .select() — avoids a read-back requirement and keeps the
  // public anon client aligned with insert-only RLS.
  const { error } = await supabase
    .from('shared_finds')
    .insert([{
        fossilmap_id: payload.id,
        is_deleted: false,
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
        coordinates_released: payload.coordinatesReleased,
        date_collected: payload.dateCollected,
        photos: payload.photos,
        measurements: payload.measurements,
        repository: payload.repository || "Private",
        accession_id: payload.accession_id,
        quality_score: payload.quality_score ?? 0,
        verification_status: payload.verification_status || 'community',
        notes: payload.notes,
        shared_at: payload.sharedAt
    }])

  if (error) throw error
}

export async function deleteSharedFind(fossilmapId: string) {
  const cleanId = fossilmapId.trim()
  if (!cleanId) throw new Error('Delete failed: missing FossilMap record ID.')
  await invokeSharedFindWrite('deleteSharedFind', { fossilmapId: cleanId })
}

export async function updateSharedFindPrecision(
  fossilmapId: string,
  locationPrecision: SharedFindPayload['locationPrecision'],
  precisionLocked: boolean,
  publicLatitude: number,
  publicLongitude: number,
  coordinatesReleased: boolean
) {
  if (supabaseUrl.includes('YOUR_PROJECT_ID')) {
    throw new Error("Supabase configuration is missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  const cleanId = fossilmapId.trim()
  if (!cleanId) throw new Error('Precision update failed: missing FossilMap record ID.')
  await invokeSharedFindWrite('updateSharedFindPrecision', {
    fossilmapId: cleanId,
    locationPrecision,
    precisionLocked,
    publicLatitude,
    publicLongitude,
    coordinatesReleased,
  })
}
