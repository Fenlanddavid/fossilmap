import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Media, Specimen } from "../db";
import { v4 as uuid } from "uuid";
import { fileToBlob } from "../services/photos";
import { ScaledImage } from "../components/ScaledImage";
import { PhotoAnnotator } from "../components/PhotoAnnotator";
import { captureGPS } from "../services/gps";

const taxonConfidence: Specimen["taxonConfidence"][] = ["high", "med", "low"];
const preservations: Specimen["preservation"][] = [
  "body fossil", "trace fossil", "mould", "cast", "impression/compression",
  "permineralised", "replacement", "carbonised", "subfossil", "other",
];

const commonTaxa = [
    "Ammonite", "Belemnite", "Gryphaea", "Brachiopod", "Echinoid", "Gastropod", "Bivalve",
    "Ichthyosaur", "Plesiosaur", "Pliosaur", "Dinosaur", "Croc", "Fish", "Shark", 
    "Trilobite", "Plant / Wood", "Trace Fossil", "Coprolite"
];

const commonElements = [
    "Tooth", "Vertebra", "Rib", "Limb Bone", "Skull Element", "Jaw", "Paddle / Fin",
    "Shell (Complete)", "Shell Fragment", "Nodule", "Matrix Block", "Osteoderm"
];

function makeSpecimenCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `UK-${year}-${rand}`;
}

export default function SpecimenPage(props: { projectId: string; localityId: string | null; sessionId?: string | null }) {
  const navigate = useNavigate();
  const localities = useLiveQuery(
    async () => db.localities.where("projectId").equals(props.projectId).reverse().sortBy("createdAt"),
    [props.projectId]
  );

  const [locationName, setLocationName] = useState("");
  const [specimenCode, setSpecimenCode] = useState(makeSpecimenCode());
  const [taxon, setTaxon] = useState("");
  const [confidence, setConfidence] = useState<Specimen["taxonConfidence"]>("med");
  const [element, setElement] = useState<Specimen["element"]>("shell");
  const [preservation, setPreservation] = useState<Specimen["preservation"]>("body fossil");
  const [taphonomy, setTaphonomy] = useState("");
  const [findContext, setFindContext] = useState("");
  
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [acc, setAcc] = useState<number | null>(null);
  
  const [weightG, setWeightG] = useState<string>("");
  const [lengthMm, setLengthMm] = useState<string>("");
  const [widthMm, setWidthMm] = useState<string>("");
  const [thicknessMm, setThicknessMm] = useState<string>("");

  const [isCustomElement, setIsCustomElement] = useState(false);

  const [bagBoxId, setBagBoxId] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [annotatingMedia, setAnnotatingMedia] = useState<{ media: Media; url: string } | null>(null);

  useEffect(() => {
    if (props.localityId) {
      db.localities.get(props.localityId).then(l => {
        if (l) setLocationName(l.name);
      });
    } else if (localities && localities.length > 0 && !locationName) {
      setLocationName(localities[0].name || "");
    }
  }, [props.localityId, localities]);

  const media = useLiveQuery(
    async () => (savedId ? db.media.where("specimenId").equals(savedId).toArray() : []),
    [savedId]
  );

  function resetForm() {
    setSavedId(null);
    setSpecimenCode(makeSpecimenCode());
    setTaxon("");
    setConfidence("med");
    setElement("shell");
    setPreservation("body fossil");
    setTaphonomy("");
    setFindContext("");
    setLat(null);
    setLon(null);
    setAcc(null);
    setWeightG("");
    setLengthMm("");
    setWidthMm("");
    setThicknessMm("");
    setIsCustomElement(false);
    setNotes("");
    setError(null);
  }

  async function doGPS() {
    setError(null);
    try {
      const fix = await captureGPS();
      setLat(fix.lat);
      setLon(fix.lon);
      setAcc(fix.accuracyM);
    } catch (e: any) {
      setError(e?.message ?? "GPS failed");
    }
  }

  async function saveSpecimen() {
    setError(null);
    setSaving(true);
    try {
      if (!locationName.trim()) throw new Error("Enter a location name first.");
      
      const trimmedName = locationName.trim();
      let targetLocalityId = "";
      
      const existing = await db.localities
        .where("projectId")
        .equals(props.projectId)
        .filter(l => l.name === trimmedName)
        .first();

      if (existing) {
        targetLocalityId = existing.id;
      } else {
        targetLocalityId = uuid();
        const now = new Date().toISOString();
        const defaultCollector = await db.settings.get("defaultCollector").then(s => s?.value || "");

        await db.localities.add({
          id: targetLocalityId,
          projectId: props.projectId,
          type: props.localityId ? "location" : "trip",
          name: trimmedName,
          lat: null,
          lon: null,
          gpsAccuracyM: null,
          observedAt: now,
          collector: defaultCollector,
          exposureType: "other",
          sssi: false,
          permissionGranted: false,
          formation: "",
          member: "",
          bed: "",
          lithologyPrimary: "other",
          notes: props.localityId ? "Structured Location" : "Field Trip (Casual)",
          createdAt: now,
          updatedAt: now,
        });
      }

      const id = uuid();
      const now = new Date().toISOString();

      const s: Specimen = {
        id,
        projectId: props.projectId,
        localityId: targetLocalityId,
        sessionId: props.sessionId || null,
        specimenCode: specimenCode.trim() || makeSpecimenCode(),
        taxon: taxon.trim(),
        taxonConfidence: confidence,
        lat,
        lon,
        gpsAccuracyM: acc,
        element,
        preservation,
        taphonomy: taphonomy.trim(),
        findContext: findContext.trim(),
        weightG: weightG ? parseFloat(weightG) : null,
        lengthMm: lengthMm ? parseFloat(lengthMm) : null,
        widthMm: widthMm ? parseFloat(widthMm) : null,
        thicknessMm: thicknessMm ? parseFloat(thicknessMm) : null,
        bagBoxId: bagBoxId.trim(),
        storageLocation: storageLocation.trim(),
        notes: notes.trim(),
        createdAt: now,
        updatedAt: now,
      };

      await db.specimens.add(s);
      setSavedId(id);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addPhotos(files: FileList | null, photoType?: Media["photoType"]) {
    setError(null);
    try {
      if (!savedId) throw new Error("Save the find first, then add photos.");
      if (!files || files.length === 0) return;

      const now = new Date().toISOString();
      const items: Media[] = [];

      for (const f of Array.from(files)) {
        const blob = await fileToBlob(f);
        const item: Media = {
          id: uuid(),
          projectId: props.projectId,
          specimenId: savedId,
          type: "photo",
          photoType: photoType || "other",
          filename: f.name,
          mime: f.type || "application/octet-stream",
          blob,
          caption: "",
          scalePresent: false,
          createdAt: now,
        };
        items.push(item);
      }

      await db.media.bulkAdd(items);

      // If only one photo was added, open the annotator automatically
      if (items.length === 1) {
        const m = items[0];
        const url = URL.createObjectURL(m.blob);
        setAnnotatingMedia({ media: m, url });
      }
    } catch (e: any) {
      setError(e?.message ?? "Photo add failed");
    }
  }

  function PhotoThumb(props: { mediaId: string; filename: string; onAnnotate: (m: Media, url: string) => void }) {
     const [media, setMedia] = useState<Media | null>(null);
     
     useEffect(() => {
        let active = true;
        db.media.get(props.mediaId).then(m => {
            if (active && m) {
                setMedia(m);
            }
        });
        return () => { active = false; };
     }, [props.mediaId]);

     if (!media) return <div className="w-full h-32 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg" />;
     
     const url = URL.createObjectURL(media.blob);

     return (
        <div 
            className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden aspect-square shadow-sm cursor-pointer"
            onClick={() => props.onAnnotate(media, url)}
        >
           <ScaledImage 
              media={media} 
              imgClassName="object-cover" 
              className="w-full h-full" 
           />
           <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="bg-white dark:bg-gray-800 text-[8px] font-black px-2 py-1 rounded-full shadow-sm uppercase tracking-widest">Annotate</span>
           </div>
           <div className="bg-white/90 dark:bg-gray-900/90 p-1 text-[8px] truncate absolute bottom-0 inset-x-0 z-10 flex justify-between items-center font-mono">
             <span className="truncate flex-1">{props.filename}</span>
             {media.photoType && (
               <span className={`px-1 rounded uppercase text-[7px] font-black ${media.photoType === 'in-situ' ? 'bg-amber-100 text-amber-800' : media.photoType === 'laboratory' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}>
                 {media.photoType === 'in-situ' ? 'Field' : media.photoType === 'laboratory' ? 'Lab' : 'Photo'}
               </span>
             )}
           </div>
        </div>
     );
  }

  return (
    <div className="grid gap-6 max-w-5xl mx-auto pb-20 px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-4">
        <h2 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tight">
          {props.localityId ? "Record Find" : "New Field Trip Find"}
        </h2>
        <div className="flex gap-2 w-full sm:w-auto">
            <button 
                onClick={() => navigate("/finds")}
                className="flex-1 sm:flex-none bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-xl font-bold transition-all text-sm"
            >
                View All
            </button>
            {savedId && (
                <button 
                    onClick={resetForm}
                    className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold shadow-md transition-all text-sm"
                >
                    + Another
                </button>
            )}
            <button onClick={() => navigate(-1)} className="flex-1 sm:flex-none text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors text-sm">Back</button>
        </div>
      </div>

      {error && <div className="border-2 border-red-200 bg-red-50 text-red-800 p-4 rounded-xl shadow-sm font-medium">⚠️ {error}</div>}

      <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className={`lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm grid gap-6 h-fit transition-opacity ${savedId ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="block">
            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Location Name</div>
            <input 
                value={locationName} 
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. Charmouth, Lyme Regis"
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
            />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label className="block">
                <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Specimen Code</div>
                <input 
                    value={specimenCode} 
                    onChange={(e) => setSpecimenCode(e.target.value)} 
                    className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
                />
                </label>

                <label className="block">
                <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Taxon Confidence</div>
                <select 
                    value={confidence} 
                    onChange={(e) => setConfidence(e.target.value as any)}
                    className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium appearance-none"
                >
                {taxonConfidence.map((c) => (
                    <option key={c} value={c}>{c}</option>
                ))}
                </select>
                </label>
            </div>

            <label className="block">
            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Taxon / Identification</div>
            <input 
                value={taxon} 
                onChange={(e) => setTaxon(e.target.value)} 
                placeholder="e.g. Dactylioceras commune" 
                list="taxa-list"
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-lg"
            />
            <datalist id="taxa-list">
                {commonTaxa.map(t => <option key={t} value={t} />)}
            </datalist>
            </label>

            <div className="bg-blue-50/50 dark:bg-blue-900/20 p-5 rounded-2xl border-2 border-blue-100/50 dark:border-blue-800/30 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex flex-col gap-1 w-full">
                    <div className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">GPS Find spot</div>
                    <div className="text-sm sm:text-lg font-mono font-bold text-gray-800 dark:text-gray-100 break-all">
                        {lat && lon ? (
                        <div className="flex items-center gap-2">
                            {lat.toFixed(6)}, {lon.toFixed(6)}
                        </div>
                        ) : (
                        <span className="opacity-40 italic text-sm">Coordinates not set</span>
                        )}
                    </div>
                </div>
                <button type="button" onClick={doGPS} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap text-sm">
                    📍 {lat ? "Update GPS" : "Get Find GPS"}
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <label className="block">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest opacity-60">Weight (g)</div>
                    <input type="number" step="0.01" value={weightG} onChange={(e) => setWeightG(e.target.value)} className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                </label>
                <label className="block">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest opacity-60">Length (mm)</div>
                    <input type="number" step="0.1" value={lengthMm} onChange={(e) => setLengthMm(e.target.value)} className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                </label>
                <label className="block">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest opacity-60">Width (mm)</div>
                    <input type="number" step="0.1" value={widthMm} onChange={(e) => setWidthMm(e.target.value)} className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                </label>
                <label className="block">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest opacity-60">Thick (mm)</div>
                    <input type="number" step="0.1" value={thicknessMm} onChange={(e) => setThicknessMm(e.target.value)} className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label className="block">
                    <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Anatomical Element</div>
                    <div className="grid gap-2">
                        <select 
                            value={isCustomElement ? "CUSTOM" : element} 
                            onChange={(e) => {
                                if (e.target.value === "CUSTOM") {
                                    setIsCustomElement(true);
                                    setElement("");
                                } else {
                                    setIsCustomElement(false);
                                    setElement(e.target.value);
                                }
                            }}
                            className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium appearance-none"
                        >
                            <option value="">-- Select Element --</option>
                            {commonElements.map(e => <option key={e} value={e}>{e}</option>)}
                            <option value="CUSTOM">✎ Custom / Not Listed...</option>
                        </select>
                        
                        {isCustomElement && (
                            <input 
                                value={element} 
                                onChange={(e) => setElement(e.target.value)}
                                placeholder="Type custom element..."
                                autoFocus
                                className="w-full bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold animate-in slide-in-from-top-1"
                            />
                        )}
                    </div>
                </label>

                <label className="block">
                    <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Preservation</div>
                    <select 
                        value={preservation} 
                        onChange={(e) => setPreservation(e.target.value as any)}
                        className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"
                    >
                    {preservations.map((x) => <option key={x} value={x} className="capitalize">{x}</option>)}
                    </select>
                </label>
            </div>

            <label className="block">
            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Notes</div>
            <textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                rows={4} 
                placeholder="Find context, matrix details, etc."
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
            />
            </label>

            <button 
                onClick={saveSpecimen} 
                disabled={saving || !locationName.trim()} 
                className={`mt-4 w-full px-8 py-5 rounded-2xl font-black text-2xl shadow-xl transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:transform-none ${savedId ? "bg-green-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
            >
            {saving ? "Saving..." : savedId ? "Find Recorded ✓" : "Record Find →"}
            </button>
        </div>

        {/* Photo Panel */}
        <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-inner flex flex-col gap-6 h-fit sticky top-4">
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tight m-0">Photos</h2>
                    {savedId && <span className="text-[10px] font-mono font-bold bg-white dark:bg-gray-800 px-2 py-1 rounded shadow-sm">{media?.length || 0} / 4</span>}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <label className={`aspect-square rounded-2xl font-black text-[10px] shadow-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center border-2 uppercase tracking-widest ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 hover:bg-amber-100"}`}>
                       <span className="text-2xl">📸</span>
                       <span>Photo 1</span>
                       <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "in-situ")} disabled={!savedId} className="hidden" />
                    </label>
                    
                    <label className={`aspect-square rounded-2xl font-black text-[10px] shadow-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center border-2 uppercase tracking-widest ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-400 hover:bg-blue-100"}`}>
                       <span className="text-2xl">📸</span>
                       <span>Photo 2</span>
                       <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "in-situ")} disabled={!savedId} className="hidden" />
                    </label>

                    <label className={`aspect-square rounded-2xl font-black text-[10px] shadow-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center border-2 uppercase tracking-widest ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100"}`}>
                       <span className="text-2xl">📸</span>
                       <span>Photo 3</span>
                       <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "laboratory")} disabled={!savedId} className="hidden" />
                    </label>
                    
                    <label className={`aspect-square rounded-2xl font-black text-[10px] shadow-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center border-2 uppercase tracking-widest ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800/50 text-purple-700 dark:text-purple-400 hover:bg-purple-100"}`}>
                       <span className="text-2xl">📸</span>
                       <span>Photo 4</span>
                       <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "laboratory")} disabled={!savedId} className="hidden" />
                    </label>
                </div>
                
                <label className={`w-full px-4 py-3 rounded-xl font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2 border ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-white dark:bg-gray-800 hover:bg-gray-50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"}`}>
                    📁 Upload Files
                    <input type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} disabled={!savedId} className="hidden" />
                </label>
            </div>

            {!savedId && <div className="text-center py-16 opacity-30 italic text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl">Record find first to unlock photos.</div>}

            {media && media.length > 0 && (
                <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1">
                    {media.map(m => <PhotoThumb key={m.id} mediaId={m.id} filename={m.filename} onAnnotate={(media, url) => setAnnotatingMedia({ media, url })} />)}
                </div>
            )}
        </div>
      </div>

      {annotatingMedia && (
        <PhotoAnnotator 
            media={annotatingMedia.media} 
            url={annotatingMedia.url} 
            onClose={() => {
                URL.revokeObjectURL(annotatingMedia.url);
                setAnnotatingMedia(null);
            }} 
        />
      )}
    </div>
  );
}
