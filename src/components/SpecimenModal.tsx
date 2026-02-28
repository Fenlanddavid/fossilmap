import React, { useEffect, useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Specimen, Media } from "../db";
import { Modal } from "./Modal";
import { v4 as uuid } from "uuid";
import { Globe, Check, Loader2 } from "lucide-react";
import { fileToBlob } from "../services/photos";
import { ScaleCalibrationModal } from "./ScaleCalibrationModal";
import { ScaledImage } from "./ScaledImage";
import { PhotoAnnotator } from "./PhotoAnnotator";
import { captureGPS } from "../services/gps";
import { uploadSharedFind, deleteSharedFind } from "../services/supabase";
import { LocationPickerModal } from "./LocationPickerModal";

export function SpecimenModal(props: { specimenId: string; onClose: () => void }) {
  const specimen = useLiveQuery(async () => db.specimens.get(props.specimenId), [props.specimenId]);
  const media = useLiveQuery(async () => db.media.where("specimenId").equals(props.specimenId).toArray(), [props.specimenId]);
  const [draft, setDraft] = useState<Specimen | null>(null);
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [isCustomElement, setIsCustomElement] = useState(false);
  const [sharing, setSharing] = useState(false);
  
  const defaultCollector = useLiveQuery(async () => {
    const s = await db.settings.get("defaultCollector");
    return s?.value || "Anonymous Collector";
  });

  const [calibratingMedia, setCalibratingMedia] = useState<{ media: Media; url: string } | null>(null);
  const [annotatingMedia, setAnnotatingMedia] = useState<{ media: Media; url: string } | null>(null);

  const commonTaxa = [
    "Ammonite", "Belemnite", "Gryphaea", "Brachiopod", "Echinoid", "Gastropod", "Bivalve",
    "Ichthyosaur", "Plesiosaur", "Pliosaur", "Dinosaur", "Croc", "Fish", "Shark", 
    "Trilobite", "Plant / Wood", "Trace Fossil", "Coprolite"
  ];

  const commonElements = [
    "Tooth", "Vertebra", "Rib", "Limb Bone", "Skull Element", "Jaw", "Paddle / Fin",
    "Shell (Complete)", "Shell Fragment", "Nodule", "Matrix Block", "Osteoderm"
  ];

  useEffect(() => {
    if (specimen) {
        setDraft(specimen);
        if (specimen.element && !commonElements.includes(specimen.element)) {
            setIsCustomElement(true);
        } else {
            setIsCustomElement(false);
        }
    }
  }, [specimen?.id]);

  const imageUrls = useMemo(() => {
    const urls: { id: string; url: string; filename: string; media: Media }[] = [];
    for (const m of media ?? []) {
      const url = URL.createObjectURL(m.blob);
      urls.push({ id: m.id, url, filename: m.filename, media: m });
    }
    return urls;
  }, [media]);

  useEffect(() => {
    return () => {
      for (const x of imageUrls) URL.revokeObjectURL(x.url);
    };
  }, [imageUrls]);

  if (!draft) return <Modal onClose={props.onClose} title="Loading…"><div>Loading data...</div></Modal>;

  async function shareToCommunity() {
    if (!draft || !draft.lat || !draft.lon) {
      alert("GPS coordinates are required to share with the community.");
      return;
    }

    if (!confirm("Share this find with FossilMapped? It will be visible to everyone on the global map.")) return;

    setSharing(true);
    try {
      // Prepare the payload
      const photos: string[] = [];
      for (const m of media || []) {
        // Convert blob to base64 for the payload
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(m.blob);
        });
        photos.push(await base64Promise);
      }

      // Find location name and period
      const locality = await db.localities.get(draft.localityId);
      const collectorEmail = await db.settings.get("defaultEmail").then(s => s?.value || "");

      const payload = {
        id: draft.id,
        collectorName: defaultCollector,
        collectorEmail: collectorEmail,
        taxon: draft.taxon,
        element: draft.element,
        period: draft.period || locality?.period || "Unknown",
        locationName: locality?.name || "Unknown Location",
        latitude: draft.lat,
        longitude: draft.lon,
        dateCollected: draft.createdAt,
        photos: photos,
        measurements: {
          length: draft.lengthMm,
          width: draft.widthMm,
          thickness: draft.thicknessMm,
          weight: draft.weightG
        },
        notes: draft.notes,
        sharedAt: new Date().toISOString()
      };

      // Use Supabase Service
      await uploadSharedFind(payload);

      await db.specimens.update(draft.id, { isShared: true, sharedAt: payload.sharedAt });
      alert("Successfully shared with the FossilMapped community! 🌍");
    } catch (e: any) {
      console.error(e);
      let errorMsg = "Sharing failed. ";
      if (e?.message) errorMsg += e.message;
      if (e?.status === 413) errorMsg += " Photos might be too large.";
      alert(errorMsg);
    } finally {
      setSharing(false);
    }
  }

  async function unshareFromCommunity() {
    if (!draft || !draft.isShared) return;
    if (!confirm("Remove this find from the public FossilMapped database?")) return;

    setSharing(true);
    try {
      await deleteSharedFind(draft.id);
      await db.specimens.update(draft.id, { isShared: false, sharedAt: undefined });
      alert("Successfully removed from the community database. 🗑️");
    } catch (e: any) {
      console.error(e);
      alert("Removal failed: " + (e?.message || "Check your internet connection"));
    } finally {
      setSharing(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    const now = new Date().toISOString();
    await db.specimens.update(draft.id, { ...draft, updatedAt: now });
    setBusy(false);
    setIsEditing(false);
  }

  async function del() {
    if (!draft) return;
    if (!confirm("Delete this find?")) return;
    setBusy(true);
    await db.media.where("specimenId").equals(draft.id).delete();
    await db.specimens.delete(draft.id);
    setBusy(false);
    props.onClose();
  }

  async function addPhotos(files: FileList | null, photoType?: Media["photoType"]) {
    if (!draft || !files || files.length === 0) return;
    setBusy(true);
    const now = new Date().toISOString();

    const items: Media[] = [];
    for (const f of Array.from(files)) {
      const blob = await fileToBlob(f);
      const item: Media = {
        id: uuid(),
        projectId: draft.projectId,
        specimenId: draft.id,
        type: "photo" as const,
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

    if (items.length === 1) {
        const m = items[0];
        const url = URL.createObjectURL(m.blob);
        setAnnotatingMedia({ media: m, url });
    }

    setBusy(false);
  }

  async function removePhoto(mediaId: string) {
    if (!confirm("Remove this photo?")) return;
    setBusy(true);
    await db.media.delete(mediaId);
    setBusy(false);
  }

  async function doGPS() {
    setBusy(true);
    try {
      const fix = await captureGPS();
      setDraft(prev => prev ? { ...prev, lat: fix.lat, lon: fix.lon, gpsAccuracyM: fix.accuracyM } : null);
    } catch (e: any) {
      alert(e?.message ?? "GPS failed");
    } finally {
      setBusy(false);
    }
  }

  const headerActions = (
    <div className="flex gap-2 items-center">
        {!isEditing && (
            <div className="flex gap-1 items-center">
                <button 
                    onClick={shareToCommunity}
                    disabled={sharing || draft.isShared}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black transition-all shadow-sm ${draft.isShared ? 'bg-green-100 text-green-700 cursor-default' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                >
                    {sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : draft.isShared ? <Check className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                    {sharing ? "Sharing..." : draft.isShared ? "Shared" : "Share"}
                </button>
                {draft.isShared && !sharing && (
                    <button 
                        onClick={unshareFromCommunity}
                        title="Remove from Community"
                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                )}
            </div>
        )}
        <button 
            onClick={() => setIsEditing(!isEditing)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm ${isEditing ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
        >
            {isEditing ? "Viewing..." : "Edit Details"}
        </button>
    </div>
  );

  return (
    <>
      <Modal onClose={props.onClose} title={`Find: ${draft.specimenCode}`} headerActions={headerActions}>
        <div className="grid gap-6 max-h-[80vh] overflow-y-auto pr-1">
          {isEditing ? (
            <div className="grid gap-4">
              <label className="grid gap-1">
                <span className="text-sm font-bold opacity-75">Taxon / ID</span>
                <input 
                    className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                    value={draft.taxon} 
                    onChange={(e) => setDraft(prev => prev ? { ...prev, taxon: e.target.value } : null)} 
                    list="modal-taxa-list"
                />
                <datalist id="modal-taxa-list">
                    {commonTaxa.map(t => <option key={t} value={t} />)}
                </datalist>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-1">
                  <span className="text-sm font-bold opacity-75">Confidence</span>
                  <select 
                    className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    value={draft.taxonConfidence} 
                    onChange={(e) => setDraft(prev => prev ? { ...prev, taxonConfidence: e.target.value as any } : null)}
                  >
                    <option value="high">High</option>
                    <option value="med">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                
                <label className="grid gap-1">
                  <span className="text-sm font-bold opacity-75">Element</span>
                  <div className="grid gap-2">
                    <select 
                        value={isCustomElement ? "CUSTOM" : draft.element} 
                        onChange={(e) => {
                            if (e.target.value === "CUSTOM") {
                                setIsCustomElement(true);
                                setDraft(prev => prev ? { ...prev, element: "" } : null);
                            } else {
                                setIsCustomElement(false);
                                setDraft(prev => prev ? { ...prev, element: e.target.value } : null);
                            }
                        }}
                        className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    >
                        <option value="">-- Select Element --</option>
                        {commonElements.map(e => <option key={e} value={e}>{e}</option>)}
                        <option value="CUSTOM">✎ Custom...</option>
                    </select>
                    {isCustomElement && (
                        <input 
                            className="w-full bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold animate-in slide-in-from-top-1"
                            value={draft.element} 
                            onChange={(e) => setDraft(prev => prev ? { ...prev, element: e.target.value } : null)}
                            placeholder="Type element..."
                            autoFocus
                        />
                    )}
                  </div>
                </label>
              </div>

              <div className="bg-blue-50/50 dark:bg-blue-900/20 p-5 rounded-2xl border-2 border-blue-100/50 dark:border-blue-800/30 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                      <div className="flex flex-col gap-1 w-full text-xs">
                          <div className="font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">GPS Find spot</div>
                          <div className="font-mono mt-0.5 font-bold text-gray-800 dark:text-gray-100">
                              {draft.lat && draft.lon ? `${draft.lat.toFixed(6)}, ${draft.lon?.toFixed(6)}` : "Not set"}
                          </div>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                          <button 
                              type="button" 
                              onClick={() => setIsPickingLocation(true)} 
                              className="flex-1 sm:flex-none bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1 hover:bg-blue-600 hover:text-white"
                          >
                              🗺️ Pick on Map
                          </button>
                          <button type="button" onClick={doGPS} className="flex-1 sm:w-auto bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">Update GPS</button>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <label className="grid gap-1">
                          <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest text-blue-600 dark:text-blue-400">Latitude</span>
                          <input 
                              type="number" 
                              step="0.000001"
                              className="w-full bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800 rounded-xl p-2.5 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                              value={draft.lat ?? ""} 
                              onChange={(e) => setDraft(prev => prev ? { ...prev, lat: e.target.value ? parseFloat(e.target.value) : null } : null)} 
                          />
                      </label>
                      <label className="grid gap-1">
                          <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest text-blue-600 dark:text-blue-400">Longitude</span>
                          <input 
                              type="number" 
                              step="0.000001"
                              className="w-full bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800 rounded-xl p-2.5 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                              value={draft.lon ?? ""} 
                              onChange={(e) => setDraft(prev => prev ? { ...prev, lon: e.target.value ? parseFloat(e.target.value) : null } : null)} 
                          />
                      </label>
                  </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase opacity-60">Weight (g)</span>
                    <input type="number" step="0.01" value={draft.weightG || ""} onChange={(e) => setDraft(prev => prev ? {...prev, weightG: parseFloat(e.target.value) || null} : null)} className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs" />
                </label>
                <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase opacity-60">Length (mm)</span>
                    <input type="number" step="0.1" value={draft.lengthMm || ""} onChange={(e) => setDraft(prev => prev ? {...prev, lengthMm: parseFloat(e.target.value) || null} : null)} className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs" />
                </label>
                <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase opacity-60">Width (mm)</span>
                    <input type="number" step="0.1" value={draft.widthMm || ""} onChange={(e) => setDraft(prev => prev ? {...prev, widthMm: parseFloat(e.target.value) || null} : null)} className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs" />
                </label>
                <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase opacity-60">Thick (mm)</span>
                    <input type="number" step="0.1" value={draft.thicknessMm || ""} onChange={(e) => setDraft(prev => prev ? {...prev, thicknessMm: parseFloat(e.target.value) || null} : null)} className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs" />
                </label>
              </div>

              <label className="grid gap-1">
                <span className="text-sm font-bold opacity-75">Notes</span>
                <textarea 
                  className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                  value={draft.notes} 
                  onChange={(e) => setDraft(prev => prev ? { ...prev, notes: e.target.value } : null)} rows={4} 
                />
              </label>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                <div className="flex flex-col gap-3 mb-3">
                  <h4 className="m-0 font-bold text-sm uppercase tracking-tight">Add Photos (4 Max)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <label className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-2 py-3 rounded-xl text-[10px] font-black cursor-pointer hover:bg-amber-100 transition-colors shadow-sm text-center flex flex-col items-center justify-center gap-1 uppercase">
                      📸 Photo 1
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "in-situ")} className="hidden" />
                      </label>
                      <label className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-2 py-3 rounded-xl text-[10px] font-black cursor-pointer hover:bg-blue-100 transition-colors shadow-sm text-center flex flex-col items-center justify-center gap-1 uppercase">
                      📸 Photo 2
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "in-situ")} className="hidden" />
                      </label>
                      <label className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 px-2 py-3 rounded-xl text-[10px] font-black cursor-pointer hover:bg-indigo-100 transition-colors shadow-sm text-center flex flex-col items-center justify-center gap-1 uppercase">
                      📸 Photo 3
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "laboratory")} className="hidden" />
                      </label>
                      <label className="bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400 px-2 py-3 rounded-xl text-[10px] font-black cursor-pointer hover:bg-purple-100 transition-colors shadow-sm text-center flex flex-col items-center justify-center gap-1 uppercase">
                      📸 Photo 4
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "laboratory")} className="hidden" />
                      </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
                    {imageUrls.map((x) => (
                    <div key={x.id} className="relative group border-2 border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden aspect-square shadow-sm cursor-pointer" onClick={() => setCalibratingMedia({ media: x.media, url: x.url })}>
                        <ScaledImage media={x.media} imgClassName="object-cover" className="w-full h-full" />
                        <button onClick={(e) => { e.stopPropagation(); removePhoto(x.id); }} className="absolute top-1 right-1 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-lg z-10">✕</button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setAnnotatingMedia({ media: x.media, url: x.url }); }} 
                            className="absolute bottom-1 left-1 bg-blue-600 text-white px-2 py-1 rounded text-[8px] font-black uppercase shadow-lg z-10 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        >
                            ✎ Annotate
                        </button>
                    </div>
                    ))}
                </div>
              </div>

              <div className="flex gap-4 mt-2 pt-3 border-t border-gray-100 dark:border-gray-700 justify-between items-center">
                <button onClick={del} disabled={busy} className="text-red-600 hover:text-red-800 text-sm font-bold px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  Delete Find
                </button>
                <div className="flex gap-3">
                  <button onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-xl text-gray-500 font-bold text-sm">Cancel</button>
                  <button onClick={save} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl shadow-md font-bold text-sm">Save Changes</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">Find Details</div>
                  <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight mb-2">{draft.taxon || "(Unknown)"}</div>
                  <div className="flex flex-wrap gap-2 mb-4">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${draft.taxonConfidence === 'high' ? 'bg-green-50 text-green-700 border-green-100' : draft.taxonConfidence === 'med' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{draft.taxonConfidence} confidence</span>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">{draft.element}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white dark:bg-gray-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                          <div className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Weight</div>
                          <div className="text-xs font-bold text-gray-700 dark:text-gray-200">{draft.weightG ? `${draft.weightG}g` : "—"}</div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                          <div className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Length</div>
                          <div className="text-xs font-bold text-gray-700 dark:text-gray-200">{draft.lengthMm ? `${draft.lengthMm}mm` : "—"}</div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                          <div className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Width</div>
                          <div className="text-xs font-bold text-gray-700 dark:text-gray-200">{draft.widthMm ? `${draft.widthMm}mm` : "—"}</div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                          <div className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Thick</div>
                          <div className="text-xs font-bold text-gray-700 dark:text-gray-200">{draft.thicknessMm ? `${draft.thicknessMm}mm` : "—"}</div>
                      </div>
                  </div>

                  {draft.lat && (
                    <div className="mt-4 flex items-center justify-between bg-blue-50/50 dark:bg-blue-900/10 px-4 py-2 rounded-xl border border-blue-100 dark:border-blue-900/30">
                        <div className="text-[10px] font-mono font-bold text-blue-600">📍 {draft.lat.toFixed(6)}, {draft.lon?.toFixed(6)}</div>
                        <button onClick={() => window.open(`https://www.google.com/maps?q=${draft.lat},${draft.lon}`, "_blank")} className="text-[9px] font-black text-blue-500 hover:underline uppercase">View Map ↗</button>
                    </div>
                  )}
              </div>

              {draft.notes && (
                  <div className="px-2">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Field Notes</div>
                    <div className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap italic bg-gray-50 dark:bg-gray-900/30 p-4 rounded-xl border border-gray-100 dark:border-gray-800">{draft.notes}</div>
                  </div>
              )}

              <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
                  <div className="flex justify-between items-center mb-4 px-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Documentation</h4>
                    <span className="text-[9px] font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-500 font-bold">
                        {imageUrls.length} PHOTO{imageUrls.length !== 1 ? 'S' : ''}
                    </span>
                  </div>
                  
                  {imageUrls.length === 0 ? (
                      <div className="text-center py-12 opacity-30 italic text-sm border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl">No photos recorded.</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {imageUrls.map(x => (
                            <div key={x.id} className="relative group border-2 border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden aspect-square shadow-md cursor-pointer" onClick={() => setCalibratingMedia({ media: x.media, url: x.url })}>
                                <ScaledImage media={x.media} imgClassName="object-cover" className="w-full h-full" />
                                <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <span className="bg-white dark:bg-gray-800 text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg hidden sm:inline-block">View Scale</span>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setAnnotatingMedia({ media: x.media, url: x.url }); }}
                                        className="bg-blue-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg"
                                    >
                                        Annotate
                                    </button>
                                </div>
                                {x.media.photoType && (
                                    <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-md text-[7px] text-white font-black px-1.5 py-0.5 rounded uppercase tracking-widest">
                                        {x.media.photoType === 'in-situ' ? 'Field' : x.media.photoType === 'laboratory' ? 'Laboratory' : 'Photo'}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                  )}
              </div>
              
              <div className="flex justify-end pt-4">
                  <button onClick={props.onClose} className="bg-gray-900 dark:bg-gray-100 text-white dark:text-black px-8 py-3 rounded-2xl font-black shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all text-sm">Done</button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {calibratingMedia && (
        <ScaleCalibrationModal 
          media={calibratingMedia.media} 
          url={calibratingMedia.url} 
          onClose={() => setCalibratingMedia(null)} 
        />
      )}

      {annotatingMedia && (
        <PhotoAnnotator 
          media={annotatingMedia.media} 
          url={annotatingMedia.url} 
          onClose={() => setAnnotatingMedia(null)} 
        />
      )}

      {isPickingLocation && draft && (
          <LocationPickerModal 
              initialLat={draft.lat}
              initialLon={draft.lon}
              onClose={() => setIsPickingLocation(false)}
              onSelect={(pickedLat, pickedLon) => {
                  setDraft(prev => prev ? { ...prev, lat: pickedLat, lon: pickedLon, gpsAccuracyM: null } : null);
                  setIsPickingLocation(false);
              }}
          />
      )}
    </>
  );
}
