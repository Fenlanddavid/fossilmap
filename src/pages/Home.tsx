import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Media } from "../db";
import { SpecimenModal } from "../components/SpecimenModal";
import { TideWidget } from "../components/TideWidget";
import { SpecimenThumbnail } from "../components/SpecimenThumbnail";
import { LocalityThumbnail } from "../components/LocalityThumbnail";
import { LocalityFindsList } from "../components/LocalityFindsList";
import { Camera, Upload, Plus } from "lucide-react";
import { fileToBlob } from "../services/photos";
import { v4 as uuid } from "uuid";

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
  const [busy, setBusy] = useState(false);
  
  const activeSessions = useLiveQuery(async () => {
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
        return await collection
          .filter(l => l.name.toLowerCase().includes(query) || (l.formation?.toLowerCase().includes(query) ?? false))
          .reverse()
          .sortBy("createdAt");
      }
      return await collection.reverse().sortBy("createdAt");
    },
    [props.projectId, searchQuery]
  );

  const specimens = useLiveQuery(
    async () => db.specimens.where("projectId").equals(props.projectId).reverse().sortBy("createdAt"),
    [props.projectId]
  );

  async function addLocalityPhoto(localityId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
        const file = files[0];
        const blob = await fileToBlob(file);
        const item: Media = {
            id: uuid(),
            projectId: props.projectId,
            localityId: localityId,
            type: "photo" as const,
            filename: file.name,
            mime: file.type || "image/jpeg",
            blob,
            caption: "Locality Photo",
            scalePresent: false,
            createdAt: new Date().toISOString(),
        };
        await db.media.add(item);
    } catch (e) {
        console.error("Locality photo failed:", e);
        alert("Failed to save photo.");
    } finally {
        setBusy(false);
    }
  }

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
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-100 dark:border-emerald-800 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
                <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">Local-First</span>
            </div>
            <h1 className="text-lg font-black text-gray-900 dark:text-white leading-tight">Your data, your choice.</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 max-w-lg">All data is stored locally on this device. No data is shared unless you choose to contribute a find to the FossilMapped database.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto shrink-0">
            <button onClick={props.goLocality} className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl text-sm shadow-xl transition-all flex items-center justify-center gap-2 font-black transform active:scale-95">
                <span>📍</span> New Location
            </button>
            <button onClick={() => props.goSpecimen(undefined)} className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl text-sm shadow-xl transition-all flex items-center justify-center gap-2 font-black transform active:scale-95">
                New Field Trip
            </button>
        </div>
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
              <div className="grid gap-4 sm:grid-cols-2">
                {localities.slice(0, 12).map((l) => {
                  const activeSession = activeSessions?.get(l.id);
                  const isActive = !!activeSession;
                  
                  return (
                  <div key={l.id} className={`border ${isActive ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-gray-200 dark:border-gray-700'} rounded-2xl bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all flex flex-row group relative overflow-hidden h-52 sm:h-48`}>
                    
                    {/* Left Side: Content */}
                    <div className="p-4 flex flex-col flex-1 min-w-0">
                        <div className="flex justify-between gap-3 mb-1">
                            <button 
                                onClick={() => props.goLocalityEdit(l.id)}
                                className="text-gray-900 dark:text-white truncate text-base font-black group-hover:text-blue-600 dark:group-hover:text-blue-400 text-left transition-colors"
                            >
                                {l.name || "(Unnamed)"}
                            </button>
                        </div>
                        
                        <div className="text-[11px] opacity-70 mb-3">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-gray-600 dark:text-gray-300">
                                    {l.lat && l.lon ? `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}` : "No GPS"}
                                </span>
                                {l.type === 'trip' && l.createdAt && !isNaN(Date.parse(l.createdAt)) && (
                                    <span className="opacity-60">{new Date(l.createdAt).toLocaleDateString()}</span>
                                )}
                            </div>
                            <div className="flex gap-1.5 items-center flex-wrap">
                                {l.period && <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1 py-0.5 rounded border border-blue-100 dark:border-blue-800 uppercase tracking-tighter text-[9px]">{l.period}</span>}
                                {l.stage && <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1 py-0.5 rounded border border-blue-100 dark:border-blue-800 uppercase tracking-tighter text-[9px]">{l.stage}</span>}
                            </div>
                        </div>

                        <LocalityFindsList localityId={l.id} />
                        
                        <div className="mt-auto flex gap-3 items-center">
                        {isActive ? (
                            <>
                            <button onClick={() => props.goSpecimen(l.id)} className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-black shadow-sm flex items-center gap-1 uppercase tracking-wider">
                                <Plus className="w-3 h-3" /> Find
                            </button>
                            <button onClick={() => finishTrip(l.id)} className="text-[10px] bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 px-2.5 py-1.5 rounded-lg font-black border border-red-100 dark:border-red-900/40 uppercase tracking-wider">
                                Finish
                            </button>
                            </>
                        ) : (
                            <>
                            <button onClick={() => props.goSpecimen(l.id)} className="text-[10px] text-blue-600 hover:text-blue-800 font-black hover:underline flex items-center gap-1 uppercase tracking-wider">
                                Add find <span>→</span>
                            </button>
                            <button onClick={() => props.goLocalityEdit(l.id)} className="text-[10px] text-gray-500 hover:text-gray-700 font-bold ml-auto uppercase tracking-wider">
                                {l.type === 'location' ? 'View' : 'Edit'}
                            </button>
                            </>
                        )}
                        </div>
                    </div>

                    {/* Right Side: Media Area */}
                    <div className="w-28 sm:w-36 bg-gray-50 dark:bg-gray-900/50 relative border-l border-gray-100 dark:border-gray-700 group/media shrink-0">
                        <LocalityThumbnail localityId={l.id} className="w-full h-full" imgClassName="object-cover" />
                        
                        {/* Overlay text when no image exists */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
                            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 group-hover/media:opacity-0 transition-opacity">Upload / Take Image</span>
                        </div>

                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/media:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                            <label className="cursor-pointer flex items-center gap-2 bg-white text-black px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-transform">
                                <Camera className="w-3.5 h-3.5" /> Camera
                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addLocalityPhoto(l.id, e.target.files)} />
                            </label>
                            <label className="cursor-pointer flex items-center gap-2 bg-white/20 backdrop-blur-md text-white px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/20 hover:bg-white/30 transition-all">
                                <Upload className="w-3.5 h-3.5" /> Upload
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => addLocalityPhoto(l.id, e.target.files)} />
                            </label>
                        </div>

                        {l.type === 'trip' && <div className={`absolute top-0 right-0 ${isActive ? 'bg-emerald-600' : 'bg-emerald-500'} text-white text-[7px] font-black px-1.5 py-0.5 rounded-bl uppercase tracking-widest z-10`}>Trip</div>}
                        {isActive && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        </div>
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
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight">Recent Finds</h2>
                <button onClick={props.goAllFinds} className="text-sm text-blue-600 font-bold hover:underline">View All Finds →</button>
            </div>

            {(!specimens || specimens.length === 0) && <div className="text-gray-500 italic bg-gray-50 dark:bg-gray-800/50 p-10 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-center">No finds recorded yet.</div>}
            
            {specimens && specimens.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {specimens.slice(0, 12).map((s) => {
                  return (
                    <div key={s.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all flex flex-col h-full group cursor-pointer" onClick={() => setOpenSpecimenId(s.id)}>
                      <div className="aspect-square bg-gray-100 dark:bg-gray-900 relative">
                        <SpecimenThumbnail 
                            specimenId={s.id} 
                            className="w-full h-full" 
                            imgClassName="object-cover"
                        />
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
