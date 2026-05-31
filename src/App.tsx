import React, { Suspense, useCallback, useEffect, useState } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Compass,
  Download,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  HardDrive,
  Home as HomeIcon,
  Map as MapIcon,
  MapPin,
  Microscope,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  Smartphone,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { db } from "./db";
import { ensureDefaultProject } from "./app/seed";
import { exportData, exportToCSV, importData, previewImportConflicts } from "./services/data";
import OnboardingFlow from "./components/OnboardingFlow";

import Home from "./pages/Home";

const LocalityPage = React.lazy(() => import("./pages/Locality"));
const SpecimenPage = React.lazy(() => import("./pages/Specimen"));
const SessionPage = React.lazy(() => import("./pages/SessionPage"));
const AllLocations = React.lazy(() => import("./pages/AllLocations"));
const MapPage = React.lazy(() => import("./pages/Map"));
const AllFinds = React.lazy(() => import("./pages/AllFinds"));
const Settings = React.lazy(() => import("./pages/Settings"));
const TidePage = React.lazy(() => import("./pages/TidePage"));
const TripsPage = React.lazy(() => import("./pages/Trips"));
const ToolsPage = React.lazy(() => import("./pages/Tools"));

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 512 512" fill="none" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#0f172a" />
      <path
        d="M96 340c58-94 118-142 180-142 23 0 38 9 52 22 8-54 26-92 54-114 12-10 30-6 38 8l14 26c8 15 1 34-15 40l-43 17c-7 50-20 91-40 122-21 33-52 49-93 49H128c-26 0-43-8-32-28Z"
        fill="#34d399"
      />
      <path d="M163 368h45v56h-45zM260 368h45v56h-45z" fill="#34d399" />
      <circle cx="398" cy="135" r="9" fill="#f8fafc" />
      <path d="M114 338c67-16 124-23 170-20 36 2 67 11 94 27" stroke="#064e3b" strokeWidth="18" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}

function Shell() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dismissedBackup, setDismissedBackup] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showQuotaWarning, setShowQuotaWarning] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    ensureDefaultProject().then(setProjectId);

    try {
      const isPWA = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || (navigator as any).standalone;
      setIsStandalone(!!isPWA);
    } catch {
      setIsStandalone(true);
    }

    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isFB = ua.includes("FBAN") || ua.includes("FBAV");
    const isInsta = ua.includes("Instagram");
    const isAndroid = /Android/i.test(ua);
    const isApple = /iPhone|iPad|iPod/i.test(ua);

    setIsIOS(isApple);
    if ((isFB || isInsta) && (isAndroid || isApple)) setIsInAppBrowser(true);

    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => false);
    }

    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(({ usage = 0, quota = 1 }) => {
        if (quota > 0 && usage / quota > 0.8) setShowQuotaWarning(true);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPromptEvent(null);
      setIsStandalone(true);
      setShowInstallHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const project = useLiveQuery(async () => (projectId ? db.projects.get(projectId) : null), [projectId]);
  const settings = useLiveQuery(() => db.settings.toArray());
  const lastBackup = settings?.find((s) => s.key === "lastBackup")?.value;
  const theme = settings?.find((s) => s.key === "theme")?.value ?? "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const dataCount = useLiveQuery(async () => {
    const [locations, finds, media] = await Promise.all([
      db.localities.count(),
      db.specimens.count(),
      db.media.count(),
    ]);
    return { locations, finds, media, total: locations + finds + media };
  }, []);

  const showBackupReminder =
    !dismissedBackup &&
    (dataCount?.total ?? 0) > 0 &&
    (!lastBackup || Date.now() - new Date(lastBackup).getTime() > 30 * 24 * 60 * 60 * 1000);

  const androidIntentUrl = `intent://${window.location.host}${window.location.pathname}#Intent;scheme=https;package=com.android.chrome;end`;

  const promptInstall = useCallback(async () => {
    if (!installPromptEvent) {
      setShowInstallHelp(true);
      return false;
    }
    try {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice.catch(() => null);
      setInstallPromptEvent(null);
      setShowInstallHelp(false);
      return true;
    } catch {
      setInstallPromptEvent(null);
      setShowInstallHelp(true);
      return false;
    }
  }, [installPromptEvent]);

  async function handleSnooze() {
    await db.settings.put({ key: "lastBackup", value: new Date().toISOString() });
    setDismissedBackup(true);
  }

  async function handleExport(includeMedia = true) {
    try {
      const json = await exportData({ includeMedia });
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = includeMedia
        ? `fossilmap-backup-${new Date().toISOString().slice(0, 10)}.json`
        : `fossilmap-records-only-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      if (includeMedia) {
        await db.settings.put({ key: "lastBackup", value: new Date().toISOString() });
        setDismissedBackup(true);
      }
    } catch (e) {
      alert("Export failed: " + e);
    }
  }

  async function handleCSVExport() {
    try {
      const csv = await exportToCSV();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fossilmap-records-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("CSV export failed: " + e);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const preview = await previewImportConflicts(text);
      const exportedAt = preview.exportedAt ? new Date(preview.exportedAt).toLocaleString() : "unknown date";
      const overwritten = preview.conflicts.overwrittenIds;
      const overwriteCount = Object.values(overwritten).reduce((sum, count) => sum + count, 0);
      const conflictLines = [
        overwriteCount > 0 ? `${overwriteCount} records have matching IDs and will be updated.` : "",
        preview.conflicts.localityNames.length > 0 ? `Matching locality names: ${preview.conflicts.localityNames.join(", ")}` : "",
        preview.conflicts.specimenCodes.length > 0 ? `Matching specimen codes: ${preview.conflicts.specimenCodes.join(", ")}` : "",
      ].filter(Boolean);
      const ok = confirm(
        `Import preview from ${exportedAt}:\n\n` +
          `${preview.localities} locations/trips\n` +
          `${preview.sessions} sessions\n` +
          `${preview.specimens} specimens\n` +
          `${preview.media} photos\n` +
          `${preview.settings} settings\n\n` +
          (conflictLines.length > 0 ? `Potential conflicts:\n${conflictLines.join("\n")}\n\n` : "No matching IDs, locality names or specimen codes found.\n\n") +
          "Continue with merge?"
      );
      if (!ok) return;
      await importData(text);
      alert("Import successful. FossilMap will reload now.");
      window.location.reload();
    } catch (err) {
      alert("Import failed: " + err);
    }
  }

  if (!projectId || !project) {
    return (
      <div className="grid min-h-screen place-items-center bg-stone-50 text-slate-700 dark:bg-slate-950 dark:text-slate-100">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Logo />
          <div>
            <p className="text-sm font-black">Loading FossilMap</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Opening your local field book.</p>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { to: "/",          label: "Home",      icon: HomeIcon  },
    { to: "/trips",     label: "Trips",     icon: Compass   },
    { to: "/locations", label: "Locations", icon: MapPin    },
    { to: "/finds",     label: "Finds",     icon: Microscope},
    { to: "/tools",     label: "Tools",     icon: Wrench    },
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-3 py-3 sm:px-5">
        {isInAppBrowser && (
          <div className="mb-3 rounded-lg border border-sky-300 bg-sky-700 p-4 text-white shadow-lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide">{isIOS ? "Open in Safari to install" : "Open in Chrome to install"}</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-sky-100">
                    In-app browsers can block home-screen install and durable storage. Open FossilMap in the system browser before serious recording.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {!isIOS && (
                  <a href={androidIntentUrl} className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-sky-700 no-underline">
                    Open Chrome
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <button onClick={() => setIsInAppBrowser(false)} className="rounded-lg border border-white/25 px-3 py-2 text-xs font-bold text-white/85 hover:bg-white/10">
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="mb-4 rounded-lg border border-slate-200 bg-white/92 p-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/92">
          <div className="flex min-w-0 items-center justify-between gap-3">
              <Link to="/" className="flex min-w-0 items-center gap-3 no-underline">
                <Logo />
                <div className="min-w-0">
                  <h1 className="m-0 truncate text-2xl font-black tracking-tight bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent sm:text-3xl">FossilMap</h1>
                  <p className="hidden text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300 sm:block">Local fossil field book</p>
                </div>
              </Link>

              <div className="flex items-center gap-2">
                {!isStandalone && (
                  <button
                    onClick={promptInstall}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-black text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/25 dark:text-amber-200"
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    Install
                  </button>
                )}

                <NavLink
                  to="/settings"
                  aria-label="Settings"
                  className={({ isActive }) =>
                    `grid h-9 w-9 place-items-center rounded-lg border transition-colors ${
                      isActive
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`
                  }
                >
                  <SettingsIcon className="h-4 w-4" />
                </NavLink>
              </div>
          </div>
        </header>

        <div className="mb-4 grid gap-3">
          {showInstallHelp && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-950 shadow-sm dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" />
                  <div>
                    <h2 className="text-sm font-black">Install FossilMap</h2>
                    <p className="mt-1 text-xs leading-relaxed text-sky-800 dark:text-sky-200">
                      {isIOS
                        ? "On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen."
                        : "On Android, open this page in Chrome, tap the three-dot menu, then Add to Home Screen or Install App."}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowInstallHelp(false)} className="grid h-8 w-8 place-items-center rounded-lg text-sky-700 hover:bg-sky-100 dark:text-sky-200 dark:hover:bg-sky-900/40" aria-label="Dismiss install help">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {showQuotaWarning && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-950 shadow-sm dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
              <div className="flex gap-3">
                <HardDrive className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <h2 className="text-sm font-black">Device storage is nearly full</h2>
                  <p className="mt-1 text-xs leading-relaxed text-red-800 dark:text-red-200">Back up now, then free device storage before adding more photos.</p>
                </div>
              </div>
            </div>
          )}

          {showBackupReminder && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                  <div>
                    <h2 className="text-sm font-black">Backup recommended</h2>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                      FossilMap is local-first. Your records and photos are on this device, so a recent JSON backup matters.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSnooze} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Later
                  </button>
                  <button onClick={() => handleExport(true)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700">
                    <FileDown className="h-3.5 w-3.5" />
                    Backup now
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <main className="flex-1 pb-24">
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<HomeRouter projectId={projectId} isStandalone={isStandalone} promptInstall={promptInstall} />} />
              <Route path="/locations" element={<AllLocations projectId={projectId} />} />
              <Route path="/location" element={<LocalityPage projectId={projectId} type="location" onSaved={(id) => nav(`/location/${id}`)} />} />
              <Route path="/location/:id" element={<LocalityPage projectId={projectId} onSaved={() => {}} />} />
              <Route path="/field-trip" element={<LocalityPage projectId={projectId} type="trip" onSaved={(id) => nav(`/field-trip/${id}`)} />} />
              <Route path="/field-trip/:id" element={<LocalityPage projectId={projectId} onSaved={() => {}} />} />
              <Route path="/session/new" element={<SessionPage projectId={projectId} />} />
              <Route path="/session/:id" element={<SessionPage projectId={projectId} />} />
              <Route path="/specimen" element={<SpecimenRouter projectId={projectId} />} />
              <Route path="/finds" element={<AllFinds projectId={projectId} />} />
              <Route path="/trips" element={<TripsPage projectId={projectId} />} />
              <Route path="/tools" element={<ToolsPage />} />
              <Route path="/map" element={<MapPage projectId={projectId} />} />
              <Route path="/tides" element={<TidePage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/locality" element={<LinkToFieldTrip />} />
              <Route path="/locality/:id" element={<LinkToFieldTrip />} />
            </Routes>
          </Suspense>
        </main>

      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-stretch border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-black transition-colors ${
                  isActive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <OnboardingFlow />
    </div>
  );
}

function PageLoading() {
  return (
    <div className="grid min-h-72 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      <div className="flex items-center gap-3">
        <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
        <span className="text-sm font-black">Loading FossilMap section</span>
      </div>
    </div>
  );
}

function LinkToFieldTrip() {
  const nav = useNavigate();
  const { id } = useParams();
  useEffect(() => {
    nav(id ? `/location/${id}` : "/location", { replace: true });
  }, [id, nav]);
  return null;
}

function HomeRouter({ projectId, isStandalone, promptInstall }: { projectId: string; isStandalone: boolean; promptInstall: () => Promise<boolean> }) {
  const nav = useNavigate();
  return (
    <Home
      projectId={projectId}
      isStandalone={isStandalone}
      promptInstall={promptInstall}
      goLocality={() => nav("/locations")}
      goNewLocality={() => nav("/location")}
      goFieldTrip={() => nav("/field-trip")}
      goLocalityEdit={(id: string, type?: "location" | "trip") => {
        nav(type === "trip" ? `/field-trip/${id}` : `/location/${id}`);
      }}
      goSpecimen={(localityId?: string) => {
        if (!localityId) {
          nav("/specimen");
        } else {
          const q = `?localityId=${encodeURIComponent(localityId)}`;
          nav(`/specimen${q}`);
        }
      }}
      goAllFinds={() => nav("/finds")}
      goFindsWithFilter={(query: string) => nav(`/finds?q=${encodeURIComponent(query)}`)}
      goMap={() => nav("/map")}
      goSettings={() => nav("/settings")}
    />
  );
}

function SpecimenRouter({ projectId }: { projectId: string }) {
  const [params] = useSearchParams();
  const localityId = params.get("localityId");
  const sessionId = params.get("sessionId");
  return <SpecimenPage projectId={projectId} localityId={localityId ?? null} sessionId={sessionId ?? null} />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Shell />
    </BrowserRouter>
  );
}
