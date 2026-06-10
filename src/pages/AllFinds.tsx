import React, { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Calendar, Camera, ClipboardList, ExternalLink, MapPin, Microscope, Plus, Search, X, Zap } from "lucide-react";
import { db } from "../db";
import { SpecimenThumbnail } from "../components/SpecimenThumbnail";
import { getCommunityUrl } from "../services/community";
import { CommunityFind, getRecentCommunityFinds } from "../services/communityFinds";

const SpecimenModal = React.lazy(() =>
  import("../components/SpecimenModal").then((mod) => ({ default: mod.SpecimenModal }))
);

type View = "all" | "pending";

export default function AllFinds(props: { projectId: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [view, setView] = useState<View>("all");
  const [openSpecimenId, setOpenSpecimenId] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearchQuery(q);
    if (searchParams.get("view") === "pending") setView("pending");
  }, [searchParams]);

  const specimens = useLiveQuery(
    async () => {
      const collection = db.specimens.where("projectId").equals(props.projectId);
      if (view === "pending") {
        return collection.filter((s) => !!s.isPending).reverse().sortBy("createdAt");
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return collection
          .filter((s) =>
            !s.isPending &&
            ((s.taxon || "").toLowerCase().includes(q) ||
              (s.period || "").toLowerCase().includes(q) ||
              (s.stage || "").toLowerCase().includes(q) ||
              (s.specimenCode || "").toLowerCase().includes(q) ||
              (s.notes || "").toLowerCase().includes(q))
          )
          .reverse()
          .sortBy("createdAt");
      }
      return collection.filter((s) => !s.isPending).reverse().sortBy("createdAt");
    },
    [props.projectId, searchQuery, view]
  );

  const pendingCount = useLiveQuery(
    async () => db.specimens.where("projectId").equals(props.projectId).filter((s) => !!s.isPending).count(),
    [props.projectId]
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-5 pb-28">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Find register</p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">All finds</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Browse, search and complete every recorded fossil.</p>
          </div>

          <button
            onClick={() => navigate("/specimen")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Record find
          </button>
        </div>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex justify-center gap-2 overflow-x-auto">
          <button
            onClick={() => setView("all")}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-black transition-colors ${
              view === "all"
                ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <Microscope className="h-4 w-4" />
            All finds
          </button>
          <button
            onClick={() => setView("pending")}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-black transition-colors ${
              view === "pending"
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <Zap className="h-4 w-4" />
            Pending
            {(pendingCount ?? 0) > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                view === "pending" ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {view === "all" && (
          <div className="relative mx-auto w-full min-w-0 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search taxon, code, period or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-emerald-900/50"
            />
          </div>
        )}
      </div>

      {view === "pending" && (specimens?.length ?? 0) === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="No pending finds"
          detail="Quick finds saved in the field will appear here until you add the full record."
          actionLabel="Record find"
          onAction={() => navigate("/specimen")}
          tone="amber"
        />
      )}

      {view === "all" && (!specimens || specimens.length === 0) && (
        <EmptyState
          icon={Microscope}
          title={searchQuery ? "No finds match your search" : "No finds recorded yet"}
          detail={searchQuery ? "Try a different taxon, period, code or note." : "Record a specimen to build your field evidence register."}
          actionLabel={searchQuery ? "Clear search" : "Record find"}
          onAction={searchQuery ? () => setSearchQuery("") : () => navigate("/specimen")}
        />
      )}

      {view === "pending" && (specimens?.length ?? 0) > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {specimens!.map((find) => (
            <button
              key={find.id}
              onClick={() => setOpenSpecimenId(find.id)}
              className="group flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/75 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-50 hover:shadow-md dark:border-amber-800 dark:bg-amber-950/20 dark:hover:border-amber-600 dark:hover:bg-amber-950/40"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-900 dark:text-white">{find.taxon || "Unidentified"}</p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">{find.specimenCode}</p>
                {find.lat && find.lon && (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                    <MapPin className="h-2.5 w-2.5" />
                    {find.lat.toFixed(4)}, {find.lon.toFixed(4)}
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                Draft
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-500 transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      )}

      {view === "all" && <FossilMappedLatestFindsWidget />}

      {view === "all" && (specimens?.length ?? 0) > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {specimens!.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenSpecimenId(s.id)}
              className="group relative grid min-w-0 grid-cols-[4rem_1fr_auto] gap-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white hover:shadow-md dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-emerald-800 dark:hover:bg-slate-950"
            >
              <div className={`absolute inset-x-0 top-0 h-1 ${
                s.taxonConfidence === "high" ? "bg-emerald-400" :
                s.taxonConfidence === "low" ? "bg-red-400" :
                "bg-amber-400"
              }`} />
              <div className="mt-1 aspect-square overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800">
                <SpecimenThumbnail specimenId={s.id} className="h-full w-full" imgClassName="object-cover" />
              </div>

              <div className="min-w-0 self-center">
                <h3 className="truncate text-sm font-black text-slate-950 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
                  {s.taxon || "Unidentified"}
                </h3>
                <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">{s.specimenCode}</p>

                <div className="mt-1 flex flex-wrap gap-1">
                  {s.period && <Pill>{s.period}</Pill>}
                  {s.stage && <Pill>{s.stage}</Pill>}
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                    s.taxonConfidence === "high" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" :
                    s.taxonConfidence === "med" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" :
                    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                  }`}>
                    {s.taxonConfidence} confidence
                  </span>
                </div>

                <div className="mt-1.5 grid gap-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Microscope className="h-3 w-3" />
                    <span className="truncate">{s.element || "Unknown element"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    <span>{new Date(s.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                </div>
              </div>

              <ArrowRight className="mr-1 mt-6 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-300" />
            </button>
          ))}
        </div>
      )}

      {openSpecimenId && (
        <React.Suspense fallback={null}>
          <SpecimenModal specimenId={openSpecimenId} onClose={() => setOpenSpecimenId(null)} />
        </React.Suspense>
      )}
    </div>
  );
}

function FossilMappedLatestFindsWidget() {
  const [finds, setFinds] = useState<CommunityFind[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    getRecentCommunityFinds(5)
      .then((items) => {
        if (!active) return;
        setFinds(items);
        setError("");
      })
      .catch((e) => {
        if (!active) return;
        setFinds([]);
        setError(e instanceof Error ? e.message : "Could not load FossilMapped latest finds.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className={`inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-lg border px-4 py-2.5 text-sm font-black transition-colors ${
          isOpen
            ? "border-emerald-500 bg-emerald-600 text-white"
            : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-200 dark:hover:bg-emerald-950/45"
        }`}
        aria-expanded={isOpen}
      >
        FossilMapped latest
        <ArrowRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
      </button>

      {isOpen && <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">FossilMapped</p>
            <h3 className="truncate text-sm font-black text-slate-950 dark:text-white">Latest shared finds</h3>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <a
              href={getCommunityUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-200 bg-white text-emerald-800 transition-colors hover:bg-emerald-600 hover:text-white dark:border-emerald-800 dark:bg-slate-950 dark:text-emerald-200"
              aria-label="Open FossilMapped"
              title="Open FossilMapped"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Hide latest shared finds"
              title="Hide latest shared finds"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
        {loading ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-400">
            Loading latest public finds
          </div>
        ) : error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100">
            {error}
          </div>
        ) : finds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-400">
            No public finds are available yet.
          </div>
        ) : (
          <div className="grid gap-2">
            {finds.map((find) => (
              <a
                key={find.id}
                href={getCommunityUrl(find.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="group grid min-w-0 grid-cols-[3.5rem_1fr_auto] gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-left no-underline transition-colors hover:border-emerald-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-emerald-800 dark:hover:bg-slate-900"
              >
                <div className="aspect-square overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800">
                  {find.photos[0] ? (
                    <img src={find.photos[0]} alt={find.taxon} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-slate-400">
                      <Camera className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">{find.taxon}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{find.locationName}</p>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {[find.formation, find.member].filter(Boolean).join(" / ") || "No formation recorded"}
                  </p>
                </div>
                <ArrowRight className="mr-1 mt-5 h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
              </a>
            ))}
          </div>
        )}
        </div>
      </section>}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
      {children}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
  actionLabel,
  onAction,
  tone = "emerald",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
  tone?: "emerald" | "amber";
}) {
  const actionClass = tone === "amber"
    ? "bg-amber-500 hover:bg-amber-600"
    : "bg-emerald-600 hover:bg-emerald-700";

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-black text-slate-950 dark:text-white">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">{detail}</p>
      <button onClick={onAction} className={`mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-black text-white transition-colors ${actionClass}`}>
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
