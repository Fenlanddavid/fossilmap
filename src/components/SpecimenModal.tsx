import React, { useEffect, useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Specimen, Media } from "../db";
import { Modal } from "./Modal";
import { v4 as uuid } from "uuid";
import { fileToBlob } from "../services/photos";
import { ScaleCalibrationModal } from "./ScaleCalibrationModal";
import { ScaledImage } from "./ScaledImage";

export function SpecimenModal(props: { specimenId: string; onClose: () => void }) {
  const specimen = useLiveQuery(async () => db.specimens.get(props.specimenId), [props.specimenId]);
  const media = useLiveQuery(async () => db.media.where("specimenId").equals(props.specimenId).toArray(), [props.specimenId]);
  const [draft, setDraft] = useState<Specimen | null>(null);
  const [busy, setBusy] = useState(false);
  
  const [calibratingMedia, setCalibratingMedia] = useState<{ media: Media; url: string } | null>(null);

  useEffect(() => {
    if (specimen) setDraft(specimen);
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

  async function save() {
    if (!draft) return;
    setBusy(true);
    const now = new Date().toISOString();
    await db.specimens.update(draft.id, { ...draft, updatedAt: now });
    setBusy(false);
    props.onClose();
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
      items.push({
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
      });
    }
    await db.media.bulkAdd(items);
    setBusy(false);
  }

  async function removePhoto(mediaId: string) {
    if (!confirm("Remove this photo?")) return;
    setBusy(true);
    await db.media.delete(mediaId);
    setBusy(false);
  }

  return (
    <>
      <Modal onClose={props.onClose} title={`Find: ${draft.specimenCode}`}>
        <div className="grid gap-4 max-h-[80vh] overflow-y-auto pr-1">
          <label className="grid gap-1">
            <span className="text-sm font-bold opacity-75">Taxon / ID</span>
            <input className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={draft.taxon} onChange={(e) => setDraft({ ...draft, taxon: e.target.value })} />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-bold opacity-75">Confidence</span>
            <select 
              className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={draft.taxonConfidence} 
              onChange={(e) => setDraft({ ...draft, taxonConfidence: e.target.value as any })}
            >
              <option value="high">high</option>
              <option value="med">med</option>
              <option value="low">low</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-bold opacity-75">Notes</span>
            <textarea 
              className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={draft.notes} 
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={4} 
            />
          </label>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <div className="flex flex-col gap-3 mb-3">
              <div className="grid gap-0.5">
                <h4 className="m-0 font-bold text-sm">Photos</h4>
                {imageUrls.length > 0 && (
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold animate-pulse">
                    Tip: Tap photo to set scale
                  </p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                  <label className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer hover:bg-amber-100 transition-colors shadow-sm text-center flex items-center justify-center gap-1">
                  📸 Photo 1
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "in-situ")} className="hidden" />
                  </label>
                  <label className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer hover:bg-indigo-100 transition-colors shadow-sm text-center flex items-center justify-center gap-1">
                  📸 Photo 2
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, "laboratory")} className="hidden" />
                  </label>
              </div>
              
              <label className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-gray-200 transition-colors shadow-sm text-center">
                📁 Upload Files
                <input type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} className="hidden" />
              </label>
            </div>

            {imageUrls.length === 0 && <div className="text-sm opacity-60 italic text-center py-4 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-dashed border-gray-100 dark:border-gray-800">No photos attached.</div>}

            {imageUrls.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {imageUrls.map((x) => (
                  <div key={x.id} className="relative group border-2 border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden aspect-square shadow-sm cursor-pointer" onClick={() => setCalibratingMedia({ media: x.media, url: x.url })}>
                    <ScaledImage 
                      media={x.media} 
                      imgClassName="object-cover" 
                      className="w-full h-full" 
                    />

                    <button 
                      onClick={(e) => { e.stopPropagation(); removePhoto(x.id); }} 
                      disabled={busy}
                      className="absolute top-1 right-1 bg-red-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:scale-110 active:scale-95 z-10"
                    >✕</button>
                    <div className="bg-white/90 dark:bg-gray-900/90 p-1 text-[9px] truncate absolute bottom-0 inset-x-0 font-mono text-center z-10 flex justify-between items-center px-1">
                       <span className="truncate flex-1">{x.filename}</span>
                       {x.media.photoType && (
                         <span className={`px-1 rounded uppercase text-[7px] font-black ${x.media.photoType === 'in-situ' ? 'bg-amber-100 text-amber-800' : x.media.photoType === 'laboratory' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}>
                           {x.media.photoType === 'in-situ' ? 'Photo 1' : x.media.photoType === 'laboratory' ? 'Photo 2' : 'Photo'}
                         </span>
                       )}
                    </div>
                    
                    <div className={`absolute inset-0 bg-blue-600/20 transition-opacity flex items-center justify-center z-10 ${x.media.pxPerMm ? 'opacity-0 group-hover:opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}>
                        <span className={`bg-white dark:bg-gray-800 text-[10px] font-bold px-2 py-1 rounded-full shadow-sm ${!x.media.pxPerMm ? 'ring-2 ring-blue-500 animate-bounce' : ''}`}>
                          {x.media.pxPerMm ? 'Rescale' : 'Set Scale'}
                        </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-4 mt-2 pt-3 border-t border-gray-100 dark:border-gray-700 justify-between items-center">
            <button onClick={del} disabled={busy} className="text-red-600 hover:text-red-800 text-sm font-bold px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              Delete Find
            </button>

            <div className="flex gap-3">
              <button onClick={props.onClose} disabled={busy} className="px-4 py-2 rounded-xl text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-bold text-sm">Cancel</button>
              <button onClick={save} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl shadow-md font-bold transition-all disabled:opacity-50 text-sm">Save Changes</button>
            </div>
          </div>
        </div>
      </Modal>

      {calibratingMedia && (
        <ScaleCalibrationModal 
          media={calibratingMedia.media} 
          url={calibratingMedia.url} 
          onClose={() => setCalibratingMedia(null)} 
        />
      )}
    </>
  );
}