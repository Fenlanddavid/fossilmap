import React, { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  HelpCircle,
  Mail,
  Moon,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";
import { db } from "../db";
import { exportData, getDataStats } from "../services/data";

export default function Settings() {
  const [collectorName, setCollectorName] = useState("");
  const [collectorEmail, setCollectorEmail] = useState("");
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [installCount, setInstallCount] = useState<number | null>(null);

  const settings = useLiveQuery(() => db.settings.toArray());
  const lastBackup = settings?.find((s) => s.key === "lastBackup")?.value;
  const defaultCollector = settings?.find((s) => s.key === "defaultCollector")?.value;
  const defaultEmail = settings?.find((s) => s.key === "defaultEmail")?.value;
  const theme = settings?.find((s) => s.key === "theme")?.value ?? "dark";

  const dataStats = useLiveQuery(getDataStats, []);

  useEffect(() => {
    if (defaultCollector) setCollectorName(defaultCollector);
    if (defaultEmail) setCollectorEmail(defaultEmail);
  }, [defaultCollector, defaultEmail]);

  useEffect(() => {
    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then(setIsPersisted).catch(() => setIsPersisted(null));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    fetch("https://fossilmap-counter.trials-uk.workers.dev/count", { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeoutId);
        if (typeof data.count === 'number') setInstallCount(data.count);
      })
      .catch(() => clearTimeout(timeoutId));
  }, []);

  async function saveCollector() {
    await db.settings.put({ key: "defaultCollector", value: collectorName.trim() });
    await db.settings.put({ key: "defaultEmail", value: collectorEmail.trim() });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  async function toggleTheme() {
    const newTheme = theme === "dark" ? "light" : "dark";
    await db.settings.put({ key: "theme", value: newTheme });
  }

  async function requestPersistence() {
    if (!navigator.storage?.persist) return;
    const persisted = await navigator.storage.persist();
    setIsPersisted(persisted);
    if (!persisted) {
      alert("Storage persistence could not be granted. This is usually controlled by the browser.");
    }
  }

  async function downloadBackup(includeMedia: boolean) {
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
    }
  }

  function replayOnboarding() {
    try {
      localStorage.setItem("fm_onboarding_force", "1");
      localStorage.removeItem("fm_onboarding_done");
    } catch {}
    window.location.assign(import.meta.env.BASE_URL || "/");
  }

  const backupAgeLabel = (() => {
    if (!lastBackup) return "Never";
    const days = Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  })();
  const mediaMb = ((dataStats?.mediaBytes ?? 0) / (1024 * 1024)).toFixed(1);
  const storageUsageMb = dataStats?.storageUsageBytes == null ? null : (dataStats.storageUsageBytes / (1024 * 1024)).toFixed(1);
  const storageQuotaMb = dataStats?.storageQuotaBytes == null ? null : (dataStats.storageQuotaBytes / (1024 * 1024)).toFixed(0);

  return (
    <div className="mx-auto grid max-w-4xl gap-6 pb-12">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">FossilMap settings</p>
        <h2 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">Profile, storage and quick start.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          These details support field trips, reports, community sharing and local data safety.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatTile icon={Database} label="Locations" value={dataStats?.localities ?? 0} />
        <StatTile icon={ShieldCheck} label="Finds" value={dataStats?.specimens ?? 0} />
        <StatTile icon={HardDrive} label="Photos" value={dataStats?.media ?? 0} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">Collector profile</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Used as the default collector on new trips and as contact context for shared finds.</p>
          </div>
          {saved && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-black text-slate-700 dark:text-slate-200">
              <User className="h-4 w-4" />
              Default collector name
            </span>
            <input
              type="text"
              value={collectorName}
              onChange={(e) => setCollectorName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-medium outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-emerald-900/50"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-black text-slate-700 dark:text-slate-200">
              <Mail className="h-4 w-4" />
              Contact email
            </span>
            <input
              type="email"
              value={collectorEmail}
              onChange={(e) => setCollectorEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-medium outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-emerald-900/50"
            />
          </label>
        </div>

        <button onClick={saveCollector} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-700">
          <Save className="h-4 w-4" />
          Save preferences
        </button>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-black text-slate-950 dark:text-white">Appearance</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Use the mode that works best in the field.</p>
          <button onClick={toggleTheme} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800">
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {theme === "dark" ? "Dark mode" : "Light mode"}
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-black text-slate-950 dark:text-white">Quick start</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Replay the onboarding flow without deleting any data.</p>
          <button onClick={replayOnboarding} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:bg-emerald-950/50">
            <HelpCircle className="h-4 w-4" />
            Show quick start
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">Storage and backup</h3>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              FossilMap stores its database in this browser profile. Persistent storage helps, but the Backup button is still the important protection.
            </p>
          </div>
          <div className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-black ${isPersisted ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200" : "bg-amber-50 text-amber-800 dark:bg-amber-950/35 dark:text-amber-200"}`}>
            <HardDrive className="h-3.5 w-3.5" />
            {isPersisted ? "Persistent" : isPersisted === false ? "Best effort" : "Unknown"}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <InfoRow icon={Download} label="Last JSON backup" value={lastBackup ? `${backupAgeLabel} (${new Date(lastBackup).toLocaleString()})` : "Never"} />
          <InfoRow icon={Database} label="Local records" value={`${dataStats?.localities ?? 0} places, ${dataStats?.specimens ?? 0} finds, ${dataStats?.media ?? 0} photos`} />
          <InfoRow icon={HardDrive} label="Photo payload" value={`${mediaMb} MB stored in FossilMap photos`} />
          <InfoRow icon={HardDrive} label="Browser storage" value={storageUsageMb && storageQuotaMb ? `${storageUsageMb} MB used of about ${storageQuotaMb} MB` : "Browser estimate unavailable"} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => downloadBackup(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">
            <Download className="h-4 w-4" />
            Full JSON backup
          </button>
          <button onClick={() => downloadBackup(false)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800">
            <Database className="h-4 w-4" />
            Records only
          </button>
          {!isPersisted && (
            <button onClick={requestPersistence} className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-black text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-100 dark:hover:bg-sky-950/50">
              <RefreshCcw className="h-4 w-4" />
              Request persistent storage
            </button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
          <div>
            <h3 className="font-black text-slate-950 dark:text-white">Privacy model</h3>
            <p className="mt-1 leading-relaxed text-slate-500 dark:text-slate-400">
              All FossilMap records stay on this device unless you choose to share an individual find with FossilMapped.
            </p>
            <a
              href={import.meta.env.VITE_COMMUNITY_URL || "https://Fenlanddavid.github.io/fossilmapped/"}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-emerald-700 no-underline hover:text-emerald-600 dark:text-emerald-300"
            >
              Open FossilMapped
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>

      {typeof installCount === 'number' && (
        <div className="flex justify-end">
          <span className="text-[11px] font-black tabular-nums text-slate-400 dark:text-slate-500">+{installCount.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <div className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">{value}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/45">
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-300" />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-1 break-words text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  );
}
