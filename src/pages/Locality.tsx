import React, { useEffect, useState, useMemo } from "react";
import { db, Locality, Specimen, Media } from "../db";
import { v4 as uuid } from "uuid";
import { captureGPS } from "../services/gps";
import { useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { SpecimenRow } from "../components/SpecimenRow";
import { SpecimenModal } from "../components/SpecimenModal";
import { FieldTripReport } from "../components/FieldTripReport";

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
  onSaved: (id: string) => void;
}) {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = !!id;

  const [name, setName] = useState("");
  const [collector, setCollector] = useState("");
  const [observedAt, setObservedAt] = useState(new Date().toISOString().slice(0, 16));
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [acc, setAcc] = useState<number | null>(null);

  const [exposureType, setExposureType] = useState<Locality["exposureType"]>("beach shingle");
  const [sssi, setSssi] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const [formation, setFormation] = useState("");
  const [member, setMember] = useState("");
  const [bed, setBed] = useState("");
  const [lithologyPrimary, setLithologyPrimary] = useState<Locality["lithologyPrimary"]>("mudstone");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  
  const [openFindId, setOpenFindId] = useState<string | null>(null);

  const defaultCollector = useLiveQuery(async () => {
    const s = await db.settings.get("defaultCollector");
    return s?.value;
  }, []);

  useEffect(() => {
    if (!isEdit && defaultCollector) {
      setCollector(defaultCollector);
    }
  }, [isEdit, defaultCollector]);

  // Fetch finds for this trip
  const finds = useLiveQuery(async () => {
    if (!id) return [];
    return db.specimens.where("localityId").equals(id).reverse().sortBy("createdAt");
  }, [id]);

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
    
    const sortedMedia = [...allMedia].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const row of sortedMedia) {
      if (!info.has(row.specimenId)) {
        info.set(row.specimenId, row);
      }
    }
    return info;
  }, [allMedia, finds]);

  useEffect(() => {
    if (id) {
      db.localities.get(id).then(l => {
        if (l) {
          setName(l.name);
          setCollector(l.collector);
          setObservedAt(new Date(l.observedAt).toISOString().slice(0, 16));
          setLat(l.lat);
          setLon(l.lon);
          setAcc(l.gpsAccuracyM);
          setExposureType(l.exposureType);
          setSssi(l.sssi);
          setPermissionGranted(l.permissionGranted);
          setFormation(l.formation);
          setMember(l.member);
          setBed(l.bed);
          setLithologyPrimary(l.lithologyPrimary);
          setNotes(l.notes);
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

  async function handleDelete() {
    if (!id) return;
    if (!confirm("Are you sure? This will permanently delete this field trip and all finds recorded during it.")) return;
    
    setSaving(true);
    try {
      await db.transaction("rw", db.localities, db.specimens, db.media, async () => {
        const specimens = await db.specimens.where("localityId").equals(id).toArray();
        const specimenIds = specimens.map(s => s.id);
        await db.media.where("specimenId").anyOf(specimenIds).delete();
        await db.specimens.where("localityId").equals(id).delete();
        await db.localities.delete(id);
      });
      nav("/");
    } catch (e: any) {
      setError("Delete failed: " + e.message);
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
        name,
        lat,
        lon,
        gpsAccuracyM: acc,
        observedAt: isoObserved,
        collector,
        exposureType,
        sssi,
        permissionGranted,
        formation,
        member,
        bed,
        lithologyPrimary,
        notes,
        createdAt: isEdit ? undefined as any : now, 
        updatedAt: now,
      };

      if (isEdit) {
        await db.localities.update(id, locality);
        alert("Field trip updated!");
        nav("/");
      } else {
        (locality as any).createdAt = now;
        await db.localities.add(locality);
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

  if (loading) return <div className="p-10 text-center opacity-50 font-medium">Loading trip details...</div>;

  const currentLocality: Locality | null = id ? {
    id, projectId: props.projectId, name, lat, lon, gpsAccuracyM: acc, observedAt, collector,
    exposureType, sssi, permissionGranted, formation, member, bed, lithologyPrimary, notes,
    createdAt: "", updatedAt: ""
  } : null;

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="no-print grid gap-8">
        <div className="flex justify-between items-center px-1">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{isEdit ? `Field Trip Details` : "New Field Trip"}</h2>
            <div className="flex gap-2">
                {isEdit && (
                    <>
                        <button 
                            onClick={handlePrint}
                            className="text-sm font-bold text-blue-600 hover:text-white hover:bg-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-lg border border-blue-200 dark:border-blue-800 transition-all"
                        >
                            Export Report (PDF)
                        </button>
                        <button 
                            onClick={handleDelete}
                            disabled={saving}
                            className="text-sm font-bold text-red-600 hover:text-white hover:bg-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-lg border border-red-200 dark:border-red-800 transition-all disabled:opacity-50"
                        >
                            Delete Trip
                        </button>
                    </>
                )}
                <button onClick={() => nav(-1)} className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">Back</button>
            </div>
        </div>

        {error && (
            <div className="border-2 border-red-200 bg-red-50 text-red-800 p-4 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 font-medium flex gap-3 items-center">
                <span className="text-xl">⚠️</span> {error}
            </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Column: Trip Info */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm grid gap-6 h-fit">
                <label className="block">
                <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Trip Name / Location</div>
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

                <div className="bg-blue-50/50 dark:bg-blue-900/20 p-5 rounded-2xl border-2 border-blue-100/50 dark:border-blue-800/30 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="flex flex-col gap-1">
                    <div className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">GPS Location</div>
                    <div className="text-lg font-mono font-bold text-gray-800 dark:text-gray-100">
                        {lat && lon ? (
                        <div className="flex items-center gap-2">
                            {lat.toFixed(6)}, {lon.toFixed(6)}
                            {acc ? <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">±{Math.round(acc)}m</span> : ""}
                        </div>
                        ) : (
                        <span className="opacity-40 italic">Coordinates not set</span>
                        )}
                    </div>
                </div>
                <button 
                    type="button"
                    onClick={doGPS} 
                    className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-all flex items-center gap-2 whitespace-nowrap group"
                >
                    <span className="group-active:animate-ping">📍</span> {lat ? "Update GPS" : "Get Current GPS"}
                </button>
                </div>

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

                <label className="block">
                <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Trip Notes</div>
                <textarea 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)} 
                    rows={4} 
                    className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                />
                </label>

                <button 
                    onClick={save} 
                    disabled={saving || !name.trim()} 
                    className={`mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-black text-xl shadow-xl transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:transform-none flex items-center justify-center gap-3`}
                >
                {saving ? "Saving..." : isEdit ? "Save Changes ✓" : "Start Field Trip →"}
                </button>
            </div>

            {/* Right Column: Finds List */}
            <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-inner h-fit max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Finds from Trip</h3>
                    <div className="text-xs font-mono bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded font-bold">{finds?.length ?? 0} total</div>
                </div>

                {!isEdit && (
                    <div className="text-center py-10 opacity-50 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl italic text-sm px-4">
                        Save this trip first to start recording finds!
                    </div>
                )}

                {isEdit && (
                    <div className="grid gap-3">
                        <button 
                            onClick={() => nav(`/specimen?localityId=${id}`)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 mb-2"
                        >
                            Add Find
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

      {openFindId && <SpecimenModal specimenId={openFindId} onClose={() => setOpenFindId(null)} />}
    </div>
  );
}
