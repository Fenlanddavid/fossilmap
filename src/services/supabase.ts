import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function uploadSharedFind(payload: any) {
  if (supabaseUrl.includes('YOUR_PROJECT_ID')) {
    throw new Error("Supabase configuration is missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  const { data, error } = await supabase
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
    .select()
  
  if (error) throw error
  return data[0]
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
