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
  type?: "location" | "trip";
  onSaved: (id: string) => void;
}) {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = !!id;

  const [localityType, setLocalityType] = useState<"location" | "trip">(props.type || "location");
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
  const [isEditing, setIsEditing] = useState(!isEdit);
  
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

  // Fetch finds for this trip/location
  const finds = useLiveQuery(async () => {
    if (!id) return [];
    return db.specimens.where("localityId").equals(id).reverse().sortBy("createdAt");
  }, [id]);

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
          setLocalityType(l.type || "location");
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
    const term = localityType === 'location' ? 'location' : 'field trip';
    if (!confirm(`Are you sure? This will permanently delete this ${term}, all sessions, and all finds recorded during it.`)) return;
    
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
        setIsEditing(false);
        alert(`${localityType === 'location' ? 'Location' : 'Field trip'} updated!`);
      } else {
        (locality as any).createdAt = now;
        await db.localities.add(locality);
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
    exposureType, sssi, permissionGranted, formation, member, bed, lithologyPrimary, notes,
    createdAt: "", updatedAt: ""
  } : null;

  const isTrip = localityType === 'trip';

  return (
    <div className="max-w-4xl mx-auto pb-20 px-4">
      <div className="no-print grid gap-8 mt-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex flex-wrap gap-3 items-center">
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

        <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Column: Info */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm grid gap-6 h-fit">
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

                    <div className="bg-blue-50/50 dark:bg-blue-900/20 p-5 rounded-2xl border-2 border-blue-100/50 dark:border-blue-800/30 flex flex-col sm:flex-row gap-4 items-center justify-between">
                        <div className="flex flex-col gap-1 w-full">
                            <div className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">GPS Location</div>
                            <div className="text-sm sm:text-lg font-mono font-bold text-gray-800 dark:text-gray-100">
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
                            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                            📍 {lat ? "Update GPS" : "Get Current GPS"}
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
                        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Notes</div>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="grid gap-6">
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Stratigraphy</h4>
                                <p className="font-bold text-gray-700 dark:text-gray-300">
                                    {formation || "Unknown Formation"}
                                </p>
                                {member && <p className="text-sm opacity-60 italic">{member}</p>}
                                {bed && <p className="text-sm opacity-60">Bed: {bed}</p>}
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Details</h4>
                                <p className="font-bold text-gray-700 dark:text-gray-300 capitalize">
                                    {lithologyPrimary}, {exposureType}
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-6">
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Location</h4>
                                {lat && lon ? (
                                    <div className="flex flex-col gap-1">
                                        <p className="font-mono font-bold text-blue-600">{lat.toFixed(6)}, {lon.toFixed(6)}</p>
                                        <button 
                                            onClick={() => window.open(`https://www.google.com/maps?q=${lat},${lon}`, "_blank")}
                                            className="text-[10px] font-bold text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1"
                                        >
                                            View on Google Maps ↗
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-sm opacity-40 italic">Coordinates not set</p>
                                )}
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Collector / Date</h4>
                                <p className="font-bold text-gray-700 dark:text-gray-300">{collector || "Not set"}</p>
                                <p className="text-xs opacity-60">{new Date(observedAt).toLocaleDateString()}</p>
                            </div>
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

      {openFindId && <SpecimenModal specimenId={openFindId} onClose={() => setOpenFindId(null)} />}
    </div>
  );
}
