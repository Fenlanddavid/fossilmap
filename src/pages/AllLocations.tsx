import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
import { LocalityThumbnail } from "../components/LocalityThumbnail";

export default function AllLocations(props: { projectId: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const locations = useLiveQuery(
    async () => {
      let collection = db.localities.where("projectId").equals(props.projectId);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return collection
          .filter(l => 
            l.name.toLowerCase().includes(q) || 
            (l.notes?.toLowerCase().includes(q) ?? false) ||
            (l.formation?.toLowerCase().includes(q) ?? false) ||
            (l.period?.toLowerCase().includes(q) ?? false) ||
            (l.stage?.toLowerCase().includes(q) ?? false)
          )
          .reverse()
          .sortBy("createdAt");
      }
      return collection.reverse().sortBy("createdAt");
    },
    [props.projectId, searchQuery]
  );

  return (
    <div className="max-w-5xl mx-auto pb-10 px-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8 mt-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight">Locations & Trips</h2>
          <p className="text-gray-500 text-sm font-medium">Browse and search every recorded geological location or field trip.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-xl lg:justify-end">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">🔍</span>
            <input 
              type="text"
              placeholder="Search by name, formation, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 sm:py-3 pl-10 pr-4 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
            />
          </div>
          <button 
            onClick={() => navigate("/location")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 sm:py-3 rounded-xl font-bold shadow-md transition-all whitespace-nowrap text-sm"
          >
            + New Location
          </button>
        </div>
      </div>

      {(!locations || locations.length === 0) ? (
        <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <div className="text-4xl mb-4">📍</div>
          <p className="text-gray-500 italic font-medium">
            {searchQuery ? "No results match your search." : "No locations or trips recorded yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {locations.map((l) => (
            <article
              key={l.id}
              onClick={() => navigate(l.type === "trip" ? `/field-trip/${l.id}` : `/location/${l.id}`)}
              className="group grid min-h-44 grid-cols-[1fr_7.25rem] overflow-hidden rounded-lg border bg-white shadow-sm transition-all hover:shadow-md dark:bg-slate-900 border-slate-200 dark:border-slate-800 cursor-pointer"
            >
              {/* Left: text content */}
              <div className="flex min-w-0 flex-col p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-base font-black text-slate-950 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
                    {l.name || "(Unnamed)"}
                  </span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${l.type === "trip" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"}`}>
                    {l.type === "trip" ? "Trip" : "Site"}
                  </span>
                </div>

                <div className="mb-2 flex flex-wrap gap-1.5">
                  {l.period && (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                      {l.period}
                    </span>
                  )}
                  {l.stage && (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                      {l.stage}
                    </span>
                  )}
                  {l.formation && (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {l.formation}
                    </span>
                  )}
                </div>

                <div className="mb-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {l.lat && l.lon ? `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}` : "No GPS set"}
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400">
                    {new Date(l.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-1">
                    {l.sssi && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600 dark:bg-amber-900/20">⚠️ SSSI</span>}
                    {l.rigs && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600 dark:bg-amber-900/20">⚠️ RIGS</span>}
                  </div>
                </div>
              </div>

              {/* Right: cover photo */}
              <div className="relative border-l border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                <LocalityThumbnail localityId={l.id} className="h-full w-full" imgClassName="object-cover" />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
