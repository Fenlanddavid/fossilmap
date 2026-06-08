import React from "react";
import { AlertTriangle } from "lucide-react";
import { Specimen, Media } from "../db";
import { SpecimenRow } from "./SpecimenRow";

type SelectedLocality = {
  id: string;
  name: string;
  type: "location" | "trip";
  lat: number;
  lon: number;
  sssi: boolean;
  rigs: boolean;
  period: string;
  stage: string;
  formation: string;
  lithology: string;
  specimenCount: number;
};

export function LocalityPanel(props: {
  selected: SelectedLocality;
  selectedSpecimens: Specimen[] | undefined;
  firstPhotoBySpecimenId: Map<string, Media> | undefined;
  onOpenSpecimen: (id: string) => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { selected } = props;
  
  return (
    <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 grid gap-3 shadow-xl max-h-[44svh] sm:max-h-[50svh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex justify-between gap-3 items-start">
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${selected.type === 'trip' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                    {selected.type === 'trip' ? 'Trip' : 'Location'}
                </span>
                <span className="opacity-50 text-[10px] font-mono">{selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}</span>
            </div>
            <h3 className="font-bold text-lg m-0 text-gray-900 dark:text-white truncate" title={selected.name}>{selected.name}</h3>
        </div>
        <div className="flex gap-2 shrink-0">
            <button
                type="button"
                onClick={props.onEdit}
                className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white px-2 py-1 rounded transition-colors font-medium border border-slate-200 dark:border-slate-600 shadow-sm"
            >
                View
            </button>
            <button type="button" onClick={props.onClose} aria-label="Close locality panel" className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">✕</button>
        </div>
      </div>

      <div className="text-sm opacity-90 flex flex-col gap-2">
        <div className="font-medium text-slate-700 dark:text-slate-300">
            {props.selectedSpecimens?.length ?? 0} find{(props.selectedSpecimens?.length ?? 0) === 1 ? "" : "s"} in view
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
            {selected.sssi && <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 font-bold flex items-center gap-1"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> SSSI</span>}
            {selected.rigs && <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 font-bold flex items-center gap-1"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> RIGS</span>}
            {!selected.sssi && !selected.rigs && (
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 font-medium">Designation OK</span>
            )}
            {selected.period && <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-800 font-medium">{selected.period}</span>}
            {selected.stage && <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-800 font-medium">{selected.stage}</span>}
            {selected.formation && <span className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-600 font-medium">Fm: {selected.formation}</span>}
        </div>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-700 pt-3 mt-1">
        <h4 className="m-0 mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Recorded Finds</h4>

        {(!props.selectedSpecimens || props.selectedSpecimens.length === 0) && (
          <div className="opacity-70 text-sm italic py-2 text-center bg-slate-50 dark:bg-slate-900 rounded-lg">No finds found.</div>
        )}

        {props.selectedSpecimens && props.selectedSpecimens.length > 0 && (
          <div className="grid gap-2">
            {props.selectedSpecimens.slice(0, 50).map((s) => (
              <SpecimenRow
                key={s.id}
                specimen={s}
                thumbMedia={props.firstPhotoBySpecimenId?.get(s.id) ?? null}
                onOpen={() => props.onOpenSpecimen(s.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
