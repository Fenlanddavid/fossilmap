import React from "react";
import { Specimen, Media } from "../db";
import { SpecimenRow } from "./SpecimenRow";

type SelectedLocality = {
  id: string;
  name: string;
  type: "location" | "trip";
  lat: number;
  lon: number;
  sssi: boolean;
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
    <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur border border-gray-200 dark:border-gray-700 rounded-xl p-4 grid gap-3 shadow-xl max-h-[50vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-300">
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
                onClick={props.onEdit}
                className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-blue-600 hover:text-white px-2 py-1 rounded transition-colors font-medium border border-gray-200 dark:border-gray-600 shadow-sm"
            >
                View
            </button>
            <button onClick={props.onClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">✕</button>
        </div>
      </div>

      <div className="text-sm opacity-90 flex flex-col gap-2">
        <div className="font-medium text-gray-700 dark:text-gray-300">
            {props.selectedSpecimens?.length ?? 0} find{(props.selectedSpecimens?.length ?? 0) === 1 ? "" : "s"} in view
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
            {selected.sssi ? (
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 font-bold flex items-center gap-1">⚠️ SSSI Flagged</span>
            ) : (
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 font-medium">Designation OK</span>
            )}
            {selected.formation && <span className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded-lg border border-gray-200 dark:border-gray-600 font-medium">Fm: {selected.formation}</span>}
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-1">
        <h4 className="m-0 mb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Recorded Finds</h4>

        {(!props.selectedSpecimens || props.selectedSpecimens.length === 0) && (
          <div className="opacity-70 text-sm italic py-2 text-center bg-gray-50 dark:bg-gray-900 rounded-lg">No finds found.</div>
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
