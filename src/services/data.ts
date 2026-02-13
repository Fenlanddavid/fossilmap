import { db, Media } from "../db";

export async function exportData(): Promise<string> {
  const projects = await db.projects.toArray();
  const localities = await db.localities.toArray();
  const specimens = await db.specimens.toArray();
  
  const media = await db.media.toArray();
  const mediaExport = await Promise.all(media.map(async (m) => {
    return {
      ...m,
      blob: await blobToBase64(m.blob)
    };
  }));

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects,
    localities,
    specimens,
    media: mediaExport
  };

  return JSON.stringify(data, null, 2);
}

export async function exportToCSV(): Promise<string> {
  const localities = await db.localities.toArray();
  const specimens = await db.specimens.toArray();
  
  const locMap = new Map(localities.map(l => [l.id, l]));
  
  const headers = [
    "Specimen Code", "Taxon", "Confidence", "Element", "Preservation", 
    "Locality Name", "Latitude", "Longitude", "GPS Accuracy (m)", 
    "Formation", "Member", "Bed", "Lithology", 
    "Date Observed", "Collector", "Specimen Notes", "Locality Notes"
  ];

  const rows = specimens.map(s => {
    const l = locMap.get(s.localityId);
    // Sanitize notes by removing newlines and escaping quotes
    const sNotes = (s.notes || "").replace(/\r?\n|\r/g, " ");
    const lNotes = (l?.notes || "").replace(/\r?\n|\r/g, " ");

    return [
      s.specimenCode, s.taxon, s.taxonConfidence, s.element, s.preservation,
      l?.name ?? "", l?.lat ?? "", l?.lon ?? "", l?.gpsAccuracyM ?? "",
      l?.formation ?? "", l?.member ?? "", l?.bed ?? "", l?.lithologyPrimary ?? "",
      l?.observedAt ? new Date(l.observedAt).toLocaleString() : "",
      l?.collector ?? "", sNotes, lNotes
    ].map(val => `"${String(val).replace(/"/g, '""')}"`);
  });

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

export async function importData(json: string) {
  const data = JSON.parse(json);
  
  if (!data.projects || !Array.isArray(data.projects)) throw new Error("Invalid format: missing projects");

  await db.transaction("rw", db.projects, db.localities, db.specimens, db.media, async () => {
    await db.projects.bulkPut(data.projects);
    if(data.localities) await db.localities.bulkPut(data.localities);
    if(data.specimens) await db.specimens.bulkPut(data.specimens);
    
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