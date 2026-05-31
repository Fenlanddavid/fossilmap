import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Media, Specimen } from "../db";
import { v4 as uuid } from "uuid";
import { fileToBlob } from "../services/photos";
import { ScaledImage } from "../components/ScaledImage";
import { PhotoAnnotator } from "../components/PhotoAnnotator";
import { captureGPS } from "../services/gps";
import { ArrowDown, ArrowUp, Camera, CheckCircle2, ClipboardList, MapPin, Microscope, RefreshCw, Ruler, Trash2, Warehouse } from "lucide-react";

const LocationPickerModal = React.lazy(() =>
  import("../components/LocationPickerModal").then((mod) => ({ default: mod.LocationPickerModal }))
);

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
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("id");
  const isEditingExisting = !!editId;
  const localities = useLiveQuery(
    async () => db.localities.where("projectId").equals(props.projectId).reverse().sortBy("createdAt"),
    [props.projectId]
  );

  const [locationName, setLocationName] = useState("");
  const [specimenCode, setSpecimenCode] = useState(makeSpecimenCode());
  const [taxon, setTaxon] = useState("");
  const [confidence, setConfidence] = useState<Specimen["taxonConfidence"]>("med");
  const [period, setPeriod] = useState("");
  const [stage, setStage] = useState("");
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
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [annotatingMedia, setAnnotatingMedia] = useState<{ media: Media; url: string } | null>(null);

  useEffect(() => {
    if (editId) return;
    if (props.localityId) {
      db.localities.get(props.localityId).then(l => {
        if (l) setLocationName(l.name);
      });
    } else if (localities && localities.length > 0 && !locationName) {
      setLocationName(localities[0].name || "");
    }
  }, [props.localityId, localities, editId]);

  useEffect(() => {
    if (!editId) return;
    const targetId = editId;
    let active = true;
    setError(null);

    async function loadExistingSpecimen() {
      const specimen = await db.specimens.get(targetId);
      if (!active) return;
      if (!specimen) {
        setError("Find not found.");
        return;
      }

      const locality = await db.localities.get(specimen.localityId);
      if (!active) return;

      setSavedId(specimen.id);
      setLocationName(locality?.name || "");
      setSpecimenCode(specimen.specimenCode || makeSpecimenCode());
      setTaxon(specimen.taxon || "");
      setConfidence(specimen.taxonConfidence || "med");
      setPeriod(specimen.period || "");
      setStage(specimen.stage || "");
      setElement(specimen.element || "shell");
      setPreservation(specimen.preservation || "body fossil");
      setTaphonomy(specimen.taphonomy || "");
      setFindContext(specimen.findContext || "");
      setLat(specimen.lat ?? null);
      setLon(specimen.lon ?? null);
      setAcc(specimen.gpsAccuracyM ?? null);
      setWeightG(specimen.weightG != null ? String(specimen.weightG) : "");
      setLengthMm(specimen.lengthMm != null ? String(specimen.lengthMm) : "");
      setWidthMm(specimen.widthMm != null ? String(specimen.widthMm) : "");
      setThicknessMm(specimen.thicknessMm != null ? String(specimen.thicknessMm) : "");
      setBagBoxId(specimen.bagBoxId || "");
      setStorageLocation(specimen.storageLocation || "");
      setNotes(specimen.notes || "");
      setIsCustomElement(!!specimen.element && !commonElements.includes(specimen.element));
    }

    loadExistingSpecimen().catch((e) => {
      if (active) setError(e?.message ?? "Find load failed.");
    });

    return () => {
      active = false;
    };
  }, [editId]);

  const media = useLiveQuery(
    async () => (savedId ? db.media.where("specimenId").equals(savedId).sortBy("createdAt") : []),
    [savedId]
  );
  const formLocked = !!savedId && !isEditingExisting;

  const qualityItems = [
    { label: "Taxon", done: !!taxon.trim() },
    { label: "Location", done: !!locationName.trim() },
    { label: "GPS", done: lat != null && lon != null },
    { label: "Period", done: !!period.trim() },
    { label: "Element", done: !!element.trim() },
    { label: "Context", done: !!findContext.trim() || !!notes.trim() },
    { label: "Measurements", done: !!lengthMm || !!widthMm || !!thicknessMm || !!weightG },
    { label: "Photos", done: (media?.length ?? 0) > 0 },
  ];
  const qualityDone = qualityItems.filter(item => item.done).length;
  const qualityPercent = Math.round((qualityDone / qualityItems.length) * 100);

  function resetForm() {
    if (isEditingExisting) {
      navigate("/specimen");
      return;
    }
    setSavedId(null);
    setSpecimenCode(makeSpecimenCode());
    setTaxon("");
    setConfidence("med");
    setPeriod("");
    setStage("");
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
          rigs: false,
          permissionGranted: false,
          period: period.trim(),
          stage: stage.trim(),
          formation: "",
          member: "",
          bed: "",
          lithologyPrimary: "other",
          notes: props.localityId ? "Structured Location" : "Field Trip (Casual)",
          designationNotes: "",
          createdAt: now,
          updatedAt: now,
        });
      }

      const existingSpecimen = editId ? await db.specimens.get(editId) : null;
      const id = editId || uuid();
      const now = new Date().toISOString();

      const s: Specimen = {
        id,
        projectId: props.projectId,
        localityId: targetLocalityId,
        sessionId: props.sessionId || null,
        specimenCode: specimenCode.trim() || makeSpecimenCode(),
        taxon: taxon.trim(),
        taxonConfidence: confidence,
        period: period.trim(),
        stage: stage.trim(),
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
        hrid: existingSpecimen?.hrid,
        repository: existingSpecimen?.repository,
        accessionId: existingSpecimen?.accessionId,
        qualityScore: existingSpecimen?.qualityScore,
        isShared: existingSpecimen?.isShared,
        sharedAt: existingSpecimen?.sharedAt,
        createdAt: existingSpecimen?.createdAt || now,
        updatedAt: now,
      };

      if (editId) {
        await db.specimens.put(s);
      } else {
        await db.specimens.add(s);
      }
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

  async function removePhoto(mediaId: string) {
    if (!confirm("Remove this photo from the find?")) return;
    setError(null);
    try {
      await db.media.delete(mediaId);
    } catch (e: any) {
      setError(e?.message ?? "Photo remove failed");
    }
  }

  async function replacePhoto(mediaId: string, files: FileList | null) {
    setError(null);
    try {
      const file = files?.[0];
      if (!file) return;
      const blob = await fileToBlob(file);
      await db.media.update(mediaId, {
        blob,
        filename: file.name,
        mime: file.type || "application/octet-stream",
      });
    } catch (e: any) {
      setError(e?.message ?? "Photo replace failed");
    }
  }

  async function movePhoto(mediaId: string, direction: -1 | 1) {
    if (!media) return;
    const ordered = [...media].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const fromIndex = ordered.findIndex((item) => item.id === mediaId);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= ordered.length) return;

    const moved = [...ordered];
    [moved[fromIndex], moved[toIndex]] = [moved[toIndex], moved[fromIndex]];
    const baseTime = Date.now() - moved.length * 1000;

    await db.transaction("rw", db.media, async () => {
      await Promise.all(
        moved.map((item, index) =>
          db.media.update(item.id, { createdAt: new Date(baseTime + index * 1000).toISOString() })
        )
      );
    });
  }

  function PhotoThumb(props: {
    mediaId: string;
    filename: string;
    index: number;
    count: number;
    onAnnotate: (m: Media, url: string) => void;
    onRemove: (mediaId: string) => void;
    onReplace: (mediaId: string, files: FileList | null) => void;
    onMove: (mediaId: string, direction: -1 | 1) => void;
  }) {
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
     
     return (
        <div
            className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden aspect-square shadow-sm cursor-pointer"
            onClick={() => props.onAnnotate(media, URL.createObjectURL(media.blob))}
        >
           <ScaledImage 
              media={media} 
              imgClassName="object-cover" 
              className="w-full h-full" 
           />
           <div className="pointer-events-none absolute inset-0 bg-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="bg-white dark:bg-gray-800 text-[8px] font-black px-2 py-1 rounded-full shadow-sm uppercase tracking-widest">Annotate</span>
           </div>
           <div className="absolute top-1 left-1 right-1 z-20 flex items-center justify-between gap-1">
             <div className="flex gap-1">
               <button
                 type="button"
                 title="Move earlier"
                 aria-label="Move photo earlier"
                 disabled={props.index === 0}
                 onClick={(e) => {
                   e.stopPropagation();
                   props.onMove(props.mediaId, -1);
                 }}
                 className="grid h-6 w-6 place-items-center rounded bg-white/90 text-slate-700 shadow-sm disabled:opacity-35 dark:bg-slate-900/90 dark:text-slate-100"
               >
                 <ArrowUp className="h-3.5 w-3.5" />
               </button>
               <button
                 type="button"
                 title="Move later"
                 aria-label="Move photo later"
                 disabled={props.index === props.count - 1}
                 onClick={(e) => {
                   e.stopPropagation();
                   props.onMove(props.mediaId, 1);
                 }}
                 className="grid h-6 w-6 place-items-center rounded bg-white/90 text-slate-700 shadow-sm disabled:opacity-35 dark:bg-slate-900/90 dark:text-slate-100"
               >
                 <ArrowDown className="h-3.5 w-3.5" />
               </button>
             </div>
             <button
               type="button"
               title="Delete photo"
               aria-label="Delete photo"
               onClick={(e) => {
                 e.stopPropagation();
                 props.onRemove(props.mediaId);
               }}
               className="grid h-6 w-6 place-items-center rounded bg-red-600 text-white shadow-sm"
             >
               <Trash2 className="h-3.5 w-3.5" />
             </button>
           </div>
           <div className="bg-white/90 dark:bg-gray-900/90 p-1 text-[8px] truncate absolute bottom-0 inset-x-0 z-10 flex justify-between items-center font-mono">
             <span className="truncate flex-1">{props.filename}</span>
             <label className="mr-1 inline-grid h-5 w-5 cursor-pointer place-items-center rounded bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-200" title="Replace photo" aria-label="Replace photo" onClick={(e) => e.stopPropagation()}>
               <RefreshCw className="h-3 w-3" />
               <input type="file" accept="image/*" className="hidden" onChange={(e) => props.onReplace(props.mediaId, e.target.files)} />
             </label>
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
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Specimen recorder</p>
          <h2 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-gray-100 tracking-tight">
            {isEditingExisting ? "Edit Find" : props.localityId ? "Record Find" : "New Field Trip Find"}
          </h2>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
            <button 
                onClick={() => navigate("/finds")}
                className="flex-1 sm:flex-none bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-xl font-bold transition-all text-sm"
            >
                View All
            </button>
            {savedId && !isEditingExisting && (
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

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-black text-gray-900 dark:text-white">Record quality</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Save quickly in the field, then fill gaps before sharing or reporting.</p>
          </div>
          <div className="text-sm font-black text-emerald-700 dark:text-emerald-300">{qualityPercent}% complete</div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-900 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${qualityPercent}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {qualityItems.map(item => (
            <span key={item.label} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${item.done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100' : 'bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400'}`}>
              {item.done && <CheckCircle2 className="w-3 h-3" />}
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className={`lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm grid gap-6 h-fit transition-opacity ${formLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <SectionTitle icon={MapPin} title="1. Place" detail="Link the specimen to the right locality or trip." />
            <label className="block">
            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Location Name</div>
            <input 
                value={locationName} 
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. Charmouth, Lyme Regis"
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
            />
            </label>

            <SectionTitle icon={Microscope} title="2. Identify" detail="Record the identification and geological age as far as you know it." />

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label className="block">
                <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Geological Period</div>
                <input 
                    value={period} 
                    onChange={(e) => setPeriod(e.target.value)} 
                    placeholder="e.g. Jurassic" 
                    list="periods-list"
                    className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium font-bold text-blue-600 dark:text-blue-400"
                />
                <datalist id="periods-list">
                    {["Precambrian", "Cambrian", "Ordovician", "Silurian", "Devonian", "Carboniferous", "Permian", "Triassic", "Jurassic", "Cretaceous", "Paleogene", "Neogene", "Quaternary"].map(p => <option key={p} value={p} />)}
                </datalist>
                </label>

                <label className="block">
                <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Geological Stage</div>
                <input 
                    value={stage} 
                    onChange={(e) => setStage(e.target.value)} 
                    placeholder="e.g. Sinemurian" 
                    list="stages-list"
                    className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium font-bold text-blue-600 dark:text-blue-400"
                />
                <datalist id="stages-list">
                    {[
                        // Jurassic
                        "Hettangian", "Sinemurian", "Pliensbachian", "Toarcian", "Aalenian", "Bajocian", "Bathonian", "Callovian", "Oxfordian", "Kimmeridgian", "Tithonian",
                        // Cretaceous
                        "Berriasian", "Valanginian", "Hauterivian", "Barremian", "Aptian", "Albian", "Cenomanian", "Turonian", "Coniacian", "Santonian", "Campanian", "Maastrichtian",
                        // Paleogene/Neogene/Quaternary
                        "Danian", "Selandian", "Thanetian", "Ypresian", "Lutetian", "Bartonian", "Priabonian", "Rupelian", "Chattian", "Aquitanian", "Burdigalian", "Langhian", "Serravallian", "Tortonian", "Messinian", "Zanclean", "Piacenzian", "Gelasian", "Calabrian", "Chibanian", "Tarantian",
                        // Carboniferous
                        "Tournaisian", "Visean", "Serpukhovian", "Bashkirian", "Moscovian", "Kasimovian", "Gzhelian",
                        // Devonian
                        "Lochkovian", "Pragian", "Emsian", "Eifelian", "Givetian", "Frasnian", "Famennian",
                        // Silurian
                        "Rhuddanian", "Aeronian", "Telychian", "Sheinwoodian", "Homerian", "Gorstian", "Ludfordian",
                        // Ordovician
                        "Tremadocian", "Floian", "Dapingian", "Darriwilian", "Sandbian", "Katian", "Hirnantian"
                    ].sort().map(s => <option key={s} value={s} />)}
                </datalist>
                </label>
            </div>

            <SectionTitle icon={MapPin} title="3. Find spot" detail="Capture GPS now if possible. You can correct it on the map later." />

            <div className="bg-blue-50/50 dark:bg-blue-900/20 p-5 rounded-2xl border-2 border-blue-100/50 dark:border-blue-800/30 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
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
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button 
                            type="button" 
                            onClick={() => setIsPickingLocation(true)} 
                            className="flex-1 sm:flex-none bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1 hover:bg-blue-600 hover:text-white"
                        >
                            🗺️ Pick on Map
                        </button>
                        <button type="button" onClick={doGPS} className="flex-1 sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap text-sm">
                            📍 {lat ? "Update GPS" : "Get Find GPS"}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <label className="grid gap-1">
                        <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest text-blue-600 dark:text-blue-400">Latitude</span>
                        <input 
                            type="number" 
                            step="0.000001"
                            placeholder="54.500000"
                            className="w-full bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800 rounded-xl p-2.5 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                            value={lat ?? ""} 
                            onChange={(e) => setLat(e.target.value ? parseFloat(e.target.value) : null)} 
                        />
                    </label>
                    <label className="grid gap-1">
                        <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest text-blue-600 dark:text-blue-400">Longitude</span>
                        <input 
                            type="number" 
                            step="0.000001"
                            placeholder="-2.000000"
                            className="w-full bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800 rounded-xl p-2.5 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                            value={lon ?? ""} 
                            onChange={(e) => setLon(e.target.value ? parseFloat(e.target.value) : null)} 
                        />
                    </label>
                </div>
            </div>

            <SectionTitle icon={Ruler} title="4. Measure and describe" detail="Measurements, element, preservation, context and field observations." />

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label className="block">
                    <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Find Context</div>
                    <textarea
                        value={findContext}
                        onChange={(e) => setFindContext(e.target.value)}
                        rows={3}
                        placeholder="In situ, loose block, beach shingle, cliff fall, nodule split, spoil heap..."
                        className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    />
                </label>
                <label className="block">
                    <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Taphonomy / Preservation Notes</div>
                    <textarea
                        value={taphonomy}
                        onChange={(e) => setTaphonomy(e.target.value)}
                        rows={3}
                        placeholder="Abraded, compressed, pyritised, phosphatic, articulated, rolled, encrusted..."
                        className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    />
                </label>
            </div>

            <SectionTitle icon={Warehouse} title="5. Storage" detail="Make the physical fossil findable after the field day." />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label className="block">
                    <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Bag / Box ID</div>
                    <input
                        value={bagBoxId}
                        onChange={(e) => setBagBoxId(e.target.value)}
                        placeholder="e.g. Bag 3, Tray B, Box JUR-01"
                        className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    />
                </label>
                <label className="block">
                    <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Storage Location</div>
                    <input
                        value={storageLocation}
                        onChange={(e) => setStorageLocation(e.target.value)}
                        placeholder="e.g. Cabinet 2, shelf 4"
                        className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    />
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
                className={`mt-4 w-full px-8 py-5 rounded-2xl font-black text-2xl shadow-xl transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:transform-none ${savedId && !isEditingExisting ? "bg-green-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
            >
            {saving ? "Saving..." : isEditingExisting ? "Save Changes" : savedId ? "Find Recorded" : "Save Specimen Draft"}
            </button>
        </div>

        {/* Photo Panel */}
        <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-inner flex flex-col gap-6 h-fit sticky top-4">
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tight m-0 flex items-center gap-2"><Camera className="w-5 h-5" /> Photos</h2>
                    {savedId && <span className="text-[10px] font-mono font-bold bg-white dark:bg-gray-800 px-2 py-1 rounded shadow-sm">{media?.length || 0} / 4</span>}
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                    Take at least one context photo and one scale/detail photo before cleaning or trimming matrix.
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <label className={`aspect-square rounded-2xl font-black text-[10px] shadow-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center border-2 uppercase tracking-widest ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 hover:bg-amber-100"}`}>
                       <Camera className="w-6 h-6" />
                       <span>In situ</span>
                       <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "in-situ")} disabled={!savedId} className="hidden" />
                    </label>
                    
                    <label className={`aspect-square rounded-2xl font-black text-[10px] shadow-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center border-2 uppercase tracking-widest ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-400 hover:bg-blue-100"}`}>
                       <Ruler className="w-6 h-6" />
                       <span>With scale</span>
                       <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "in-situ")} disabled={!savedId} className="hidden" />
                    </label>

                    <label className={`aspect-square rounded-2xl font-black text-[10px] shadow-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center border-2 uppercase tracking-widest ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100"}`}>
                       <Microscope className="w-6 h-6" />
                       <span>Cleaned</span>
                       <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "laboratory")} disabled={!savedId} className="hidden" />
                    </label>
                    
                    <label className={`aspect-square rounded-2xl font-black text-[10px] shadow-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center border-2 uppercase tracking-widest ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800/50 text-purple-700 dark:text-purple-400 hover:bg-purple-100"}`}>
                       <ClipboardList className="w-6 h-6" />
                       <span>Detail</span>
                       <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "laboratory")} disabled={!savedId} className="hidden" />
                    </label>
                </div>
                
                <label className={`w-full px-4 py-3 rounded-xl font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2 border ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-white dark:bg-gray-800 hover:bg-gray-50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"}`}>
                    Upload Files
                    <input type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} disabled={!savedId} className="hidden" />
                </label>
            </div>

            {!savedId && <div className="text-center py-16 opacity-30 italic text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl">Record find first to unlock photos.</div>}

            {media && media.length > 0 && (
                <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1">
                    {media.map((m, index) => (
                      <PhotoThumb
                        key={m.id}
                        mediaId={m.id}
                        filename={m.filename}
                        index={index}
                        count={media.length}
                        onAnnotate={(media, url) => setAnnotatingMedia({ media, url })}
                        onRemove={removePhoto}
                        onReplace={replacePhoto}
                        onMove={movePhoto}
                      />
                    ))}
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

      {isPickingLocation && (
        <React.Suspense fallback={null}>
          <LocationPickerModal 
              initialLat={lat}
              initialLon={lon}
              onClose={() => setIsPickingLocation(false)}
              onSelect={(pickedLat, pickedLon) => {
                  setLat(pickedLat);
                  setLon(pickedLon);
                  setAcc(null); // Manual pick doesn't have GPS accuracy
                  setIsPickingLocation(false);
              }}
          />
        </React.Suspense>
      )}
    </div>
  );
}

function SectionTitle({
    icon: Icon,
    title,
    detail,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    detail: string;
}) {
    return (
        <div className="flex items-start gap-3 border-t border-gray-100 pt-5 first:border-t-0 first:pt-0 dark:border-gray-700">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <Icon className="h-4 w-4" />
            </div>
            <div>
                <h3 className="m-0 text-sm font-black text-gray-900 dark:text-white">{title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{detail}</p>
            </div>
        </div>
    );
}
