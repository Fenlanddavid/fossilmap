import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

export default function Home(props: {
  projectId: string;
  goLocality: () => void;
  goLocalityEdit: (id: string) => void;
  goSpecimen: (localityId?: string) => void;
  goMap: () => void;
}) {
  const localities = useLiveQuery(
    async () => db.localities.where("projectId").equals(props.projectId).reverse().sortBy("createdAt"),
    [props.projectId]
  );

  const specimens = useLiveQuery(
    async () => db.specimens.where("projectId").equals(props.projectId).reverse().sortBy("createdAt"),
    [props.projectId]
  );

  return (
    <div className="grid gap-8 max-w-5xl mx-auto">
      <div className="flex gap-4 flex-wrap">
        <button onClick={props.goLocality} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2">
            <span>📍</span> New Field Trip
        </button>
        <button onClick={() => props.goSpecimen(undefined)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2">
            Casual Find
        </button>
        <button onClick={props.goMap} className="bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 ml-auto">
            <span>🗺️</span> Open Map
        </button>
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Recent Field Trips</h2>
            <div className="text-sm text-gray-500 font-mono">{localities?.length ?? 0} total</div>
        </div>
        
        {(!localities || localities.length === 0) && (
            <div className="text-gray-500 italic bg-gray-50 dark:bg-gray-800/50 p-10 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-center">
                No field trips recorded yet. Start by adding a new trip!
            </div>
        )}
        
        {localities && localities.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {localities.slice(0, 9).map((l) => (
              <div key={l.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all flex flex-col h-full group">
                <div className="flex justify-between gap-3 mb-2">
                  <button 
                    onClick={() => props.goLocalityEdit(l.id)}
                    className="text-gray-900 dark:text-white truncate text-lg font-bold group-hover:text-blue-600 dark:group-hover:text-blue-400 text-left transition-colors"
                  >
                    {l.name || "(Unnamed trip)"}
                  </button>
                </div>
                
                <div className="text-sm opacity-70 mb-4 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                     <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                        {l.lat && l.lon ? `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}` : "No GPS"}
                     </span>
                     <span className="text-xs opacity-60">{new Date(l.createdAt).toLocaleDateString()}</span>
                  </div>
                  {l.sssi && <span className="text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded text-xs font-bold inline-block mt-1">⚠️ SSSI</span>}
                </div>
                
                <div className="pt-3 mt-auto border-t border-gray-100 dark:border-gray-700 flex gap-4 items-center">
                  <button onClick={() => props.goSpecimen(l.id)} className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline flex items-center gap-1">
                    Add find <span>→</span>
                  </button>
                  <button onClick={() => props.goLocalityEdit(l.id)} className="text-xs text-gray-500 hover:text-gray-700 font-medium ml-auto px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                    Edit Trip
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Recent Finds</h2>
            <div className="text-sm text-gray-500 font-mono">{specimens?.length ?? 0} total</div>
        </div>

        {(!specimens || specimens.length === 0) && <div className="text-gray-500 italic bg-gray-50 dark:bg-gray-800/50 p-10 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-center">No finds recorded yet.</div>}
        
        {specimens && specimens.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {specimens.slice(0, 12).map((s) => (
              <div key={s.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between gap-3 mb-1 items-center">
                  <strong className="text-gray-900 dark:text-white font-mono text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded uppercase tracking-tighter">{s.specimenCode}</strong>
                  <span className="opacity-50 text-[10px] shrink-0 font-medium">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-2">
                  <div className="font-bold text-gray-800 dark:text-gray-200 truncate leading-tight" title={s.taxon}>{s.taxon || "(Taxon TBD)"}</div>
                  <div className="opacity-60 text-xs mt-1 flex gap-2 items-center">
                    <span className="bg-gray-50 dark:bg-gray-900 px-1 rounded border border-gray-100 dark:border-gray-800">{s.taxonConfidence}</span>
                    {s.element !== "unknown" && <span className="capitalize">{s.element}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}