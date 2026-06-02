import React, { Suspense, useCallback, useEffect, useState } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  Compass,
  ExternalLink,
  FileDown,
  HardDrive,
  Home as HomeIcon,
  MapPin,
  Microscope,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  Smartphone,
  Wrench,
  X,
} from "lucide-react";
import { db } from "./db";
import { ensureDefaultProject } from "./app/seed";
import { UPDATE_NOTES } from "./version";
import OnboardingFlow from "./components/OnboardingFlow";
import { useConfirmDialog } from "./components/ConfirmModal";
import GlobalQuickFind from "./components/GlobalQuickFind";

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
    <svg width="32" height="32" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M50 400
           C 150 400, 180 250, 320 250
           C 340 250, 350 150, 370 100
           L 460 100
           L 460 180
           L 380 180
           C 360 180, 350 350, 320 350
           L 150 350
           C 100 350, 50 400, 50 400 Z"
        fill="#10b981"
      />
      <rect x="180" y="350" width="35" height="100" fill="#10b981" rx="15" />
      <rect x="260" y="350" width="35" height="100" fill="#10b981" rx="15" />
      <circle cx="420" cy="130" r="10" fill="white" />
    </svg>
  );
}

function Shell() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const { confirm: confirmAction, notify, dialog } = useConfirmDialog();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dismissedBackup, setDismissedBackup] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showQuotaWarning, setShowQuotaWarning] = useState(false);
  const [updatingApp, setUpdatingApp] = useState(false);
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
      // Ping the install counter once per device
      db.settings.get("fm_installed").then(existing => {
        if (!existing) {
          db.settings.put({ key: "fm_installed", value: "true" });
          fetch("https://fossilmap-counter.trials-uk.workers.dev/up").catch(() => {});
        }
      }).catch(() => {});
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
  const backupSnoozedUntil = settings?.find((s) => s.key === "backupSnoozedUntil")?.value;
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

  const lastBackupTime = lastBackup ? new Date(lastBackup).getTime() : null;
  const backupSnoozedUntilTime = backupSnoozedUntil ? new Date(backupSnoozedUntil).getTime() : null;
  const isBackupSnoozed = backupSnoozedUntilTime != null && Number.isFinite(backupSnoozedUntilTime) && Date.now() < backupSnoozedUntilTime;
  const backupIsStale = !lastBackupTime || !Number.isFinite(lastBackupTime) || Date.now() - lastBackupTime > 30 * 24 * 60 * 60 * 1000;
  const showBackupReminder =
    !dismissedBackup &&
    (dataCount?.total ?? 0) > 0 &&
    !isBackupSnoozed &&
    backupIsStale;

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
    const snoozedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.settings.put({ key: "backupSnoozedUntil", value: snoozedUntil });
    setDismissedBackup(true);
  }

  function openBackupSettings() {
    setDismissedBackup(true);
    nav("/settings?tab=backup");
  }

  async function handleAppUpdate() {
    const ok = await confirmAction({
      title: "Update FossilMap?",
      message: "The app will reload. Finish any unsaved form entry before continuing.",
      confirmLabel: "Update",
      tone: "warning",
    });
    if (!ok) return;
    setUpdatingApp(true);
    try {
      await updateServiceWorker(true);
    } catch (e) {
      setUpdatingApp(false);
      await notify({
        title: "Update failed",
        message: String(e),
        tone: "danger",
      });
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
                    `inline-flex h-9 items-center justify-center rounded-lg border transition-colors ${
                      isStandalone ? "px-3 text-xs font-black" : "w-9"
                    } ${
                      isActive
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`
                  }
                >
                  {isStandalone ? "Settings" : <SettingsIcon className="h-4 w-4" />}
                </NavLink>
              </div>
          </div>
        </header>

        <div className="mb-4 grid gap-3">
          {needRefresh && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-950 shadow-sm dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-100">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" />
                  <div>
                    <h2 className="text-sm font-black">Update available</h2>
                    <p className="mt-1 text-xs leading-relaxed text-sky-800 dark:text-sky-200">
                      {UPDATE_NOTES} Tap update when you are ready to reload.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleAppUpdate}
                  disabled={updatingApp}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-sky-700 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${updatingApp ? "animate-spin" : ""}`} />
                  {updatingApp ? "Updating" : "Update FossilMap"}
                </button>
              </div>
            </div>
          )}

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
                  <button onClick={openBackupSettings} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700">
                    <FileDown className="h-3.5 w-3.5" />
                    Open backup
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

      <GlobalQuickFind projectId={projectId} />
      <OnboardingFlow />
      {dialog}
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
      goPendingFinds={() => nav("/finds?view=pending")}
      goFindsWithFilter={(query: string) => nav(`/finds?q=${encodeURIComponent(query)}`)}
      goMap={() => nav("/map")}
      goSettings={() => nav("/settings")}
      goBackupSettings={() => nav("/settings?tab=backup")}
      goSession={(id: string) => nav(`/session/${id}`)}
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
