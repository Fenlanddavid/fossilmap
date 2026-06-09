import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Specimen, Media } from "../db";
import { Modal } from "./Modal";
import { v4 as uuid } from "uuid";
import { Check, Database, ExternalLink, Globe, Loader2, Lock, Printer, ShieldCheck, Trash2 } from "lucide-react";
import { fileToBlob, compressForShare } from "../services/photos";
import { ScaleCalibrationModal } from "./ScaleCalibrationModal";
import { ScaledImage } from "./ScaledImage";
import { PhotoAnnotator } from "./PhotoAnnotator";
import { captureGPS } from "../services/gps";
import { formatCoords, getFiniteCoords } from "../services/coords";
import { uploadSharedFind, deleteSharedFind, updateSharedFindPrecision } from "../services/supabase";
import { calculateQualityScore, generateHRID, getQualityColor, getQualityLabel } from "../services/research";
import { getCommunityUrl } from "../services/community";
import { useConfirmDialog } from "./ConfirmModal";
import { SpecimenLabelSheet } from "./SpecimenLabelSheet";

const LocationPickerModal = React.lazy(() =>
  import("./LocationPickerModal").then((mod) => ({ default: mod.LocationPickerModal }))
);

type PrecisionLevel = "exact" | "100m" | "1km" | "locality";

function applyPrecision(
  lat: number,
  lon: number,
  level: PrecisionLevel
): { lat: number; lon: number } {
  if (level === "exact") return { lat, lon };
  if (level === "100m") {
    return {
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
    };
  }
  if (level === "1km" || level === "locality") {
    return {
      lat: Math.round(lat * 100) / 100,
      lon: Math.round(lon * 100) / 100,
    };
  }
  return { lat, lon };
}

function isPrecisionLevel(value: unknown): value is PrecisionLevel {
  return value === "exact" || value === "100m" || value === "1km" || value === "locality";
}

function precisionLabel(level: PrecisionLevel): string {
  if (level === "exact") return "exact GPS";
  if (level === "locality") return "locality area";
  return `~${level} area`;
}

export function SpecimenModal(props: { specimenId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { confirm: confirmAction, notify, dialog } = useConfirmDialog();
  const specimen = useLiveQuery(async () => db.specimens.get(props.specimenId), [props.specimenId]);
  const media = useLiveQuery(async () => db.media.where("specimenId").equals(props.specimenId).toArray(), [props.specimenId]);
  const [draft, setDraft] = useState<Specimen | null>(null);
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [wasPending, setWasPending] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [isCustomElement, setIsCustomElement] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharePrec, setSharePrec] = useState<PrecisionLevel>("1km");
  const [includeShareEmail, setIncludeShareEmail] = useState(true);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [showLabelSheet, setShowLabelSheet] = useState(false);
  
  const qualityScore = useMemo(() => {
    if (!draft) return 0;
    return calculateQualityScore(draft, media || []);
  }, [draft, media]);
  
  const defaultCollector = useLiveQuery(async () => {
    const s = await db.settings.get("defaultCollector");
    return s?.value || "Anonymous Collector";
  });
  const defaultEmail = useLiveQuery(async () => {
    const s = await db.settings.get("defaultEmail");
    return (s?.value || "").trim();
  });
  const locality = useLiveQuery(
    async () => draft?.localityId ? db.localities.get(draft.localityId) : null,
    [draft?.localityId]
  );

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
        if (specimen.isPending) { setIsEditing(true); setWasPending(true); }
        if (specimen.element && !commonElements.includes(specimen.element)) {
            setIsCustomElement(true);
        } else {
            setIsCustomElement(false);
        }
        if (isPrecisionLevel(specimen.locationPrecision)) {
            setSharePrec(specimen.locationPrecision);
        } else if (!specimen.isShared) {
            setSharePrec("1km");
        }
    }
  }, [specimen]);

  useEffect(() => {
    if (!saveNotice) return;
    const timer = window.setTimeout(() => setSaveNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

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

  const labelMedia = useMemo(() => {
    const sorted = [...(media ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return sorted[0] ?? null;
  }, [media]);

  if (!draft) return (
    <>
      <Modal onClose={props.onClose} title="Loading..."><div>Loading data...</div></Modal>
      {dialog}
    </>
  );

  async function shareToCommunity() {
    const coords = getFiniteCoords(draft?.lat, draft?.lon);
    if (!draft || !coords) {
      await notify({
        title: "GPS required",
        message: "Add GPS coordinates before sharing this find with the FossilMapped community map.",
        tone: "warning",
      });
      return;
    }
    if (!draft.taxon?.trim()) {
      await notify({
        title: "Taxon required",
        message: "A taxon name is required before sharing — it is used as the primary identifier on FossilMapped.",
        tone: "warning",
      });
      return;
    }
    const chosenPrecision = sharePrec;
    const publicCoords = applyPrecision(coords.lat, coords.lon, chosenPrecision);

    if (qualityScore < 50) {
      const missing: string[] = [];
      if (!draft.formation) missing.push("formation");
      if (!draft.stage) missing.push("stage");
      if (!draft.lengthMm && !draft.widthMm && !draft.weightG) missing.push("measurements");
      if (!media || media.length === 0) missing.push("at least one photo");
      const nudge = missing.length
        ? `This record scores ${qualityScore}%. Adding ${missing.join(", ")} will improve its research value before sharing.`
        : `This record scores ${qualityScore}%. Consider completing the record before sharing.`;
      const proceed = await confirmAction({
        title: "Record is incomplete",
        message: nudge,
        confirmLabel: "Share anyway",
        cancelLabel: "Go back and improve",
        tone: "warning",
      });
      if (!proceed) return;
    }

    // Fetch locality early so we can disclose inherited fields in the confirm dialog.
    const locality = await db.localities.get(draft.localityId);
    const inherited: string[] = [];
    if (!draft.formation && locality?.formation) inherited.push(`formation (${locality.formation})`);
    if (!draft.stage && locality?.stage) inherited.push(`stage (${locality.stage})`);
    if (!draft.period && locality?.period) inherited.push(`period (${locality.period})`);

    const photoCount = (media || []).length;
    const photosShared = Math.min(photoCount, 2);
    const photoNote = photoCount > 2 ? ` Up to 2 of your ${photoCount} photos will be shared.` : "";
    const inheritedNote = inherited.length > 0 ? ` Stratigraphy inherited from locality: ${inherited.join(", ")}.` : "";

    const emailNote = includeShareEmail
      ? " Your contact email, if set in settings, will also be shared."
      : " Your contact email will be omitted from the public record."

    const ok = await confirmAction({
      title: "Share with FossilMapped?",
      message: `This find will be visible on the public community map. Public location: ${precisionLabel(chosenPrecision)}.${photoNote}${inheritedNote} Your collector name will be shared.${emailNote}`,
      confirmLabel: "Share find",
      tone: "warning",
    });
    if (!ok) return;

    setSharing(true);
    try {
      let hrid = draft.hrid || generateHRID();
      const repository = draft.repository || "Private";

      // Cap at 2 photos for Supabase payload size limits.
      const photos: string[] = [];
      for (const m of (media || []).slice(0, photosShared)) {
        const compressed = await compressForShare(m.blob);
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(compressed);
        });
        photos.push(await base64Promise);
      }

      const collectorEmail = await db.settings.get("defaultEmail").then(s => s?.value || "");

      const cleanStage = (draft.stage || locality?.stage || "").replace(/^Unknown$/i, "").trim();

      const buildPayload = () => ({
        id: draft.id,
        hrid: hrid,
        collectorName: defaultCollector,
        collectorEmail: includeShareEmail ? collectorEmail : "",
        taxon: draft.taxon,
        element: draft.element,
        period: (draft.period || locality?.period || "Unknown").trim(),
        stage: cleanStage,
        formation: draft.formation || locality?.formation || "",
        member: draft.member || locality?.member || "",
        bed: draft.bed || locality?.bed || "",
        verification_status: 'community' as const,
        locationName: locality?.name || "Unknown Location",
        latitude: coords.lat,
        longitude: coords.lon,
        publicLatitude: publicCoords.lat,
        publicLongitude: publicCoords.lon,
        locationPrecision: chosenPrecision,
        precisionLocked: chosenPrecision !== "exact",
        dateCollected: draft.dateCollected ?? draft.createdAt,
        photos: photos,
        measurements: {
          length: draft.lengthMm,
          width: draft.widthMm,
          thickness: draft.thicknessMm,
          weight: draft.weightG
        },
        repository: repository,
        accession_id: draft.accessionId || null,
        quality_score: qualityScore,
        notes: draft.notes,
        sharedAt: new Date().toISOString()
      });

      let payload = buildPayload();
      for (let attempt = 0; attempt < 5; attempt++) {
        payload = buildPayload();
        try {
          await uploadSharedFind(payload);
          break;
        } catch (error) {
          if (draft.hrid || attempt === 4 || !isUniqueConflict(error)) throw error;
          hrid = generateHRID();
        }
      }

      await db.specimens.update(draft.id, {
        isShared: true,
        sharedAt: payload.sharedAt,
        hrid: hrid,
        qualityScore: qualityScore,
        publicLat: payload.publicLatitude,
        publicLon: payload.publicLongitude,
        locationPrecision: payload.locationPrecision,
        precisionLocked: payload.precisionLocked
      });
      setDraft(prev => prev ? {
        ...prev,
        isShared: true,
        sharedAt: payload.sharedAt,
        hrid,
        qualityScore,
        publicLat: payload.publicLatitude,
        publicLon: payload.publicLongitude,
        locationPrecision: payload.locationPrecision,
        precisionLocked: payload.precisionLocked
      } : prev);
      await notify({
        title: "Find shared",
        message: (
          <span>
            Shared as <strong>{hrid}</strong>.{' '}
            <a
              href={getCommunityUrl(hrid)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              View on FossilMapped →
            </a>
          </span>
        ),
        tone: "success",
      });
    } catch (e: any) {
      console.error(e);
      let errorMsg = "Sharing failed. ";
      if (e?.message) errorMsg += e.message;
      if (e?.status === 413) errorMsg += " Photos might be too large.";
      await notify({
        title: "Sharing failed",
        message: errorMsg,
        tone: "danger",
      });
    } finally {
      setSharing(false);
    }
  }

  async function unshareFromCommunity() {
    if (!draft || !draft.isShared) return;
    const ok = await confirmAction({
      title: "Remove community share?",
      message: "This removes the find from the public FossilMapped database. Your local FossilMap record will stay on this device.",
      confirmLabel: "Remove share",
      danger: true,
    });
    if (!ok) return;

    setSharing(true);
    try {
      await deleteSharedFind(draft.id);
      await db.specimens.update(draft.id, {
        isShared: false,
        sharedAt: undefined,
        publicLat: undefined,
        publicLon: undefined,
        locationPrecision: undefined,
        precisionLocked: undefined,
      });
      setDraft(prev => prev ? {
        ...prev,
        isShared: false,
        sharedAt: undefined,
        publicLat: undefined,
        publicLon: undefined,
        locationPrecision: undefined,
        precisionLocked: undefined,
      } : prev);
      await notify({
        title: "Share removed",
        message: "The find has been removed from the community database.",
        tone: "success",
      });
    } catch (e: any) {
      console.error(e);
      await notify({
        title: "Removal failed",
        message: e?.message || "Check your internet connection and try again.",
        tone: "danger",
      });
    } finally {
      setSharing(false);
    }
  }

  async function handleTogglePrecision() {
    if (!draft || !draft.isShared) return;
    const coords = getFiniteCoords(draft.lat, draft.lon);
    if (!coords) {
      await notify({
        title: "GPS required",
        message: "Exact coordinates are missing from this local record.",
        tone: "warning",
      });
      return;
    }

    const currentPrecision = isPrecisionLevel(draft.locationPrecision) ? draft.locationPrecision : "exact";
    const currentlyLocked = draft.precisionLocked ?? currentPrecision !== "exact";
    const shareExact = currentlyLocked;
    const nextPrecision: PrecisionLevel = shareExact ? "exact" : "1km";
    const nextPrecisionLocked = nextPrecision !== "exact";
    const ok = await confirmAction({
      title: shareExact ? "Share exact location?" : "Hide exact location?",
      message: shareExact
        ? "Exact GPS coordinates will be visible to all FossilMapped users."
        : "FossilMapped will return to a general 1km area marker.",
      confirmLabel: shareExact ? "Share exact" : "Use approximate",
      tone: "warning",
    });
    if (!ok) return;

    setSharing(true);
    try {
      const nextPublicCoords = shareExact
        ? coords
        : applyPrecision(coords.lat, coords.lon, "1km");

      await updateSharedFindPrecision(
        draft.id,
        nextPrecision,
        nextPrecisionLocked,
        nextPublicCoords.lat,
        nextPublicCoords.lon
      );

      const patch = {
        precisionLocked: nextPrecisionLocked,
        publicLat: nextPublicCoords.lat,
        publicLon: nextPublicCoords.lon,
        locationPrecision: nextPrecision,
      };
      await db.specimens.update(draft.id, patch);
      setDraft(prev => prev ? { ...prev, ...patch } : prev);
      await notify({
        title: shareExact ? "Exact location shared" : "Approximate location restored",
        message: shareExact
          ? "FossilMapped will show the exact GPS coordinates for this find."
          : "FossilMapped will show a general 1km area marker.",
        tone: "success",
      });
    } catch (e: any) {
      console.error(e);
      await notify({
        title: "Precision update failed",
        message: e?.message || "Check your internet connection and try again.",
        tone: "danger",
      });
    } finally {
      setSharing(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setSaveNotice(null);
    try {
      const trimmedCode = draft.specimenCode.trim();
      if (trimmedCode) {
        const conflict = await db.specimens
          .where("projectId").equals(draft.projectId)
          .filter((s) => s.specimenCode.trim().toLowerCase() === trimmedCode.toLowerCase() && s.id !== draft.id)
          .first();
        if (conflict) {
          await notify({
            title: "Duplicate code",
            message: `"${trimmedCode}" is already used by ${conflict.taxon || "another find"}.`,
            tone: "warning",
          });
          setBusy(false);
          return;
        }
      }
      const now = new Date().toISOString();
      await db.specimens.update(draft.id, { ...draft, specimenCode: trimmedCode || draft.specimenCode, isPending: false, updatedAt: now });
      setSaveNotice("Changes saved to this find.");
      if (wasPending) {
        props.onClose();
      } else {
        setIsEditing(false);
      }
    } catch (e: any) {
      console.error(e);
      await notify({
        title: "Save failed",
        message: e?.message || "The changes could not be saved on this device.",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!draft) return;
    const ok = await confirmAction({
      title: "Delete this find?",
      message: "This will permanently delete the find and its photos from this device.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
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

    if (items.length === 1 && !isEditing) {
        const m = items[0];
        const url = URL.createObjectURL(m.blob);
        setAnnotatingMedia({ media: m, url });
    }

    setBusy(false);
  }

  async function removePhoto(mediaId: string) {
    const ok = await confirmAction({
      title: "Remove photo?",
      message: "This removes the photo from this find on this device.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
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
      await notify({
        title: "GPS failed",
        message: e?.message ?? "FossilMap could not get a GPS fix.",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  const headerActions = (
    <div className="flex gap-2 items-center">
        <button 
            onClick={() => {
              props.onClose();
              navigate(`/specimen?id=${draft.id}`);
            }}
            className="px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
        >
            Edit Details
        </button>
    </div>
  );
  const draftCoords = getFiniteCoords(draft.lat, draft.lon);
  const draftCoordsLabel = formatCoords(draft.lat, draft.lon);
  const currentPrecision = isPrecisionLevel(draft.locationPrecision)
    ? draft.locationPrecision
    : draft.isShared
      ? "exact"
      : sharePrec;
  const currentPrecisionLocked = draft.precisionLocked ?? currentPrecision !== "exact";
  const shareExactLocation = sharePrec === "exact";
  const sharedExactLocation = draft.isShared && !currentPrecisionLocked;
  const publicPrecisionLabel = draft.isShared
    ? currentPrecisionLocked
      ? precisionLabel(currentPrecision)
      : "exact GPS"
    : precisionLabel(sharePrec);
  const communityUrl = getCommunityUrl(draft.hrid);
  const locationIsExact = draft.isShared ? sharedExactLocation : shareExactLocation;
  const qualityLabel = getQualityLabel(qualityScore);
  const communitySharePanel = (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20 sm:p-4">
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-700/20 sm:h-10 sm:w-10">
              <Globe className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="m-0 text-sm font-black text-slate-900 dark:text-white">Share for research</h4>
                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                  draft.isShared
                    ? "border-emerald-300 bg-white text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                }`}>
                  {draft.isShared ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {draft.isShared ? "Shared" : "Private"}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                {draft.isShared
                  ? `Visible on FossilMapped${draft.hrid ? ` as ${draft.hrid}` : ""}.`
                  : "Ready to publish to the FossilMapped community map."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="min-w-0 rounded-xl border border-white/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <Database className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Quality
                </div>
                <div className={`mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-bold ${getQualityColor(qualityScore)}`}>
                  <span className="text-base leading-none">{qualityScore}%</span>
                  <span className="text-xs leading-tight">{qualityLabel}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-black text-slate-900 dark:text-white">
                <ShieldCheck className={`h-4 w-4 ${locationIsExact ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`} />
                {locationIsExact ? "Exact GPS is public" : "Exact spot stays private"}
              </div>
              <p className={`mt-1 text-[10px] font-semibold ${locationIsExact ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
                {locationIsExact
                  ? "Best for site-level research where public coordinates are acceptable."
                  : "A rounded area marker is shown on the public map."}
              </p>
            </div>

            <div className="inline-flex h-9 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                disabled={sharing || (!draft.isShared && !shareExactLocation) || (draft.isShared && !sharedExactLocation)}
                onClick={() => {
                  if (draft.isShared) handleTogglePrecision();
                  else setSharePrec("1km");
                }}
                className={`inline-flex items-center justify-center rounded-md px-3 text-[10px] font-black uppercase tracking-wider transition-colors ${
                  !locationIsExact
                    ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-950 dark:text-emerald-300"
                    : "text-slate-500 hover:bg-white/70 hover:text-slate-900 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-950/60 dark:hover:text-slate-100"
                } disabled:cursor-default disabled:opacity-70`}
              >
                General area
              </button>
              <button
                type="button"
                disabled={sharing || (!draft.isShared && shareExactLocation) || (draft.isShared && sharedExactLocation)}
                onClick={() => {
                  if (draft.isShared) handleTogglePrecision();
                  else setSharePrec("exact");
                }}
                className={`inline-flex items-center justify-center rounded-md px-3 text-[10px] font-black uppercase tracking-wider transition-colors ${
                  locationIsExact
                    ? "bg-white text-amber-700 shadow-sm dark:bg-slate-950 dark:text-amber-300"
                    : "text-slate-500 hover:bg-white/70 hover:text-slate-900 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-950/60 dark:hover:text-slate-100"
                } disabled:cursor-default disabled:opacity-70`}
              >
                Exact GPS
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {!draft.isShared ? (
              <label className={`flex items-start gap-2 text-[10px] font-semibold ${defaultEmail ? "cursor-pointer text-slate-600 dark:text-slate-300" : "cursor-not-allowed text-slate-400 dark:text-slate-500"}`}>
                <input
                  type="checkbox"
                  checked={includeShareEmail && !!defaultEmail}
                  disabled={sharing || !defaultEmail}
                  onChange={(event) => setIncludeShareEmail(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                />
                <span>
                  Include contact email
                  <span className="block font-medium text-slate-400 dark:text-slate-500">
                    {defaultEmail ? "Researchers can contact you about this find." : "No email is saved in settings."}
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                Shared contact details are controlled by the published record.
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {draft.isShared ? (
              <>
                <a
                  href={communityUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300 sm:flex-none"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View
                </a>
                <button
                  type="button"
                  onClick={unshareFromCommunity}
                  disabled={sharing}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-wait disabled:opacity-60 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-300 sm:flex-none"
                >
                  {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Remove share
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={shareToCommunity}
                disabled={sharing}
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                {sharing ? "Sharing..." : "Share with FossilMapped"}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <>
      <Modal onClose={props.onClose} title={`Find: ${draft.specimenCode}`} headerActions={headerActions}>
        <div className="grid gap-6 max-h-[80vh] overflow-y-auto pr-1">
          {isEditing ? (
            <div className="grid gap-4">
              <div className="bg-blue-600/5 dark:bg-blue-400/5 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/50 flex items-center justify-between mb-2">
                 <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Research Quality Score</div>
                    <div className={`text-xl font-black ${getQualityColor(qualityScore)}`}>{qualityScore}% <span className="text-[10px] opacity-60 ml-1">— {getQualityLabel(qualityScore)}</span></div>
                 </div>
                 <div className="text-right">
                    <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Repository</div>
                    <select 
                      value={draft.repository || "Private"} 
                      onChange={(e) => setDraft(prev => prev ? { ...prev, repository: e.target.value } : null)}
                      className="bg-transparent text-sm font-bold border-none p-0 focus:ring-0 cursor-pointer text-right"
                    >
                      <option value="Private">Private Collection</option>
                      <option value="Museum">Museum Collection</option>
                      <option value="University">University Collection</option>
                    </select>
                 </div>
              </div>

              {draft.repository !== 'Private' && (
                  <label className="grid gap-1 animate-in slide-in-from-top-2">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Accession / Museum Number</span>
                    <input 
                      className="w-full bg-white dark:bg-gray-800 border-2 border-amber-100 dark:border-amber-900 rounded-xl p-2.5 focus:ring-2 focus:ring-amber-500 outline-none transition-all font-mono text-sm" 
                      value={draft.accessionId || ""} 
                      onChange={(e) => setDraft(prev => prev ? { ...prev, accessionId: e.target.value } : null)} 
                      placeholder="e.g. NHMUK PV R 12345"
                    />
                  </label>
              )}

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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="grid gap-1">
                  <span className="text-sm font-bold opacity-75">Geological Period</span>
                  <input 
                      className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                      value={draft.period || ""} 
                      onChange={(e) => setDraft(prev => prev ? { ...prev, period: e.target.value } : null)} 
                      list="modal-periods-list"
                      placeholder="Inherit from locality..."
                  />
                  <datalist id="modal-periods-list">
                      {["Precambrian", "Cambrian", "Ordovician", "Silurian", "Devonian", "Carboniferous", "Permian", "Triassic", "Jurassic", "Cretaceous", "Paleogene", "Neogene", "Quaternary"].map(p => <option key={p} value={p} />)}
                  </datalist>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-bold opacity-75">Geological Stage</span>
                  <input 
                      className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" 
                      value={draft.stage || ""} 
                      onChange={(e) => setDraft(prev => prev ? { ...prev, stage: e.target.value } : null)} 
                      list="modal-stages-list"
                      placeholder="Inherit from locality..."
                  />
                  <datalist id="modal-stages-list">
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="grid gap-1">
                  <span className="text-sm font-bold opacity-75">Formation</span>
                  <input
                    className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    value={draft.formation || ""}
                    onChange={(e) => setDraft(prev => prev ? { ...prev, formation: e.target.value } : null)}
                    placeholder="Override locality value"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-bold opacity-75">Member</span>
                  <input
                    className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    value={draft.member || ""}
                    onChange={(e) => setDraft(prev => prev ? { ...prev, member: e.target.value } : null)}
                    placeholder="Override locality value"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-bold opacity-75">Bed</span>
                  <input
                    className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    value={draft.bed || ""}
                    onChange={(e) => setDraft(prev => prev ? { ...prev, bed: e.target.value } : null)}
                    placeholder="Override locality value"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  <span className="text-sm font-bold opacity-75">Preservation</span>
                  <select
                    className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    value={draft.preservation || "body fossil"}
                    onChange={(e) => setDraft(prev => prev ? { ...prev, preservation: e.target.value as Specimen["preservation"] } : null)}
                  >
                    {[
                      "body fossil",
                      "trace fossil",
                      "mould",
                      "cast",
                      "impression/compression",
                      "permineralised",
                      "replacement",
                      "carbonised",
                      "subfossil",
                      "other",
                    ].map((value) => <option key={value} value={value}>{value}</option>)}
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
                              {draftCoordsLabel ?? "Not set"}
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

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Context & Taphonomy</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-sm font-bold opacity-75">Find context</span>
                    <textarea
                      value={draft.findContext || ""}
                      onChange={(e) => setDraft(prev => prev ? { ...prev, findContext: e.target.value } : null)}
                      rows={3}
                      placeholder="Matrix, float, in situ, beach shingle..."
                      className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-bold opacity-75">Taphonomy</span>
                    <textarea
                      value={draft.taphonomy || ""}
                      onChange={(e) => setDraft(prev => prev ? { ...prev, taphonomy: e.target.value } : null)}
                      rows={3}
                      placeholder="Weathering, abrasion, articulation, breakage..."
                      className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
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
                <span className="text-sm font-bold opacity-75">Date collected</span>
                <input
                  type="date"
                  value={draft.dateCollected ? draft.dateCollected.slice(0, 10) : draft.createdAt?.slice(0, 10) || ""}
                  onChange={(e) => setDraft(prev => prev ? { ...prev, dateCollected: e.target.value } : null)}
                  className="w-full bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                />
              </label>

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
                  <h4 className="m-0 font-bold text-sm uppercase tracking-tight">Add Photos (4 max stored · 2 shared)</h4>
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
                    <div key={x.id} className="grid gap-1.5">
                        <div className="relative group border-2 border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden aspect-square shadow-sm cursor-pointer" onClick={() => setCalibratingMedia({ media: x.media, url: x.url })}>
                            <ScaledImage media={x.media} imgClassName="object-cover" className="w-full h-full" />
                            <button onClick={(e) => { e.stopPropagation(); removePhoto(x.id); }} className="absolute top-1 right-1 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-lg z-10">✕</button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setAnnotatingMedia({ media: x.media, url: x.url }); }} 
                                className="absolute bottom-1 left-1 bg-blue-600 text-white px-2 py-1 rounded text-[8px] font-black uppercase shadow-lg z-10 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            >
                                ✎ Annotate
                            </button>
                        </div>
                        <input
                            type="text"
                            value={x.media.caption || ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={async (e) => {
                                await db.media.update(x.id, { caption: e.target.value });
                            }}
                            placeholder="Caption (optional)"
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-900"
                        />
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
                  <button onClick={save} disabled={busy} className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl shadow-md font-bold text-sm disabled:cursor-wait disabled:opacity-70">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {busy ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              {saveNotice && (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <Check className="h-4 w-4 shrink-0" />
                  {saveNotice}
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">Find Details</div>
                  <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight mb-2">{draft.taxon || "(Unknown)"}</div>
                  <div className="flex flex-wrap gap-2 mb-4">
                      {draft.period && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">{draft.period}</span>
                      )}
                      {draft.stage && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">{draft.stage}</span>
                      )}
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

                  {draftCoords && (
                    <div className="mt-4 flex items-center justify-between bg-blue-50/50 dark:bg-blue-900/10 px-4 py-2 rounded-xl border border-blue-100 dark:border-blue-900/30">
                        <div className="text-[10px] font-mono font-bold text-blue-600">📍 {draftCoordsLabel}</div>
                        <button onClick={() => window.open(`https://www.google.com/maps?q=${draftCoords.lat},${draftCoords.lon}`, "_blank")} className="text-[9px] font-black text-blue-500 hover:underline uppercase">View Map ↗</button>
                    </div>
                  )}
              </div>

              {communitySharePanel}

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
              
              <div className="flex justify-between items-center pt-4">
                  <button onClick={del} disabled={busy} className="text-red-600 hover:text-red-800 text-sm font-bold transition-colors">
                    Delete
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowLabelSheet(true)}
                      className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Printer className="h-4 w-4" />
                      Print label
                    </button>
                    <button onClick={props.onClose} className="bg-gray-900 dark:bg-gray-100 text-white dark:text-black px-8 py-3 rounded-2xl font-black shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all text-sm">Done</button>
                  </div>
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
        <React.Suspense fallback={null}>
          <LocationPickerModal 
              initialLat={draft.lat}
              initialLon={draft.lon}
              onClose={() => setIsPickingLocation(false)}
              onSelect={(pickedLat, pickedLon) => {
                  setDraft(prev => prev ? { ...prev, lat: pickedLat, lon: pickedLon, gpsAccuracyM: null } : null);
                  setIsPickingLocation(false);
              }}
          />
        </React.Suspense>
      )}
      {showLabelSheet && draft && (
        <SpecimenLabelSheet
          labels={[{ specimen: draft, locality: locality ?? null, media: labelMedia }]}
          onClose={() => setShowLabelSheet(false)}
        />
      )}
      {dialog}
    </>
  );
}

function isUniqueConflict(error: unknown): boolean {
  const e = error as { code?: string; message?: string; details?: string; hint?: string };
  if (e?.code === "23505") return true;
  const text = [e?.message, e?.details, e?.hint].filter(Boolean).join(" ");
  return /duplicate key|unique constraint|shared_finds_hrid|hrid/i.test(text);
}
