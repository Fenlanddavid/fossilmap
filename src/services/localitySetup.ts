import { v4 as uuid } from "uuid";
import { db, Locality, Specimen } from "../db";
import { lookupBGSGeology, type BGSResult } from "./bgs";
import { getFiniteCoords } from "./coords";
import { formatOsGridRef } from "./osGrid";

export const DEFAULT_LOCALITY_MATCH_RADIUS_M = 500;
export const EXTENDED_LOCALITY_MATCH_RADIUS_M = 1609;

export type NearbyLocalityMatch = {
  locality: Locality;
  distanceM: number;
  kind: "nearby" | "possible";
  formationMatches: boolean | null;
};

export type LocalitySuggestion = {
  name: string;
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
  gridRef: string | null;
  formation: string;
  period: string;
  stage: string;
  lithologyPrimary: Locality["lithologyPrimary"];
  observedAt: string;
  notes: string;
  bgs: BGSResult | null;
  confidence: "high" | "review" | "manual";
};

export type LocalitySetupAnalysis = {
  find: Specimen;
  linkedLocality: Locality | null;
  nearby: NearbyLocalityMatch[];
  possible: NearbyLocalityMatch[];
  suggestion: LocalitySuggestion | null;
  error?: string;
};

export type ClusterProposal = {
  id: string;
  finds: Specimen[];
  center: { lat: number; lon: number };
  nearby: NearbyLocalityMatch[];
  possible: NearbyLocalityMatch[];
  suggestion: LocalitySuggestion | null;
  action: "create" | "merge" | "skip";
  mergeLocalityId?: string;
};

export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const radius = 6371000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)}m`;
  const miles = distanceM / 1609.344;
  return `${miles.toFixed(miles < 10 ? 1 : 0)} miles`;
}

export async function findNearbyLocalities(
  projectId: string,
  lat: number,
  lon: number,
  options: { radiusM?: number; extendedRadiusM?: number; formation?: string } = {},
): Promise<NearbyLocalityMatch[]> {
  const radiusM = options.radiusM ?? DEFAULT_LOCALITY_MATCH_RADIUS_M;
  const extendedRadiusM = options.extendedRadiusM ?? EXTENDED_LOCALITY_MATCH_RADIUS_M;
  const formation = clean(options.formation).toLowerCase();
  const localities = await db.localities.where("projectId").equals(projectId).toArray();

  return localities
    .map((locality): NearbyLocalityMatch | null => {
      const coords = getFiniteCoords(locality.lat, locality.lon);
      if (!coords) return null;
      const distanceM = distanceMeters(lat, lon, coords.lat, coords.lon);
      if (distanceM > extendedRadiusM) return null;
      const localityFormation = clean(locality.formation).toLowerCase();
      const formationMatches = formation && localityFormation
        ? formation === localityFormation
        : null;
      return {
        locality,
        distanceM,
        kind: distanceM <= radiusM ? "nearby" : "possible",
        formationMatches,
      };
    })
    .filter((item): item is NearbyLocalityMatch => !!item)
    .sort((a, b) => matchRank(a) - matchRank(b));
}

export async function buildLocalitySuggestion(
  find: Specimen,
  options: { lat?: number; lon?: number; runBgs?: boolean } = {},
): Promise<LocalitySuggestion | null> {
  const coords = getFiniteCoords(options.lat ?? find.lat, options.lon ?? find.lon);
  if (!coords) return null;

  let bgs: BGSResult | null = null;
  if (options.runBgs !== false) {
    try {
      bgs = await lookupBGSGeology(coords.lat, coords.lon);
    } catch {
      bgs = null;
    }
  }

  const formation = clean(find.formation) || bgs?.formation || "";
  const period = clean(find.period) || bgs?.period || "";
  const stage = clean(find.stage) || bgs?.stage || "";
  const gridRef = formatOsGridRef(coords.lat, coords.lon, 8);
  const name = suggestLocalityName({ formation, period, stage, gridRef });
  const lithologyPrimary = lithologyFromDescription(bgs?.description || formation);
  const observedAt = find.dateCollected
    ? new Date(`${find.dateCollected}T12:00:00`).toISOString()
    : find.createdAt || new Date().toISOString();

  return {
    name,
    lat: coords.lat,
    lon: coords.lon,
    gpsAccuracyM: find.gpsAccuracyM ?? null,
    gridRef,
    formation,
    period,
    stage,
    lithologyPrimary,
    observedAt,
    notes: bgs?.description ? `BGS bedrock lookup: ${bgs.description}.` : "",
    bgs,
    confidence: bgs?.formation && bgs?.period ? "high" : bgs ? "review" : "manual",
  };
}

export async function analyseFindForLocalitySetup(find: Specimen): Promise<LocalitySetupAnalysis> {
  const coords = getFiniteCoords(find.lat, find.lon);
  const linkedLocality = find.localityId ? await db.localities.get(find.localityId) ?? null : null;
  if (!coords) {
    return {
      find,
      linkedLocality,
      nearby: [],
      possible: [],
      suggestion: null,
      error: "This find has no GPS fix, so FossilMap cannot suggest a locality automatically.",
    };
  }

  const suggestion = await buildLocalitySuggestion(find);
  const matches = await findNearbyLocalities(find.projectId, coords.lat, coords.lon, {
    formation: suggestion?.formation || find.formation,
  });

  return {
    find,
    linkedLocality,
    nearby: matches.filter((match) => match.kind === "nearby"),
    possible: matches.filter((match) => match.kind === "possible"),
    suggestion,
  };
}

export async function createLocalityFromFind(find: Specimen, suggestion: LocalitySuggestion): Promise<Locality> {
  const now = new Date().toISOString();
  const locality: Locality = {
    id: uuid(),
    projectId: find.projectId,
    type: "location",
    name: suggestion.name,
    lat: suggestion.lat,
    lon: suggestion.lon,
    gpsAccuracyM: suggestion.gpsAccuracyM,
    observedAt: suggestion.observedAt,
    collector: "",
    exposureType: "other",
    sssi: false,
    rigs: false,
    permissionGranted: false,
    period: suggestion.period,
    stage: suggestion.stage,
    formation: suggestion.formation,
    member: clean(find.member),
    bed: clean(find.bed),
    lithologyPrimary: suggestion.lithologyPrimary,
    notes: suggestion.notes,
    designationNotes: "",
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction("rw", db.localities, db.specimens, async () => {
    await db.localities.add(locality);
    await attachFindToLocality(find, locality, { markComplete: true });
  });

  return locality;
}

export async function attachFindToLocality(
  find: Specimen,
  locality: Locality,
  options: { markComplete?: boolean } = {},
): Promise<void> {
  const now = new Date().toISOString();
  await db.specimens.update(find.id, {
    localityId: locality.id,
    sessionId: null,
    period: clean(find.period) || locality.period || "",
    stage: clean(find.stage) || locality.stage || "",
    formation: clean(find.formation) || locality.formation || "",
    member: clean(find.member) || locality.member || "",
    bed: clean(find.bed) || locality.bed || "",
    isPending: options.markComplete ? false : find.isPending,
    updatedAt: now,
  });
}

export async function updateLocalityFromSuggestion(
  locality: Locality,
  suggestion: LocalitySuggestion,
): Promise<void> {
  await db.localities.update(locality.id, {
    formation: locality.formation || suggestion.formation,
    period: locality.period || suggestion.period,
    stage: locality.stage || suggestion.stage,
    lithologyPrimary: locality.lithologyPrimary || suggestion.lithologyPrimary,
    notes: mergeText(locality.notes, suggestion.notes),
    updatedAt: new Date().toISOString(),
  });
}

export async function clusterPendingFinds(
  projectId: string,
  radiusM: number,
): Promise<ClusterProposal[]> {
  const pending = await db.specimens
    .where("projectId")
    .equals(projectId)
    .filter((find) => !!find.isPending && !!getFiniteCoords(find.lat, find.lon))
    .toArray();

  const clusters: Specimen[][] = [];
  for (const find of pending) {
    const coords = getFiniteCoords(find.lat, find.lon);
    if (!coords) continue;
    let target: Specimen[] | null = null;
    for (const cluster of clusters) {
      const center = clusterCenter(cluster);
      if (center && distanceMeters(coords.lat, coords.lon, center.lat, center.lon) <= radiusM) {
        target = cluster;
        break;
      }
    }
    if (target) target.push(find);
    else clusters.push([find]);
  }

  const proposals: ClusterProposal[] = [];
  for (const finds of clusters) {
    const center = clusterCenter(finds);
    if (!center) continue;
    const seed: Specimen = { ...finds[0], lat: center.lat, lon: center.lon };
    const suggestion = await buildLocalitySuggestion(seed);
    const matches = await findNearbyLocalities(projectId, center.lat, center.lon, {
      formation: suggestion?.formation || seed.formation,
    });
    const nearby = matches.filter((match) => match.kind === "nearby");
    const possible = matches.filter((match) => match.kind === "possible");
    const mergeTarget = nearby[0] || possible.find((match) => match.formationMatches);
    proposals.push({
      id: uuid(),
      finds,
      center,
      nearby,
      possible,
      suggestion,
      action: mergeTarget ? "merge" : "create",
      mergeLocalityId: mergeTarget?.locality.id,
    });
  }

  return proposals.sort((a, b) => b.finds.length - a.finds.length);
}

export async function applyClusterProposal(proposal: ClusterProposal): Promise<void> {
  if (proposal.action === "skip") return;
  if (proposal.action === "merge" && proposal.mergeLocalityId) {
    const locality = await db.localities.get(proposal.mergeLocalityId);
    if (!locality) return;
    await db.transaction("rw", db.specimens, async () => {
      for (const find of proposal.finds) {
        await attachFindToLocality(find, locality, { markComplete: true });
      }
    });
    return;
  }
  if (!proposal.suggestion || proposal.finds.length === 0) return;

  const locality = await createLocalityShell(proposal.finds[0].projectId, proposal.suggestion);
  await db.transaction("rw", db.localities, db.specimens, async () => {
    await db.localities.add(locality);
    for (const find of proposal.finds) {
      await attachFindToLocality(find, locality, { markComplete: true });
    }
  });
}

function createLocalityShell(projectId: string, suggestion: LocalitySuggestion): Locality {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    projectId,
    type: "location",
    name: suggestion.name,
    lat: suggestion.lat,
    lon: suggestion.lon,
    gpsAccuracyM: suggestion.gpsAccuracyM,
    observedAt: suggestion.observedAt,
    collector: "",
    exposureType: "other",
    sssi: false,
    rigs: false,
    permissionGranted: false,
    period: suggestion.period,
    stage: suggestion.stage,
    formation: suggestion.formation,
    member: "",
    bed: "",
    lithologyPrimary: suggestion.lithologyPrimary,
    notes: suggestion.notes,
    designationNotes: "",
    createdAt: now,
    updatedAt: now,
  };
}

function clusterCenter(finds: Specimen[]): { lat: number; lon: number } | null {
  const coords = finds.map((find) => getFiniteCoords(find.lat, find.lon)).filter((item): item is { lat: number; lon: number } => !!item);
  if (coords.length === 0) return null;
  return {
    lat: coords.reduce((sum, item) => sum + item.lat, 0) / coords.length,
    lon: coords.reduce((sum, item) => sum + item.lon, 0) / coords.length,
  };
}

function suggestLocalityName(input: { formation: string; period: string; stage: string; gridRef: string | null }): string {
  if (input.formation) return `${input.formation} locality`;
  if (input.stage) return `${input.stage} locality`;
  if (input.period) return `${input.period} locality`;
  if (input.gridRef) return `Locality near ${input.gridRef}`;
  return "New fossil locality";
}

function lithologyFromDescription(description: string): Locality["lithologyPrimary"] {
  const text = description.toLowerCase();
  if (text.includes("shale")) return "shale";
  if (text.includes("siltstone")) return "siltstone";
  if (text.includes("sandstone")) return "sandstone";
  if (text.includes("limestone")) return "limestone";
  if (text.includes("chalk")) return "chalk";
  if (text.includes("clay")) return "clay";
  if (text.includes("marl")) return "marl";
  if (text.includes("conglomerate")) return "conglomerate";
  if (text.includes("ironstone")) return "ironstone";
  if (text.includes("coal")) return "coal";
  if (text.includes("chert") || text.includes("flint")) return "chert/flint";
  if (text.includes("mudstone")) return "mudstone";
  return "other";
}

function matchRank(match: NearbyLocalityMatch): number {
  const geologyBias = match.formationMatches === true ? -150 : match.formationMatches === false ? 150 : 0;
  return match.distanceM + geologyBias;
}

function mergeText(current: string, addition: string): string {
  const trimmedCurrent = clean(current);
  const trimmedAddition = clean(addition);
  if (!trimmedAddition) return trimmedCurrent;
  if (!trimmedCurrent) return trimmedAddition;
  if (trimmedCurrent.includes(trimmedAddition)) return trimmedCurrent;
  return `${trimmedCurrent}\n${trimmedAddition}`;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
