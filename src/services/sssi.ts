export type SSSIResult = {
  isSSSI: boolean;
  siteName: string;
  country: "england" | "scotland" | "wales" | "unknown";
  notifiedFeatures?: string;
};

const ENG_FS = "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/SSSI_England/FeatureServer/0/query";
const SCO_FS = "https://services1.arcgis.com/LM9GyVFsughzHdbO/arcgis/rest/services/Sites_of_Special_Scientific_Interest/FeatureServer/0/query";
const REQUEST_TIMEOUT_MS = 8000;

function detectCountry(lat: number, lon: number): "england" | "scotland" | "wales" {
  if (lat > 55.0) return "scotland";
  if (lon < -3.0 && lat < 53.5 && lat > 51.3) return "wales";
  return "england";
}

function emptyResult(country: SSSIResult["country"]): SSSIResult {
  return { isSSSI: false, siteName: "", country };
}

function buildArcGISPointUrl(endpoint: string, lat: number, lon: number, outFields: string): string {
  const params = new URLSearchParams({
    geometryType: "esriGeometryPoint",
    geometry: `${lon},${lat}`,
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields,
    returnGeometry: "false",
    f: "json",
  });
  return `${endpoint}?${params.toString()}`;
}

async function fetchArcGISJson(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`SSSI service returned ${resp.status}`);
    const data = await resp.json();
    if (data?.error) throw new Error(data.error.message || "SSSI service query failed");
    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function checkEnglandSSSI(lat: number, lon: number): Promise<SSSIResult> {
  const data = await fetchArcGISJson(buildArcGISPointUrl(ENG_FS, lat, lon, "NAME,LABEL,REF_CODE"));
  const feature = Array.isArray(data?.features) ? data.features[0] : null;
  if (!feature) return emptyResult("england");

  const attributes = feature.attributes ?? feature.properties ?? {};
  const siteName = String(attributes.NAME ?? attributes.LABEL ?? "").trim();
  const reference = String(attributes.REF_CODE ?? "").trim();
  return {
    isSSSI: true,
    siteName,
    country: "england",
    notifiedFeatures: reference ? `Natural England SSSI reference ${reference}` : undefined,
  };
}

async function checkScotlandSSSI(lat: number, lon: number): Promise<SSSIResult> {
  const data = await fetchArcGISJson(buildArcGISPointUrl(SCO_FS, lat, lon, "NAME,PA_CODE,STATUS"));
  const feature = Array.isArray(data?.features) ? data.features[0] : null;
  if (!feature) return emptyResult("scotland");

  const attributes = feature.attributes ?? feature.properties ?? {};
  const siteName = String(attributes.NAME ?? "").trim();
  const status = String(attributes.STATUS ?? "").trim();
  const code = String(attributes.PA_CODE ?? "").trim();
  const details = [status, code ? `NatureScot code ${code}` : null].filter(Boolean).join(" - ");
  return {
    isSSSI: true,
    siteName,
    country: "scotland",
    notifiedFeatures: details || undefined,
  };
}

export async function checkSSSI(lat: number, lon: number): Promise<SSSIResult> {
  try {
    const country = detectCountry(lat, lon);

    if (country === "wales") {
      return {
        isSSSI: false,
        siteName: "",
        country: "wales",
        notifiedFeatures: "Full Wales SSSI data not available - check NRW Lle portal",
      };
    }

    if (country === "scotland") return await checkScotlandSSSI(lat, lon);
    return await checkEnglandSSSI(lat, lon);
  } catch {
    return emptyResult("unknown");
  }
}
