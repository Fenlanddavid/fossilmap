import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  Camera,
  ChevronRight,
  Clock,
  Compass,
  Download,
  HardDrive,
  Map as MapIcon,
  MapPin,
  Microscope,
  Plus,
  Search,
  Settings,
  Smartphone,
  Upload,
  Zap,
} from "lucide-react";
import { QuickFindSheet } from "../components/QuickFindSheet";
import { v4 as uuid } from "uuid";
import { db, Media } from "../db";
import { SpecimenThumbnail } from "../components/SpecimenThumbnail";
import { LocalityThumbnail } from "../components/LocalityThumbnail";
import { LocalityFindsList } from "../components/LocalityFindsList";
import { fileToBlob } from "../services/photos";

const SpecimenModal = React.lazy(() =>
  import("../components/SpecimenModal").then((mod) => ({ default: mod.SpecimenModal }))
);

export default function Home(props: {
  projectId: string;
  isStandalone: boolean;
  promptInstall: () => Promise<boolean>;
  goLocality: () => void;
  goNewLocality: () => void;
  goFieldTrip: () => void;
  goLocalityEdit: (id: string, type?: "location" | "trip") => void;
  goSpecimen: (localityId?: string) => void;
  goAllFinds: () => void;
  goFindsWithFilter: (query: string) => void;
  goMap: () => void;
  goSettings: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [openSpecimenId, setOpenSpecimenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showQuickFind, setShowQuickFind] = useState(false);
  const [quickFindLocalityId, setQuickFindLocalityId] = useState<string | null>(null);

  const activeSessions = useLiveQuery(async () => {
    const sessions = await db.sessions.toCollection().filter((s) => !s.isFinished).toArray();
    const map = new Map<string, any>();
    for (const s of sessions) map.set(s.localityId, s);
    return map;
  }, []);

  const localities = useLiveQuery(
    async () => {
      const collection = db.localities.where("projectId").equals(props.projectId);
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return collection
          .filter((l) =>
            l.name.toLowerCase().includes(query) ||
            (l.formation?.toLowerCase().includes(query) ?? false) ||
            (l.period?.toLowerCase().includes(query) ?? false) ||
            (l.stage?.toLowerCase().includes(query) ?? false)
          )
          .reverse()
          .sortBy("createdAt");
      }
      return collection.reverse().sortBy("createdAt");
    },
    [props.projectId, searchQuery]
  );

  const specimens = useLiveQuery(
    async () => db.specimens.where("projectId").equals(props.projectId).reverse().sortBy("createdAt"),
    [props.projectId]
  );

  const dashboard = useLiveQuery(async () => {
    const [locations, specimensCount, mediaCount, sessions, settings] = await Promise.all([
      db.localities.where("projectId").equals(props.projectId).toArray(),
      db.specimens.where("projectId").equals(props.projectId).count(),
      db.media.where("projectId").equals(props.projectId).count(),
      db.sessions.where("projectId").equals(props.projectId).toArray(),
      db.settings.toArray(),
    ]);

    const trips = locations.filter((l) => l.type === "trip").length;
    const fixedLocations = locations.filter((l) => l.type !== "trip").length;
    const active = sessions.filter((s) => !s.isFinished).length;
    const lastBackup = settings.find((s) => s.key === "lastBackup")?.value as string | undefined;
    const defaultCollector = settings.find((s) => s.key === "defaultCollector")?.value as string | undefined;

    return {
      locations: fixedLocations,
      trips,
      finds: specimensCount,
      media: mediaCount,
      active,
      lastBackup,
      defaultCollector,
    };
  }, [props.projectId]);

  const recentFinds = useMemo(() => specimens?.slice(0, 8) ?? [], [specimens]);
  const visibleLocalities = useMemo(() => localities?.slice(0, searchQuery.trim() ? 24 : 8) ?? [], [localities, searchQuery]);
  const hasAnyData = (dashboard?.locations ?? 0) + (dashboard?.trips ?? 0) + (dashboard?.finds ?? 0) > 0;

  const nextMove = useMemo(() => {
    if (!dashboard) return null;

    const activeEntry = activeSessions && Array.from(activeSessions.entries())[0];
    if (activeEntry) {
      const locality = localities?.find((l) => l.id === activeEntry[0]);
      return {
        icon: Clock,
        tone: "emerald" as const,
        title: "Resume active field trip",
        detail: locality?.name ? `Continue recording at ${locality.name}.` : "A field trip is still open.",
        label: "Add a find",
        action: () => props.goSpecimen(activeEntry[0]),
      };
    }

    if (!dashboard.defaultCollector) {
      return {
        icon: Settings,
        tone: "amber" as const,
        title: "Set your collector details",
        detail: "Your name and contact email can be reused on trips, reports and shared finds.",
        label: "Open settings",
        action: props.goSettings,
      };
    }

    if (!hasAnyData) {
      return {
        icon: Compass,
        tone: "blue" as const,
        title: "Start with a field trip",
        detail: "Use a trip for a day out, or create a fixed locality if you revisit the same exposure.",
        label: "Start field trip",
        action: props.goFieldTrip,
      };
    }

    if (dashboard.finds === 0) {
      return {
        icon: Microscope,
        tone: "emerald" as const,
        title: "Record your first specimen",
        detail: "Add taxon, element, GPS, dimensions and photographs while the context is fresh.",
        label: "Record find",
        action: () => props.goSpecimen(),
      };
    }

    const lastBackupAge = dashboard.lastBackup ? (Date.now() - new Date(dashboard.lastBackup).getTime()) / 86400000 : Infinity;
    if (lastBackupAge > 30) {
      return {
        icon: Download,
        tone: "amber" as const,
        title: "Make a fresh backup",
        detail: "Your fossil photos and records are local to this device.",
        label: "Open settings",
        action: props.goSettings,
      };
    }

    if (!props.isStandalone) {
      return {
        icon: Smartphone,
        tone: "blue" as const,
        title: "Install FossilMap",
        detail: "Use it from your home screen before heading into the field.",
        label: "Install app",
        action: () => props.promptInstall(),
      };
    }

    return {
      icon: MapIcon,
      tone: "slate" as const,
      title: "Review your distribution map",
      detail: "Look for clusters by formation, taxon, period or collecting date.",
      label: "Open map",
      action: props.goMap,
    };
  }, [dashboard, activeSessions, localities, hasAnyData, props]);

  async function addLocalityPhoto(localityId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const file = files[0];
      const blob = await fileToBlob(file);
      const item: Media = {
        id: uuid(),
        projectId: props.projectId,
        localityId,
        type: "photo",
        filename: file.name,
        mime: file.type || "image/jpeg",
        blob,
        caption: "Locality photo",
        scalePresent: false,
        createdAt: new Date().toISOString(),
      };
      await db.media.add(item);
    } catch (e) {
      console.error("Locality photo failed:", e);
      alert("Failed to save photo.");
    } finally {
      setBusy(false);
    }
  }

  async function finishTrip(localityId: string) {
    if (!confirm("Finish this field trip? This records the end time and stops the active visit.")) return;
    const session = activeSessions?.get(localityId);
    if (session) {
      await db.sessions.update(session.id, {
        isFinished: true,
        endTime: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const statItems = [
    { label: "Locations", value: dashboard?.locations ?? 0, icon: MapPin },
    { label: "Trips", value: dashboard?.trips ?? 0, icon: Compass },
    { label: "Finds", value: dashboard?.finds ?? 0, icon: Microscope },
    { label: "Photos", value: dashboard?.media ?? 0, icon: Camera },
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-6 pb-10">
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Fossil field records</p>
              {!hasAnyData ? (
                <>
                  <h2 className="text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">Record the fossil, the place and the evidence together.</h2>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    FossilMap is built for field context: locality, stratigraphy, photos, measurements, safe access notes and optional community sharing.
                  </p>
                </>
              ) : (
                <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-2xl">Your field book</h2>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <PrimaryAction icon={Compass} label="Field Trip" onClick={props.goFieldTrip} />
              <PrimaryAction icon={Microscope} label="Specimen" onClick={() => props.goSpecimen()} />
              <SecondaryAction icon={MapPin} label="Location" onClick={props.goNewLocality} />
              <SecondaryAction icon={MapIcon} label="Map" onClick={props.goMap} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {statItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center justify-between">
                  <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</span>
                </div>
                <div className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        {nextMove && <NextMoveCard item={nextMove} />}

        {!hasAnyData && (
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-3">
            <WorkflowStep icon={MapPin} title="Locality" detail="Where and what geology." />
            <WorkflowStep icon={Compass} title="Trip" detail="The collecting visit." />
            <WorkflowStep icon={Microscope} title="Specimen" detail="The fossil record." />
          </div>
        )}
      </section>

      {!hasAnyData && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">First run</p>
              <h3 className="text-xl font-black text-slate-950 dark:text-white">Start simple, then add detail as you go.</h3>
              <p className="mt-2 text-sm leading-relaxed text-emerald-900/75 dark:text-emerald-100/75">
                You can create a full locality record, or just start a trip and record finds. FossilMap will keep the relationships together.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button onClick={props.goFieldTrip} className="rounded-lg bg-emerald-600 px-4 py-3 text-left text-sm font-black text-white shadow-sm hover:bg-emerald-700">
                Start field trip
                <span className="mt-1 block text-xs font-medium text-white/70">Best for today</span>
              </button>
              <button onClick={props.goNewLocality} className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-left text-sm font-black text-emerald-900 shadow-sm hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-100">
                Add locality
                <span className="mt-1 block text-xs font-medium text-emerald-700/70 dark:text-emerald-200/60">Known site</span>
              </button>
              <button onClick={props.goSettings} className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-left text-sm font-black text-emerald-900 shadow-sm hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-100">
                Set profile
                <span className="mt-1 block text-xs font-medium text-emerald-700/70 dark:text-emerald-200/60">Collector details</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">Quick filters</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Jump into common fossil groups without typing.</p>
          </div>
          <button onClick={props.goAllFinds} className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:self-auto">
            All finds
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-hide">
          {["Ammonite", "Belemnite", "Ichthyosaur", "Pliosaur", "Plesiosaur", "Dinosaur", "Fish", "Shark Tooth", "Gryphaea", "Brachiopod", "Echinoid", "Trace", "Plant"].map((label) => (
            <button
              key={label}
              onClick={() => props.goFindsWithFilter(label.replace(" Tooth", ""))}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">Locations and trips</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{localities?.length ?? 0} shown from your local field book.</p>
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Search locality, period, formation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-emerald-900/50"
                />
              </div>
              <button onClick={props.goLocality} className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:inline-flex">
                View all
              </button>
            </div>
          </div>

          {(!localities || visibleLocalities.length === 0) && (
            <EmptyState
              icon={MapPin}
              title={searchQuery ? "No matching localities" : "No locations or trips yet"}
              detail={searchQuery ? "Try a different taxon, period, formation or locality name." : "Create a field trip or locality to begin your field book."}
              actionLabel={searchQuery ? "Clear search" : "Start field trip"}
              onAction={searchQuery ? () => setSearchQuery("") : props.goFieldTrip}
            />
          )}

          {visibleLocalities.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleLocalities.map((locality) => {
                const activeSession = activeSessions?.get(locality.id);
                const isActive = !!activeSession;
                return (
                  <article key={locality.id} className={`group grid min-h-44 grid-cols-[1fr_7.25rem] overflow-hidden rounded-lg border bg-white shadow-sm transition-all hover:shadow-md dark:bg-slate-900 ${isActive ? "border-emerald-400 ring-1 ring-emerald-400" : "border-slate-200 dark:border-slate-800"}`}>
                    <div className="flex min-w-0 flex-col p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <button
                          onClick={() => props.goLocalityEdit(locality.id, locality.type)}
                          className="min-w-0 truncate text-left text-base font-black text-slate-950 transition-colors hover:text-emerald-700 dark:text-white dark:hover:text-emerald-300"
                        >
                          {locality.name || "(Unnamed)"}
                        </button>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${locality.type === "trip" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"}`}>
                          {locality.type === "trip" ? "Trip" : "Site"}
                        </span>
                      </div>

                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {locality.period && <Pill>{locality.period}</Pill>}
                        {locality.stage && <Pill>{locality.stage}</Pill>}
                        {locality.formation && <Pill muted>{locality.formation}</Pill>}
                      </div>

                      <div className="mb-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {locality.lat && locality.lon ? `${locality.lat.toFixed(4)}, ${locality.lon.toFixed(4)}` : "No GPS set"}
                      </div>

                      <LocalityFindsList localityId={locality.id} />

                      <div className="mt-auto flex items-center gap-2 pt-3">
                        {isActive ? (
                          <>
                            <button onClick={() => props.goSpecimen(locality.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-black text-white hover:bg-emerald-700">
                              <Plus className="h-3.5 w-3.5" />
                              Find
                            </button>
                            <button onClick={() => finishTrip(locality.id)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-black text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/25 dark:text-red-200">
                              Finish
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => props.goSpecimen(locality.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-black text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-200">
                              <Plus className="h-3.5 w-3.5" />
                              Add find
                            </button>
                            <button onClick={() => props.goLocalityEdit(locality.id, locality.type)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-black text-slate-500 hover:text-slate-900 dark:hover:text-white">
                              Open
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="relative border-l border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                      <LocalityThumbnail localityId={locality.id} className="h-full w-full" imgClassName="object-cover" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/0 opacity-0 transition-opacity group-hover:bg-slate-950/60 group-hover:opacity-100">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-[10px] font-black text-slate-900 shadow-sm">
                          <Camera className="h-3.5 w-3.5" />
                          Camera
                          <input type="file" accept="image/*" capture="environment" disabled={busy} className="hidden" onChange={(e) => addLocalityPhoto(locality.id, e.target.files)} />
                        </label>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/25 bg-white/15 px-2 py-1.5 text-[10px] font-black text-white backdrop-blur">
                          <Upload className="h-3.5 w-3.5" />
                          Upload
                          <input type="file" accept="image/*" disabled={busy} className="hidden" onChange={(e) => addLocalityPhoto(locality.id, e.target.files)} />
                        </label>
                      </div>
                      {(locality.sssi || locality.rigs) && (
                        <div className="absolute right-2 top-2 rounded bg-amber-500 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">
                          Protected
                        </div>
                      )}
                      {isActive && <div className="absolute left-2 top-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">Active</div>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="grid content-start gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950 dark:text-white">Recent finds</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{recentFinds.length} latest records</p>
              </div>
              <button onClick={props.goAllFinds} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
                All
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {recentFinds.length === 0 ? (
              <EmptyMini icon={Microscope} title="No finds yet" detail="Record a specimen to see it here." actionLabel="Record find" onAction={() => props.goSpecimen()} />
            ) : (
              <div className="grid gap-2">
                {recentFinds.map((find) => (
                  <button
                    key={find.id}
                    onClick={() => setOpenSpecimenId(find.id)}
                    className="grid grid-cols-[3.5rem_1fr] gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-left transition-colors hover:border-emerald-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-emerald-800 dark:hover:bg-slate-950"
                  >
                    <div className="aspect-square overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                      <SpecimenThumbnail specimenId={find.id} className="h-full w-full" imgClassName="object-cover" />
                    </div>
                    <div className="min-w-0 self-center">
                      <p className="truncate text-sm font-black text-slate-900 dark:text-white">{find.taxon || "Unidentified"}</p>
                      <p className="mt-0.5 truncate text-[11px] font-mono text-slate-500 dark:text-slate-400">{find.specimenCode}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {find.period && <Pill>{find.period}</Pill>}
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{find.taxonConfidence}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex gap-3">
              <HardDrive className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
              <div>
                <h3 className="text-sm font-black text-slate-950 dark:text-white">Local-first storage</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Backup regularly. Photos can make the local database large, especially on mobile.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <a
        href={import.meta.env.VITE_COMMUNITY_URL || "/fossilmapped/"}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-4 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-md hover:shadow-lg hover:scale-[1.008] hover:-translate-y-px transition-all duration-200 ease-out cursor-pointer group no-underline"
      >
        <svg width="40" height="40" viewBox="0 0 512 512" fill="none" className="shrink-0">
          <defs>
            <linearGradient id="fm-banner-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="50%" stopColor="#059669" />
              <stop offset="100%" stopColor="#0d9488" />
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="112" fill="url(#fm-banner-grad)" opacity="0.15" />
          <circle cx="256" cy="256" r="160" stroke="url(#fm-banner-grad)" strokeWidth="24" fill="none" />
          <circle cx="256" cy="256" r="80" fill="url(#fm-banner-grad)" opacity="0.5" />
          <circle cx="256" cy="256" r="30" fill="url(#fm-banner-grad)" />
          <path d="M256 96 L256 176 M256 336 L256 416 M96 256 L176 256 M336 256 L416 256" stroke="url(#fm-banner-grad)" strokeWidth="20" strokeLinecap="round" opacity="0.35" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="font-black text-slate-800 dark:text-slate-100 text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">FossilMapped</div>
          <div className="text-[11px] text-slate-500/80 dark:text-slate-400/80 mt-0.5 leading-snug">See what the community is finding across the UK</div>
        </div>
        <span className="shrink-0 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-all">
          Open
        </span>
      </a>

      {/* Quick Find FAB — only show when user has data */}
      {hasAnyData && (
        <button
          onClick={() => {
            const active = activeSessions && Array.from(activeSessions.entries())[0];
            setQuickFindLocalityId(active ? active[0] : null);
            setShowQuickFind(true);
          }}
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 shadow-xl transition-all hover:bg-emerald-700 hover:shadow-2xl active:scale-95"
          aria-label="Quick Find"
        >
          <Zap className="h-6 w-6 text-white" />
        </button>
      )}

      {showQuickFind && (
        <QuickFindSheet
          projectId={props.projectId}
          localityId={quickFindLocalityId}
          onClose={() => setShowQuickFind(false)}
          onSaved={() => {
            // Find saved — sheet resets itself for next entry
          }}
        />
      )}

      {openSpecimenId && (
        <React.Suspense fallback={null}>
          <SpecimenModal specimenId={openSpecimenId} onClose={() => setOpenSpecimenId(null)} />
        </React.Suspense>
      )}
    </div>
  );
}

function PrimaryAction({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-emerald-700">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SecondaryAction({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function WorkflowStep({ icon: Icon, title, detail }: { icon: React.ComponentType<{ className?: string }>; title: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/45">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-black text-slate-950 dark:text-white">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

function NextMoveCard({ item }: { item: { icon: React.ComponentType<{ className?: string }>; tone: "emerald" | "blue" | "amber" | "slate"; title: string; detail: string; label: string; action: () => void } }) {
  const Icon = item.icon;
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
    blue: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100",
    amber: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
    slate: "border-slate-200 bg-white text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-white",
  };
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${tones[item.tone]}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/75 shadow-sm dark:bg-slate-950/45">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] opacity-60">Next move</p>
            <h3 className="mt-1 text-base font-black">{item.title}</h3>
            <p className="mt-1 text-sm leading-relaxed opacity-75">{item.detail}</p>
          </div>
        </div>
        <button onClick={item.action} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-black text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
          {item.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
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

function EmptyState({ icon: Icon, title, detail, actionLabel, onAction }: { icon: React.ComponentType<{ className?: string }>; title: string; detail: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-black text-slate-950 dark:text-white">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{detail}</p>
      <button onClick={onAction} className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700">
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EmptyMini({ icon: Icon, title, detail, actionLabel, onAction }: { icon: React.ComponentType<{ className?: string }>; title: string; detail: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-950/45">
      <Icon className="mx-auto mb-3 h-6 w-6 text-slate-400" />
      <h4 className="text-sm font-black text-slate-900 dark:text-white">{title}</h4>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
      <button onClick={onAction} className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">
        {actionLabel}
      </button>
    </div>
  );
}
