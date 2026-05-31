import React, { useMemo } from "react";
import { Locality, Specimen, Media } from "../db";
import { ScaledImage } from "./ScaledImage";

export function FieldTripReport(props: {
  locality: Locality;
  finds: Specimen[];
  media: Media[];
}) {
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
    <div className="report-container mx-auto max-w-5xl bg-white p-8 text-black print:max-w-none print:p-0">
      <header className="mb-8 border-b-4 border-black pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.25em] text-gray-500">FossilMap field report</p>
            <h1 className="m-0 text-4xl font-black tracking-tight">{props.locality.name}</h1>
            <p className="mt-2 text-sm font-bold text-gray-600">
              {props.locality.type === "trip" ? "Field trip" : "Locality"} recorded {formatDate(props.locality.observedAt)}
            </p>
          </div>
          <div className="text-left font-mono text-xs text-gray-600 sm:text-right">
            <div>Generated: {new Date().toLocaleString()}</div>
            <div>FossilMap v0.1.0</div>
          </div>
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
        <Metric label="Finds" value={props.finds.length} />
        <Metric label="Photos" value={photoCount} />
        <Metric label="Finds with GPS" value={`${gpsFindCount}/${props.finds.length || 0}`} />
        <Metric label="Measured" value={`${measuredFindCount}/${props.finds.length || 0}`} />
      </section>

      <section className="mb-8 grid gap-5 md:grid-cols-2 print:grid-cols-2">
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
        <section className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-5 print:bg-white">
          <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-gray-500">Field Notes</h2>
          <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">{props.locality.notes}</p>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between border-b-2 border-black pb-2">
          <h2 className="m-0 text-2xl font-black tracking-tight">Recorded Finds</h2>
          <span className="font-mono text-xs font-bold text-gray-500">{storedFindCount} with storage recorded</span>
        </div>

        {props.finds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm font-bold text-gray-500">No finds recorded for this trip yet.</div>
        ) : (
          <div className="grid gap-8">
            {props.finds.map((find, index) => {
              const findMedia = mediaMap.get(find.id) ?? [];
              const completeness = specimenCompleteness(find, findMedia.length);
              return (
                <article key={find.id} className="border-b border-gray-200 pb-8 last:border-0 print:break-inside-avoid">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="bg-black px-2 py-1 font-mono text-xs font-black text-white">{index + 1}</span>
                        <span className="rounded border border-gray-300 px-2 py-1 font-mono text-xs font-black">{find.specimenCode}</span>
                        <span className="rounded border border-gray-300 px-2 py-1 text-xs font-black uppercase">{find.taxonConfidence} confidence</span>
                      </div>
                      <h3 className="m-0 text-xl font-black">{find.taxon || "Unidentified taxon"}</h3>
                      <p className="mt-1 text-sm font-bold text-gray-600">{[find.period, find.stage].filter(Boolean).join(" / ") || "Age not recorded"}</p>
                    </div>
                    <div className="min-w-28 rounded-lg border border-gray-200 bg-gray-50 p-3 text-center print:bg-white">
                      <div className="text-2xl font-black">{completeness}%</div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">complete</div>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-[1fr_1.3fr] print:grid-cols-[1fr_1.3fr]">
                    <div className="grid gap-4">
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
                        <div className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-gray-300 text-sm font-bold text-gray-400">No photo evidence</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {findMedia.slice(0, 6).map((media) => (
                            <figure key={media.id} className="m-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                              <ScaledImage media={media} className="aspect-square bg-gray-100" imgClassName="object-cover" />
                              <figcaption className="flex items-center justify-between gap-2 px-2 py-1 font-mono text-[9px] text-gray-600">
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

      <footer className="mt-12 border-t border-gray-200 pt-4 text-center font-mono text-[10px] text-gray-500">
        Generated from local FossilMap data. Check access restrictions and grid references before external publication.
      </footer>
    </div>
  );
}

function ReportBlock(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-5 print:bg-white">
      <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-gray-500">{props.title}</h2>
      <div className="grid gap-2 text-sm">{props.children}</div>
    </section>
  );
}

function Metric(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 print:bg-white">
      <div className="text-2xl font-black">{props.value}</div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-gray-500">{props.label}</div>
    </div>
  );
}

function Fact(props: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">{props.label}</div>
      <div className="mt-0.5 break-words font-semibold">{props.value || "Not recorded"}</div>
    </div>
  );
}

function Note(props: { title: string; text: string }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-gray-500">{props.title}</div>
      <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">{props.text}</p>
    </div>
  );
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString() : "date not recorded";
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
