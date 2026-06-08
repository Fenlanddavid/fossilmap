/**
 * FossilMap BGS Detailed Geology Proxy
 *
 * Read-only proxy for the BGS Detailed Geology WMS service (50k resolution).
 * Adds CORS headers so the FossilMap PWA can access BGS data from the browser.
 *
 * Upstream: map.bgs.ac.uk/arcgis/services/BGS_Detailed_Geology/MapServer/WmsServer
 * Layers:   BGS.50k.Bedrock, BGS.50k.Superficial.deposits
 *
 * Privacy:
 *   - Only accepts allowlisted WMS params (SERVICE, REQUEST, VERSION, LAYERS, BBOX, etc.)
 *   - Does not accept arbitrary target URLs
 *   - Does not forward cookies, credentials or user data
 *   - Logs nothing beyond what Cloudflare Workers analytics capture automatically
 *
 * Attribution:
 *   Contains British Geological Survey materials © UKRI 2025.
 *   BGS data is used under the Open Government Licence.
 */

const BGS_WMS_URL =
  "https://map.bgs.ac.uk/arcgis/services/BGS_Detailed_Geology/MapServer/WmsServer";

const ALLOWED_REQUESTS = new Set(["GetCapabilities", "GetFeatureInfo"]);
const ALLOWED_SERVICES = new Set(["WMS"]);
const ALLOWED_VERSIONS = new Set(["1.3.0", "1.1.1"]);
const ALLOWED_INFO_FORMATS = new Set([
  "text/xml",
  "text/plain",
  "application/vnd.ogc.wms_xml",
  "application/vnd.esri.wms_featureinfo_xml",
]);

// Confirmed via GetCapabilities, June 2026.
//   BGS.50k.Bedrock              — formation name (LEX_D), lithology (RCS_D), age (MAX_PERIOD, MAX_TIME_D)
//   BGS.50k.Superficial.deposits — deposit name (LEX_D), rock type (RCS_D)
const ALLOWED_LAYERS = new Set([
  "BGS.50k.Bedrock",
  "BGS.50k.Superficial.deposits",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, _env, ctx) {
    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return jsonError("Method not allowed", 405);
    }

    const url = new URL(request.url);
    const p = url.searchParams;

    // ── Validate top-level params ──
    const service = (p.get("service") ?? p.get("SERVICE") ?? "").toUpperCase();
    const reqType = p.get("request") ?? p.get("REQUEST") ?? "";
    const version = p.get("version") ?? p.get("VERSION") ?? "1.3.0";

    if (!ALLOWED_SERVICES.has(service))  return jsonError("Invalid service", 400);
    if (!ALLOWED_REQUESTS.has(reqType))  return jsonError("Invalid request type", 400);
    if (!ALLOWED_VERSIONS.has(version))  return jsonError("Invalid version", 400);

    // ── Build upstream URL ──
    const upstream = new URL(BGS_WMS_URL);
    upstream.searchParams.set("SERVICE", "WMS");
    upstream.searchParams.set("VERSION", version);
    upstream.searchParams.set("REQUEST", reqType);

    if (reqType === "GetFeatureInfo") {
      const layer      = p.get("layers")       ?? p.get("LAYERS")       ?? "";
      const queryLayer = p.get("query_layers")  ?? p.get("QUERY_LAYERS") ?? "";
      const bbox       = p.get("bbox")          ?? p.get("BBOX")         ?? "";
      const crs        = p.get("crs")           ?? p.get("CRS")          ?? "EPSG:4326";
      const width      = p.get("width")         ?? p.get("WIDTH")        ?? "";
      const height     = p.get("height")        ?? p.get("HEIGHT")       ?? "";
      const i          = p.get("i")             ?? p.get("I")            ?? "";
      const j          = p.get("j")             ?? p.get("J")            ?? "";
      const infoFormat = p.get("info_format")   ?? p.get("INFO_FORMAT")  ?? "text/xml";

      if (!layer || layer !== queryLayer)        return jsonError("Invalid layer request", 400);
      if (!ALLOWED_LAYERS.has(layer))            return jsonError("Layer not allowlisted", 400);
      if (!bbox || !isValidBbox(bbox))           return jsonError("Invalid bbox", 400);
      if (crs !== "EPSG:4326")                   return jsonError("Invalid CRS", 400);
      if (!isNonNegativeInt(width))              return jsonError("Invalid WIDTH", 400);
      if (!isNonNegativeInt(height))             return jsonError("Invalid HEIGHT", 400);
      if (!isNonNegativeInt(i))                  return jsonError("Invalid I", 400);
      if (!isNonNegativeInt(j))                  return jsonError("Invalid J", 400);
      if (!ALLOWED_INFO_FORMATS.has(infoFormat)) return jsonError("Invalid info format", 400);

      upstream.searchParams.set("LAYERS",       layer);
      upstream.searchParams.set("QUERY_LAYERS", queryLayer);
      upstream.searchParams.set("CRS",          crs);
      upstream.searchParams.set("BBOX",         bbox);
      upstream.searchParams.set("WIDTH",        width);
      upstream.searchParams.set("HEIGHT",       height);
      upstream.searchParams.set("I",            i);
      upstream.searchParams.set("J",            j);
      upstream.searchParams.set("INFO_FORMAT",  infoFormat);
    }
    // GetCapabilities: no additional params needed

    // ── Edge cache check ──
    const cache    = caches.default;
    const cacheKey = new Request(upstream.toString());
    const cached   = await cache.match(cacheKey);
    if (cached) return withCors(cached);

    // ── Upstream fetch ──
    let upstreamResponse;
    try {
      upstreamResponse = await fetch(upstream.toString(), {
        method:  "GET",
        headers: { "User-Agent": "FossilMap-BGS-Geology-Proxy/1.0" },
      });
    } catch {
      return jsonError("BGS service unreachable", 502);
    }

    if (!upstreamResponse.ok) {
      return jsonError(`BGS service returned ${upstreamResponse.status}`, 502);
    }

    const contentType = upstreamResponse.headers.get("Content-Type") ?? "text/xml";

    const response = new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type":  contentType,
        "Cache-Control": "public, max-age=604800", // 7 days — geology is stable
        ...CORS_HEADERS,
      },
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Accepts non-negative integers up to 4096.
 */
function isNonNegativeInt(value) {
  const n = Number(value);
  return /^\d+$/.test(String(value)) && Number.isInteger(n) && n >= 0 && n <= 4096;
}

/**
 * Validates a WMS 1.3.0 EPSG:4326 BBOX string: "minLat,minLon,maxLat,maxLon"
 * Clamped to a rough UK bounding box to reduce misuse surface.
 */
function isValidBbox(value) {
  const parts = String(value).split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;

  const [minLat, minLon, maxLat, maxLon] = parts;

  return (
    minLat >= 49.8 && maxLat <= 60.9 &&
    minLon >= -8.2 && maxLon <= 1.8  &&
    minLat < maxLat &&
    minLon < maxLon
  );
}
