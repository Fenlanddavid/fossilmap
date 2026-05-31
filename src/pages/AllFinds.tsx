import React, { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { useSearchParams } from "react-router-dom";
import { SpecimenThumbnail } from "../components/SpecimenThumbnail";
import { Zap, MapPin } from "lucide-react";

const SpecimenModal = React.lazy(() =>
  import("../components/SpecimenModal").then((mod) => ({ default: mod.SpecimenModal }))
);

type View = "all" | "pending";

export default function AllFinds(props: { projectId: string }) {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [view, setView] = useState<View>("all");
  const [openSpecimenId, setOpenSpecimenId] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearchQuery(q);
  }, [searchParams]);

  const specimens = useLiveQuery(
    async () => {
      let collection = db.specimens.where("projectId").equals(props.projectId);
      if (view === "pending") {
        return collection.filter(s => !!s.isPending).reverse().sortBy("createdAt");
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return collection
          .filter(s =>
            !s.isPending &&
            (s.taxon.toLowerCase().includes(q) ||
            (s.period || "").toLowerCase().includes(q) ||
            (s.stage || "").toLowerCase().includes(q) ||
            s.specimenCode.toLowerCase().includes(q) ||
            s.notes.toLowerCase().includes(q))
          )
          .reverse()
          .sortBy("createdAt");
      }
      return collection.filter(s => !s.isPending).reverse().sortBy("createdAt");
    },
    [props.projectId, searchQuery, view]
  );

  const pendingCount = useLiveQuery(
    async () => db.specimens.where("projectId").equals(props.projectId).filter(s => !!s.isPending).count(),
    [props.projectId]
  );

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight">All Finds</h2>
          <p className="text-gray-500 text-sm font-medium">Browse and search every recorded find.</p>
        </div>

        {view === "all" && (
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">🔍</span>
            <input
              type="text"
              placeholder="Search by taxon, code, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-3 pl-10 pr-4 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setView("all")}
          className={`px-4 py-2 rounded-lg text-sm font-black transition-colors border ${
            view === "all"
              ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800"
          }`}
        >
          All finds
        </button>
        <button
          onClick={() => setView("pending")}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black transition-colors border ${
            view === "pending"
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800"
          }`}
        >
          <Zap className="h-3.5 w-3.5" />
          Pending
          {(pendingCount ?? 0) > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
              view === "pending" ? "bg-white/30 text-white" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            }`}>
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {view === "pending" && (specimens?.length ?? 0) === 0 && (
        <div className="text-center py-20 bg-amber-50 dark:bg-amber-950/20 rounded-3xl border-2 border-dashed border-amber-200 dark:border-amber-800">
          <Zap className="mx-auto mb-3 h-8 w-8 text-amber-400" />
          <p className="text-amber-700 dark:text-amber-400 font-medium">No pending finds.</p>
          <p className="text-amber-600/70 dark:text-amber-500/70 text-sm mt-1">Quick finds logged in the field will appear here.</p>
        </div>
      )}

      {view === "all" && (!specimens || specimens.length === 0) && (
        <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-gray-500 italic">
            {searchQuery ? "No finds match your search." : "No finds recorded yet."}
          </p>
        </div>
      )}

      {view === "pending" && (specimens?.length ?? 0) > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {specimens!.map((find) => (
            <button
              key={find.id}
              onClick={() => setOpenSpecimenId(find.id)}
              className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-left transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 dark:hover:border-amber-600 dark:hover:bg-amber-950/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-900 dark:text-white">{find.taxon || "Unidentified"}</p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">{find.specimenCode}</p>
                {find.lat && find.lon && (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                    <MapPin className="h-2.5 w-2.5" />
                    {find.lat.toFixed(4)}, {find.lon.toFixed(4)}
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                Draft
              </span>
            </button>
          ))}
        </div>
      )}

      {view === "all" && (specimens?.length ?? 0) > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specimens!.map((s) => (
            <div
              key={s.id}
              onClick={() => setOpenSpecimenId(s.id)}
              className="group border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer flex flex-col"
            >
              <div className="aspect-video bg-gray-100 dark:bg-gray-900 relative border-b border-gray-100 dark:border-gray-700">
                <SpecimenThumbnail specimenId={s.id} className="w-full h-full" imgClassName="object-cover" />
                <div className="absolute top-3 left-3">
                  <span className="font-mono text-[10px] font-bold bg-black/60 backdrop-blur-md text-white px-2 py-1 rounded shadow-sm">
                    {s.specimenCode}
                  </span>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 group-hover:text-blue-600 transition-colors line-clamp-1">
                    {s.taxon || "Unidentified"}
                  </h3>
                </div>

                {(s.period || s.stage) && (
                  <div className="flex gap-2 items-center mb-2">
                    {s.period && <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded shadow-sm border border-blue-100 dark:border-blue-800">{s.period}</span>}
                    {s.stage && <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded shadow-sm border border-blue-100 dark:border-blue-800">{s.stage}</span>}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-auto pt-3">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                    s.taxonConfidence === "high" ? "bg-green-50 border-green-100 text-green-700" :
                    s.taxonConfidence === "med" ? "bg-amber-50 border-amber-100 text-amber-700" :
                    "bg-red-50 border-red-100 text-red-700"
                  }`}>
                    {s.taxonConfidence} confidence
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-800 uppercase">
                    {s.element || "Unknown element"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {openSpecimenId && (
        <React.Suspense fallback={null}>
          <SpecimenModal
            specimenId={openSpecimenId}
            onClose={() => setOpenSpecimenId(null)}
          />
        </React.Suspense>
      )}
    </div>
  );
}
