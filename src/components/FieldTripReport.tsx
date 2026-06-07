import React, { useMemo } from "react";
import { Locality, Specimen, Media } from "../db";
import { ScaledImage } from "./ScaledImage";
import { APP_VERSION } from "../version";

export function FieldTripReport(props: {
  locality: Locality;
  finds: Specimen[];
  media: Media[];
}) {
  const generatedAt = useMemo(() => new Date(), []);
  const reportReference = useMemo(() => makeReportReference(props.locality.id, generatedAt), [props.locality.id, generatedAt]);

  const mediaMap = useMemo(() => {
    const mapped = new Map<string, Media[]>();
    for (const item of props.media) {
      if (!item.specimenId) continue;
      if (!mapped.has(item.specimenId)) mapped.set(item.specimenId, []);
      mapped.get(item.specimenId)!.push(item);
    }
    for (const items of mapped.values()) {
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    }
    return mapped;
  }, [props.media]);

  const photoCount = props.finds.reduce((total, find) => total + (mediaMap.get(find.id)?.length ?? 0), 0);
  const gpsFindCount = props.finds.filter((find) => find.lat != null && find.lon != null).length;
  const measuredFindCount = props.finds.filter((find) => find.lengthMm || find.widthMm || find.thicknessMm || find.weightG).length;
  const storedFindCount = props.finds.filter((find) => find.bagBoxId || find.storageLocation).length;
  const localityGps = props.locality.lat != null && props.locality.lon != null
    ? `${props.locality.lat.toFixed(6)}, ${props.locality.lon.toFixed(6)}${props.locality.gpsAccuracyM ? ` (+/- ${Math.round(props.locality.gpsAccuracyM)}m)` : ""}`
    : "Not recorded";

  return (
    <div className="report-container mx-auto max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-stone-50 text-slate-950 shadow-sm print:max-w-none print:rounded-none print:border-0 print:bg-white print:shadow-none">
      <header className="relative overflow-hidden border-b border-slate-200 bg-white p-7 print:p-6">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-600 via-teal-500 to-sky-500" />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700">
                <span className="font-mono text-lg font-black">FM</span>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">FossilMap field report</p>
                <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-500">{reportReference}</p>
              </div>
            </div>
            <h1 className="m-0 max-w-3xl text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">
              {props.locality.name || "Unnamed field record"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-slate-600">
              {props.locality.type === "trip" ? "Field trip" : "Locality"} recorded {formatDate(props.locality.observedAt)}.
              {" "}This report links site context, stratigraphy, access notes, specimen evidence and mapped find positions.
            </p>
          </div>
          <div className="min-w-48 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-[10px] leading-relaxed text-slate-600 print:bg-white">
            <div><strong className="text-slate-950">Generated</strong> {generatedAt.toLocaleString("en-GB")}</div>
            <div><strong className="text-slate-950">Reference</strong> {reportReference}</div>
            <div><strong className="text-slate-950">Version</strong> FossilMap v{APP_VERSION}</div>
          </div>
        </div>
      </header>

      <main className="grid gap-7 p-7 print:p-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
          <Metric label="Finds" value={props.finds.length} />
          <Metric label="Photos" value={photoCount} />
          <Metric label="Find GPS" value={`${gpsFindCount}/${props.finds.length || 0}`} />
          <Metric label="Measured" value={`${measuredFindCount}/${props.finds.length || 0}`} />
        </section>

        <MapSnapshot locality={props.locality} finds={props.finds} />

        <section className="grid gap-5 md:grid-cols-2 print:grid-cols-2">
          <ReportBlock title="Site and Access">
            <Fact label="Collector" value={props.locality.collector || "Not recorded"} />
            <Fact label="GPS" value={localityGps} />
            <Fact label="Exposure" value={props.locality.exposureType} />
            <Fact label="Permission" value={props.locality.permissionGranted ? "Permission recorded" : "Not recorded"} />
            <Fact label="Designation" value={designationText(props.locality)} />
            {props.locality.designationNotes && <Fact label="Access notes" value={props.locality.designationNotes} />}
          </ReportBlock>

          <ReportBlock title="Stratigraphy">
            <Fact label="Period" value={props.locality.period || "Not recorded"} />
            <Fact label="Stage" value={props.locality.stage || "Not recorded"} />
            <Fact label="Formation" value={props.locality.formation || "Not recorded"} />
            <Fact label="Member" value={props.locality.member || "Not recorded"} />
            <Fact label="Bed" value={props.locality.bed || "Not recorded"} />
            <Fact label="Lithology" value={props.locality.lithologyPrimary || "Not recorded"} />
          </ReportBlock>
        </section>

        {props.locality.notes && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 print:break-inside-avoid">
            <h2 className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Field Notes</h2>
            <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{props.locality.notes}</p>
          </section>
        )}

        <section>
          <div className="mb-4 flex flex-col gap-2 border-b-2 border-slate-950 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Numbered register</p>
              <h2 className="m-0 text-2xl font-black tracking-tight text-slate-950">Recorded Finds</h2>
            </div>
            <span className="font-mono text-xs font-bold text-slate-500">{storedFindCount} with storage recorded</span>
          </div>

          {props.finds.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">No finds recorded for this trip yet.</div>
          ) : (
            <div className="grid gap-7">
              {props.finds.map((find, index) => {
                const findMedia = mediaMap.get(find.id) ?? [];
                const completeness = specimenCompleteness(find, findMedia.length);
                return (
                  <article key={find.id} className="rounded-lg border border-slate-200 bg-white p-5 print:break-inside-avoid">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="grid h-7 min-w-7 place-items-center rounded bg-slate-950 px-2 font-mono text-xs font-black text-white">{index + 1}</span>
                          <span className="rounded border border-slate-300 px-2 py-1 font-mono text-xs font-black">{find.specimenCode}</span>
                          <span className="rounded border border-slate-300 px-2 py-1 text-xs font-black uppercase">{find.taxonConfidence} confidence</span>
                        </div>
                        <h3 className="m-0 text-xl font-black text-slate-950">{find.taxon || "Unidentified taxon"}</h3>
                        <p className="mt-1 text-sm font-bold text-slate-600">{[find.period, find.stage].filter(Boolean).join(" / ") || "Age not recorded"}</p>
                      </div>
                      <div className="min-w-28 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center print:bg-white">
                        <div className="text-2xl font-black text-slate-950">{completeness}%</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">complete</div>
                      </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-[1fr_1.3fr] print:grid-cols-[1fr_1.3fr]">
                      <div className="grid content-start gap-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <Fact label="Element" value={find.element || "Not recorded"} />
                          <Fact label="Preservation" value={find.preservation || "Not recorded"} />
                          <Fact label="Measurements" value={measurementText(find)} />
                          <Fact label="Storage" value={storageText(find)} />
                          <Fact label="Find GPS" value={find.lat != null && find.lon != null ? `${find.lat.toFixed(6)}, ${find.lon.toFixed(6)}` : "Not recorded"} />
                          <Fact label="Photos" value={String(findMedia.length)} />
                        </div>

                        {find.findContext && <Note title="Find context" text={find.findContext} />}
                        {find.taphonomy && <Note title="Taphonomy" text={find.taphonomy} />}
                        {find.notes && <Note title="Specimen notes" text={find.notes} />}
                      </div>

                      <div>
                        {findMedia.length === 0 ? (
                          <div className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-slate-300 text-sm font-bold text-slate-400">No photo evidence</div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {findMedia.slice(0, 6).map((media) => (
                              <figure key={media.id} className="m-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                <ScaledImage media={media} className="aspect-square bg-slate-100" imgClassName="object-cover" />
                                <figcaption className="flex items-center justify-between gap-2 px-2 py-1 font-mono text-[9px] text-slate-600">
                                  <span className="truncate">{media.filename}</span>
                                  <span className="shrink-0 uppercase">{photoLabel(media.photoType)}</span>
                                </figcaption>
                              </figure>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="border-t border-slate-200 pt-4 text-center font-mono text-[10px] leading-relaxed text-slate-500">
          Generated from local FossilMap data. Check access restrictions, designations and grid references before external publication.
        </footer>
      </main>
    </div>
  );
}

function MapSnapshot(props: { locality: Locality; finds: Specimen[] }) {
  const findPoints = props.finds
    .map((find, index) => ({ find, index }))
    .filter(({ find }) => find.lat != null && find.lon != null);
  const localityPoint = props.locality.lat != null && props.locality.lon != null
    ? { lat: props.locality.lat, lon: props.locality.lon }
    : null;
  const allPoints = [
    ...(localityPoint ? [localityPoint] : []),
    ...findPoints.map(({ find }) => ({ lat: find.lat!, lon: find.lon! })),
  ];

  if (allPoints.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500 print:break-inside-avoid">
        Map snapshot unavailable: no locality or find GPS has been recorded.
      </section>
    );
  }

  const bounds = makeBounds(allPoints);
  const project = (lat: number, lon: number) => ({
    x: 44 + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 552,
    y: 276 - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 222,
  });
  const localityXY = localityPoint ? project(localityPoint.lat, localityPoint.lon) : null;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white print:break-inside-avoid">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Map Snapshot</h2>
        <p className="mt-1 text-xs font-semibold text-slate-600">
          {findPoints.length} of {props.finds.length} finds plotted with locality and find markers.
        </p>
      </div>
      <div className="p-4">
        <svg viewBox="0 0 640 320" role="img" aria-label="Report map snapshot with locality and find markers" className="h-auto w-full rounded-lg border border-slate-200 bg-slate-100">
          <rect width="640" height="320" fill="#f8fafc" />
          {Array.from({ length: 6 }).map((_, i) => (
            <React.Fragment key={i}>
              <line x1={44 + i * 110.4} y1="34" x2={44 + i * 110.4} y2="276" stroke="#e2e8f0" strokeWidth="1" />
              <line x1="44" y1={34 + i * 48.4} x2="596" y2={34 + i * 48.4} stroke="#e2e8f0" strokeWidth="1" />
            </React.Fragment>
          ))}
          <rect x="44" y="34" width="552" height="242" fill="none" stroke="#cbd5e1" strokeWidth="2" />

          {localityXY && (
            <g>
              <path d={`M ${localityXY.x} ${localityXY.y - 13} L ${localityXY.x + 13} ${localityXY.y} L ${localityXY.x} ${localityXY.y + 13} L ${localityXY.x - 13} ${localityXY.y} Z`} fill="#047857" stroke="#ffffff" strokeWidth="3" />
              <text x={localityXY.x + 16} y={localityXY.y - 10} fontFamily="Arial, sans-serif" fontSize="11" fontWeight="800" fill="#064e3b">Locality</text>
            </g>
          )}

          {findPoints.map(({ find, index }) => {
            const point = project(find.lat!, find.lon!);
            return (
              <g key={find.id}>
                <circle cx={point.x} cy={point.y} r="11" fill="#ffffff" stroke="#0284c7" strokeWidth="3" />
                <text x={point.x} y={point.y + 3.5} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="10" fontWeight="900" fill="#075985">{index + 1}</text>
              </g>
            );
          })}

          <g transform="translate(456 244)">
            <rect width="112" height="44" rx="8" fill="#ffffff" stroke="#cbd5e1" />
            <path d="M 14 13 L 22 21 L 14 29 L 6 21 Z" fill="#047857" />
            <text x="30" y="24" fontFamily="Arial, sans-serif" fontSize="10" fontWeight="700" fill="#334155">Locality</text>
            <circle cx="14" cy="35" r="6" fill="#ffffff" stroke="#0284c7" strokeWidth="2" />
            <text x="30" y="38" fontFamily="Arial, sans-serif" fontSize="10" fontWeight="700" fill="#334155">Find marker</text>
          </g>
        </svg>
      </div>
    </section>
  );
}

function makeBounds(points: Array<{ lat: number; lon: number }>) {
  let minLat = Math.min(...points.map((point) => point.lat));
  let maxLat = Math.max(...points.map((point) => point.lat));
  let minLon = Math.min(...points.map((point) => point.lon));
  let maxLon = Math.max(...points.map((point) => point.lon));
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const latSpan = Math.max(maxLat - minLat, 0.002);
  const lonSpan = Math.max(maxLon - minLon, 0.002);
  minLat = centerLat - latSpan * 0.6;
  maxLat = centerLat + latSpan * 0.6;
  minLon = centerLon - lonSpan * 0.6;
  maxLon = centerLon + lonSpan * 0.6;
  return { minLat, maxLat, minLon, maxLon };
}

function ReportBlock(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 print:break-inside-avoid">
      <h2 className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{props.title}</h2>
      <div className="grid gap-2 text-sm">{props.children}</div>
    </section>
  );
}

function Metric(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 print:break-inside-avoid">
      <div className="text-2xl font-black text-slate-950">{props.value}</div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{props.label}</div>
    </div>
  );
}

function Fact(props: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{props.label}</div>
      <div className="mt-0.5 break-words font-semibold text-slate-800">{props.value || "Not recorded"}</div>
    </div>
  );
}

function Note(props: { title: string; text: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{props.title}</div>
      <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{props.text}</p>
    </div>
  );
}

function makeReportReference(id: string, generatedAt: Date) {
  const datePart = generatedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const idPart = id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "LOCAL";
  return `FM-FIELD-${datePart}-${idPart}`;
}

function formatDate(value: string) {
  if (!value) return "date not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date not recorded";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function designationText(locality: Locality) {
  const items = [];
  if (locality.sssi) items.push("SSSI");
  if (locality.rigs) items.push("RIGS/LGS");
  return items.length ? items.join(", ") : "No designation recorded";
}

function measurementText(find: Specimen) {
  const parts = [
    find.lengthMm ? `L ${find.lengthMm}mm` : "",
    find.widthMm ? `W ${find.widthMm}mm` : "",
    find.thicknessMm ? `T ${find.thicknessMm}mm` : "",
    find.weightG ? `${find.weightG}g` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Not recorded";
}

function storageText(find: Specimen) {
  return [find.bagBoxId, find.storageLocation].filter(Boolean).join(" / ") || "Not recorded";
}

function photoLabel(type: Media["photoType"]) {
  if (type === "in-situ") return "Field";
  if (type === "laboratory") return "Lab";
  return "Photo";
}

function specimenCompleteness(find: Specimen, photoCount: number) {
  const checks = [
    !!find.specimenCode,
    !!find.taxon,
    !!find.element,
    !!find.period || !!find.stage,
    find.lat != null && find.lon != null,
    !!find.findContext || !!find.notes,
    !!find.lengthMm || !!find.widthMm || !!find.thicknessMm || !!find.weightG,
    photoCount > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
