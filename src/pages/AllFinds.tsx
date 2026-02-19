import React, { useState, useMemo, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Media } from "../db";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ScaledImage } from "../components/ScaledImage";
import { SpecimenModal } from "../components/SpecimenModal";

export default function AllFinds(props: { projectId: string }) {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [openSpecimenId, setOpenSpecimenId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearchQuery(q);
  }, [searchParams]);

  const specimens = useLiveQuery(
    async () => {
      let collection = db.specimens.where("projectId").equals(props.projectId);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return collection
          .filter(s => 
            s.taxon.toLowerCase().includes(q) || 
            s.specimenCode.toLowerCase().includes(q) ||
            s.notes.toLowerCase().includes(q)
          )
          .reverse()
          .sortBy("createdAt");
      }
      return collection.reverse().sortBy("createdAt");
    },
    [props.projectId, searchQuery]
  );

  const specimenIds = useMemo(() => specimens?.map(s => s.id) ?? [], [specimens]);

  const firstMediaMap = useLiveQuery(async () => {
    if (specimenIds.length === 0) return new Map<string, Media>();
    const media = await db.media.where("specimenId").anyOf(specimenIds).toArray();
    const m = new Map<string, Media>();
    // Sort by createdAt to get the first photo
    media.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const row of media) {
        if (!m.has(row.specimenId)) m.set(row.specimenId, row);
    }
    return m;
  }, [specimenIds]);

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight">All Finds</h2>
          <p className="text-gray-500 text-sm font-medium">Browse and search every recorded find.</p>
        </div>
        
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
      </div>

      {(!specimens || specimens.length === 0) ? (
        <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-gray-500 italic">
            {searchQuery ? "No finds match your search." : "No finds recorded yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specimens.map((s) => {
            const media = firstMediaMap?.get(s.id);
            return (
              <div 
                key={s.id} 
                onClick={() => setOpenSpecimenId(s.id)}
                className="group border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer flex flex-col"
              >
                <div className="aspect-video bg-gray-100 dark:bg-gray-900 relative border-b border-gray-100 dark:border-gray-700">
                  {media ? (
                    <ScaledImage 
                      media={media} 
                      className="w-full h-full" 
                      imgClassName="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-30 italic text-xs">
                      No photo
                    </div>
                  )}
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
                  
                  <div className="flex flex-wrap gap-2 mt-auto pt-3">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                      s.taxonConfidence === "high" ? "bg-green-50 border-green-100 text-green-700" :
                      s.taxonConfidence === "med" ? "bg-amber-50 border-amber-100 text-amber-700" :
                      "bg-red-50 border-red-100 text-red-700"
                    }`}>
                      {s.taxonConfidence}
                    </span>
                    {s.element !== "unknown" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                        {s.element}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] opacity-40 font-medium self-center">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {s.notes && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 line-clamp-2 italic">
                      "{s.notes}"
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openSpecimenId && (
        <SpecimenModal specimenId={openSpecimenId} onClose={() => setOpenSpecimenId(null)} />
      )}
    </div>
  );
}