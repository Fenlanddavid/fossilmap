import React, { useMemo } from "react";
import { Locality, Specimen, Media } from "../db";
import { ScaleBar } from "./ScaleBar";

export function FieldTripReport(props: {
  locality: Locality;
  finds: Specimen[];
  media: Media[];
}) {
  const mediaMap = useMemo(() => {
    const m = new Map<string, Media[]>();
    for (const item of props.media) {
      if (!m.has(item.specimenId)) m.set(item.specimenId, []);
      m.get(item.specimenId)!.push(item);
    }
    return m;
  }, [props.media]);

  return (
    <div className="bg-white text-black p-8 max-w-4xl mx-auto print:p-0 print:max-w-none report-container">
      <header className="border-b-4 border-black pb-4 mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter">Field Trip Report</h1>
          <p className="text-xl font-bold opacity-70">{props.locality.name}</p>
        </div>
        <div className="text-right font-mono text-sm">
          <div>Report Generated: {new Date().toLocaleDateString()}</div>
          <div>FossilMap v0.1.0</div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-8 mb-8 bg-gray-50 p-6 rounded-xl border border-gray-200 print:bg-transparent print:border-none print:p-0">
        <div className="grid gap-2">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">Trip Details</h2>
          <div className="grid grid-cols-[100px_1fr] gap-x-4">
            <span className="font-bold">Collector:</span> <span>{props.locality.collector}</span>
            <span className="font-bold">Date:</span> <span>{new Date(props.locality.observedAt).toLocaleString()}</span>
            <span className="font-bold">GPS:</span> <span>{props.locality.lat?.toFixed(6)}, {props.locality.lon?.toFixed(6)} (±{Math.round(props.locality.gpsAccuracyM || 0)}m)</span>
            <span className="font-bold">Exposure:</span> <span className="capitalize">{props.locality.exposureType}</span>
          </div>
        </div>
        <div className="grid gap-2">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">Stratigraphy</h2>
          <div className="grid grid-cols-[100px_1fr] gap-x-4">
            <span className="font-bold">Formation:</span> <span>{props.locality.formation}</span>
            <span className="font-bold">Member:</span> <span>{props.locality.member || "N/A"}</span>
            <span className="font-bold">Bed:</span> <span>{props.locality.bed || "N/A"}</span>
            <span className="font-bold">Lithology:</span> <span className="capitalize">{props.locality.lithologyPrimary}</span>
          </div>
        </div>
      </section>

      {props.locality.notes && (
        <section className="mb-8">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Trip Notes</h2>
          <p className="text-sm italic border-l-4 border-gray-200 pl-4">{props.locality.notes}</p>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-black uppercase tracking-tighter mb-4 border-b-2 border-black pb-1">Recorded Finds ({props.finds.length})</h2>
        <div className="grid gap-8">
          {props.finds.map((find, idx) => (
            <div key={find.id} className="border-b border-gray-100 pb-8 last:border-0 print:break-inside-avoid">
              <div className="flex justify-between items-baseline mb-3">
                <h3 className="text-lg font-bold flex gap-2 items-center">
                  <span className="bg-black text-white px-2 py-0.5 text-sm font-mono">{find.specimenCode}</span>
                  {find.taxon || "Unidentified Taxon"}
                </h3>
                <span className="text-xs font-bold uppercase text-gray-400">Confidence: {find.taxonConfidence}</span>
              </div>

              <div className="grid grid-cols-[1fr_2fr] gap-6">
                <div className="text-sm grid gap-1 h-fit">
                  <p><span className="font-bold uppercase text-[10px] text-gray-500 block">Element</span> {find.element}</p>
                  <p><span className="font-bold uppercase text-[10px] text-gray-500 block">Preservation</span> {find.preservation}</p>
                  {find.notes && <p><span className="font-bold uppercase text-[10px] text-gray-500 block">Notes</span> {find.notes}</p>}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {mediaMap.get(find.id)?.map(m => {
                    const url = URL.createObjectURL(m.blob);
                    return (
                      <div key={m.id} className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-square flex items-center justify-center">
                        <img src={url} className="w-full h-full object-cover" />
                        {m.pxPerMm && (
                          <div className="absolute bottom-2 right-2">
                            <ScaleBar pxPerMm={m.pxPerMm * 0.5} /> {/* Arbitrary scale for report layout */}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-12 pt-4 border-t border-gray-200 text-center text-[10px] text-gray-400 font-mono italic">
        This document was generated using FossilMap. Coordinates and stratigraphy recorded in-field.
      </footer>
    </div>
  );
}
