import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db } from "../db";
import { LocalityThumbnail } from "../components/LocalityThumbnail";
import { formatDisplayDate } from "../services/dates";
import { Calendar, Compass, FileText, List, Map as MapIcon, MapPin, Microscope, Plus, ShieldAlert } from "lucide-react";

const MapPage = React.lazy(() => import("./Map"));

export default function TripsPage({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [view, setView] = useState<"list" | "map">("list");

  const trips = useLiveQuery(
    async () => {
      const rows = await db.localities
        .where("projectId").equals(projectId)
        .filter(l => l.type === "trip")
        .reverse()
        .sortBy("createdAt");
      return Promise.all(
        rows.map(async (t) => {
          const findCount = await db.specimens.where("localityId").equals(t.id).count();
          const sessions = await db.sessions
            .where("localityId").equals(t.id)
            .reverse()
            .sortBy("startTime");
          const latest = sessions[0] ?? null;
          let durationLabel = "";

          if (latest) {
            const start = new Date(latest.startTime).getTime();
            const end = latest.endTime ? new Date(latest.endTime).getTime() : null;
            if (end && end > start) {
              const mins = Math.floor((end - start) / 60000);
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              durationLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
            }
          }

          return { ...t, findCount, durationLabel, sessionCount: sessions.length };
        })
      );
    },
    [projectId]
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-5 pb-10">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Fieldwork log</p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Field trips</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {trips?.length ?? 0} trip{(trips?.length ?? 0) !== 1 ? "s" : ""} in your local field book.
            </p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:items-center">
            <div className="flex min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
              <button
                onClick={() => setView("list")}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-black transition-colors ${
                  view === "list"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
              <button
                onClick={() => setView("map")}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-black transition-colors ${
                  view === "map"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" />
                Map
              </button>
            </div>
            <button
              onClick={() => navigate("/field-trip")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
            >
              <Plus className="h-3.5 w-3.5" />
              New Trip
            </button>
          </div>
        </div>
      </header>

      {/* Map view */}
      {view === "map" && (
        <React.Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />}>
          <MapPage projectId={projectId} tripOnly />
        </React.Suspense>
      )}

      {/* List view */}
      {view === "list" && (
        <>
          {(!trips || trips.length === 0) ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <Compass className="mx-auto mb-4 h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="font-black text-slate-900 dark:text-white">No field trips yet</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Start a trip to record finds against a date and location.
              </p>
              <button
                onClick={() => navigate("/field-trip")}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Start field trip
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {trips.map((trip) => (
                <article
                  key={trip.id}
                  onClick={() => navigate(`/field-trip/${trip.id}`)}
                  className="group relative grid min-h-48 cursor-pointer grid-cols-[1fr_7.75rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-emerald-400" />
                  <div className="flex min-w-0 flex-col p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="min-w-0 text-base font-black leading-tight text-slate-950 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
                        {trip.name || "(Unnamed trip)"}
                      </span>
                      <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                        Trip
                      </span>
                    </div>

                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {trip.period && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                          {trip.period}
                        </span>
                      )}
                      {trip.stage && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                          {trip.stage}
                        </span>
                      )}
                      {trip.formation && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {trip.formation}
                        </span>
                      )}
                      {(trip.sssi || trip.rigs) && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                          <ShieldAlert className="h-2.5 w-2.5" />
                          Protected
                        </span>
                      )}
                    </div>

                    <div className="mb-3 grid gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Microscope className="h-3.5 w-3.5" />
                        <span>{trip.findCount} find{trip.findCount !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{trip.lat && trip.lon ? `${trip.lat.toFixed(4)}, ${trip.lon.toFixed(4)}` : "No GPS set"}</span>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                        <Calendar className="h-3 w-3" />
                        {formatDisplayDate(trip.observedAt || trip.createdAt)}
                        {trip.durationLabel && <span className="opacity-70">· {trip.durationLabel}</span>}
                      </span>
                      {trip.sessionCount > 1 && (
                        <span className="text-[10px] font-bold text-slate-400">
                          {trip.sessionCount} sessions
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/field-trip/${trip.id}`);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                      >
                        <FileText className="h-3 w-3" />
                        Open
                      </button>
                    </div>
                  </div>

                  <div className="relative border-l border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                    <LocalityThumbnail localityId={trip.id} className="h-full w-full" imgClassName="object-cover" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950/55 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    {(trip.sssi || trip.rigs) && (
                      <div className="absolute right-2 top-2 rounded bg-amber-500 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-white shadow-sm">
                        Protected
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
