import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  HardDrive,
  HelpCircle,
  Loader2,
  Mail,
  Moon,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sun,
  Upload,
  User,
  X,
} from "lucide-react";
import { db } from "../db";
import {
  exportData,
  exportToCSV,
  getDataStats,
  importData,
  previewImportConflicts,
  type ImportConflictPreview,
} from "../services/data";
import { CoachTip } from "../components/CoachTip";
import { getCommunityUrl } from "../services/community";

const IMPORT_CONFIRMATION = "IMPORT";

type ExportKind = "full" | "records" | "csv";
type SettingsTab = "backup" | "profile" | "app" | "sharing";

type DataStatus = {
  type: "success" | "error";
  text: string;
};

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "backup", label: "Backup", icon: Database },
  { id: "profile", label: "Profile", icon: User },
  { id: "app", label: "App", icon: Sun },
  { id: "sharing", label: "Sharing", icon: ShieldCheck },
];

function isSettingsTab(value: string | null): value is SettingsTab {
  return value === "backup" || value === "profile" || value === "app" || value === "sharing";
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(() => {
    const urlTab = searchParams.get("tab");
    let savedTab: string | null = null;
    try {
      savedTab = localStorage.getItem("fm_settings_tab");
    } catch {}
    if (isSettingsTab(urlTab)) return urlTab;
    if (isSettingsTab(savedTab)) return savedTab;
    return "backup";
  });
  const [collectorName, setCollectorName] = useState("");
  const [collectorEmail, setCollectorEmail] = useState("");
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [installCount, setInstallCount] = useState<number | null>(null);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null);
  const [importPendingFile, setImportPendingFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportConflictPreview | null>(null);
  const [importPreviewError, setImportPreviewError] = useState<string | null>(null);
  const [importConfirmText, setImportConfirmText] = useState("");
  const [importing, setImporting] = useState(false);

  const settings = useLiveQuery(() => db.settings.toArray());
  const lastBackup = settings?.find((s) => s.key === "lastBackup")?.value;
  const defaultCollector = settings?.find((s) => s.key === "defaultCollector")?.value;
  const defaultEmail = settings?.find((s) => s.key === "defaultEmail")?.value;
  const theme = settings?.find((s) => s.key === "theme")?.value ?? "dark";

  const dataStats = useLiveQuery(getDataStats, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (!isSettingsTab(tab) || tab === settingsTab) return;
    setSettingsTab(tab);
    try {
      localStorage.setItem("fm_settings_tab", tab);
    } catch {}
  }, [searchParams, settingsTab]);

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
      .then((res) => res.json())
      .then((data) => {
        clearTimeout(timeoutId);
        if (typeof data.count === "number") setInstallCount(data.count);
      })
      .catch(() => clearTimeout(timeoutId));
  }, []);

  function selectSettingsTab(tab: SettingsTab) {
    setSettingsTab(tab);
    try {
      localStorage.setItem("fm_settings_tab", tab);
    } catch {}
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tab);
    setSearchParams(nextParams, { replace: true });
  }

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
    setDataStatus(null);
    if (!navigator.storage?.persist) {
      setDataStatus({
        type: "error",
        text: "This browser does not offer persistent storage. Keep a current downloaded backup.",
      });
      return;
    }

    try {
      const persisted = await navigator.storage.persist();
      setIsPersisted(persisted);
      setDataStatus({
        type: persisted ? "success" : "error",
        text: persisted
          ? "Persistent storage is now enabled for FossilMap on this device."
          : "The browser could not grant persistent storage. Keep a current downloaded backup.",
      });
    } catch (error) {
      setDataStatus({ type: "error", text: "Persistent storage request failed: " + error });
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadBackup(includeMedia: boolean) {
    const kind: ExportKind = includeMedia ? "full" : "records";
    setExporting(kind);
    setDataStatus(null);
    try {
      const json = await exportData({ includeMedia });
      const filename = includeMedia
        ? `fossilmap-backup-${new Date().toISOString().slice(0, 10)}.json`
        : `fossilmap-records-only-${new Date().toISOString().slice(0, 10)}.json`;
      triggerDownload(new Blob([json], { type: "application/json" }), filename);
      if (includeMedia) {
        await db.settings.put({ key: "lastBackup", value: new Date().toISOString() });
      }
      setDataStatus({
        type: "success",
        text: includeMedia
          ? `Full backup downloaded as ${filename}. Check your browser downloads before closing FossilMap.`
          : `Records-only backup downloaded as ${filename}. Photos were not included.`,
      });
    } catch (error) {
      setDataStatus({ type: "error", text: "Backup failed: " + error });
    } finally {
      setExporting(null);
    }
  }

  async function downloadCSV() {
    setExporting("csv");
    setDataStatus(null);
    try {
      const csv = await exportToCSV();
      const filename = `fossilmap-records-${new Date().toISOString().slice(0, 10)}.csv`;
      triggerDownload(new Blob([csv], { type: "text/csv" }), filename);
      setDataStatus({ type: "success", text: `CSV export downloaded as ${filename}.` });
    } catch (error) {
      setDataStatus({ type: "error", text: "CSV export failed: " + error });
    } finally {
      setExporting(null);
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportPendingFile(file);
    setImportPreview(null);
    setImportPreviewError(null);
    setImportConfirmText("");
    setDataStatus(null);

    try {
      const text = await file.text();
      const preview = await previewImportConflicts(text);
      setImportPreview(preview);
    } catch {
      setImportPreviewError("Preview unavailable. FossilMap will still validate the file before importing it.");
    }
  }

  function cancelImport() {
    setImportPendingFile(null);
    setImportPreview(null);
    setImportPreviewError(null);
    setImportConfirmText("");
  }

  async function confirmImport() {
    if (!importPendingFile || importConfirmText !== IMPORT_CONFIRMATION) return;
    const file = importPendingFile;
    setImporting(true);
    setDataStatus(null);
    try {
      const text = await file.text();
      await importData(text);
      cancelImport();
      setDataStatus({ type: "success", text: `Imported ${file.name}. FossilMap records have been refreshed on this device.` });
    } catch (error) {
      setDataStatus({ type: "error", text: "Import failed: " + error });
    } finally {
      setImporting(false);
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
  const importCanConfirm = importConfirmText === IMPORT_CONFIRMATION;
  const overwrittenCount = importPreview
    ? Object.values(importPreview.conflicts.overwrittenIds).reduce((sum, count) => sum + count, 0)
    : 0;

  function formatBackupDate(value?: string | null) {
    if (!value) return "Never";
    const date = new Date(value);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  const currentRows: Array<[string, number | string]> = dataStats ? [
    ["Projects", dataStats.projects],
    ["Locations", dataStats.localities],
    ["Sessions", dataStats.sessions],
    ["Finds", dataStats.specimens],
    ["Photos", dataStats.media],
    ["Settings", dataStats.settings],
  ] : [
    ["Projects", "Checking"],
    ["Locations", "Checking"],
    ["Sessions", "Checking"],
    ["Finds", "Checking"],
    ["Photos", "Checking"],
    ["Settings", "Checking"],
  ];

  const importRows: Array<[string, number | string]> = importPreview ? [
    ["Projects", importPreview.projects],
    ["Locations", importPreview.localities],
    ["Sessions", importPreview.sessions],
    ["Finds", importPreview.specimens],
    ["Photos", importPreview.media],
    ["Settings", importPreview.settings],
  ] : [];

  return (
    <div className="mx-auto grid max-w-4xl gap-4 pb-12 sm:gap-6">
      {importing && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" role="status" aria-live="assertive">
          <div className="w-full max-w-sm rounded-lg border border-emerald-200 bg-white p-5 text-center shadow-2xl dark:border-emerald-800 dark:bg-slate-900">
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-emerald-600 dark:text-emerald-300" />
            <h2 className="text-base font-black text-slate-950 dark:text-white">Importing backup</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Keep FossilMap open while the records and photos are imported.
            </p>
          </div>
        </div>
      )}

      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">FossilMap settings</p>
        <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Backup, profile and app settings.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Local data protection is first because FossilMap stores records and photos in this browser profile.
        </p>
      </header>

      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = settingsTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectSettingsTab(tab.id)}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-black transition-colors ${
                active
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-100"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
              aria-pressed={active}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {settingsTab === "backup" && (
        <>
          <section className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatTile icon={Database} label="Locations" value={dataStats?.localities ?? 0} />
            <StatTile icon={ShieldCheck} label="Finds" value={dataStats?.specimens ?? 0} />
            <StatTile icon={HardDrive} label="Photos" value={dataStats?.media ?? 0} />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950 dark:text-white">Storage and backup</h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  Persistent storage helps, but the downloaded JSON backup is the important copy to keep.
                </p>
              </div>
              <div className={`inline-flex items-center gap-1.5 self-start rounded-lg px-2.5 py-1 text-xs font-black ${isPersisted ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200" : "bg-amber-50 text-amber-800 dark:bg-amber-950/35 dark:text-amber-200"}`}>
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

            <div className="mt-5">
              <CoachTip storageKey="fm_tip_backup_import" title="Backup and import" tone="amber">
                Use full backup before changing phone or clearing browser data. Import updates matching records and leaves records not in the backup alone.
              </CoachTip>
            </div>

            {dataStatus && (
              <div
                className={`mt-5 flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${
                  dataStatus.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
                    : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"
                }`}
                role="status"
                aria-live="polite"
              >
                <div className="flex gap-2">
                  {dataStatus.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span className="font-bold leading-relaxed">{dataStatus.text}</span>
                </div>
                <button onClick={() => setDataStatus(null)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10" aria-label="Dismiss backup message">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-black text-emerald-950 dark:text-emerald-100">Full backup</h4>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800 dark:text-emerald-200">
                    Saves records, settings and photos into one JSON file. Keep this before changing phone or clearing browser data.
                  </p>
                </div>
                <button
                  onClick={() => downloadBackup(true)}
                  disabled={!!exporting || importing}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {exporting === "full" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  {exporting === "full" ? "Saving..." : "Backup now"}
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button
                onClick={() => downloadBackup(false)}
                disabled={!!exporting || importing}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {exporting === "records" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                {exporting === "records" ? "Saving..." : "Records-only JSON"}
              </button>
              <button
                onClick={downloadCSV}
                disabled={!!exporting || importing}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {exporting === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {exporting === "csv" ? "Exporting..." : "Export CSV"}
              </button>
              <label className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800 ${importing || !!exporting ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                <Upload className="h-4 w-4" />
                Import backup
                {!importing && !exporting && <input type="file" accept=".json,application/json" onChange={handleImportFile} className="hidden" />}
              </label>
            </div>

            {importPendingFile && (
              <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="font-black">Import "{importPendingFile.name}"?</h4>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                      FossilMap will import this backup and update matching records. Records not in the backup are left alone, so this works for merging a backup into the current device.
                    </p>
                  </div>
                  {importPreview?.exportedAt && (
                    <span className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-800 dark:bg-amber-900/50 dark:text-amber-100">
                      {formatBackupDate(importPreview.exportedAt)}
                    </span>
                  )}
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-200">Current data on this device</div>
                    <div className="grid grid-cols-2 gap-2">
                      {currentRows.map(([label, count]) => (
                        <DataCountTile key={label} label={label} count={count} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-200">Backup to import</div>
                    {importPreview ? (
                      <div className="grid grid-cols-2 gap-2">
                        {importRows.map(([label, count]) => (
                          <DataCountTile key={label} label={label} count={count} />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-200 bg-white/70 p-3 text-xs font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                        {importPreviewError ?? "Reading backup preview..."}
                      </div>
                    )}
                  </div>
                </div>

                {importPreview && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-white/70 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    {overwrittenCount > 0 ? (
                      <p><strong>{overwrittenCount} matching records</strong> will be updated from the backup.</p>
                    ) : (
                      <p>No matching record IDs found. This looks like a new import on this device.</p>
                    )}
                    {(importPreview.conflicts.localityNames.length > 0 || importPreview.conflicts.specimenCodes.length > 0) && (
                      <p className="mt-1">
                        Similar names/codes found: {[...importPreview.conflicts.localityNames, ...importPreview.conflicts.specimenCodes].join(", ")}
                      </p>
                    )}
                  </div>
                )}

                <label className="mt-4 block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-200">Type IMPORT to continue</span>
                  <input
                    type="text"
                    value={importConfirmText}
                    onChange={(event) => setImportConfirmText(event.target.value)}
                    disabled={importing}
                    className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60 dark:border-amber-800 dark:bg-slate-950 dark:text-slate-100"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={confirmImport}
                    disabled={importing || !importCanConfirm}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {importing ? "Importing..." : "Confirm import"}
                  </button>
                  <button
                    disabled={importing}
                    onClick={cancelImport}
                    className="rounded-lg px-3 py-2.5 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:text-amber-200 dark:hover:bg-amber-900/40"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {!isPersisted && (
                <button onClick={requestPersistence} className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-black text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-100 dark:hover:bg-sky-950/50">
                  <RefreshCcw className="h-4 w-4" />
                  Request persistent storage
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {settingsTab === "profile" && (
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
      )}

      {settingsTab === "app" && (
        <>
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

        </>
      )}

      {settingsTab === "sharing" && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
            <div>
              <h3 className="font-black text-slate-950 dark:text-white">Privacy model</h3>
              <p className="mt-1 leading-relaxed text-slate-500 dark:text-slate-400">
                All FossilMap records stay on this device unless you choose to share an individual find with FossilMapped.
              </p>
              <a
                href={getCommunityUrl()}
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
      )}

      {typeof installCount === "number" && (
        <div className="flex justify-end">
          <span className="text-[11px] font-black tabular-nums text-slate-400 dark:text-slate-500">+{installCount.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-1 sm:mb-3">
        <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
        <span className="truncate text-[9px] font-black uppercase tracking-widest text-slate-400 sm:text-[10px]">{label}</span>
      </div>
      <div className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{value}</div>
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

function DataCountTile({ label, count }: { label: string; count: number | string }) {
  return (
    <div className="rounded-lg border border-amber-100 bg-white/75 px-2 py-1.5 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="text-[9px] font-black uppercase tracking-widest text-amber-600/80 dark:text-amber-300/75">{label}</div>
      <div className="text-sm font-black tabular-nums text-amber-950 dark:text-amber-50">{count}</div>
    </div>
  );
}
