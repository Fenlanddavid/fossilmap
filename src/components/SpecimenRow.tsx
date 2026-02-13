import React from "react";
import { Specimen } from "../db";
import { ScaleBar } from "./ScaleBar";

export function SpecimenRow(props: { 
  specimen: Specimen; 
  thumbUrl: string | null; 
  pxPerMm?: number;
  onOpen: () => void 
}) {
  const s = props.specimen;
  return (
    <button
      onClick={props.onOpen}
      className="w-full text-left flex gap-3 items-center border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
    >
      <div className="relative">
        {props.thumbUrl ? (
          <img src={props.thumbUrl} alt="thumb" className="w-14 h-14 object-cover rounded-lg bg-gray-100 dark:bg-gray-700" />
        ) : (
          <div className="w-14 h-14 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 grid place-items-center opacity-70 text-xs bg-gray-50 dark:bg-gray-800">
            no photo
          </div>
        )}
        {props.pxPerMm && (
          <div className="absolute bottom-1 right-1 pointer-events-none scale-50 origin-bottom-right">
            <ScaleBar pxPerMm={props.pxPerMm * 0.2} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex gap-2 items-baseline flex-wrap">
          <strong className="text-sm font-semibold group-hover:text-blue-600 transition-colors">{s.specimenCode}</strong>
          <span className="opacity-75 text-xs">{new Date(s.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="opacity-90 mt-0.5 text-sm">
          {s.taxon || "(Taxon TBD)"} <span className="opacity-60">• {s.taxonConfidence}</span>
        </div>
      </div>
    </button>
  );
}
