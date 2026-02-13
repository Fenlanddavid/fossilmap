import React, { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Media, Specimen } from "../db";
import { v4 as uuid } from "uuid";
import { fileToBlob } from "../services/photos";
import { ScaleBar } from "../components/ScaleBar";

const taxonConfidence: Specimen["taxonConfidence"][] = ["high", "med", "low"];
const elements: Specimen["element"][] = ["shell", "bone", "tooth", "plant", "trace fossil", "microfossil", "unknown", "other"];
const preservations: Specimen["preservation"][] = [
  "body fossil", "trace fossil", "mould", "cast", "impression/compression",
  "permineralised", "replacement", "carbonised", "subfossil", "other",
];

function makeSpecimenCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `UK-${year}-${rand}`;
}

export default function SpecimenPage(props: { projectId: string; localityId: string | null }) {
  const localities = useLiveQuery(
    async () => db.localities.where("projectId").equals(props.projectId).reverse().sortBy("createdAt"),
    [props.projectId]
  );

  const [localityId, setLocalityId] = useState<string | "">(props.localityId ?? "");
  const [specimenCode, setSpecimenCode] = useState(makeSpecimenCode());
  const [taxon, setTaxon] = useState("");
  const [confidence, setConfidence] = useState<Specimen["taxonConfidence"]>("med");
  const [element, setElement] = useState<Specimen["element"]>("shell");
  const [preservation, setPreservation] = useState<Specimen["preservation"]>("body fossil");
  const [taphonomy, setTaphonomy] = useState("");
  const [findContext, setFindContext] = useState("");
  const [bagBoxId, setBagBoxId] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (props.localityId) {
      setLocalityId(props.localityId);
    } else if (localities && localities.length > 0 && !localityId) {
      setLocalityId(localities[0].id);
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
    setNotes("");
    setError(null);
  }

  async function saveSpecimen() {
    setError(null);
    setSaving(true);
    try {
      if (!localityId) throw new Error("Pick a field trip first.");
      const id = uuid();
      const now = new Date().toISOString();

      const s: Specimen = {
        id,
        projectId: props.projectId,
        localityId,
        specimenCode: specimenCode.trim() || makeSpecimenCode(),
        taxon: taxon.trim(),
        taxonConfidence: confidence,
        element,
        preservation,
        taphonomy: taphonomy.trim(),
        findContext: findContext.trim(),
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

  async function addPhotos(files: FileList | null) {
    setError(null);
    try {
      if (!savedId) throw new Error("Save the find first, then add photos.");
      if (!files || files.length === 0) return;

      const now = new Date().toISOString();
      const items: Media[] = [];

      for (const f of Array.from(files)) {
        const blob = await fileToBlob(f);
        items.push({
          id: uuid(),
          projectId: props.projectId,
          specimenId: savedId,
          type: "photo",
          filename: f.name,
          mime: f.type || "application/octet-stream",
          blob,
          caption: "",
          scalePresent: false,
          createdAt: now,
        });
      }

      await db.media.bulkAdd(items);
    } catch (e: any) {
      setError(e?.message ?? "Photo add failed");
    }
  }

  function PhotoThumb(props: { mediaId: string; filename: string }) {
     const [url, setUrl] = useState<string | null>(null);
     const [pxPerMm, setPxPerMm] = useState<number | undefined>();
     
     useEffect(() => {
        let active = true;
        db.media.get(props.mediaId).then(m => {
            if (active && m) {
                setUrl(URL.createObjectURL(m.blob));
                setPxPerMm(m.pxPerMm);
            }
        });
        return () => { active = false; if(url) URL.revokeObjectURL(url); };
     }, [props.mediaId]);

     if (!url) return <div className="w-full h-32 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg" />;
     
     return (
        <div className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden aspect-square">
           <img src={url} alt={props.filename} className="w-full h-full object-cover" />
           {pxPerMm && (
             <div className="absolute bottom-6 right-2">
               <ScaleBar pxPerMm={pxPerMm * 0.2} />
             </div>
           )}
           <div className="bg-white/90 dark:bg-gray-900/90 p-1 text-[10px] truncate absolute bottom-0 inset-x-0">{props.filename}</div>
        </div>
     );
  }

  return (
    <div className="grid gap-6 max-w-4xl mx-auto pb-10">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Casual Find</h2>
        {savedId && (
            <button 
                onClick={resetForm}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold shadow-md transition-all"
            >
                + Record Another Find
            </button>
        )}
      </div>

      {error && <div className="border-2 border-red-200 bg-red-50 text-red-800 p-4 rounded-xl shadow-sm">{error}</div>}

      <div className="grid lg:grid-cols-2 gap-6">
          <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm grid gap-5 h-fit transition-opacity ${savedId ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="block">
            <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300">Select Field Trip</div>
            <select 
                value={localityId} 
                onChange={(e) => setLocalityId(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow font-bold"
            >
                <option value="">— Select Trip —</option>
                {localities?.map((l) => (
                <option key={l.id} value={l.id}>
                    {l.name || "(Unnamed)"}
                </option>
                ))}
            </select>
            </label>

            <div className="grid grid-cols-2 gap-4">
            <label className="block">
                <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300">Specimen Code</div>
                <input 
                    value={specimenCode} 
                    onChange={(e) => setSpecimenCode(e.target.value)} 
                    className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow font-mono text-sm"
                />
            </label>

            <label className="block">
                <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300">Confidence</div>
                <select 
                    value={confidence} 
                    onChange={(e) => setConfidence(e.target.value as any)}
                    className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                >
                {taxonConfidence.map((c) => (
                    <option key={c} value={c}>{c}</option>
                ))}
                </select>
            </label>
            </div>

            <label className="block">
            <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300">Taxon / Identification</div>
            <input 
                value={taxon} 
                onChange={(e) => setTaxon(e.target.value)} 
                placeholder="e.g., Ichthyosaurus sp." 
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
            />
            </label>

            <div className="grid grid-cols-2 gap-4">
            <label className="block">
                <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300">Element</div>
                <select 
                    value={element} 
                    onChange={(e) => setElement(e.target.value as any)}
                    className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                >
                {elements.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
            </label>

            <label className="block">
                <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300">Preservation</div>
                <select 
                    value={preservation} 
                    onChange={(e) => setPreservation(e.target.value as any)}
                    className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                >
                {preservations.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
            </label>
            </div>

            <label className="block">
            <div className="mb-1.5 text-sm font-bold text-gray-700 dark:text-gray-300">Notes</div>
            <textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                rows={4} 
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
            />
            </label>

            <button 
                onClick={saveSpecimen} 
                disabled={saving || !localityId} 
                className={`mt-2 w-full px-6 py-4 rounded-xl font-bold text-lg shadow-md transition-all transform active:scale-95 disabled:opacity-50 disabled:transform-none ${savedId ? "bg-green-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
            >
            {saving ? "Saving..." : savedId ? "Find Saved ✓" : "Save Find"}
            </button>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm flex flex-col gap-4 h-fit sticky top-4">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 m-0">Photos</h2>
                <div className="flex gap-2">
                    <label className={`px-3 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors cursor-pointer flex items-center gap-1 ${!savedId ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}>
                       📸 Take Photo
                       <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files)} disabled={!savedId} className="hidden" />
                    </label>
                    <label className={`px-3 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors cursor-pointer flex items-center gap-1 ${!savedId ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
                       📁 Upload
                       <input type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} disabled={!savedId} className="hidden" />
                    </label>
                </div>
            </div>

            {!savedId && <div className="text-center py-12 opacity-40 italic text-sm border-2 border-dashed border-gray-100 dark:border-gray-700 rounded-2xl">Save the record first to attach photos.</div>}

            {media && media.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    {media.map(m => <PhotoThumb key={m.id} mediaId={m.id} filename={m.filename} />)}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
