/**
 * BGS (British Geological Survey) bedrock geology lookup.
 * Uses the BGS Detailed Geology ArcGIS REST service.
 * Coverage: Great Britain only.
 */

export type BGSResult = {
  formation: string
  period: string
  stage: string
  description: string
}

// Maps BGS age strings to standard geological period names
const AGE_TO_PERIOD: Record<string, string> = {
  'precambrian': 'Precambrian',
  'cambrian': 'Cambrian',
  'ordovician': 'Ordovician',
  'silurian': 'Silurian',
  'devonian': 'Devonian',
  'carboniferous': 'Carboniferous',
  'permian': 'Permian',
  'triassic': 'Triassic',
  'jurassic': 'Jurassic',
  'cretaceous': 'Cretaceous',
  'paleogene': 'Paleogene',
  'palaeogene': 'Paleogene',
  'neogene': 'Neogene',
  'quaternary': 'Quaternary',
  'pleistocene': 'Quaternary',
  'holocene': 'Quaternary',
  'eocene': 'Paleogene',
  'oligocene': 'Paleogene',
  'miocene': 'Neogene',
  'pliocene': 'Neogene',
  'hettangian': 'Jurassic',
  'sinemurian': 'Jurassic',
  'pliensbachian': 'Jurassic',
  'toarcian': 'Jurassic',
  'aalenian': 'Jurassic',
  'bajocian': 'Jurassic',
  'bathonian': 'Jurassic',
  'callovian': 'Jurassic',
  'oxfordian': 'Jurassic',
  'kimmeridgian': 'Jurassic',
  'tithonian': 'Jurassic',
  'berriasian': 'Cretaceous',
  'valanginian': 'Cretaceous',
  'hauterivian': 'Cretaceous',
  'barremian': 'Cretaceous',
  'aptian': 'Cretaceous',
  'albian': 'Cretaceous',
  'cenomanian': 'Cretaceous',
  'turonian': 'Cretaceous',
  'coniacian': 'Cretaceous',
  'santonian': 'Cretaceous',
  'campanian': 'Cretaceous',
  'maastrichtian': 'Cretaceous',
}

function normaliseAge(raw: string): { period: string; stage: string } {
  const lower = raw.toLowerCase().trim()
  // Direct period match
  if (AGE_TO_PERIOD[lower]) {
    return { period: AGE_TO_PERIOD[lower], stage: '' }
  }
  // Check if any period keyword appears in the string
  for (const [key, value] of Object.entries(AGE_TO_PERIOD)) {
    if (lower.includes(key)) {
      const isPeriod = ['precambrian','cambrian','ordovician','silurian','devonian',
        'carboniferous','permian','triassic','jurassic','cretaceous',
        'paleogene','palaeogene','neogene','quaternary'].includes(key)
      return { period: value, stage: isPeriod ? '' : toTitleCase(key) }
    }
  }
  return { period: toTitleCase(raw), stage: '' }
}

function toTitleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function cleanFormationName(raw: string): string {
  // Remove common suffixes that aren't part of the name when used as formation field
  return raw
    .replace(/\s+(Formation|Fm|Member|Mbr|Group|Gp|Subgroup)\.?$/i, '')
    .trim()
}

export async function lookupBGSGeology(lat: number, lon: number): Promise<BGSResult> {
  // BGS Detailed Geology MapServer — bedrock layer (layer 0)
  const params = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'RANK,LEX_D,LEX_RCS_D,AGE,OLDER_AGE,YOUNGER_AGE,ROCK_D,STRAT_D',
    returnGeometry: 'false',
    resultRecordCount: '1',
  })

  const url = `https://map.bgs.ac.uk/arcgis/rest/services/BGS_Detailed_Geology/MapServer/0/query?${params}`

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)

  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) throw new Error(`BGS service returned ${resp.status}`)
    const json = await resp.json()

    const features: any[] = json.features || []
    if (features.length === 0) {
      throw new Error('No BGS bedrock data found at this location. The coordinate may be offshore or outside GB coverage.')
    }

    const attrs = features[0].attributes || {}

    // Formation name: prefer LEX_D (lexicon name), fallback to LEX_RCS_D or STRAT_D
    const rawFormation = String(attrs.LEX_D || attrs.LEX_RCS_D || attrs.STRAT_D || '').trim()
    const formation = rawFormation ? cleanFormationName(rawFormation) : ''

    // Age: prefer AGE, then OLDER_AGE
    const rawAge = String(attrs.AGE || attrs.OLDER_AGE || '').trim()
    const { period, stage } = rawAge ? normaliseAge(rawAge) : { period: '', stage: '' }

    // Description for display
    const description = String(attrs.ROCK_D || attrs.LEX_RCS_D || rawFormation || '').trim()

    if (!formation && !period) {
      throw new Error('BGS returned data but could not extract formation or period. Try filling in manually.')
    }

    return { formation, period, stage, description }
  } finally {
    window.clearTimeout(timeout)
  }
}
