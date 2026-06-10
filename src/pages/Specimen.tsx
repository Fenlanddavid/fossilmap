import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Locality, Media, Specimen } from "../db";
import { v4 as uuid } from "uuid";
import { fileToBlob } from "../services/photos";
import { ScaledImage } from "../components/ScaledImage";
import { PhotoAnnotator } from "../components/PhotoAnnotator";
import { captureGPS } from "../services/gps";
import { formatCoords } from "../services/coords";
import { formatOsGridRef, OS_GRID_INVALID_MESSAGE, parseOsGridRef } from "../services/osGrid";
import { calculateQualityScore } from "../services/research";
import { useConfirmDialog } from "../components/ConfirmModal";
import { CoachTip } from "../components/CoachTip";
import {
  ArrowDown, ArrowUp, Camera, CheckCircle2, ClipboardList,
  MapPin, Microscope, RefreshCw, Ruler, Trash2, Warehouse,
} from "lucide-react";

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
  "Trilobite", "Plant / Wood", "Trace Fossil", "Coprolite",
];
const commonElements = [
  "Tooth", "Vertebra", "Rib", "Limb Bone", "Skull Element", "Jaw", "Paddle / Fin",
  "Shell (Complete)", "Shell Fragment", "Nodule", "Matrix Block", "Osteoderm",
];

function makeSpecimenCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `UK-${year}-${rand}`;
}

function numberFromInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const next = Number(trimmed);
  return Number.isFinite(next) ? next : null;
}

// ─── Wizard step config ────────────────────────────────────────────────────
const STEPS = [
  { n: 1, label: "Identify", shortLabel: "ID", icon: Microscope },
  { n: 2, label: "Photograph", shortLabel: "Photo", icon: Camera },
  { n: 3, label: "Describe", shortLabel: "Info", icon: Ruler },
  { n: 4, label: "Store", shortLabel: "Store", icon: Warehouse },
] as const;
type StepNum = 1 | 2 | 3 | 4;

// ──────────────────────────────────────────────────────────────────────────

export default function SpecimenPage(props: {
  projectId: string;
  localityId: string | null;
  sessionId?: string | null;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("id");
  const isEditingExisting = !!editId;
  const { confirm: confirmAction, dialog } = useConfirmDialog();

  const localities = useLiveQuery(
    async () => db.localities.where("projectId").equals(props.projectId).reverse().sortBy("createdAt"),
    [props.projectId]
  );

  // ── Form fields ──────────────────────────────────────────────────────────
  const [locationName, setLocationName] = useState("");
  const [selectedLocalityId, setSelectedLocalityId] = useState(props.localityId ?? "");
  const [specimenCode, setSpecimenCode] = useState(makeSpecimenCode());
  const [taxon, setTaxon] = useState("");
  const [confidence, setConfidence] = useState<Specimen["taxonConfidence"]>("med");
  const [period, setPeriod] = useState("");
  const [stage, setStage] = useState("");
  const [formation, setFormation] = useState("");
  const [element, setElement] = useState<Specimen["element"]>("shell");
  const [isCustomElement, setIsCustomElement] = useState(false);
  const [preservation, setPreservation] = useState<Specimen["preservation"]>("body fossil");
  const [taphonomy, setTaphonomy] = useState("");
  const [findContext, setFindContext] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [acc, setAcc] = useState<number | null>(null);
  const [weightG, setWeightG] = useState("");
  const [lengthMm, setLengthMm] = useState("");
  const [widthMm, setWidthMm] = useState("");
  const [thicknessMm, setThicknessMm] = useState("");
  const [bagBoxId, setBagBoxId] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [dateCollected, setDateCollected] = useState(() => new Date().toISOString().slice(0, 10));

  // ── UI state ─────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [annotatingMedia, setAnnotatingMedia] = useState<{ media: Media; url: string } | null>(null);

  // ── Wizard state (mobile only, not persisted) ─────────────────────────────
  const [activeStep, setActiveStep] = useState<StepNum>(1);
  const [maxVisitedStep, setMaxVisitedStep] = useState<number>(1);
  const isMobileRef = useRef(false);
  const [isMobileWizard, setIsMobileWizard] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = (matches: boolean) => {
      isMobileRef.current = matches;
      setIsMobileWizard(matches);
    };
    update(mq.matches);
    const handler = (e: MediaQueryListEvent) => update(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = window.setTimeout(() => setSaveMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  function applyLocalityDefaults(locality: Locality, overwrite = false) {
    setLocationName(locality.name || "");
    if (overwrite || !period.trim()) setPeriod(locality.period || "");
    if (overwrite || !stage.trim()) setStage(locality.stage || "");
    if (overwrite || !formation.trim()) setFormation(locality.formation || "");
  }

  async function chooseLocality(localityId: string) {
    setSelectedLocalityId(localityId);
    if (!localityId) return;
    const locality = await db.localities.get(localityId);
    if (locality) applyLocalityDefaults(locality, true);
  }

  // ── Load locality default ─────────────────────────────────────────────────
  useEffect(() => {
    if (editId) return;
    if (props.localityId) {
      db.localities.get(props.localityId).then((l) => {
        if (l) {
          setSelectedLocalityId(l.id);
          applyLocalityDefaults(l, false);
        }
      });
    }
  }, [props.localityId, editId]);

  // ── Load existing specimen for edit ──────────────────────────────────────
  useEffect(() => {
    if (!editId) return;
    const targetId = editId;
    let active = true;
    setError(null);

    async function load() {
      const specimen = await db.specimens.get(targetId);
      if (!active || !specimen) { if (active) setError("Find not found."); return; }
      const locality = await db.localities.get(specimen.localityId);
      if (!active) return;

      setSavedId(specimen.id);
      setSelectedLocalityId(specimen.localityId || "");
      setLocationName(locality?.name || "");
      setSpecimenCode(specimen.specimenCode || makeSpecimenCode());
      setTaxon(specimen.taxon || "");
      setConfidence(specimen.taxonConfidence || "med");
      setPeriod(specimen.period || "");
      setStage(specimen.stage || "");
      setFormation(specimen.formation || "");
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
      setDateCollected(specimen.dateCollected || specimen.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10));
    }

    load().catch((e) => { if (active) setError(e?.message ?? "Load failed."); });
    return () => { active = false; };
  }, [editId]);

  const media = useLiveQuery(
    async () => (savedId ? db.media.where("specimenId").equals(savedId).sortBy("createdAt") : []),
    [savedId]
  );
  const sortedLocalities = useMemo(
    () => [...(localities ?? [])].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [localities]
  );
  const formLocked = !!savedId && !isEditingExisting && !isMobileWizard;

  // ── Quality bar ───────────────────────────────────────────────────────────
  const qualitySpecimen = useMemo<Partial<Specimen>>(() => ({
    lat,
    lon,
    gpsAccuracyM: acc,
    period: period.trim(),
    stage: stage.trim(),
    formation: formation.trim(),
    element,
    preservation,
    findContext: findContext.trim(),
    taphonomy: taphonomy.trim(),
    weightG: numberFromInput(weightG),
    lengthMm: numberFromInput(lengthMm),
    widthMm: numberFromInput(widthMm),
    thicknessMm: numberFromInput(thicknessMm),
  }), [acc, element, findContext, formation, lat, lengthMm, lon, period, preservation, stage, taphonomy, thicknessMm, weightG, widthMm]);
  const qualityPercent = calculateQualityScore(qualitySpecimen, media || []);
  const qualityItems = [
    { label: "GPS", done: lat != null && lon != null },
    { label: "Accuracy", done: typeof acc === "number" && acc < 30 },
    { label: "Period", done: !!period.trim() && period.trim() !== "Unknown" },
    { label: "Stage", done: !!stage.trim() && stage.trim() !== "Unknown" },
    { label: "Formation", done: !!formation.trim() },
    { label: "Element", done: !!element.trim() },
    { label: "Preservation", done: preservation !== "body fossil" },
    { label: "Context", done: !!findContext.trim() },
    { label: "Taphonomy", done: !!taphonomy.trim() },
    { label: "Measurements", done: !!(numberFromInput(weightG) || numberFromInput(lengthMm) || numberFromInput(widthMm) || numberFromInput(thicknessMm)) },
    { label: "Photos", done: (media?.length ?? 0) > 0 },
    { label: "Scale photo", done: (media ?? []).some((m) => (m.pxPerMm ?? 0) > 0) },
  ];

  // ── GPS ───────────────────────────────────────────────────────────────────
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

  // ── Save helpers ──────────────────────────────────────────────────────────
  async function resolveLocalityId(): Promise<string> {
    if (selectedLocalityId) {
      const linked = await db.localities.get(selectedLocalityId);
      if (linked) return linked.id;
    }
    if (props.localityId && !isEditingExisting) {
      const linked = await db.localities.get(props.localityId);
      if (linked) return linked.id;
    }

    const trimmedName = locationName.trim();
    const existing = await db.localities
      .where("projectId").equals(props.projectId)
      .filter((l) => l.name === trimmedName)
      .first();
    if (existing) return existing.id;

    const newId = uuid();
    const now = new Date().toISOString();
    const defaultCollector = await db.settings.get("defaultCollector").then((s) => s?.value || "");
    await db.localities.add({
      id: newId,
      projectId: props.projectId,
      type: "location",
      name: trimmedName,
      lat: null, lon: null, gpsAccuracyM: null,
      observedAt: now,
      collector: defaultCollector,
      exposureType: "other",
      sssi: false, rigs: false, permissionGranted: false,
      period: period.trim(), stage: stage.trim(),
      formation: formation.trim(), member: "", bed: "",
      lithologyPrimary: "other",
      notes: "Structured Location",
      designationNotes: "",
      createdAt: now, updatedAt: now,
    });
    return newId;
  }

  function buildSpecimenRecord(id: string, localityId: string, existing: Specimen | undefined, isPending: boolean): Specimen {
    const now = new Date().toISOString();
    return {
      id,
      projectId: props.projectId,
      localityId,
      sessionId: props.sessionId || null,
      specimenCode: specimenCode.trim() || makeSpecimenCode(),
      taxon: taxon.trim(),
      taxonConfidence: confidence,
      period: period.trim(),
      stage: stage.trim(),
      formation: formation.trim(),
      lat, lon,
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
      hrid: existing?.hrid,
      repository: existing?.repository,
      accessionId: existing?.accessionId,
      qualityScore: existing?.qualityScore,
      isShared: existing?.isShared,
      sharedAt: existing?.sharedAt,
      locationPrecision: existing?.locationPrecision,
      precisionLocked: existing?.precisionLocked,
      publicLat: existing?.publicLat,
      publicLon: existing?.publicLon,
      dateCollected: dateCollected || undefined,
      isPending,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
  }

  async function findSpecimenCodeConflict(code: string, excludeId?: string | null) {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const normalized = trimmed.toLowerCase();
    return db.specimens
      .where("projectId").equals(props.projectId)
      .filter((s) => s.specimenCode.trim().toLowerCase() === normalized && s.id !== (excludeId ?? ""))
      .first();
  }

  async function assertUniqueSpecimenCode(code: string, excludeId?: string | null) {
    const conflict = await findSpecimenCodeConflict(code, excludeId);
    if (!conflict) return;
    throw new Error(
      `Specimen code "${code.trim()}" is already used by ${conflict.taxon || "another find"}. Please use a different code.`
    );
  }

  // Full save (desktop / edit mode)
  async function saveSpecimen() {
    setError(null);
    setSaveMessage(null);
    setSaving(true);
    try {
      if (!locationName.trim()) throw new Error("Enter a location name first.");
      await assertUniqueSpecimenCode(specimenCode, editId);
      const localityId = await resolveLocalityId();
      const existing = editId ? await db.specimens.get(editId) : undefined;
      const id = editId || uuid();
      const record = buildSpecimenRecord(id, localityId, existing, false);
      if (editId) await db.specimens.put(record);
      else await db.specimens.add(record);
      setSavedId(id);
      setSaveMessage(editId ? "Changes saved to this find." : "Find recorded.");
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Step 1 save — writes draft with isPending: true, advances wizard
  async function saveStepOne() {
    setError(null);
    setSaving(true);
    try {
      if (!taxon.trim()) throw new Error("Enter a taxon name first.");
      if (!locationName.trim()) throw new Error("Enter a location name first.");
      await assertUniqueSpecimenCode(specimenCode);
      const localityId = await resolveLocalityId();
      const id = uuid();
      const record = buildSpecimenRecord(id, localityId, undefined, true);
      await db.specimens.add(record);
      setSavedId(id);
      goToStep(2);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Step 3 partial update — preserve, taphonomy, context, measurements
  async function updateStep3() {
    if (!savedId) return;
    setError(null);
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await db.specimens.update(savedId, {
        preservation, taphonomy: taphonomy.trim(), findContext: findContext.trim(),
        weightG: weightG ? parseFloat(weightG) : null,
        lengthMm: lengthMm ? parseFloat(lengthMm) : null,
        widthMm: widthMm ? parseFloat(widthMm) : null,
        thicknessMm: thicknessMm ? parseFloat(thicknessMm) : null,
        updatedAt: now,
      });
      goToStep(4);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Step 4 complete — clears isPending
  async function completeSpecimen() {
    if (!savedId) return;
    setError(null);
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await assertUniqueSpecimenCode(specimenCode, savedId);
      await db.specimens.update(savedId, {
        specimenCode: specimenCode.trim() || makeSpecimenCode(),
        bagBoxId: bagBoxId.trim(),
        storageLocation: storageLocation.trim(),
        notes: notes.trim(),
        isPending: false,
        updatedAt: now,
      });
      setSavedId(null);
      resetForm();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function goToStep(step: StepNum) {
    setActiveStep(step);
    setMaxVisitedStep((prev) => Math.max(prev, step));
  }

  function resetForm() {
    if (isEditingExisting) { navigate("/specimen"); return; }
    setSavedId(null);
    setActiveStep(1);
    setMaxVisitedStep(1);
    setSpecimenCode(makeSpecimenCode());
    setSelectedLocalityId(props.localityId ?? "");
    if (props.localityId) {
      db.localities.get(props.localityId).then((locality) => {
        if (locality) applyLocalityDefaults(locality, true);
      });
    } else {
      setLocationName("");
    }
    setTaxon(""); setConfidence("med"); setPeriod(""); setStage(""); setFormation("");
    setElement("shell"); setPreservation("body fossil");
    setTaphonomy(""); setFindContext("");
    setLat(null); setLon(null); setAcc(null);
    setWeightG(""); setLengthMm(""); setWidthMm(""); setThicknessMm("");
    setIsCustomElement(false); setBagBoxId(""); setStorageLocation(""); setNotes("");
    setError(null);
  }

  // ── Photo handlers ────────────────────────────────────────────────────────
  async function addPhotos(files: FileList | null, photoType?: Media["photoType"]) {
    setError(null);
    try {
      if (!savedId) throw new Error("Save the find first, then add photos.");
      if (!files || files.length === 0) return;
      const now = new Date().toISOString();
      const items: Media[] = [];
      for (const f of Array.from(files)) {
        const blob = await fileToBlob(f);
        items.push({
          id: uuid(), projectId: props.projectId, specimenId: savedId,
          type: "photo", photoType: photoType || "other",
          filename: f.name, mime: f.type || "application/octet-stream",
          blob, caption: "", scalePresent: false, createdAt: now,
        });
      }
      await db.media.bulkAdd(items);
      if (items.length === 1) {
        const m = items[0];
        setAnnotatingMedia({ media: m, url: URL.createObjectURL(m.blob) });
      }
    } catch (e: any) {
      setError(e?.message ?? "Photo add failed");
    }
  }

  async function removePhoto(mediaId: string) {
    const ok = await confirmAction({
      title: "Remove photo?",
      message: "This removes the photo from this find on this device.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try { await db.media.delete(mediaId); }
    catch (e: any) { setError(e?.message ?? "Photo remove failed"); }
  }

  async function replacePhoto(mediaId: string, files: FileList | null) {
    try {
      const file = files?.[0];
      if (!file) return;
      const blob = await fileToBlob(file);
      await db.media.update(mediaId, { blob, filename: file.name, mime: file.type || "application/octet-stream" });
    } catch (e: any) { setError(e?.message ?? "Photo replace failed"); }
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

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="grid min-w-0 gap-5 max-w-5xl mx-auto pb-20 px-4 sm:gap-6">
      {/* Header */}
      <div className="flex min-w-0 flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Specimen recorder</p>
          <h2 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-gray-100 tracking-tight">
            {isEditingExisting ? "Edit Find" : props.localityId ? "Record Find" : "New Find"}
          </h2>
        </div>
        <div className="flex min-w-0 gap-2 w-full sm:w-auto">
          <button
            onClick={() => navigate("/finds")}
            className="flex-1 sm:flex-none bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-xl font-bold transition-all text-sm"
          >
            View All
          </button>
          {savedId && !isEditingExisting && !isMobileWizard && (
            <button
              onClick={resetForm}
              className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold shadow-md transition-all text-sm"
            >
              + Another
            </button>
          )}
          <button
            onClick={() => navigate(-1)}
            className="flex-1 sm:flex-none text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors text-sm"
          >
            Back
          </button>
        </div>
      </div>

      {error && (
        <div className="border-2 border-red-200 bg-red-50 text-red-800 p-4 rounded-xl shadow-sm font-medium">
          ⚠️ {error}
        </div>
      )}

      {saveMessage && (
        <div className="border-2 border-green-200 bg-green-50 text-green-800 p-4 rounded-xl shadow-sm font-bold">
          {saveMessage}
        </div>
      )}

      {/* Quality bar */}
      <div className="min-w-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="font-black text-gray-900 dark:text-white">Record quality</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Save quickly in the field, then fill gaps before sharing or reporting.</p>
          </div>
          <div className="text-sm font-black text-emerald-700 dark:text-emerald-300">{qualityPercent}% complete</div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-900 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${qualityPercent}%` }} />
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
          {qualityItems.map((item) => (
            <span
              key={item.label}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${item.done ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100" : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400"}`}
            >
              {item.done && <CheckCircle2 className="w-3 h-3" />}
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <CoachTip storageKey="fm_tip_specimen_wizard" title="Specimen workflow">
        Save the core place and ID first, then add photos, measurements, context and storage details as the record becomes steadier.
      </CoachTip>

      {/* ── MOBILE WIZARD ─────────────────────────────────────────────────── */}
      {isMobileWizard && !isEditingExisting && (
        <MobileWizard
          activeStep={activeStep}
          maxVisitedStep={maxVisitedStep}
          savedId={savedId}
          saving={saving}
          // step state
          selectedLocalityId={selectedLocalityId}
          chooseLocality={chooseLocality}
          localities={sortedLocalities}
          locationName={locationName} setLocationName={setLocationName}
          taxon={taxon} setTaxon={setTaxon}
          confidence={confidence} setConfidence={setConfidence}
          period={period} setPeriod={setPeriod}
          stage={stage} setStage={setStage}
          formation={formation} setFormation={setFormation}
          element={element} setElement={setElement}
          isCustomElement={isCustomElement} setIsCustomElement={setIsCustomElement}
          lat={lat} lon={lon} acc={acc}
          doGPS={doGPS}
          isPickingLocation={isPickingLocation}
          setIsPickingLocation={setIsPickingLocation}
          setLat={setLat} setLon={setLon} setAcc={setAcc}
          preservation={preservation} setPreservation={setPreservation}
          taphonomy={taphonomy} setTaphonomy={setTaphonomy}
          findContext={findContext} setFindContext={setFindContext}
          weightG={weightG} setWeightG={setWeightG}
          lengthMm={lengthMm} setLengthMm={setLengthMm}
          widthMm={widthMm} setWidthMm={setWidthMm}
          thicknessMm={thicknessMm} setThicknessMm={setThicknessMm}
          specimenCode={specimenCode} setSpecimenCode={setSpecimenCode}
          bagBoxId={bagBoxId} setBagBoxId={setBagBoxId}
          storageLocation={storageLocation} setStorageLocation={setStorageLocation}
          notes={notes} setNotes={setNotes}
          dateCollected={dateCollected} setDateCollected={setDateCollected}
          media={media ?? []}
          addPhotos={addPhotos}
          removePhoto={removePhoto}
          replacePhoto={replacePhoto}
          movePhoto={movePhoto}
          setAnnotatingMedia={setAnnotatingMedia}
          goToStep={goToStep}
          onSaveStep1={saveStepOne}
          onSaveStep3={updateStep3}
          onComplete={completeSpecimen}
        />
      )}

      {/* ── DESKTOP FULL FORM ─────────────────────────────────────────────── */}
      {(!isMobileWizard || isEditingExisting) && (
        <div className="grid min-w-0 lg:grid-cols-3 gap-8">
          {/* Main form */}
          <div
            className={`min-w-0 lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm grid gap-6 h-fit transition-opacity ${formLocked ? "opacity-50 pointer-events-none" : ""}`}
          >
            <SectionTitle icon={MapPin} title="1. Place" detail="Link the specimen to the right locality or trip." />
            <LocalityLinkFields
              selectedLocalityId={selectedLocalityId}
              chooseLocality={chooseLocality}
              localities={sortedLocalities}
              locationName={locationName}
              setLocationName={setLocationName}
            />

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
                  {taxonConfidence.map((c) => <option key={c} value={c}>{c}</option>)}
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
                {commonTaxa.map((t) => <option key={t} value={t} />)}
              </datalist>
            </label>

            <PeriodStageFields period={period} setPeriod={setPeriod} stage={stage} setStage={setStage} />
            <FormationField formation={formation} setFormation={setFormation} />

            <SectionTitle icon={MapPin} title="3. Find spot" detail="Capture GPS now if possible. You can correct it on the map later." />
            <GpsBlock lat={lat} lon={lon} doGPS={doGPS} setIsPickingLocation={setIsPickingLocation} setLat={setLat} setLon={setLon} setAcc={setAcc} />

            <label className="block">
              <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Date collected</div>
              <input
                type="date"
                value={dateCollected}
                onChange={(e) => setDateCollected(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
              />
            </label>

            <SectionTitle icon={Ruler} title="4. Measure and describe" detail="Measurements, element, preservation, context and field observations." />
            <MeasurementFields weightG={weightG} setWeightG={setWeightG} lengthMm={lengthMm} setLengthMm={setLengthMm} widthMm={widthMm} setWidthMm={setWidthMm} thicknessMm={thicknessMm} setThicknessMm={setThicknessMm} />
            <ElementPreservationFields element={element} setElement={setElement} isCustomElement={isCustomElement} setIsCustomElement={setIsCustomElement} preservation={preservation} setPreservation={setPreservation} />
            <ContextFields findContext={findContext} setFindContext={setFindContext} taphonomy={taphonomy} setTaphonomy={setTaphonomy} />

            <SectionTitle icon={Warehouse} title="5. Storage" detail="Make the physical fossil findable after the field day." />
            <StorageFields bagBoxId={bagBoxId} setBagBoxId={setBagBoxId} storageLocation={storageLocation} setStorageLocation={setStorageLocation} notes={notes} setNotes={setNotes} />

            <button
              onClick={saveSpecimen}
              disabled={saving || !locationName.trim()}
              className={`mt-4 w-full px-8 py-5 rounded-2xl font-black text-2xl shadow-xl transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:transform-none ${savedId && !isEditingExisting ? "bg-green-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
            >
              {saving ? "Saving…" : saveMessage ? "Saved" : isEditingExisting ? "Save Changes" : savedId ? "Find Recorded" : "Save Specimen Draft"}
            </button>
          </div>

          {/* Photo panel */}
          <PhotoPanel
            savedId={savedId}
            media={media ?? []}
            addPhotos={addPhotos}
            removePhoto={removePhoto}
            replacePhoto={replacePhoto}
            movePhoto={movePhoto}
            setAnnotatingMedia={setAnnotatingMedia}
          />
        </div>
      )}

      {annotatingMedia && (
        <PhotoAnnotator
          media={annotatingMedia.media}
          url={annotatingMedia.url}
          onClose={() => { URL.revokeObjectURL(annotatingMedia.url); setAnnotatingMedia(null); }}
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
              setAcc(null);
              setIsPickingLocation(false);
            }}
          />
        </React.Suspense>
      )}
      {dialog}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE WIZARD
// ─────────────────────────────────────────────────────────────────────────────

type WizardProps = {
  activeStep: StepNum;
  maxVisitedStep: number;
  savedId: string | null;
  saving: boolean;
  selectedLocalityId: string;
  chooseLocality: (id: string) => void;
  localities: Locality[];
  locationName: string; setLocationName: (v: string) => void;
  taxon: string; setTaxon: (v: string) => void;
  confidence: Specimen["taxonConfidence"]; setConfidence: (v: Specimen["taxonConfidence"]) => void;
  period: string; setPeriod: (v: string) => void;
  stage: string; setStage: (v: string) => void;
  formation: string; setFormation: (v: string) => void;
  element: string; setElement: (v: string) => void;
  isCustomElement: boolean; setIsCustomElement: (v: boolean) => void;
  lat: number | null; lon: number | null; acc: number | null;
  doGPS: () => void;
  isPickingLocation: boolean; setIsPickingLocation: (v: boolean) => void;
  setLat: (v: number | null) => void; setLon: (v: number | null) => void; setAcc: (v: number | null) => void;
  preservation: Specimen["preservation"]; setPreservation: (v: Specimen["preservation"]) => void;
  taphonomy: string; setTaphonomy: (v: string) => void;
  findContext: string; setFindContext: (v: string) => void;
  weightG: string; setWeightG: (v: string) => void;
  lengthMm: string; setLengthMm: (v: string) => void;
  widthMm: string; setWidthMm: (v: string) => void;
  thicknessMm: string; setThicknessMm: (v: string) => void;
  specimenCode: string; setSpecimenCode: (v: string) => void;
  bagBoxId: string; setBagBoxId: (v: string) => void;
  storageLocation: string; setStorageLocation: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  dateCollected: string; setDateCollected: (v: string) => void;
  media: Media[];
  addPhotos: (files: FileList | null, photoType?: Media["photoType"]) => void;
  removePhoto: (id: string) => void;
  replacePhoto: (id: string, files: FileList | null) => void;
  movePhoto: (id: string, direction: -1 | 1) => void;
  setAnnotatingMedia: (v: { media: Media; url: string } | null) => void;
  goToStep: (s: StepNum) => void;
  onSaveStep1: () => void;
  onSaveStep3: () => void;
  onComplete: () => void;
};

function MobileWizard(p: WizardProps) {
  const canGoBack = p.activeStep > 1;

  function handleBack() {
    if (p.activeStep > 1) p.goToStep((p.activeStep - 1) as StepNum);
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Step dots */}
      <div className="grid w-full min-w-0 grid-cols-4 gap-1.5 py-1">
        {STEPS.map((s) => {
          const visited = s.n <= p.maxVisitedStep;
          const active = s.n === p.activeStep;
          const Icon = s.icon;
          return (
            <button
              key={s.n}
              type="button"
              aria-label={s.label}
              disabled={!visited}
              onClick={() => visited && p.goToStep(s.n as StepNum)}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[9px] font-black uppercase transition-all ${
                active
                  ? "bg-emerald-600 text-white shadow"
                  : visited
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-gray-100 text-gray-400 dark:bg-gray-800 cursor-not-allowed"
              }`}
            >
              <Icon className="h-3 w-3 shrink-0" />
              <span className="min-w-0 truncate">{s.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="grid min-w-0 gap-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5">

        {/* ── Step 1: Identify + GPS ── */}
        {p.activeStep === 1 && (
          <>
            <SectionTitle icon={MapPin} title="Location" detail="Where was this found?" />
            <LocalityLinkFields
              selectedLocalityId={p.selectedLocalityId}
              chooseLocality={p.chooseLocality}
              localities={p.localities}
              locationName={p.locationName}
              setLocationName={p.setLocationName}
            />

            <SectionTitle icon={Microscope} title="Identify" detail="Taxon and geological age." />
            <label className="block">
              <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">
                Taxon / Identification <span className="text-red-500">*</span>
              </div>
              <input
                value={p.taxon}
                onChange={(e) => p.setTaxon(e.target.value)}
                placeholder="e.g. Dactylioceras commune"
                list="taxa-list-m"
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-lg"
              />
              <datalist id="taxa-list-m">
                {commonTaxa.map((t) => <option key={t} value={t} />)}
              </datalist>
            </label>

            <div className="grid min-w-0 grid-cols-2 gap-3">
              <label className="block">
                <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Confidence</div>
                <select
                  value={p.confidence}
                  onChange={(e) => p.setConfidence(e.target.value as any)}
                  className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-medium appearance-none"
                >
                  {taxonConfidence.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Element</div>
                <select
                  value={p.isCustomElement ? "CUSTOM" : p.element}
                  onChange={(e) => {
                    if (e.target.value === "CUSTOM") { p.setIsCustomElement(true); p.setElement(""); }
                    else { p.setIsCustomElement(false); p.setElement(e.target.value); }
                  }}
                  className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-medium appearance-none"
                >
                  <option value="">-- Element --</option>
                  {commonElements.map((e) => <option key={e} value={e}>{e}</option>)}
                  <option value="CUSTOM">✎ Custom…</option>
                </select>
              </label>
            </div>
            {p.isCustomElement && (
              <input
                value={p.element}
                onChange={(e) => p.setElement(e.target.value)}
                placeholder="Custom element…"
                autoFocus
                className="w-full bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
              />
            )}

            <PeriodStageFields period={p.period} setPeriod={p.setPeriod} stage={p.stage} setStage={p.setStage} />
            <FormationField formation={p.formation} setFormation={p.setFormation} />

            <SectionTitle icon={MapPin} title="GPS" detail="Tap while standing on the find. You can update this later." />
            <GpsBlock lat={p.lat} lon={p.lon} doGPS={p.doGPS} setIsPickingLocation={p.setIsPickingLocation} setLat={p.setLat} setLon={p.setLon} setAcc={p.setAcc} compact />

            <label className="block">
              <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Date collected</div>
              <input
                type="date"
                value={p.dateCollected}
                onChange={(e) => p.setDateCollected(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold"
              />
            </label>
          </>
        )}

        {/* ── Step 2: Photograph ── */}
        {p.activeStep === 2 && (
          <>
            <SectionTitle icon={Camera} title="Photograph" detail="At least one context photo and one with scale before cleaning." />
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
              Take at least one context photo and one scale/detail photo before cleaning or trimming matrix.
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-3">
              {[
                { label: "In situ", type: "in-situ" as const, icon: Camera, colour: "amber" },
                { label: "With scale", type: "in-situ" as const, icon: Ruler, colour: "blue" },
                { label: "Cleaned", type: "laboratory" as const, icon: Microscope, colour: "indigo" },
                { label: "Detail", type: "laboratory" as const, icon: ClipboardList, colour: "purple" },
              ].map(({ label, type, icon: Icon, colour }) => (
                <label
                  key={label}
                  className={`aspect-square rounded-2xl font-black text-[10px] shadow-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center border-2 uppercase tracking-widest bg-${colour}-50 dark:bg-${colour}-900/10 border-${colour}-200 dark:border-${colour}-800/50 text-${colour}-700 dark:text-${colour}-400 hover:bg-${colour}-100`}
                >
                  <Icon className="w-6 h-6" />
                  <span>{label}</span>
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => p.addPhotos(e.target.files, type)} className="hidden" />
                </label>
              ))}
            </div>
            <label className="w-full px-4 py-3 rounded-xl font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2 border bg-white dark:bg-gray-800 hover:bg-gray-50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
              Upload Files
              <input type="file" accept="image/*" multiple onChange={(e) => p.addPhotos(e.target.files)} className="hidden" />
            </label>
            {p.media.length > 0 && (
              <div className="grid min-w-0 grid-cols-2 gap-3">
                {p.media.map((m, index) => (
                  <PhotoThumb
                    key={m.id}
                    mediaId={m.id}
                    filename={m.filename}
                    index={index}
                    count={p.media.length}
                    onAnnotate={(med, url) => p.setAnnotatingMedia({ media: med, url })}
                    onRemove={p.removePhoto}
                    onReplace={p.replacePhoto}
                    onMove={p.movePhoto}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Step 3: Describe ── */}
        {p.activeStep === 3 && (
          <>
            <SectionTitle icon={Ruler} title="Describe" detail="Preservation, context and measurements." />
            <label className="block">
              <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Preservation</div>
              <select
                value={p.preservation}
                onChange={(e) => p.setPreservation(e.target.value as any)}
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
              >
                {preservations.map((x) => <option key={x} value={x} className="capitalize">{x}</option>)}
              </select>
            </label>
            <ContextFields findContext={p.findContext} setFindContext={p.setFindContext} taphonomy={p.taphonomy} setTaphonomy={p.setTaphonomy} />
            <MeasurementFields weightG={p.weightG} setWeightG={p.setWeightG} lengthMm={p.lengthMm} setLengthMm={p.setLengthMm} widthMm={p.widthMm} setWidthMm={p.setWidthMm} thicknessMm={p.thicknessMm} setThicknessMm={p.setThicknessMm} />
          </>
        )}

        {/* ── Step 4: Store + Complete ── */}
        {p.activeStep === 4 && (
          <>
            <SectionTitle icon={Warehouse} title="Store" detail="Make the physical fossil findable after the field day." />
            <label className="block">
              <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Specimen Code</div>
              <input
                value={p.specimenCode}
                onChange={(e) => p.setSpecimenCode(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
              />
            </label>
            <StorageFields bagBoxId={p.bagBoxId} setBagBoxId={p.setBagBoxId} storageLocation={p.storageLocation} setStorageLocation={p.setStorageLocation} notes={p.notes} setNotes={p.setNotes} />
          </>
        )}
      </div>

      {/* Wizard nav */}
      <div className="flex min-w-0 gap-3">
        {canGoBack && (
          <button
            type="button"
            onClick={handleBack}
            className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-3 rounded-xl font-bold transition-all"
          >
            ← Back
          </button>
        )}
        {p.activeStep === 1 && (
          <button
            type="button"
            onClick={p.onSaveStep1}
            disabled={p.saving || !p.taxon.trim() || !p.locationName.trim()}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-black shadow-md transition-all"
          >
            {p.saving ? "Saving…" : "Save & Next →"}
          </button>
        )}
        {p.activeStep === 2 && (
          <button
            type="button"
            onClick={() => p.goToStep(3)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl font-black shadow-md transition-all"
          >
            Next →
          </button>
        )}
        {p.activeStep === 3 && (
          <button
            type="button"
            onClick={p.onSaveStep3}
            disabled={p.saving}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-black shadow-md transition-all"
          >
            {p.saving ? "Saving…" : "Next →"}
          </button>
        )}
        {p.activeStep === 4 && (
          <button
            type="button"
            onClick={p.onComplete}
            disabled={p.saving}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-black shadow-md transition-all"
          >
            {p.saving ? "Saving…" : "✓ Complete"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED FIELD COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function LocalityLinkFields({
  selectedLocalityId,
  chooseLocality,
  localities,
  locationName,
  setLocationName,
}: {
  selectedLocalityId: string;
  chooseLocality: (id: string) => void;
  localities: Locality[];
  locationName: string;
  setLocationName: (v: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <label className="block">
        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Saved locality</div>
        <select
          value={selectedLocalityId}
          onChange={(e) => chooseLocality(e.target.value)}
          className="w-full appearance-none rounded-xl border-2 border-gray-100 bg-white p-3.5 font-bold outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="">Manual / new locality</option>
          {localities.map((locality) => (
            <option key={locality.id} value={locality.id}>
              {locality.name || "(Unnamed)"} {locality.type === "trip" ? "(trip)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Location Name</div>
        <input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          disabled={!!selectedLocalityId}
          placeholder="e.g. Charmouth, Lyme Regis"
          className="w-full rounded-xl border-2 border-gray-100 bg-white p-3.5 font-bold outline-none transition-all focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-950"
        />
      </label>
      {selectedLocalityId && (
        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
          This find will stay linked to the selected saved locality. Choose Manual / new locality to type a different place.
        </p>
      )}
    </div>
  );
}

function FormationField({ formation, setFormation }: {
  formation: string;
  setFormation: (v: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Formation</div>
      <input
        value={formation}
        onChange={(e) => setFormation(e.target.value)}
        placeholder="e.g. Blue Lias Formation"
        className="w-full rounded-xl border-2 border-gray-100 bg-white p-3.5 font-bold outline-none transition-all focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
      />
    </label>
  );
}

function PeriodStageFields({ period, setPeriod, stage, setStage }: {
  period: string; setPeriod: (v: string) => void;
  stage: string; setStage: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <label className="block">
        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Geological Period</div>
        <input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="e.g. Jurassic"
          list="periods-list"
          className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-blue-600 dark:text-blue-400"
        />
        <datalist id="periods-list">
          {["Precambrian", "Cambrian", "Ordovician", "Silurian", "Devonian", "Carboniferous", "Permian", "Triassic", "Jurassic", "Cretaceous", "Paleogene", "Neogene", "Quaternary"].map((p) => <option key={p} value={p} />)}
        </datalist>
      </label>
      <label className="block">
        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Geological Stage</div>
        <input
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          placeholder="e.g. Sinemurian"
          list="stages-list"
          className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-blue-600 dark:text-blue-400"
        />
        <datalist id="stages-list">
          {["Hettangian","Sinemurian","Pliensbachian","Toarcian","Aalenian","Bajocian","Bathonian","Callovian","Oxfordian","Kimmeridgian","Tithonian","Berriasian","Valanginian","Hauterivian","Barremian","Aptian","Albian","Cenomanian","Turonian","Coniacian","Santonian","Campanian","Maastrichtian","Danian","Selandian","Thanetian","Ypresian","Lutetian","Bartonian","Priabonian","Rupelian","Chattian","Aquitanian","Burdigalian","Langhian","Serravallian","Tortonian","Messinian","Zanclean","Piacenzian","Gelasian","Calabrian","Chibanian","Tarantian","Tournaisian","Visean","Serpukhovian","Bashkirian","Moscovian","Kasimovian","Gzhelian","Lochkovian","Pragian","Emsian","Eifelian","Givetian","Frasnian","Famennian","Rhuddanian","Aeronian","Telychian","Sheinwoodian","Homerian","Gorstian","Ludfordian","Tremadocian","Floian","Dapingian","Darriwilian","Sandbian","Katian","Hirnantian"].sort().map((s) => <option key={s} value={s} />)}
        </datalist>
      </label>
    </div>
  );
}

function GpsBlock({ lat, lon, doGPS, setIsPickingLocation, setLat, setLon, setAcc, compact }: {
  lat: number | null; lon: number | null;
  doGPS: () => void;
  setIsPickingLocation: (v: boolean) => void;
  setLat: (v: number | null) => void;
  setLon: (v: number | null) => void;
  setAcc: (v: number | null) => void;
  compact?: boolean;
}) {
  const coordsLabel = formatCoords(lat, lon);
  const osGridRef = formatOsGridRef(lat, lon, 8);
  const [ngrInput, setNgrInput] = useState("");
  const [ngrError, setNgrError] = useState("");

  function applyNgrInput() {
    const value = ngrInput.trim();
    if (!value) {
      setNgrError("");
      return;
    }
    try {
      const parsed = parseOsGridRef(value);
      setLat(parsed.lat);
      setLon(parsed.lon);
      setAcc(null);
      setNgrInput(formatOsGridRef(parsed.lat, parsed.lon, 8) ?? value.toUpperCase());
      setNgrError("");
    } catch {
      setNgrError(OS_GRID_INVALID_MESSAGE);
    }
  }

  return (
    <div className="bg-blue-50/50 dark:bg-blue-900/20 p-5 rounded-2xl border-2 border-blue-100/50 dark:border-blue-800/30 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col gap-1 w-full">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">GPS Find spot</div>
          <div className="text-sm sm:text-lg font-mono font-bold text-gray-800 dark:text-gray-100 break-all">
            {coordsLabel ?? <span className="opacity-40 italic text-sm">Coordinates not set</span>}
          </div>
          {osGridRef && (
            <div className="text-xs font-bold text-blue-700 dark:text-blue-300">
              OS grid ref {osGridRef}
            </div>
          )}
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {!compact && (
            <button
              type="button"
              onClick={() => setIsPickingLocation(true)}
              className="flex-1 sm:flex-none bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1 hover:bg-blue-600 hover:text-white"
            >
              🗺️ Pick on Map
            </button>
          )}
          <button
            type="button"
            onClick={doGPS}
            className="flex-1 sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap text-sm"
          >
            📍 {coordsLabel ? "Update GPS" : "Get GPS"}
          </button>
        </div>
      </div>
      {!compact && (
        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1">
            <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest text-blue-600 dark:text-blue-400">Latitude</span>
            <input
              type="number" step="0.000001" placeholder="54.500000"
              className="w-full bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800 rounded-xl p-2.5 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              value={lat ?? ""}
              onChange={(e) => setLat(e.target.value ? parseFloat(e.target.value) : null)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest text-blue-600 dark:text-blue-400">Longitude</span>
            <input
              type="number" step="0.000001" placeholder="-2.000000"
              className="w-full bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800 rounded-xl p-2.5 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              value={lon ?? ""}
              onChange={(e) => setLon(e.target.value ? parseFloat(e.target.value) : null)}
            />
          </label>
        </div>
      )}
      <label className="grid gap-1">
        <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest text-blue-600 dark:text-blue-400">OS grid ref</span>
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          placeholder="TF 3940 0490"
          className={`w-full bg-white dark:bg-gray-900 border rounded-xl p-2.5 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none ${ngrError ? "border-red-300 dark:border-red-700" : "border-blue-100 dark:border-blue-800"}`}
          value={ngrInput}
          onChange={(e) => {
            setNgrInput(e.target.value.toUpperCase());
            if (ngrError) setNgrError("");
          }}
          onBlur={applyNgrInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyNgrInput();
            }
          }}
        />
        {ngrError && <span className="text-[11px] font-bold text-red-600 dark:text-red-300">{ngrError}</span>}
      </label>
    </div>
  );
}

function MeasurementFields({ weightG, setWeightG, lengthMm, setLengthMm, widthMm, setWidthMm, thicknessMm, setThicknessMm }: {
  weightG: string; setWeightG: (v: string) => void;
  lengthMm: string; setLengthMm: (v: string) => void;
  widthMm: string; setWidthMm: (v: string) => void;
  thicknessMm: string; setThicknessMm: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { label: "Weight (g)", val: weightG, set: setWeightG, step: "0.01" },
        { label: "Length (mm)", val: lengthMm, set: setLengthMm, step: "0.1" },
        { label: "Width (mm)", val: widthMm, set: setWidthMm, step: "0.1" },
        { label: "Thick (mm)", val: thicknessMm, set: setThicknessMm, step: "0.1" },
      ].map(({ label, val, set, step }) => (
        <label key={label} className="block">
          <div className="mb-2 text-[10px] font-black uppercase tracking-widest opacity-60">{label}</div>
          <input
            type="number" step={step} value={val}
            onChange={(e) => set(e.target.value)}
            className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
          />
        </label>
      ))}
    </div>
  );
}

function ElementPreservationFields({ element, setElement, isCustomElement, setIsCustomElement, preservation, setPreservation }: {
  element: string; setElement: (v: string) => void;
  isCustomElement: boolean; setIsCustomElement: (v: boolean) => void;
  preservation: Specimen["preservation"]; setPreservation: (v: Specimen["preservation"]) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <label className="block">
        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Anatomical Element</div>
        <div className="grid gap-2">
          <select
            value={isCustomElement ? "CUSTOM" : element}
            onChange={(e) => {
              if (e.target.value === "CUSTOM") { setIsCustomElement(true); setElement(""); }
              else { setIsCustomElement(false); setElement(e.target.value); }
            }}
            className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium appearance-none"
          >
            <option value="">-- Select Element --</option>
            {commonElements.map((e) => <option key={e} value={e}>{e}</option>)}
            <option value="CUSTOM">✎ Custom / Not Listed…</option>
          </select>
          {isCustomElement && (
            <input
              value={element}
              onChange={(e) => setElement(e.target.value)}
              placeholder="Type custom element…"
              autoFocus
              className="w-full bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
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
  );
}

function ContextFields({ findContext, setFindContext, taphonomy, setTaphonomy }: {
  findContext: string; setFindContext: (v: string) => void;
  taphonomy: string; setTaphonomy: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <label className="block">
        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Find Context</div>
        <textarea
          value={findContext}
          onChange={(e) => setFindContext(e.target.value)}
          rows={3}
          placeholder="In situ, loose block, beach shingle, cliff fall, nodule split, spoil heap…"
          className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
        />
      </label>
      <label className="block">
        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Taphonomy / Preservation Notes</div>
        <textarea
          value={taphonomy}
          onChange={(e) => setTaphonomy(e.target.value)}
          rows={3}
          placeholder="Abraded, compressed, pyritised, phosphatic, articulated, rolled, encrusted…"
          className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
        />
      </label>
    </div>
  );
}

function StorageFields({ bagBoxId, setBagBoxId, storageLocation, setStorageLocation, notes, setNotes }: {
  bagBoxId: string; setBagBoxId: (v: string) => void;
  storageLocation: string; setStorageLocation: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
}) {
  return (
    <>
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
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHOTO PANEL (desktop sidebar)
// ─────────────────────────────────────────────────────────────────────────────

function PhotoPanel({ savedId, media, addPhotos, removePhoto, replacePhoto, movePhoto, setAnnotatingMedia }: {
  savedId: string | null;
  media: Media[];
  addPhotos: (files: FileList | null, photoType?: Media["photoType"]) => void;
  removePhoto: (id: string) => void;
  replacePhoto: (id: string, files: FileList | null) => void;
  movePhoto: (id: string, direction: -1 | 1) => void;
  setAnnotatingMedia: (v: { media: Media; url: string } | null) => void;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-inner flex flex-col gap-6 h-fit sticky top-4">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-black text-gray-800 dark:text-gray-100 uppercase tracking-tight m-0 flex items-center gap-2">
            <Camera className="w-5 h-5" /> Photos
          </h2>
          {savedId && <span className="text-[10px] font-mono font-bold bg-white dark:bg-gray-800 px-2 py-1 rounded shadow-sm">{media.length} {media.length === 1 ? 'photo' : 'photos'}</span>}
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          Take at least one context photo and one scale/detail photo before cleaning or trimming matrix.
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "In situ", type: "in-situ" as const, icon: Camera, cls: "amber" },
            { label: "With scale", type: "in-situ" as const, icon: Ruler, cls: "blue" },
            { label: "Cleaned", type: "laboratory" as const, icon: Microscope, cls: "indigo" },
            { label: "Detail", type: "laboratory" as const, icon: ClipboardList, cls: "purple" },
          ].map(({ label, type, icon: Icon, cls }) => (
            <label
              key={label}
              className={`aspect-square rounded-2xl font-black text-[10px] shadow-sm transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center border-2 uppercase tracking-widest ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : `bg-${cls}-50 dark:bg-${cls}-900/10 border-${cls}-200 dark:border-${cls}-800/50 text-${cls}-700 dark:text-${cls}-400 hover:bg-${cls}-100`}`}
            >
              <Icon className="w-6 h-6" />
              <span>{label}</span>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => addPhotos(e.target.files, type)} disabled={!savedId} className="hidden" />
            </label>
          ))}
        </div>
        <label className={`w-full px-4 py-3 rounded-xl font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2 border ${!savedId ? "bg-gray-100 text-gray-400 cursor-not-allowed border-transparent" : "bg-white dark:bg-gray-800 hover:bg-gray-50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"}`}>
          Upload Files
          <input type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} disabled={!savedId} className="hidden" />
        </label>
      </div>

      {!savedId && (
        <div className="text-center py-16 opacity-30 italic text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl">
          Record find first to unlock photos.
        </div>
      )}

      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1">
          {media.map((m, index) => (
            <PhotoThumb
              key={m.id}
              mediaId={m.id}
              filename={m.filename}
              index={index}
              count={media.length}
              onAnnotate={(med, url) => setAnnotatingMedia({ media: med, url })}
              onRemove={removePhoto}
              onReplace={replacePhoto}
              onMove={movePhoto}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHOTO THUMB
// ─────────────────────────────────────────────────────────────────────────────

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
    db.media.get(props.mediaId).then((m) => { if (active && m) setMedia(m); });
    return () => { active = false; };
  }, [props.mediaId]);

  if (!media) return <div className="w-full h-32 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg" />;

  return (
    <div className="grid gap-1.5">
      <div
        className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden aspect-square shadow-sm cursor-pointer"
        onClick={() => props.onAnnotate(media, URL.createObjectURL(media.blob))}
      >
        <ScaledImage media={media} imgClassName="object-cover" className="w-full h-full" />
        <div className="pointer-events-none absolute inset-0 bg-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="bg-white dark:bg-gray-800 text-[8px] font-black px-2 py-1 rounded-full shadow-sm uppercase tracking-widest">Annotate</span>
        </div>
        <div className="absolute top-1 left-1 right-1 z-20 flex items-center justify-between gap-1">
          <div className="flex gap-1">
            <button type="button" title="Move earlier" aria-label="Move photo earlier" disabled={props.index === 0}
              onClick={(e) => { e.stopPropagation(); props.onMove(props.mediaId, -1); }}
              className="grid h-6 w-6 place-items-center rounded bg-white/90 text-slate-700 shadow-sm disabled:opacity-35 dark:bg-slate-900/90 dark:text-slate-100">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Move later" aria-label="Move photo later" disabled={props.index === props.count - 1}
              onClick={(e) => { e.stopPropagation(); props.onMove(props.mediaId, 1); }}
              className="grid h-6 w-6 place-items-center rounded bg-white/90 text-slate-700 shadow-sm disabled:opacity-35 dark:bg-slate-900/90 dark:text-slate-100">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <button type="button" title="Delete photo" aria-label="Delete photo"
            onClick={(e) => { e.stopPropagation(); props.onRemove(props.mediaId); }}
            className="grid h-6 w-6 place-items-center rounded bg-red-600 text-white shadow-sm">
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
            <span className={`px-1 rounded uppercase text-[7px] font-black ${media.photoType === "in-situ" ? "bg-amber-100 text-amber-800" : media.photoType === "laboratory" ? "bg-indigo-100 text-indigo-800" : "bg-gray-100 text-gray-800"}`}>
              {media.photoType === "in-situ" ? "Field" : media.photoType === "laboratory" ? "Lab" : "Photo"}
            </span>
          )}
        </div>
      </div>
      <input
        type="text"
        value={media.caption || ""}
        onClick={(e) => e.stopPropagation()}
        onChange={async (e) => {
          const caption = e.target.value;
          setMedia({ ...media, caption });
          await db.media.update(media.id, { caption });
        }}
        placeholder="Caption (optional)"
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-900"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION TITLE
// ─────────────────────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title, detail }: {
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
