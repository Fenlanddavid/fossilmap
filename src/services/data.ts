import { db, Media } from "../db";

export type ExportOptions = {
  includeMedia?: boolean;
};

export type ImportPreview = {
  projects: number;
  localities: number;
  sessions: number;
  specimens: number;
  media: number;
  settings: number;
  exportedAt?: string;
  version?: number;
};

export type ImportConflictPreview = ImportPreview & {
  conflicts: {
    overwrittenIds: {
      projects: number;
      localities: number;
      sessions: number;
      specimens: number;
      media: number;
      settings: number;
    };
    localityNames: string[];
    specimenCodes: string[];
  };
};

export async function exportData(options: ExportOptions = {}): Promise<string> {
  const includeMedia = options.includeMedia ?? true;
  const projects = await db.projects.toArray();
  const localities = await db.localities.toArray();
  const sessions = await db.sessions.toArray();
  const specimens = await db.specimens.toArray();
  const settings = await db.settings.toArray();
  
  const media = includeMedia ? await db.media.toArray() : [];
  const mediaExport = includeMedia
    ? await Promise.all(media.map(async (m) => {
        return {
          ...m,
          blob: await blobToBase64(m.blob)
        };
      }))
    : [];

  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    mediaIncluded: includeMedia,
    projects,
    localities,
    sessions,
    specimens,
    media: mediaExport,
    settings
  };

  return JSON.stringify(data, null, 2);
}

export async function getDataStats() {
  const [projects, localities, sessions, specimens, media, settings] = await Promise.all([
    db.projects.count(),
    db.localities.count(),
    db.sessions.count(),
    db.specimens.count(),
    db.media.count(),
    db.settings.count(),
  ]);

  let mediaBytes = 0;
  const mediaRows = await db.media.toArray();
  for (const item of mediaRows) mediaBytes += item.blob?.size ?? 0;

  let storageEstimate: { usage?: number; quota?: number } | null = null;
  try {
    storageEstimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  } catch {
    storageEstimate = null;
  }

  return {
    projects,
    localities,
    sessions,
    specimens,
    media,
    settings,
    mediaBytes,
    storageUsageBytes: storageEstimate?.usage ?? null,
    storageQuotaBytes: storageEstimate?.quota ?? null,
  };
}

function parseImport(json: string) {
  const data = JSON.parse(json);
  if (!data.projects || !Array.isArray(data.projects)) throw new Error("Invalid format: missing projects");
  return data;
}

function buildPreview(data: any): ImportPreview {
  return {
    projects: data.projects?.length ?? 0,
    localities: data.localities?.length ?? 0,
    sessions: data.sessions?.length ?? 0,
    specimens: data.specimens?.length ?? 0,
    media: data.media?.length ?? 0,
    settings: data.settings?.length ?? 0,
    exportedAt: data.exportedAt,
    version: data.version,
  };
}

export function previewImport(json: string): ImportPreview {
  return buildPreview(parseImport(json));
}

export async function previewImportConflicts(json: string): Promise<ImportConflictPreview> {
  const data = parseImport(json);
  const preview = buildPreview(data);

  const [projects, localities, sessions, specimens, media, settings] = await Promise.all([
    db.projects.toArray(),
    db.localities.toArray(),
    db.sessions.toArray(),
    db.specimens.toArray(),
    db.media.toArray(),
    db.settings.toArray(),
  ]);

  const idSet = {
    projects: new Set(projects.map((item) => item.id)),
    localities: new Set(localities.map((item) => item.id)),
    sessions: new Set(sessions.map((item) => item.id)),
    specimens: new Set(specimens.map((item) => item.id)),
    media: new Set(media.map((item) => item.id)),
    settings: new Set(settings.map((item) => item.key)),
  };

  const normalise = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const currentLocalityNames = new Set(localities.map((item) => normalise(item.name)).filter(Boolean));
  const currentSpecimenCodes = new Set(specimens.map((item) => normalise(item.specimenCode)).filter(Boolean));

  const localityNames = Array.from(
    new Set<string>((data.localities ?? []).map((item: any) => String(item.name ?? "").trim()).filter((name: string) => currentLocalityNames.has(normalise(name))))
  ).slice(0, 10);

  const specimenCodes = Array.from(
    new Set<string>((data.specimens ?? []).map((item: any) => String(item.specimenCode ?? "").trim()).filter((code: string) => currentSpecimenCodes.has(normalise(code))))
  ).slice(0, 10);

  return {
    ...preview,
    conflicts: {
      overwrittenIds: {
        projects: (data.projects ?? []).filter((item: any) => idSet.projects.has(item.id)).length,
        localities: (data.localities ?? []).filter((item: any) => idSet.localities.has(item.id)).length,
        sessions: (data.sessions ?? []).filter((item: any) => idSet.sessions.has(item.id)).length,
        specimens: (data.specimens ?? []).filter((item: any) => idSet.specimens.has(item.id)).length,
        media: (data.media ?? []).filter((item: any) => idSet.media.has(item.id)).length,
        settings: (data.settings ?? []).filter((item: any) => idSet.settings.has(item.key)).length,
      },
      localityNames,
      specimenCodes,
    },
  };
}

export async function exportToCSV(): Promise<string> {
  const localities = await db.localities.toArray();
  const specimens = await db.specimens.toArray();
  
  const locMap = new Map(localities.map(l => [l.id, l]));
  
  const headers = [
    "Specimen Code", "HRID", "Taxon", "Confidence", "Element", "Preservation", 
    "Specimen Period", "Specimen Stage",
    "Find Latitude", "Find Longitude", "Find GPS Accuracy (m)",
    "Weight (g)", "Length (mm)", "Width (mm)", "Thickness (mm)",
    "Find Context", "Taphonomy", "Date Collected",
    "Quality Score", "Is Shared", "Shared At",
    "Repository", "Accession ID",
    "Location Name", "Type", "Latitude", "Longitude", "Locality GPS Accuracy (m)", 
    "Location Period", "Location Stage",
    "Formation", "Member", "Bed", "Lithology", 
    "SSSI", "SSSI Name", "RIGS",
    "Date Observed", "Collector", "Specimen Notes", "Locality Notes"
  ];

  const rows = specimens.map(s => {
    const l = locMap.get(s.localityId);
    // Sanitize notes by removing newlines and escaping quotes
    const sNotes = (s.notes || "").replace(/\r?\n|\r/g, " ");
    const lNotes = (l?.notes || "").replace(/\r?\n|\r/g, " ");
    const findContext = (s.findContext || "").replace(/\r?\n|\r/g, " ");
    const taphonomy = (s.taphonomy || "").replace(/\r?\n|\r/g, " ");

    return [
      s.specimenCode, s.hrid ?? "", s.taxon, s.taxonConfidence, s.element, s.preservation,
      s.period ?? "", s.stage ?? "",
      s.lat ?? "", s.lon ?? "", s.gpsAccuracyM ?? "",
      s.weightG ?? "", s.lengthMm ?? "", s.widthMm ?? "", s.thicknessMm ?? "",
      findContext, taphonomy, s.dateCollected ?? "",
      s.qualityScore ?? "", s.isShared ? "true" : "false", s.sharedAt ?? "",
      s.repository ?? "", s.accessionId ?? "",
      l?.name ?? "", l?.type ?? "location", l?.lat ?? "", l?.lon ?? "", l?.gpsAccuracyM ?? "",
      l?.period ?? "", l?.stage ?? "",
      l?.formation ?? "", l?.member ?? "", l?.bed ?? "", l?.lithologyPrimary ?? "",
      l?.sssi ? "true" : "false", l?.sssiName ?? "", l?.rigs ? "true" : "false",
      l?.observedAt ? new Date(l.observedAt).toLocaleString() : "",
      l?.collector ?? "", sNotes, lNotes
    ].map(val => `"${String(val).replace(/"/g, '""')}"`);
  });

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

export async function importData(json: string) {
  const data = parseImport(json);

  await db.transaction("rw", [db.projects, db.localities, db.sessions, db.specimens, db.media, db.settings], async () => {
    await db.projects.bulkPut(data.projects);
    if(data.localities) await db.localities.bulkPut(data.localities);
    if(data.sessions) await db.sessions.bulkPut(data.sessions);
    if(data.specimens) await db.specimens.bulkPut(data.specimens);
    if(data.settings) await db.settings.bulkPut(data.settings);
    
    if (data.media) {
      const mediaItems = await Promise.all(data.media.map(async (m: any) => ({
        ...m,
        blob: await base64ToBlob(m.blob)
      })));
      await db.media.bulkPut(mediaItems as Media[]);
    }
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function base64ToBlob(base64: string): Promise<Blob> {
  const res = await fetch(base64);
  return res.blob();
}
