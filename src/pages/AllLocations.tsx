import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Calendar, Compass, MapPin, Microscope, Plus, Search, ShieldAlert } from "lucide-react";
import { db } from "../db";
import { LocalityThumbnail } from "../components/LocalityThumbnail";

export default function AllLocations(props: { projectId: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const locations = useLiveQuery(
    async () => {
      const collection = db.localities.where("projectId").equals(props.projectId);
      let rows;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        rows = await collection
          .filter((l) =>
            (l.name || "").toLowerCase().includes(q) ||
            (l.notes || "").toLowerCase().includes(q) ||
            (l.formation || "").toLowerCase().includes(q) ||
            (l.period || "").toLowerCase().includes(q) ||
            (l.stage || "").toLowerCase().includes(q)
          )
          .reverse()
          .sortBy("createdAt");
      } else {
        rows = await collection.reverse().sortBy("createdAt");
      }
      return Promise.all(
        rows.map(async (l) => ({
          ...l,
          findCount: await db.specimens.where("localityId").equals(l.id).count(),
        }))
      );
    },
    [props.projectId, searchQuery]
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-5 pb-10">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Locality register</p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Locations and trips</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Search fixed sites, field trips, formations, periods and access notes in one place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              onClick={() => navigate("/field-trip")}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <Compass className="h-4 w-4" />
              Start trip
            </button>
            <button
              onClick={() => navigate("/location")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Location
            </button>
          </div>
        </div>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search name, formation, period or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-emerald-900/50"
          />
        </div>
      </div>

      {(!locations || locations.length === 0) ? (
        <EmptyState
          title={searchQuery ? "No locations match your search" : "No locations or trips recorded yet"}
          detail={searchQuery ? "Try a different site name, period, formation or note." : "Start a field trip or add a repeat locality to begin your field book."}
          actionLabel={searchQuery ? "Clear search" : "Start field trip"}
          onAction={searchQuery ? () => setSearchQuery("") : () => navigate("/field-trip")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {locations.map((l) => (
            <article
              key={l.id}
              onClick={() => navigate(l.type === "trip" ? `/field-trip/${l.id}` : `/location/${l.id}`)}
              className="group relative grid min-h-48 cursor-pointer grid-cols-[1fr_7.75rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800"
            >
              <div className={`absolute inset-x-0 top-0 h-1 ${l.type === "trip" ? "bg-emerald-400" : "bg-sky-400"}`} />
              <div className="flex min-w-0 flex-col p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="min-w-0 text-base font-black leading-tight text-slate-950 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
                    {l.name || "(Unnamed)"}
                  </span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${l.type === "trip" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"}`}>
                    {l.type === "trip" ? "Trip" : "Site"}
                  </span>
                </div>

                <div className="mb-3 flex flex-wrap gap-1.5">
                  {l.period && <Pill>{l.period}</Pill>}
                  {l.stage && <Pill>{l.stage}</Pill>}
                  {l.formation && <Pill muted>{l.formation}</Pill>}
                  {(l.sssi || l.rigs) && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800 dark:bg-amber-900/35 dark:text-amber-200">
                      <ShieldAlert className="h-2.5 w-2.5" />
                      Protected
                    </span>
                  )}
                </div>

                <div className="mb-3 grid gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{l.lat && l.lon ? `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}` : "No GPS set"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Microscope className="h-3.5 w-3.5" />
                    <span>{l.findCount} find{l.findCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                    <Calendar className="h-3 w-3" />
                    {new Date(l.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/specimen?localityId=${encodeURIComponent(l.id)}`);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] font-black text-emerald-800 shadow-sm hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-200"
                  >
                    <Plus className="h-3 w-3" />
                    Add find
                  </button>
                </div>
              </div>

              <div className="relative border-l border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                <LocalityThumbnail localityId={l.id} className="h-full w-full" imgClassName="object-cover" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950/55 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                {(l.sssi || l.rigs) && (
                  <div className="absolute right-2 top-2 rounded bg-amber-500 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-white shadow-sm">
                    Protected
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${muted ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"}`}>
      {children}
    </span>
  );
}

function EmptyState({ title, detail, actionLabel, onAction }: { title: string; detail: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <MapPin className="h-6 w-6" />
      </div>
      <h3 className="text-base font-black text-slate-950 dark:text-white">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">{detail}</p>
      <button onClick={onAction} className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-700">
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
