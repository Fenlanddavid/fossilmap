import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db } from "../db";
import { LocalityThumbnail } from "../components/LocalityThumbnail";
import { Map as MapIcon, List, Plus, FileText, Compass } from "lucide-react";

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
          return { ...t, findCount };
        })
      );
    },
    [projectId]
  );

  return (
    <div className="mx-auto max-w-5xl pb-10">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
            Field Trips
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {trips?.length ?? 0} trip{(trips?.length ?? 0) !== 1 ? "s" : ""} in your field book
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* List / Map toggle */}
          <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
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

      {/* Map view */}
      {view === "map" && (
        <React.Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />}>
          <MapPage projectId={projectId} />
        </React.Suspense>
      )}

      {/* List view */}
      {view === "list" && (
        <>
          {(!trips || trips.length === 0) ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center dark:border-slate-700">
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
                  className="group grid min-h-44 grid-cols-[1fr_7.25rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 cursor-pointer"
                >
                  <div className="flex min-w-0 flex-col p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-base font-black text-slate-950 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
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
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                          ⚠️ Protected
                        </span>
                      )}
                    </div>

                    <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {trip.findCount} find{trip.findCount !== 1 ? "s" : ""}
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400">
                        {new Date(trip.observedAt).toLocaleDateString("en-GB", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/field-trip/${trip.id}`);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        <FileText className="h-3 w-3" />
                        Open
                      </button>
                    </div>
                  </div>

                  {/* Cover photo */}
                  <div className="relative border-l border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                    <LocalityThumbnail localityId={trip.id} className="h-full w-full" imgClassName="object-cover" />
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
