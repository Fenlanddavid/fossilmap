import React, { useEffect, useState, useMemo } from "react";
import { db, Locality, Specimen, Media } from "../db";
import { v4 as uuid } from "uuid";
import { captureGPS } from "../services/gps";
import { formatCoords, getFiniteCoords } from "../services/coords";
import { lookupBGSGeology, BGSResult } from "../services/bgs";
import { checkSSSI, type SSSIResult } from "../services/sssi";
import { useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { SpecimenRow } from "../components/SpecimenRow";
import { FieldTripReport } from "../components/FieldTripReport";
import { SessionFindsList } from "../components/SessionFindsList";
import { TideBar } from "../components/TideBar";
import { useConfirmDialog } from "../components/ConfirmModal";
import { SpecimenLabelSheet } from "../components/SpecimenLabelSheet";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, FlaskConical, Printer, ShieldAlert } from "lucide-react";

const SpecimenModal = React.lazy(() =>
  import("../components/SpecimenModal").then((mod) => ({ default: mod.SpecimenModal }))
);
const LocationPickerModal = React.lazy(() =>
  import("../components/LocationPickerModal").then((mod) => ({ default: mod.LocationPickerModal }))
);

const exposureTypes: Locality["exposureType"][] = [
  "beach shingle", "foreshore platform", "cliff fall / landslip debris",
  "in situ cliff/face", "quarry face", "quarry spoil", "mine tip/spoil heap",
  "stream bed", "ploughed field", "building stone / walling", "other",
];

const lithologies: Locality["lithologyPrimary"][] = [
  "mudstone", "shale", "siltstone", "sandstone", "limestone", "chalk", 
  "Oxford Clay", "London Clay", "Kimmeridge Clay", "Gault Clay", "clay",
  "marl", "conglomerate", "ironstone", "coal", "chert/flint", "phosphatic nodule", "other",
];

export default function LocalityPage(props: {
  projectId: string;
  type?: "location" | "trip";
  onSaved: (id: string) => void;
}) {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = !!id;
  const { confirm: confirmAction, notify, dialog } = useConfirmDialog();

  const [localityType, setLocalityType] = useState<"location" | "trip">(props.type || "location");
  const [name, setName] = useState("");
  const [collector, setCollector] = useState("");
  const [observedAt, setObservedAt] = useState(new Date().toISOString().slice(0, 16));
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [acc, setAcc] = useState<number | null>(null);

  const [exposureType, setExposureType] = useState<Locality["exposureType"]>("beach shingle");
  const [sssi, setSssi] = useState(false);
  const [sssiName, setSssiName] = useState("");
  const [sssiCountry, setSssiCountry] = useState<SSSIResult["country"]>("unknown");
  const [sssiChecking, setSssiChecking] = useState(false);
  const [sssiNotice, setSssiNotice] = useState("");
  const [rigs, setRigs] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const [period, setPeriod] = useState("");
  const [stage, setStage] = useState("");
  const [formation, setFormation] = useState("");
  const [member, setMember] = useState("");
  const [bed, setBed] = useState("");
  const [lithologyPrimary, setLithologyPrimary] = useState<Locality["lithologyPrimary"]>("mudstone");
  const [notes, setNotes] = useState("");
  const [designationNotes, setDesignationNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isEditing, setIsEditing] = useState(!isEdit);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [bgsLoading, setBgsLoading] = useState(false);
  const [bgsResult, setBgsResult] = useState<BGSResult | null>(null);
  const [bgsError, setBgsError] = useState<string | null>(null);

  const [openFindId, setOpenFindId] = useState<string | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetLocalityId, setMoveTargetLocalityId] = useState("");
  const [showLabelSheet, setShowLabelSheet] = useState(false);

  const defaultCollector = useLiveQuery(async () => {
    const s = await db.settings.get("defaultCollector");
    return s?.value;
  }, []);

  useEffect(() => {
    if (!isEdit && defaultCollector) {
      setCollector(defaultCollector);
    }
  }, [isEdit, defaultCollector]);

  // Fetch finds for this trip/location
  const finds = useLiveQuery(async () => {
    if (!id) return [];
    return db.specimens.where("localityId").equals(id).reverse().sortBy("createdAt");
  }, [id]);

  const otherLocalities = useLiveQuery(async () => {
    if (!id) return [];
    const rows = await db.localities.where("projectId").equals(props.projectId).toArray();
    return rows
      .filter((l) => l.id !== id)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [id, props.projectId]);

  // Fetch sessions for this location
  const sessions = useLiveQuery(async () => {
      if (!id || localityType !== 'location') return [];
      const rows = await db.sessions.where("localityId").equals(id).reverse().sortBy("createdAt");
      return Promise.all(rows.map(async (s) => {
          const findCount = await db.specimens.where("sessionId").equals(s.id).count();
          return { ...s, findCount };
      }));
  }, [id, localityType]);

  // Fetch all media for the report
  const allMedia = useLiveQuery(async () => {
    if (!id || !finds) return [];
    const ids = finds.map(s => s.id);
    return db.media.where("specimenId").anyOf(ids).toArray();
  }, [id, finds]);

  // Fetch thumbnails and scale info for the finds
  const findThumbMedia = useMemo(() => {
    const info = new Map<string, Media>();
    if (!allMedia || !finds) return info;
    
    const sortedMedia = [...allMedia].sort((a, b) => {
        const aDate = a?.createdAt || "";
        const bDate = b?.createdAt || "";
        return aDate.localeCompare(bDate);
    });
    for (const row of sortedMedia) {
      if (row.specimenId && !info.has(row.specimenId)) {
        info.set(row.specimenId, row);
      }
    }
    return info;
  }, [allMedia, finds]);

  useEffect(() => {
    if (id) {
      db.localities.get(id).then(l => {
        if (l) {
          setLocalityType(l.type || "location");
          setName(l.name);
          setCollector(l.collector);
          setObservedAt(new Date(l.observedAt).toISOString().slice(0, 16));
          setLat(l.lat);
          setLon(l.lon);
          setAcc(l.gpsAccuracyM);
          setExposureType(l.exposureType);
          setSssi(l.sssi || false);
          setSssiName(l.sssiName || "");
          setSssiCountry(l.sssiCountry || "unknown");
          setRigs(l.rigs || false);
          setPermissionGranted(l.permissionGranted || false);
          setPeriod(l.period || "");
          setStage(l.stage || "");
          setFormation(l.formation);
          setMember(l.member);
          setBed(l.bed);
          setLithologyPrimary(l.lithologyPrimary);
          setNotes(l.notes);
          setDesignationNotes(l.designationNotes || "");
        }
        setLoading(false);
      });
    }
  }, [id]);

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

  async function doBGSLookup() {
    const coords = getFiniteCoords(lat, lon);
    if (!coords) return;
    setBgsLoading(true);
    setBgsError(null);
    setBgsResult(null);
    try {
      const result = await lookupBGSGeology(coords.lat, coords.lon);
      setBgsResult(result);
    } catch (e: any) {
      setBgsError(e?.message ?? "BGS lookup failed");
    } finally {
      setBgsLoading(false);
    }
  }

  function applyBGSResult() {
    if (!bgsResult) return;
    if (bgsResult.formation && !formation) setFormation(bgsResult.formation);
    if (bgsResult.period && !period) setPeriod(bgsResult.period);
    if (bgsResult.stage && !stage) setStage(bgsResult.stage);
    setBgsResult(null);
  }

  function applyBGSResultOverwrite() {
    if (!bgsResult) return;
    if (bgsResult.formation) setFormation(bgsResult.formation);
    if (bgsResult.period) setPeriod(bgsResult.period);
    if (bgsResult.stage) setStage(bgsResult.stage);
    setBgsResult(null);
  }

  function applySSSIResult(result: SSSIResult) {
    setSssiCountry(result.country);
    if (result.isSSSI) {
      setSssi(true);
      setSssiName(result.siteName);
      setDesignationNotes((current) => mergeDesignationNote(current, result));
    }
  }

  async function doSSSICheck() {
    const coords = getFiniteCoords(lat, lon);
    if (!coords) {
      setSssiNotice("Add GPS coordinates before checking SSSI status.");
      return;
    }
    setSssiChecking(true);
    setSssiNotice("");
    try {
      const result = await checkSSSI(coords.lat, coords.lon);
      setSssiCountry(result.country);
      if (result.isSSSI) {
        applySSSIResult(result);
        setSssiNotice(result.siteName ? `SSSI found: ${result.siteName}` : "SSSI found at these coordinates.");
      } else {
        setSssi(false);
        setSssiName("");
        if (result.country === "wales") {
          setSssiNotice("Wales SSSI data is not fully available here. Check the NRW Lle portal.");
        } else if (result.country === "unknown") {
          setSssiNotice("SSSI check unavailable. Try again when you have a network connection.");
        } else {
          setSssiNotice("No SSSI designation found at these coordinates.");
        }
      }
    } finally {
      setSssiChecking(false);
    }
  }

  function mergeDesignationNote(current: string, result: SSSIResult): string {
    const site = result.siteName || "Unnamed SSSI";
    const authority = result.country === "scotland" ? "NatureScot" : "Natural England";
    const attribution = result.country === "scotland" ? "© NatureScot, OGL v3.0" : "© Natural England, OGL v3.0";
    const featureText = result.notifiedFeatures ? ` Notified features: ${result.notifiedFeatures}.` : "";
    const note = `SSSI: ${site}. Check designation notice and consent requirements with ${authority} before collecting.${featureText} Source: ${attribution}.`;
    const trimmed = current.trim();
    if (trimmed.includes(`SSSI: ${site}`)) return current;
    return trimmed ? `${trimmed}\n${note}` : note;
  }

  async function handleDelete() {
    if (!id) return;
    const term = localityType === 'location' ? 'location' : 'field trip';
    const ok = await confirmAction({
      title: `Delete this ${term}?`,
      message: `This will permanently delete the ${term}, all sessions, all finds recorded during it, and their photos.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    
    setSaving(true);
    try {
      await db.transaction("rw", db.localities, db.sessions, db.specimens, db.media, async () => {
        const specimens = await db.specimens.where("localityId").equals(id).toArray();
        const specimenIds = specimens.map(s => s.id);
        await db.media.where("specimenId").anyOf(specimenIds).delete();
        await db.specimens.where("localityId").equals(id).delete();
        await db.sessions.where("localityId").equals(id).delete();
        await db.localities.delete(id);
      });
      nav("/");
    } catch (e: any) {
      setError("Delete failed: " + e.message);
      setSaving(false);
    }
  }

  async function moveFindsTo(targetLocalityId: string) {
    if (!id || !finds || finds.length === 0) return;
    const targetLocality = await db.localities.get(targetLocalityId);
    if (!targetLocality) {
      setError("Choose a destination locality first.");
      return;
    }

    const ok = await confirmAction({
      title: "Move all finds?",
      message: `Move ${finds.length} find(s) from "${name || "this locality"}" to "${targetLocality.name || "the selected locality"}"? Existing visit/session links will be cleared.`,
      confirmLabel: "Move",
      tone: "warning",
    });
    if (!ok) return;

    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await db.transaction("rw", db.specimens, async () => {
        await db.specimens.bulkPut(
          finds.map((find) => ({
            ...find,
            localityId: targetLocalityId,
            sessionId: null,
            updatedAt: now,
          }))
        );
      });
      setShowMoveModal(false);
      setMoveTargetLocalityId("");
      await notify({
        title: "Finds moved",
        message: `${finds.length} find(s) moved to "${targetLocality.name || "the selected locality"}".`,
        tone: "success",
      });
    } catch (e: any) {
      setError("Move failed: " + (e?.message ?? "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const isoObserved = new Date(observedAt).toISOString();
      const now = new Date().toISOString();
      const finalId = id || uuid();

      const locality: Locality = {
        id: finalId,
        projectId: props.projectId,
        type: localityType,
        name,
        lat,
        lon,
        gpsAccuracyM: acc,
        observedAt: isoObserved,
        collector,
        exposureType,
        sssi,
        sssiName: sssiName || undefined,
        sssiCountry,
        rigs,
        permissionGranted,
        period,
        stage,
        formation,
        member,
        bed,
        lithologyPrimary,
        notes,
        designationNotes,
        createdAt: now,
        updatedAt: now,
      };

      if (isEdit) {
        const { createdAt, ...patch } = locality;
        await db.localities.update(id, patch);
        setIsEditing(false);
        void notify({
          title: `${localityType === 'location' ? 'Location' : 'Field trip'} updated`,
          message: "The record has been saved to your local FossilMap field book.",
          tone: "success",
        });
      } else {
        await db.localities.add(locality);
        
        // If it's a field trip, create an automatic session for it
        if (localityType === "trip") {
          await db.sessions.add({
            id: uuid(),
            projectId: props.projectId,
            localityId: finalId,
            startTime: now,
            endTime: null,
            notes: "Automatic session for field trip",
            isFinished: false as any,
            createdAt: now,
            updatedAt: now,
          });
        }
        
        setIsEditing(false);
        props.onSaved(finalId);
      }
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) return <div className="p-10 text-center opacity-50 font-medium">Loading details...</div>;

  const currentLocality: Locality | null = id ? {
    id, projectId: props.projectId, type: localityType, name, lat, lon, gpsAccuracyM: acc, observedAt, collector,
    exposureType, sssi, sssiName: sssiName || undefined, sssiCountry, rigs, permissionGranted, period, stage, formation, member, bed, lithologyPrimary, notes,
    designationNotes,
    createdAt: "", updatedAt: ""
  } : null;

  const isTrip = localityType === 'trip';
  const labelData = currentLocality && finds
    ? finds.map((find) => ({
      specimen: find,
      locality: currentLocality,
      media: findThumbMedia.get(find.id) ?? null,
    }))
    : [];
  const coords = getFiniteCoords(lat, lon);
  const coordsLabel = formatCoords(lat, lon);
  const completenessItems = [
    { label: "Name", done: !!name.trim() },
    { label: "GPS", done: !!coords },
    { label: "Collector", done: !!collector.trim() },
    { label: "Period", done: !!period.trim() },
    { label: "Stage", done: !!stage.trim() },
    { label: "Formation", done: !!formation.trim() },
    { label: "Lithology", done: !!lithologyPrimary },
  ];
  const completenessCount = completenessItems.filter(item => item.done).length;
  const completenessPercent = Math.round((completenessCount / completenessItems.length) * 100);
  const hasConservationInfo = sssi || rigs || !!sssiName || !!designationNotes.trim();

  return (
    <div className="max-w-4xl mx-auto w-full min-w-0 pb-20 px-2 sm:px-4">
      <div className="no-print grid min-w-0 gap-8 mt-4">
        <div className="flex min-w-0 flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex min-w-0 flex-wrap gap-3 items-center">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight">
                    {isEdit ? (isTrip ? "Field Trip Details" : "Location Details") : (isTrip ? "New Field Trip" : "New Location")}
                </h2>
                {isEdit && !isEditing && (
                    <button 
                        onClick={() => setIsEditing(true)}
                        className="text-xs font-bold text-blue-600 hover:text-white hover:bg-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-lg border border-blue-200 dark:border-blue-800 transition-all"
                    >
                        ✎ Edit Details
                    </button>
                )}
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {isEdit && (
                    <>
                        <button 
                            onClick={handlePrint}
                            className="text-xs sm:text-sm font-bold text-blue-600 hover:text-white hover:bg-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-lg border border-blue-200 dark:border-blue-800 transition-all flex-1 sm:flex-none"
                        >
                            PDF Report
                        </button>
                        {!isEditing && (finds?.length ?? 0) > 0 && (
                            <button
                                onClick={() => setShowLabelSheet(true)}
                                className="text-xs sm:text-sm font-bold text-emerald-700 hover:text-white hover:bg-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300 px-3 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-all flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5"
                            >
                                <Printer className="h-3.5 w-3.5" />
                                Print labels
                            </button>
                        )}
                        {!isEditing && (finds?.length ?? 0) > 0 && (
                            <button
                                onClick={() => {
                                    setMoveTargetLocalityId(otherLocalities?.[0]?.id ?? "");
                                    setShowMoveModal(true);
                                }}
                                disabled={saving || (otherLocalities?.length ?? 0) === 0}
                                className="text-xs sm:text-sm font-bold text-slate-600 hover:text-white hover:bg-slate-700 bg-white dark:bg-slate-900 dark:text-slate-300 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50 flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5"
                            >
                                <ArrowRight className="h-3.5 w-3.5" />
                                Move finds
                            </button>
                        )}
                        <button 
                            onClick={handleDelete}
                            disabled={saving}
                            className="text-xs sm:text-sm font-bold text-red-600 hover:text-white hover:bg-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-lg border border-red-200 dark:border-red-800 transition-all disabled:opacity-50 flex-1 sm:flex-none"
                        >
                            Delete
                        </button>
                    </>
                )}
                <button onClick={() => nav("/")} className="text-xs sm:text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors flex-1 sm:flex-none">Home</button>
            </div>
        </div>

        {error && (
            <div className="border-2 border-red-200 bg-red-50 text-red-800 p-4 rounded-xl shadow-sm flex gap-3 items-center font-medium">
                <span className="text-xl">⚠️</span> {error}
            </div>
        )}

        <div className="grid min-w-0 lg:grid-cols-3 gap-8">
            {/* Left Column: Info */}
            <div className="min-w-0 lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-6 shadow-sm grid gap-6 h-fit">
                {isEditing ? (
                  <>
                    <label className="block">
                    <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Name / Location</div>
                    <input 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        placeholder="e.g., Charmouth Coast, Lyme Regis" 
                        className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    />
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <label className="block">
                            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Collector / Lead</div>
                            <input 
                                value={collector} 
                                onChange={(e) => setCollector(e.target.value)} 
                                placeholder="Name or initials" 
                                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                            />
                        </label>

                        <label className="block">
                            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Date & Time</div>
                            <input 
                                type="datetime-local" 
                                value={observedAt} 
                                onChange={(e) => setObservedAt(e.target.value)} 
                                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                            />
                        </label>
                    </div>

                    <div className="min-w-0 bg-blue-50/50 dark:bg-blue-900/20 p-4 sm:p-5 rounded-2xl border-2 border-blue-100/50 dark:border-blue-800/30 flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                            <div className="flex flex-col gap-1 w-full">
                                <div className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">GPS Location</div>
                                <div className="text-sm sm:text-lg font-mono font-bold text-gray-800 dark:text-gray-100">
                                    {coords ? (
                                    <div className="flex items-center gap-2">
                                        {coordsLabel}
                                        {typeof acc === "number" ? <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">±{Math.round(acc)}m</span> : ""}
                                    </div>
                                    ) : (
                                    <span className="opacity-40 italic">Coordinates not set</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex min-w-0 gap-2 w-full sm:w-auto">
                                <button 
                                    type="button" 
                                    onClick={() => setIsPickingLocation(true)} 
                                    className="flex-1 sm:flex-none bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1 hover:bg-blue-600 hover:text-white"
                                >
                                    🗺️ Pick on Map
                                </button>
                                <button 
                                    type="button"
                                    onClick={doGPS} 
                                    className="flex-1 sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-6 py-2.5 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2"
                                >
                                    📍 {coords ? "Update GPS" : "Get Current GPS"}
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

                    {/* BGS Geology Auto-populate */}
                    {coords && (
                      <div className="rounded-xl border border-purple-200 dark:border-purple-800/40 bg-purple-50 dark:bg-purple-900/10 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">BGS Bedrock Geology</div>
                            <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">Auto-fill formation and period from British Geological Survey data</div>
                          </div>
                          <button
                            type="button"
                            onClick={doBGSLookup}
                            disabled={bgsLoading}
                            className="shrink-0 flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all"
                          >
                            <FlaskConical className="w-3.5 h-3.5" />
                            {bgsLoading ? "Looking up…" : "Look up BGS"}
                          </button>
                        </div>

                        {bgsError && (
                          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 p-3 text-xs text-red-700 dark:text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{bgsError}</span>
                          </div>
                        )}

                        {bgsResult && (
                          <div className="mt-3 min-w-0 rounded-lg border border-purple-300 dark:border-purple-700/40 bg-white dark:bg-gray-900/50 p-3 sm:p-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 mb-3">BGS result — confirm to apply</div>
                            <div className="grid min-w-0 grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                              {bgsResult.formation && (
                                <div className="min-w-0">
                                  <div className="font-black uppercase text-[9px] text-gray-400 tracking-wider">Formation</div>
                                  <div className="break-words font-bold text-gray-800 dark:text-gray-200">{bgsResult.formation}</div>
                                </div>
                              )}
                              {bgsResult.period && (
                                <div className="min-w-0">
                                  <div className="font-black uppercase text-[9px] text-gray-400 tracking-wider">Period</div>
                                  <div className="break-words font-bold text-gray-800 dark:text-gray-200">{bgsResult.period}</div>
                                </div>
                              )}
                              {bgsResult.stage && (
                                <div className="min-w-0">
                                  <div className="font-black uppercase text-[9px] text-gray-400 tracking-wider">Stage</div>
                                  <div className="break-words font-bold text-gray-800 dark:text-gray-200">{bgsResult.stage}</div>
                                </div>
                              )}
                              {bgsResult.description && (
                                <div className="min-w-0 sm:col-span-2">
                                  <div className="font-black uppercase text-[9px] text-gray-400 tracking-wider">Description</div>
                                  <div className="break-words text-gray-600 dark:text-gray-400 italic">{bgsResult.description}</div>
                                </div>
                              )}
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={applyBGSResultOverwrite}
                                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-xs font-black transition-all"
                              >
                                Apply
                              </button>
                              <button
                                type="button"
                                onClick={applyBGSResult}
                                className="flex-1 border border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 px-3 py-2 rounded-lg text-xs font-black hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
                              >
                                Keep
                              </button>
                              <button
                                type="button"
                                onClick={() => setBgsResult(null)}
                                className="border border-gray-200 dark:border-gray-700 text-gray-500 px-3 py-2 rounded-lg text-xs font-black hover:bg-gray-50 transition-all"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <label className="block">
                            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Exposure Type</div>
                            <select 
                                value={exposureType} 
                                onChange={(e) => setExposureType(e.target.value as any)}
                                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none font-medium"
                            >
                            {exposureTypes.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                            </select>
                        </label>

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
                        <label className="block">
                            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Primary Lithology</div>
                            <select 
                                value={lithologyPrimary} 
                                onChange={(e) => setLithologyPrimary(e.target.value as any)}
                                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none font-medium text-blue-600 dark:text-blue-400 font-bold"
                            >
                            {lithologies.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                            </select>
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <label className="block">
                            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Formation</div>
                            <input 
                                value={formation} 
                                onChange={(e) => setFormation(e.target.value)} 
                                placeholder="e.g., Blue Lias Fm" 
                                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                            />
                        </label>
                        <label className="block">
                            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Member</div>
                            <input 
                                value={member} 
                                onChange={(e) => setMember(e.target.value)} 
                                placeholder="optional" 
                                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                            />
                        </label>
                        <label className="block">
                            <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Bed / Horizon</div>
                            <input 
                                value={bed} 
                                onChange={(e) => setBed(e.target.value)} 
                                placeholder="e.g., Ammonite Bed" 
                                className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                            />
                        </label>
                    </div>

                    <div className="min-w-0 bg-amber-50/50 dark:bg-amber-900/10 p-4 sm:p-5 rounded-2xl border-2 border-amber-100/50 dark:border-amber-800/30 grid gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Conservation & Access</div>
                            <p className="mt-1 text-xs text-amber-700/70 dark:text-amber-300/70">Use the current coordinates to check protected-site status.</p>
                          </div>
                          <button
                            type="button"
                            onClick={doSSSICheck}
                            disabled={sssiChecking}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                            {sssiChecking ? "Checking SSSI..." : "Check SSSI"}
                          </button>
                        </div>
                        {sssiNotice && (
                          <div className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                            sssi
                              ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
                              : "border-slate-200 bg-white/70 text-slate-600 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300"
                          }`}>
                            {sssiNotice}
                          </div>
                        )}
                        {sssi && (
                          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex gap-3 dark:border-amber-700 dark:bg-amber-950/30">
                            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-black text-amber-900 dark:text-amber-100 text-sm">
                                This location is within a designated SSSI{sssiName ? `: ${sssiName}` : ""}
                              </p>
                              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                                Collecting from SSSIs may require consent from Natural England{sssiCountry === "scotland" ? " / NatureScot" : ""}.
                                Check the designation notice before collecting.
                              </p>
                              <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 mt-2">
                                {sssiCountry === "scotland"
                                  ? "© NatureScot, Open Government Licence v3.0"
                                  : "© Natural England, Open Government Licence v3.0"}
                              </p>
                            </div>
                          </div>
                        )}
                        {sssiCountry === "wales" && !sssi && (
                          <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs font-bold text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
                            Wales SSSI data is not fully available here. Check the NRW Lle portal before collecting.
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={sssi} onChange={(e) => setSssi(e.target.checked)} className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-amber-600">
                                  SSSI Status
                                  {sssiName && !sssi && <span className="ml-1 text-xs text-slate-400">(auto-detected)</span>}
                                </span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={rigs} onChange={(e) => setRigs(e.target.checked)} className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-amber-600">RIGS Status</span>
                            </label>
                        </div>
                        <label className="block">
                            <div className="mb-2 text-[10px] font-bold text-amber-600/70 dark:text-amber-400/70 uppercase">Access / Designation Notes</div>
                            <textarea 
                                value={designationNotes} 
                                onChange={(e) => setDesignationNotes(e.target.value)} 
                                rows={2} 
                                placeholder="e.g. site rules, RIGS boundary details, collecting restrictions..."
                                className="w-full bg-white dark:bg-gray-900 border border-amber-100 dark:border-amber-800 rounded-xl p-3 focus:ring-2 focus:ring-amber-500 outline-none transition-all text-sm"
                            />
                        </label>
                    </div>

                    <label className="block">
                        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Field Notes</div>
                        <textarea 
                            value={notes} 
                            onChange={(e) => setNotes(e.target.value)} 
                            rows={4} 
                            className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        />
                    </label>

                    <div className="flex gap-4">
                        <button 
                            onClick={save} 
                            disabled={saving || !name.trim()} 
                            className={`mt-4 flex-1 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-black text-xl shadow-xl transition-all disabled:opacity-50`}
                        >
                            {saving ? "Saving..." : isEdit ? "Update Details ✓" : (isTrip ? "Start Field Trip →" : "Create Location →")}
                        </button>
                        {isEdit && (
                            <button 
                                onClick={() => setIsEditing(false)}
                                className="mt-4 bg-gray-100 dark:bg-gray-800 text-gray-500 px-6 py-4 rounded-2xl font-bold transition-all"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                  </>
                ) : (
                  <div className="grid gap-8">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                        <div className="min-w-0 flex-1">
                            <span className={`text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded ${isTrip ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                {isTrip ? 'Field Trip' : 'Location'}
                            </span>
                            <h3 className="text-2xl sm:text-3xl font-black text-gray-800 dark:text-gray-100 mt-2 break-words leading-tight">{name}</h3>
                        </div>
                    </div>

                    <TideBar />

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="md:col-span-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-2xl p-4">
                            <div className="flex items-start gap-3">
                                <ClipboardCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <h4 className="m-0 text-sm font-black text-emerald-950 dark:text-emerald-100">Record completeness</h4>
                                        <span className="text-xs font-black text-emerald-800 dark:text-emerald-200">{completenessPercent}%</span>
                                    </div>
                                    <div className="mt-3 h-2 rounded-full bg-emerald-100 dark:bg-emerald-900 overflow-hidden">
                                        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${completenessPercent}%` }} />
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {completenessItems.map(item => (
                                            <span key={item.label} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${item.done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100' : 'bg-white text-gray-500 dark:bg-gray-900 dark:text-gray-400'}`}>
                                                {item.done ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                                {item.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {hasConservationInfo && (
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                            <div className="flex items-start gap-3">
                                <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <h4 className="m-0 text-sm font-black text-amber-950 dark:text-amber-100">
                                        {sssiName ? `SSSI: ${sssiName}` : sssi ? "SSSI flagged" : rigs ? "RIGS flagged" : "Access note recorded"}
                                    </h4>
                                    <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                                        Check current site rules before collecting or publishing precise locations.
                                    </p>
                                    {designationNotes && (
                                        <p className="mt-2 text-xs leading-relaxed text-amber-950 dark:text-amber-100">{designationNotes}</p>
                                    )}
                                    {(sssi || sssiName) && (
                                        <p className="mt-2 text-[10px] font-bold text-amber-800/70 dark:text-amber-200/70">
                                            {sssiCountry === "scotland"
                                                ? "Source: NatureScot, Open Government Licence v3.0"
                                                : sssiCountry === "wales"
                                                    ? "Check NRW Lle for current SSSI details"
                                                    : "Source: Natural England, Open Government Licence v3.0"}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="grid gap-6">
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Stratigraphy</h4>
                                <p className="font-bold text-gray-700 dark:text-gray-300">
                                    {period ? `${period}, ` : ""}{stage ? `${stage}, ` : ""}{formation || "Unknown Formation"}
                                </p>
                                {member && <p className="text-sm opacity-60 italic">{member}</p>}
                                {bed && <p className="text-sm opacity-60">Bed: {bed}</p>}
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Conservation</h4>
                                {hasConservationInfo ? (
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {sssi && <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200 uppercase tracking-tighter">SSSI</span>}
                                        {rigs && <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200 uppercase tracking-tighter">RIGS</span>}
                                    </div>
                                ) : (
                                    <p className="text-sm opacity-40 italic">No designation recorded</p>
                                )}
                            </div>
                        </div>

                        <div className="grid gap-6">
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Details</h4>
                                <p className="font-bold text-gray-700 dark:text-gray-300 capitalize">
                                    {lithologyPrimary}, {exposureType}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Location</h4>
                                {coords ? (
                                    <div className="flex flex-col gap-1">
                                        <p className="font-mono font-bold text-blue-600">{coordsLabel}</p>
                                        <button 
                                            onClick={() => window.open(`https://www.google.com/maps?q=${coords.lat},${coords.lon}`, "_blank")}
                                            className="text-[10px] font-bold text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1"
                                        >
                                            View on Google Maps ↗
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-sm opacity-40 italic">Coordinates not set</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Collector / Date</h4>
                            <p className="font-bold text-gray-700 dark:text-gray-300">{collector || "Not set"}</p>
                            <p className="text-xs opacity-60">{new Date(observedAt).toLocaleDateString()}</p>
                        </div>
                    </div>

                    {notes && (
                        <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                            <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Notes</h4>
                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap italic">{notes}</p>
                        </div>
                    )}
                  </div>
                )}
            </div>

            {/* Right Column: Sessions or Finds */}
            <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-inner h-fit max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 m-0">{isTrip ? "Finds" : "Visits / Sessions"}</h3>
                    <div className="text-xs font-mono bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded font-bold">
                        {(isTrip ? finds?.length : sessions?.length) ?? 0} total
                    </div>
                </div>

                {!isEdit && (
                    <div className="text-center py-10 opacity-50 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl italic text-sm px-4">
                        {isTrip ? "Save this trip first to add finds!" : "Create the location first to start sessions!"}
                    </div>
                )}

                {isEdit && (
                    <div className="grid gap-3">
                        {isTrip ? (
                            <>
                                <button 
                                    onClick={() => nav(`/specimen?localityId=${id}`)}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 mb-2"
                                >
                                    + Add Find to Trip
                                </button>
                                {finds && finds.length > 0 ? (
                                    finds.map((s) => (
                                        <SpecimenRow 
                                            key={s.id} 
                                            specimen={s} 
                                            thumbMedia={findThumbMedia?.get(s.id) ?? null} 
                                            onOpen={() => setOpenFindId(s.id)} 
                                        />
                                    ))
                                ) : (
                                    <div className="text-center py-10 opacity-50 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl italic text-sm">
                                        No finds recorded yet for this trip.
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <button 
                                    onClick={() => nav(`/session/new?locationId=${id}`)}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 mb-4"
                                >
                                    + Log New Visit / Session
                                </button>

                                {sessions && sessions.length > 0 ? (
                                    sessions.map((s: any) => (
                                        <button 
                                            key={s.id} 
                                            onClick={() => nav(`/session/${s.id}`)}
                                            className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-xl shadow-sm hover:border-blue-500 transition-all group"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="font-bold text-gray-800 dark:text-gray-100 group-hover:text-blue-600">
                                                    {new Date(s.startTime).toLocaleDateString()}
                                                </div>
                                                {!s.isFinished && (
                                                    <span className="text-[8px] bg-red-600 text-white px-1.5 py-0.5 rounded font-black animate-pulse uppercase tracking-widest">Active</span>
                                                )}
                                            </div>
                                            <div className="text-xs opacity-60 mt-1 flex justify-between items-center">
                                                <span>{new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                {s.findCount > 0 && (
                                                    <span className="text-[10px] font-black bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">
                                                        {s.findCount} {s.findCount === 1 ? 'Find' : 'Finds'}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <SessionFindsList sessionId={s.id} />

                                            {s.notes && (
                                                <div className="mt-2 text-[10px] font-mono opacity-40 italic line-clamp-1">
                                                    {s.notes}
                                                </div>
                                            )}
                                        </button>
                                    ))
                                ) : (
                                    <div className="text-center py-10 opacity-50 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl italic text-sm">
                                        No visits logged for this location.
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>

      {isEdit && currentLocality && finds && allMedia && (
        <div className="hidden print:block">
            <FieldTripReport locality={currentLocality} finds={finds} media={allMedia} />
        </div>
      )}

      {showMoveModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4">
              <h3 className="m-0 text-base font-black text-slate-950 dark:text-white">Move finds</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Move all {(finds?.length ?? 0)} find(s) from this locality to another saved locality or trip.
              </p>
            </div>

            <label className="block">
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Destination</div>
              <select
                value={moveTargetLocalityId}
                onChange={(e) => setMoveTargetLocalityId(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-100 bg-white p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
              >
                {(otherLocalities ?? []).map((locality) => (
                  <option key={locality.id} value={locality.id}>
                    {locality.name || "(Unnamed locality)"} {locality.type === "trip" ? "(trip)" : "(location)"}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowMoveModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => moveFindsTo(moveTargetLocalityId)}
                disabled={!moveTargetLocalityId || saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <ArrowRight className="h-4 w-4" />
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {showLabelSheet && labelData.length > 0 && (
        <SpecimenLabelSheet labels={labelData} onClose={() => setShowLabelSheet(false)} />
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
      {openFindId && (
        <React.Suspense fallback={null}>
          <SpecimenModal specimenId={openFindId} onClose={() => setOpenFindId(null)} />
        </React.Suspense>
      )}
      {dialog}
    </div>
  );
}
