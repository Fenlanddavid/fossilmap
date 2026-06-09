import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  MapPin,
  Microscope,
  Plus,
  Save,
  ShieldAlert,
  Square,
  Waves,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { db, Media, Session, Specimen } from "../db";
import { captureGPS } from "../services/gps";
import { fileToBlob } from "../services/photos";
import { SpecimenRow } from "../components/SpecimenRow";
import { TideBar } from "../components/TideBar";
import { useConfirmDialog } from "../components/ConfirmModal";

const SpecimenModal = React.lazy(() =>
  import("../components/SpecimenModal").then((mod) => ({ default: mod.SpecimenModal }))
);

function toDateTimeLocalValue(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function SessionPage(props: { projectId: string }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get("locationId");
  const nav = useNavigate();
  const isEdit = !!id;
  const { confirm: confirmAction, dialog } = useConfirmDialog();

  const [startTime, setStartTime] = useState(() => toDateTimeLocalValue(new Date()));
  const [notes, setNotes] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isEditing, setIsEditing] = useState(!isEdit);
  const [openFindId, setOpenFindId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const session = useLiveQuery(async () => (id ? db.sessions.get(id) : null), [id]);

  const location = useLiveQuery(
    async () => {
      if (locationId) return db.localities.get(locationId);
      if (!id) return null;
      const s = await db.sessions.get(id);
      return s ? db.localities.get(s.localityId) : null;
    },
    [locationId, id, session?.localityId]
  );

  const finds = useLiveQuery(async () => {
    if (!id) return [];
    return db.specimens.where("sessionId").equals(id).reverse().sortBy("createdAt");
  }, [id]);

  const allMedia = useLiveQuery(async () => {
    if (!id || !finds || finds.length === 0) return [];
    const ids = finds.map((s) => s.id);
    return db.media.where("specimenId").anyOf(ids).toArray();
  }, [id, finds]);

  const localityPhotoCount = useLiveQuery(async () => {
    const locId = location?.id;
    if (!locId) return 0;
    return db.media.where("localityId").equals(locId).count();
  }, [location?.id]);

  const findThumbMedia = useMemo(() => {
    const info = new Map<string, Media>();
    if (!allMedia || !finds) return info;
    const sortedMedia = [...allMedia].sort((a, b) => {
      const aDate = a?.createdAt || "";
      const bDate = b?.createdAt || "";
      return aDate.localeCompare(bDate);
    });
    for (const row of sortedMedia) {
      if (row.specimenId && !info.has(row.specimenId)) info.set(row.specimenId, row);
    }
    return info;
  }, [allMedia, finds]);

  useEffect(() => {
    if (id) {
      db.sessions.get(id).then((s) => {
        if (s) {
          setStartTime(toDateTimeLocalValue(s.startTime));
          setNotes(s.notes || "");
          setIsFinished(!!s.isFinished);
        }
        setLoading(false);
      });
    }
  }, [id]);

  const durationLabel = useMemo(() => {
    const startMs = new Date(startTime).getTime();
    const endMs = session?.endTime ? new Date(session.endTime).getTime() : nowTick;
    if (!Number.isFinite(startMs) || endMs < startMs) return "Not started";
    const mins = Math.max(0, Math.floor((endMs - startMs) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [startTime, session?.endTime, nowTick]);

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

      if (isEdit) {
        await db.sessions.update(id, {
          startTime: isoStart,
          endTime: isFinished ? session?.endTime || now : null,
          notes,
          isFinished,
          updatedAt: now,
        });
        setIsEditing(false);
      } else {
        const newSession: Session = {
          id: finalId,
          projectId: props.projectId,
          localityId: locationId!,
          startTime: isoStart,
          endTime: null,
          notes,
          isFinished: false,
          createdAt: now,
          updatedAt: now,
        };
        await db.sessions.add(newSession);
        setIsEditing(false);
        nav(`/session/${finalId}`, { replace: true });
      }
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    if (!id) return;
    setSaving(true);
    await db.sessions.update(id, { notes, updatedAt: new Date().toISOString() });
    setSaving(false);
  }

  async function finishSession() {
    if (!id) return;
    const ok = await confirmAction({
      title: "Finish field trip?",
      message: "This closes the active session and records the end time. You can still view and edit the record afterwards.",
      confirmLabel: "Finish trip",
      tone: "warning",
    });
    if (!ok) return;
    const now = new Date().toISOString();
    await db.sessions.update(id, { isFinished: true, endTime: now, updatedAt: now });
    setIsFinished(true);
  }

  async function appendGpsNote() {
    if (!id) return;
    setError(null);
    try {
      const fix = await captureGPS();
      const accuracy = fix.accuracyM == null ? "unknown accuracy" : `+/-${Math.round(fix.accuracyM)}m`;
      const line = `[${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}] GPS check: ${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)} ${accuracy}`;
      const nextNotes = notes.trim() ? `${notes.trim()}\n${line}` : line;
      setNotes(nextNotes);
      await db.sessions.update(id, { notes: nextNotes, updatedAt: new Date().toISOString() });
    } catch (e: any) {
      setError(e?.message ?? "GPS failed");
    }
  }

  async function addLocalityPhoto(files: FileList | null) {
    if (!location || !files || files.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const file = files[0];
      const blob = await fileToBlob(file);
      await db.media.add({
        id: uuid(),
        projectId: props.projectId,
        localityId: location.id,
        type: "photo",
        filename: file.name,
        mime: file.type || "image/jpeg",
        blob,
        caption: "Field trip locality photo",
        scalePresent: false,
        createdAt: new Date().toISOString(),
      });
    } catch (e: any) {
      setError(e?.message ?? "Photo save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-10 text-center font-medium opacity-50">Loading field trip...</div>;

  const findCount = finds?.length ?? 0;
  const photoCount = allMedia?.length ?? 0;
  const isLive = isEdit && !isFinished;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
            {isLive ? "Live field trip" : isFinished ? "Closed field trip" : "New field trip session"}
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {location?.name || "Field Trip"}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => nav(location ? `/location/${location.id}` : "/")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Location
          </button>
          {isEdit && !isEditing && (
            <button onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
              <FileText className="h-4 w-4" />
              Edit details
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
          {error}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4">
          {!isEditing ? (
            <>
              <div className={`rounded-lg border p-5 shadow-sm ${isLive ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/25" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
                <div className="grid gap-4 sm:grid-cols-4">
                  <Metric icon={Clock} label="Duration" value={durationLabel} />
                  <Metric icon={Microscope} label="Finds" value={String(findCount)} />
                  <Metric icon={Camera} label="Find photos" value={String(photoCount)} />
                  <Metric icon={MapPin} label="Site photos" value={String(localityPhotoCount ?? 0)} />
                </div>
              </div>

              {isLive ? (
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-lg font-black text-slate-950 dark:text-white">Field controls</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Large actions for use outdoors while the session is active.</p>
                  <div className="mt-4">
                    <TideBar />
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <ActionButton icon={Plus} label="Add Find" detail="Record a specimen in this trip" onClick={() => nav(`/specimen?localityId=${location?.id}&sessionId=${id}`)} tone="emerald" />
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-left text-sky-950 transition-colors hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/75 dark:bg-slate-950/45">
                        <Camera className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-black">Site Photo</p>
                        <p className="text-xs opacity-70">Take or choose exposure, cliff, quarry or context images</p>
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => addLocalityPhoto(e.target.files)} />
                    </label>
                    <ActionButton icon={Compass} label="GPS Note" detail="Append a current GPS fix to notes" onClick={appendGpsNote} tone="slate" />
                    <ActionButton icon={Waves} label="Check Tides" detail="Open the tide planning tool" onClick={() => nav("/tides")} tone="blue" />
                    <ActionButton icon={Square} label="Finish Trip" detail="Close this active field session" onClick={finishSession} tone="amber" />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <h3 className="font-black text-slate-950 dark:text-white">Visit logged</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This session is closed. You can still edit notes or review finds.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-slate-950 dark:text-white">Session notes</h3>
                  {isEdit && (
                    <button onClick={saveNotes} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                      <Save className="h-3.5 w-3.5" />
                      Save notes
                    </button>
                  )}
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                  placeholder="Ground conditions, tide window, team members, productive beds, access notes..."
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-emerald-900/50"
                />
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-lg font-black text-slate-950 dark:text-white">{isEdit ? "Session details" : "Start a session"}</h3>
              <div className="mt-5 grid gap-5">
                <label className="grid gap-1.5">
                  <span className="text-sm font-black text-slate-700 dark:text-slate-200">Start date and time</span>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-emerald-900/50"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-black text-slate-700 dark:text-slate-200">Session notes</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-emerald-900/50"
                    placeholder="Ground conditions, team members, access constraints..."
                  />
                </label>
                {isEdit && (
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/45">
                    <input type="checkbox" checked={isFinished} onChange={(e) => setIsFinished(e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-emerald-600" />
                    <span className="text-sm font-black text-slate-700 dark:text-slate-200">Mark this session as finished</span>
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : isEdit ? "Save details" : "Start session"}
                  </button>
                  {isEdit && (
                    <button onClick={() => setIsEditing(false)} className="rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="grid content-start gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950 dark:text-white">Finds</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{findCount} recorded in this trip.</p>
              </div>
              {isLive && (
                <button onClick={() => nav(`/specimen?localityId=${location?.id}&sessionId=${id}`)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              )}
            </div>

            {!isEdit && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-400">
                Save this session first to start recording finds.
              </div>
            )}

            {isEdit && (
              <div className="grid gap-3">
                {finds && finds.length > 0 ? (
                  finds.map((s: Specimen) => (
                    <SpecimenRow
                      key={s.id}
                      specimen={s}
                      thumbMedia={findThumbMedia?.get(s.id) ?? null}
                      onOpen={() => setOpenFindId(s.id)}
                    />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-400">
                    No finds yet for this session.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h3 className="font-black">Field safety context</h3>
                <ul className="mt-2 grid gap-1.5 text-xs leading-relaxed opacity-80">
                  <li>{location?.sssi || location?.rigs ? "Protected-site flag present. Check designation notes before collecting." : "No SSSI/RIGS flag recorded on this locality."}</li>
                  <li>{location?.permissionGranted ? "Permission is marked as granted." : "Permission is not marked as granted."}</li>
                  <li>Use tide and weather checks for foreshore or cliff-base collecting.</li>
                </ul>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {openFindId && (
        <React.Suspense fallback={null}>
          <SpecimenModal specimenId={openFindId} onClose={() => setOpenFindId(null)} />
        </React.Suspense>
      )}
      {dialog}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/50 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/45">
      <div className="mb-2 flex items-center justify-between">
        <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  detail,
  onClick,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
  onClick: () => void;
  tone: "emerald" | "blue" | "amber" | "slate";
}) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
    blue: "border-sky-200 bg-sky-50 text-sky-950 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100",
    amber: "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
    slate: "border-slate-200 bg-slate-50 text-slate-950 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-white dark:hover:bg-slate-950",
  };
  return (
    <button onClick={onClick} className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors ${tones[tone]}`}>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/75 dark:bg-slate-950/45">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-black">{label}</p>
        <p className="text-xs opacity-70">{detail}</p>
      </div>
    </button>
  );
}
