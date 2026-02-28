import React, { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Media } from "../db";
import { ScaledImage } from "../components/ScaledImage";
import { SpecimenModal } from "../components/SpecimenModal";
import { TideWidget } from "../components/TideWidget";

export default function Home(props: {
  projectId: string;
  goLocality: () => void;
  goLocalityEdit: (id: string) => void;
  goSpecimen: (localityId?: string) => void;
  goAllFinds: () => void;
  goFindsWithFilter: (query: string) => void;
  goMap: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [openSpecimenId, setOpenSpecimenId] = useState<string | null>(null);
  
  const activeSessions = useLiveQuery(async () => {
    // Using filter instead of where.equals to be absolutely robust against type mismatches
    const sessions = await db.sessions.toCollection().filter(s => !s.isFinished).toArray();
    const map = new Map<string, any>();
    for (const s of sessions) {
      map.set(s.localityId, s);
    }
    return map;
  }, []);

  const localities = useLiveQuery(
    async () => {
      let collection = db.localities.where("projectId").equals(props.projectId);
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return collection
          .filter(l => l.name.toLowerCase().includes(query) || (l.formation?.toLowerCase().includes(query) ?? false))
          .reverse()
          .sortBy("createdAt");
      }
      return collection.reverse().sortBy("createdAt");
    },
    [props.projectId, searchQuery]
  );

  const specimens = useLiveQuery(
    async () => db.specimens.where("projectId").equals(props.projectId).reverse().sortBy("createdAt"),
    [props.projectId]
  );

  const specimenIds = useMemo(() => specimens?.slice(0, 12).map(s => s.id) ?? [], [specimens]);

  const firstMediaMap = useLiveQuery(async () => {
    if (specimenIds.length === 0) return new Map<string, Media>();
    const media = await db.media.where("specimenId").anyOf(specimenIds).toArray();
    const m = new Map<string, Media>();
    media.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const row of media) {
        if (!m.has(row.specimenId)) m.set(row.specimenId, row);
    }
    return m;
  }, [specimenIds]);

  async function finishTrip(localityId: string) {
    if (!confirm("Finish this field trip? This will record the end time and stop tracking.")) return;
    const session = activeSessions?.get(localityId);
    if (session) {
      await db.sessions.update(session.id, { 
        isFinished: true, 
        endTime: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  return (
    <div className="grid gap-8 max-w-5xl mx-auto">
      <div className="flex gap-2">
        <button onClick={props.goLocality} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm shadow-sm transition-colors flex items-center justify-center gap-1.5 font-bold">
            <span>📍</span> New Location
        </button>
        <button onClick={() => props.goSpecimen(undefined)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm shadow-sm transition-colors flex items-center justify-center gap-1.5 font-bold">
            New Field Trip
        </button>
      </div>

      <div className="flex flex-col gap-3 overflow-hidden">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Quick Search Collection</h3>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
            <QuickFilterBtn label="All Finds" onClick={props.goAllFinds} />
            <QuickFilterBtn label="Ammonite" onClick={() => props.goFindsWithFilter("Ammonite")} />
            <QuickFilterBtn label="Belemnite" onClick={() => props.goFindsWithFilter("Belemnite")} />
            <QuickFilterBtn label="Ichthyosaur" onClick={() => props.goFindsWithFilter("Ichthyosaur")} />
            <QuickFilterBtn label="Pliosaur" onClick={() => props.goFindsWithFilter("Pliosaur")} />
            <QuickFilterBtn label="Plesiosaur" onClick={() => props.goFindsWithFilter("Plesiosaur")} />
            <QuickFilterBtn label="Crocodile" onClick={() => props.goFindsWithFilter("Croc")} />
            <QuickFilterBtn label="Dinosaur" onClick={() => props.goFindsWithFilter("Dino")} />
            <QuickFilterBtn label="Fish" onClick={() => props.goFindsWithFilter("Fish")} />
            <QuickFilterBtn label="Shark Tooth" onClick={() => props.goFindsWithFilter("Shark")} />
            <QuickFilterBtn label="Gryphaea" onClick={() => props.goFindsWithFilter("Gryphaea")} />
            <QuickFilterBtn label="Brachiopod" onClick={() => props.goFindsWithFilter("Brachiopod")} />
            <QuickFilterBtn label="Echinoid" onClick={() => props.goFindsWithFilter("Echinoid")} />
            <QuickFilterBtn label="Shells" onClick={() => props.goFindsWithFilter("Shell")} />
            <QuickFilterBtn label="Trace" onClick={() => props.goFindsWithFilter("Trace")} />
            <QuickFilterBtn label="Plant" onClick={() => props.goFindsWithFilter("Plant")} />
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 italic ml-1 -mt-1 font-medium">Tip: Scroll for more categories</p>
      </div>

      <div className="grid gap-8">
          <section>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight">Locations & Trips</h2>
                <div className="flex items-center gap-3 flex-1 max-w-md">
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">🔍</span>
                        <input 
                            type="text"
                            placeholder="Search by name or formation..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div className="text-sm text-gray-500 font-mono hidden sm:block whitespace-nowrap">{localities?.length ?? 0} total</div>
                </div>
            </div>
            
            {(!localities || localities.length === 0) && (
                <div className="text-gray-500 italic bg-gray-50 dark:bg-gray-800/50 p-10 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-center">
                    {searchQuery ? "No results found matching your search." : "No locations or trips recorded yet. Start by adding one!"}
                </div>
            )}
            
            {localities && localities.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {localities.slice(0, 12).map((l) => {
                  const activeSession = activeSessions?.get(l.id);
                  const isActive = !!activeSession;
                  
                  return (
                  <div key={l.id} className={`border ${isActive ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-gray-200 dark:border-gray-700'} rounded-xl p-4 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all flex flex-col h-full group relative overflow-hidden`}>
                    {l.type === 'trip' && <div className={`absolute top-0 right-0 ${isActive ? 'bg-emerald-600' : 'bg-emerald-500'} text-white text-[8px] font-black px-2 py-0.5 rounded-bl uppercase tracking-widest`}>Trip</div>}
                    {isActive && (
                      <div className="absolute top-4 right-4 flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Active</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 mb-2">
                      <button 
                        onClick={() => props.goLocalityEdit(l.id)}
                        className="text-gray-900 dark:text-white truncate text-lg font-bold group-hover:text-blue-600 dark:group-hover:text-blue-400 text-left transition-colors pr-12"
                      >
                        {l.name || "(Unnamed)"}
                      </button>
                    </div>
                    
                    <div className="text-sm opacity-70 mb-4 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                         <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                            {l.lat && l.lon ? `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}` : "No GPS"}
                         </span>
                         <span className="text-xs opacity-60">{new Date(l.createdAt).toLocaleDateString()}</span>
                      </div>
                      {l.formation && <div className="text-xs font-medium opacity-80 mt-1 truncate">{l.formation}</div>}
                      {l.sssi && <span className="text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded text-xs font-bold inline-block mt-1">⚠️ SSSI</span>}
                    </div>
                    
                    <div className="pt-3 mt-auto border-t border-gray-100 dark:border-gray-700 flex gap-4 items-center">
                      {isActive ? (
                        <>
                          <button onClick={() => props.goSpecimen(l.id)} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm flex items-center gap-1">
                             <span>📸</span> Add Find
                          </button>
                          <button onClick={() => finishTrip(l.id)} className="text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 px-3 py-1.5 rounded-lg font-bold border border-red-100 dark:border-red-900/40 ml-auto">
                            Finish
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => props.goSpecimen(l.id)} className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline flex items-center gap-1">
                            Add find <span>→</span>
                          </button>
                          <button onClick={() => props.goLocalityEdit(l.id)} className="text-xs text-gray-500 hover:text-gray-700 font-medium ml-auto px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                            {l.type === 'location' ? 'View/Edit' : 'Edit Details'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Recent Finds</h2>
                <button onClick={props.goAllFinds} className="text-sm text-blue-600 font-bold hover:underline">View All Finds →</button>
            </div>

            {(!specimens || specimens.length === 0) && <div className="text-gray-500 italic bg-gray-50 dark:bg-gray-800/50 p-10 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-center">No finds recorded yet.</div>}
            
            {specimens && specimens.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {specimens.slice(0, 12).map((s) => {
                  const media = firstMediaMap?.get(s.id);
                  return (
                    <div key={s.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all flex flex-col h-full group cursor-pointer" onClick={() => setOpenSpecimenId(s.id)}>
                      <div className="aspect-square bg-gray-100 dark:bg-gray-900 relative">
                        {media ? (
                          <ScaledImage 
                            media={media} 
                            className="w-full h-full" 
                            imgClassName="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-30 italic text-[10px]">
                            No photo
                          </div>
                        )}
                        <div className="absolute top-2 left-2">
                            <strong className="text-white font-mono text-[9px] bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded uppercase tracking-tighter">{s.specimenCode}</strong>
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="font-bold text-gray-800 dark:text-gray-200 truncate leading-tight group-hover:text-blue-600 transition-colors" title={s.taxon}>{s.taxon || "(Taxon TBD)"}</div>
                        <div className="opacity-60 text-[10px] mt-1 flex justify-between items-center">
                          <div className="flex gap-2">
                            <span className="bg-gray-50 dark:bg-gray-900 px-1 rounded border border-gray-100 dark:border-gray-800 uppercase font-bold">{s.taxonConfidence}</span>
                            {s.element !== "unknown" && <span className="capitalize">{s.element}</span>}
                          </div>
                          <span className="opacity-60">{new Date(s.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-8 mt-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-bold">🛡️ Data Protection:</span> All data is stored locally on this device. No finds or GPS locations are ever uploaded or shared.
            </p>
          </div>
      </div>

            {openSpecimenId && (

              <SpecimenModal specimenId={openSpecimenId} onClose={() => setOpenSpecimenId(null)} />

            )}

          </div>

        );

      }

      

      function QuickFilterBtn({ label, onClick }: { label: string, onClick: () => void }) {

          return (

              <button 

                  onClick={onClick}

                  className="whitespace-nowrap px-5 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm transition-all hover:shadow-md hover:border-blue-500 dark:hover:border-blue-500 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"

              >

                  {label}

              </button>

          );

      }

      