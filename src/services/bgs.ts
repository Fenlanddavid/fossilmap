/**
 * BGS (British Geological Survey) bedrock geology lookup.
 * Uses the BGS Detailed Geology WMS service (50k resolution).
 * Coverage: Great Britain only.
 *
 * The WMS endpoint is accessed via a read-only Cloudflare Worker proxy that adds
 * CORS headers. Direct browser requests to map.bgs.ac.uk are blocked by missing
 * Access-Control-Allow-Origin headers.
 * Worker source: workers/bgs-proxy/index.js
 */

// BGS Detailed Geology WMS — proxied through Cloudflare Worker
const BGS_PROXY_URL = 'https://fossilmap-bgs-proxy.trials-uk.workers.dev'

// WMS layer names (confirmed via GetCapabilities, June 2026)
const BGS_BEDROCK_LAYER = 'BGS.50k.Bedrock'

export type BGSResult = {
  formation: string
  period: string
  stage: string
  description: string
}

// Maps BGS period/age strings to standard geological period names
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
  if (AGE_TO_PERIOD[lower]) {
    return { period: AGE_TO_PERIOD[lower], stage: '' }
  }
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
  return raw
    .replace(/\s+(Formation|Fm|Member|Mbr|Group|Gp|Subgroup)\.?$/i, '')
    .trim()
}

function cleanStageName(raw: string): string {
  // BGS stage strings often end in " Substage", " Stage", " Age" — strip them
  return raw
    .replace(/\s+(Substage|Stage|Age|Epoch|Subperiod)\.?$/i, '')
    .trim()
}

// ── WMS GetFeatureInfo URL builder ────────────────────────────────────────────
// WMS 1.3.0 + EPSG:4326: BBOX axis order is (minLat, minLon, maxLat, maxLon).
// WIDTH/HEIGHT 101×101 — centre pixel I=50, J=50.

function buildGetFeatureInfoUrl(layer: string, lat: number, lon: number): string {
  const pad = 0.001 // ±~100m — tight enough for 50k scale
  const minLat = lat - pad
  const maxLat = lat + pad
  const minLon = lon - pad
  const maxLon = lon + pad

  const params = new URLSearchParams({
    SERVICE:      'WMS',
    VERSION:      '1.3.0',
    REQUEST:      'GetFeatureInfo',
    LAYERS:       layer,
    QUERY_LAYERS: layer,
    CRS:          'EPSG:4326',
    BBOX:         `${minLat},${minLon},${maxLat},${maxLon}`,
    WIDTH:        '101',
    HEIGHT:       '101',
    I:            '50',
    J:            '50',
    INFO_FORMAT:  'text/xml',
  })

  return `${BGS_PROXY_URL}?${params.toString()}`
}

// ── XML parser — reads attributes from <FIELDS> element ──────────────────────
// The BGS Detailed Geology WMS returns:
//   <FeatureInfoResponse>
//     <FIELDS LEX_D="..." RCS_D="..." MAX_PERIOD="..." MAX_TIME_D="..." .../>
//   </FeatureInfoResponse>

function parseFieldsAttributes(xmlText: string): Record<string, string> | null {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  } catch {
    return null
  }

  // Look for any element named FIELDS (namespace-agnostic)
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT)
  let node: Node | null = walker.currentNode
  while (node) {
    const el = node as Element
    const localName = (el.localName ?? el.nodeName.split(':').pop() ?? '').toUpperCase()
    if (localName === 'FIELDS' && el.attributes.length > 0) {
      const result: Record<string, string> = {}
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i]
        result[attr.name.toUpperCase()] = attr.value
      }
      return result
    }
    node = walker.nextNode()
  }

  return null
}

export async function lookupBGSGeology(lat: number, lon: number): Promise<BGSResult> {
  const url = buildGetFeatureInfoUrl(BGS_BEDROCK_LAYER, lat, lon)

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)

  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) throw new Error(`BGS service returned ${resp.status}`)
    const text = await resp.text()

    const attrs = parseFieldsAttributes(text)
    if (!attrs) {
      throw new Error('No BGS bedrock data found at this location. The coordinate may be offshore or outside GB coverage.')
    }

    // Formation: LEX_D is the BGS lexicon name (e.g. "Marsden Formation")
    const rawFormation = String(attrs['LEX_D'] || attrs['FM_EQ_D'] || '').trim()
    const formation = rawFormation ? cleanFormationName(rawFormation) : ''

    // Period: MAX_PERIOD is the geological period (e.g. "Carboniferous")
    const rawPeriod = String(attrs['MAX_PERIOD'] || attrs['MIN_PERIOD'] || '').trim()
    const { period } = rawPeriod ? normaliseAge(rawPeriod) : { period: '' }

    // Stage: MAX_TIME_D is the BGS age label (e.g. "Marsdenian Substage")
    const rawStage = String(attrs['MAX_TIME_D'] || attrs['MIN_TIME_D'] || '').trim()
    const stage = rawStage ? cleanStageName(rawStage) : ''

    // Description: RCS_D is the rock type description (e.g. "Mudstone and siltstone")
    const description = String(attrs['RCS_D'] || attrs['LEX_RCS_D'] || rawFormation || '').trim()

    if (!formation && !period) {
      throw new Error('BGS returned data but could not extract formation or period. Try filling in manually.')
    }

    return { formation, period, stage, description }
  } finally {
    window.clearTimeout(timeout)
  }
}
