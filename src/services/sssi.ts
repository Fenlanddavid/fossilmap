export type SSSIResult = {
  isSSSI: boolean;
  siteName: string;
  country: "england" | "scotland" | "wales" | "unknown";
  notifiedFeatures?: string;
};

const ENG_FS = "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/SSSI_England/FeatureServer/0/query";
const SCO_FS = "https://services1.arcgis.com/LM9GyVFsughzHdbO/arcgis/rest/services/Sites_of_Special_Scientific_Interest/FeatureServer/0/query";

function detectCountry(lat: number, lon: number): "england" | "scotland" | "wales" {
  if (lat > 55.0) return "scotland";
  if (lon < -3.0 && lat < 53.5 && lat > 51.3) return "wales";
  return "england";
}

function emptyResult(country: SSSIResult["country"]): SSSIResult {
  return { isSSSI: false, siteName: "", country };
}

function buildArcGISPointUrl(endpoint: string, lat: number, lon: number): string {
  const params = new URLSearchParams({
    geometryType: "esriGeometryPoint",
    geometry: `${lon},${lat}`,
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
    f: "json",
  });
  return `${endpoint}?${params.toString()}`;
}

async function checkEnglandSSSI(lat: number, lon: number): Promise<SSSIResult> {
  const resp = await fetch(buildArcGISPointUrl(ENG_FS, lat, lon));
  if (!resp.ok) throw new Error(`Natural England SSSI service returned ${resp.status}`);
  const data = await resp.json();
  const feature = Array.isArray(data?.features) ? data.features[0] : null;
  if (!feature) return emptyResult("england");

  const attributes = feature.attributes ?? feature.properties ?? {};
  const siteName = String(attributes.NAME ?? attributes.SSSI_NAME ?? attributes.LABEL ?? "").trim();
  const notifiedFeatures = String(attributes.NOTIFIED_F ?? attributes.NOTIFIED_FEATURES ?? "").trim();
  return {
    isSSSI: true,
    siteName,
    country: "england",
    notifiedFeatures: notifiedFeatures || undefined,
  };
}

async function checkScotlandSSSI(lat: number, lon: number): Promise<SSSIResult> {
  const resp = await fetch(buildArcGISPointUrl(SCO_FS, lat, lon));
  if (!resp.ok) throw new Error(`NatureScot SSSI service returned ${resp.status}`);
  const data = await resp.json();
  const feature = Array.isArray(data?.features) ? data.features[0] : null;
  if (!feature) return emptyResult("scotland");

  const attributes = feature.attributes ?? feature.properties ?? {};
  const siteName = String(attributes.NAME ?? attributes.SITE_NAME ?? attributes.name ?? "").trim();
  const notifiedFeatures = String(attributes.NOTIFIED_F ?? attributes.NOTIFIED_FEATURES ?? "").trim();
  return {
    isSSSI: true,
    siteName,
    country: "scotland",
    notifiedFeatures: notifiedFeatures || undefined,
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
