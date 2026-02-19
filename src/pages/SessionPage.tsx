import React, { useEffect, useState, useMemo } from "react";
import { db, Locality, Session, Specimen, Media } from "../db";
import { v4 as uuid } from "uuid";
import { captureGPS } from "../services/gps";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { SpecimenRow } from "../components/SpecimenRow";
import { SpecimenModal } from "../components/SpecimenModal";

export default function SessionPage(props: {
  projectId: string;
}) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get("locationId");
  const nav = useNavigate();
  const isEdit = !!id;

  const [startTime, setStartTime] = useState(new Date().toISOString().slice(0, 16));
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [acc, setAcc] = useState<number | null>(null);

  const [notes, setNotes] = useState("");
  const [isFinished, setIsFinished] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isEditing, setIsEditing] = useState(!isEdit);
  
  const [openFindId, setOpenFindId] = useState<string | null>(null);

  const location = useLiveQuery(
    async () => (locationId ? db.localities.get(locationId) : (id ? db.sessions.get(id).then(s => s ? db.localities.get(s.localityId) : null) : null)),
    [locationId, id]
  );

  const finds = useLiveQuery(async () => {
    if (!id) return [];
    return db.specimens.where("sessionId").equals(id).reverse().sortBy("createdAt");
  }, [id]);

  const allMedia = useLiveQuery(async () => {
    if (!id || !finds) return [];
    const ids = finds.map(s => s.id);
    return db.media.where("specimenId").anyOf(ids).toArray();
  }, [id, finds]);

  const findThumbMedia = useMemo(() => {
    const info = new Map<string, Media>();
    if (!allMedia || !finds) return info;
    const sortedMedia = [...allMedia].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const row of sortedMedia) {
      if (!info.has(row.specimenId)) info.set(row.specimenId, row);
    }
    return info;
  }, [allMedia, finds]);

  useEffect(() => {
    if (id) {
      db.sessions.get(id).then(s => {
        if (s) {
          setStartTime(new Date(s.startTime).toISOString().slice(0, 16));
          setNotes(s.notes);
          setIsFinished(!!s.isFinished);
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

  async function save() {
    if (!locationId && !isEdit) {
        setError("Missing location ID");
        return;
    }
    setSaving(true);
    setError(null);
    try {
      const isoStart = new Date(startTime).toISOString();
      const now = new Date().toISOString();
      const finalId = id || uuid();

      const session: Session = {
        id: finalId,
        projectId: props.projectId,
        localityId: isEdit ? (await db.sessions.get(id))!.localityId : locationId!,
        startTime: isoStart,
        endTime: isFinished ? now : null,
        notes,
        isFinished,
        createdAt: isEdit ? undefined as any : now, 
        updatedAt: now,
      };

      if (isEdit) {
        await db.sessions.update(id, session);
        setIsEditing(false);
      } else {
        (session as any).createdAt = now;
        await db.sessions.add(session);
        setIsEditing(false);
        nav(`/session/${finalId}`, { replace: true });
      }
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function finishSession() {
    if (id) {
        const now = new Date().toISOString();
        await db.sessions.update(id, { isFinished: true, endTime: now });
        setIsFinished(true);
    }
    nav(location ? `/location/${location.id}` : "/");
  }

  if (loading) return <div className="p-10 text-center opacity-50 font-medium">Loading session...</div>;

  return (
    <div className="max-w-4xl mx-auto pb-20 px-4">
      <div className="grid gap-8 mt-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex flex-wrap gap-3 items-center">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight">
                    {isEdit ? "Session Details" : "New Session"}
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
            <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={() => nav(location ? `/location/${location.id}` : "/")} className="text-xs sm:text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors flex-1 sm:flex-none">Back</button>
            </div>
        </div>

        {error && (
            <div className="border-2 border-red-200 bg-red-50 text-red-800 p-4 rounded-xl shadow-sm flex gap-3 items-center font-medium">
                <span className="text-xl">⚠️</span> {error}
            </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm grid gap-6 h-fit">
                {!isEditing && (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
                        <div className="min-w-0 flex-1">
                            <p className="text-blue-600 dark:text-blue-400 font-black text-[10px] uppercase tracking-widest mb-1 truncate">📍 {location?.name || "Unknown Location"}</p>
                            <div className="flex flex-wrap items-center gap-3">
                                <h3 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-gray-100 break-words">{new Date(startTime).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                                {isFinished && (
                                    <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest border border-gray-200 dark:border-gray-600 whitespace-nowrap">Session Closed</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {!isFinished ? (
                            <button 
                                onClick={finishSession}
                                className="bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-100 dark:border-blue-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-1 group hover:bg-blue-600 hover:border-blue-600 transition-all shadow-sm"
                            >
                                <span className="text-2xl group-hover:scale-110 transition-transform">✓</span>
                                <span className="text-xs font-black uppercase tracking-widest text-blue-700 dark:text-blue-400 group-hover:text-white">Finish Session</span>
                            </button>
                        ) : (
                            <div className="bg-gray-100 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 opacity-60">
                                <span className="text-2xl">🔒</span>
                                <span className="text-[10px] font-black uppercase tracking-widest">Visit Logged</span>
                            </div>
                        )}

                        <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
                            <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Time Started</h4>
                            <p className="font-mono font-bold text-gray-700 dark:text-gray-200">{new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                    </div>

                    {notes && (
                        <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
                            <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Session Notes</h4>
                            <p className="text-sm opacity-80 whitespace-pre-wrap italic">{notes}</p>
                        </div>
                    )}
                  </div>
                )}

                {isEditing && (
                  <>
                    <label className="block">
                        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Start Date & Time</div>
                        <input 
                            type="datetime-local" 
                            value={startTime} 
                            onChange={(e) => setStartTime(e.target.value)} 
                            className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                        />
                    </label>

                    <label className="block">
                        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-gray-300">Session Notes</div>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-700 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" placeholder="Ground conditions, team members, etc." />
                    </label>

                    <div className="flex gap-4">
                        <button onClick={save} disabled={saving} className="mt-4 flex-1 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-black text-xl shadow-xl transition-all disabled:opacity-50">
                            {saving ? "Saving..." : isEdit ? "Save Details ✓" : "Start Session →"}
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
                )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-inner h-fit">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 m-0">Finds</h3>
                    <div className="text-xs font-mono bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded font-bold">{finds?.length ?? 0} total</div>
                </div>

                {!isEdit && (
                    <div className="text-center py-10 opacity-50 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl italic text-sm px-4">
                        Save this session first to start recording finds!
                    </div>
                )}

                {isEdit && (
                    <div className="grid gap-3">
                        {!isFinished && (
                            <button 
                                onClick={() => nav(`/specimen?localityId=${location?.id}&sessionId=${id}`)}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 mb-2"
                            >
                                Add Find to Session
                            </button>
                        )}

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
                                No finds yet for this session.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
      {openFindId && <SpecimenModal specimenId={openFindId} onClose={() => setOpenFindId(null)} />}
    </div>
  );
}
