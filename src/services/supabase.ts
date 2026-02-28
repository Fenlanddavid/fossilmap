import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function uploadSharedFind(payload: any) {
  const { data, error } = await supabase
    .from('shared_finds')
    .insert([{
        fossilmap_id: payload.id,
        collector_name: payload.collectorName,
        taxon: payload.taxon,
        element: payload.element,
        location_name: payload.locationName,
        latitude: payload.latitude,
        longitude: payload.longitude,
        date_collected: payload.dateCollected,
        photos: payload.photos, // ideally upload to Storage bucket first
        measurements: payload.measurements,
        notes: payload.notes
    }])
    .select()
  
  if (error) throw error
  return data[0]
}

export async function deleteSharedFind(fossilmapId: string) {
  const { error } = await supabase
    .from('shared_finds')
    .delete()
    .eq('fossilmap_id', fossilmapId)
  
  if (error) throw error
}
