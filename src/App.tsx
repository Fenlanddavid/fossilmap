import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { ensureDefaultProject } from "./app/seed";
import { exportData, importData, exportToCSV } from "./services/data";

import Home from "./pages/Home";
import LocalityPage from "./pages/Locality";
import SpecimenPage from "./pages/Specimen";
import MapPage from "./pages/Map";
import AllFinds from "./pages/AllFinds";
import Settings from "./pages/Settings";
import TidePage from "./pages/TidePage";

export function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* recognizable Long-neck Dinosaur silhouette */}
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
      {/* Legs */}
      <rect x="180" y="350" width="35" height="100" fill="#10b981" rx="15" />
      <rect x="260" y="350" width="35" height="100" fill="#10b981" rx="15" />
      {/* Eye */}
      <circle cx="420" cy="130" r="10" fill="white" />
    </svg>
  );
}

function Shell() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dismissedBackup, setDismissedBackup] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    ensureDefaultProject().then(setProjectId);
    
    // Request persistent storage
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        if (granted) console.log("Storage persistence granted.");
      });
    }
  }, []);

  const project = useLiveQuery(async () => (projectId ? db.projects.get(projectId) : null), [projectId]);
  const settings = useLiveQuery(() => db.settings.toArray());
  const lastBackup = settings?.find(s => s.key === "lastBackup")?.value;

  const showBackupReminder = !dismissedBackup && (!lastBackup || (Date.now() - new Date(lastBackup).getTime() > 30 * 24 * 60 * 60 * 1000));

  async function handleExport() {
    try {
      const json = await exportData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fossilmap-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      // Record backup time
      await db.settings.put({ key: "lastBackup", value: new Date().toISOString() });
      setDismissedBackup(true);
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
      alert("CSV Export failed: " + e);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("This will merge imported data into your current database. Continue?")) return;
    
    try {
      const text = await file.text();
      await importData(text);
      alert("Import successful! Reloading to refresh data...");
      window.location.reload();
    } catch (e) {
      alert("Import failed: " + e);
    }
  }

  if (!projectId || !project) return <div className="p-4 text-center">Loading FossilMap…</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 font-sans text-gray-900 dark:text-gray-100 min-h-screen">
      <header className="flex items-center gap-4 mb-4 flex-wrap border-b border-gray-200 dark:border-gray-700 pb-4">
        <Link to="/" className="no-underline flex items-center gap-3">
          <Logo />
          <h1 className="m-0 text-2xl font-black tracking-tight bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">FossilMap</h1>
        </Link>

        <nav className="flex gap-4 ml-2 flex-wrap items-center text-sm font-medium text-gray-600 dark:text-gray-300">
          <NavLink to="/" className={({ isActive }) => `hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${isActive ? "text-blue-600 dark:text-blue-400 font-bold" : ""}`}>Home</NavLink>
          <NavLink to="/map" className={({ isActive }) => `hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${isActive ? "text-blue-600 dark:text-blue-400 font-bold" : ""}`}>Map</NavLink>
          <NavLink to="/tides" className={({ isActive }) => `hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${isActive ? "text-blue-600 dark:text-blue-400 font-bold" : ""}`}>Tides</NavLink>
          <NavLink to="/field-trip" className={({ isActive }) => `hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${isActive ? "text-blue-600 dark:text-blue-400 font-bold" : ""}`}>New Field Trip</NavLink>
          <NavLink to="/specimen" className={({ isActive }) => `hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${isActive ? "text-blue-600 dark:text-blue-400 font-bold" : ""}`}>Casual Find</NavLink>
          <NavLink to="/settings" className={({ isActive }) => `hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${isActive ? "text-blue-600 dark:text-blue-400 font-bold" : ""}`}>Settings</NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-4">
            <div className="opacity-60 text-xs hidden sm:block font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{project.name}</div>
            
            <div className="flex gap-3 items-center border-l pl-4 border-gray-300 dark:border-gray-600">
                <button onClick={handleCSVExport} className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                    CSV
                </button>
                <button onClick={handleExport} className="text-xs font-medium opacity-70 hover:opacity-100 hover:text-blue-600 transition-colors">
                    Backup
                </button>
                <label className="text-xs font-medium opacity-70 hover:opacity-100 hover:text-blue-600 transition-colors cursor-pointer">
                    Restore
                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>
            </div>
        </div>
      </header>

      {showBackupReminder && (
        <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 py-2 px-4 rounded-xl mb-4 flex flex-col sm:flex-row items-center justify-between gap-x-4 gap-y-2 text-sm shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xl">🛡️</span>
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-amber-900 dark:text-amber-100">Backup Recommended</span>
              <span className="text-amber-800 dark:text-amber-200 text-xs mt-0.5">
                It's been a while since your last backup. Since FossilMap is local-only, a backup protects your finds if your device is lost or broken.
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button 
                onClick={() => setDismissedBackup(true)}
                className="text-amber-800 dark:text-amber-200 font-bold py-1 px-3 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors text-xs"
            >
                Later
            </button>
            <button 
                onClick={handleExport}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-4 rounded-lg transition-colors whitespace-nowrap shadow-sm text-xs"
            >
                Backup Now
            </button>
          </div>
        </div>
      )}

      <main>
        <Routes>
            <Route path="/" element={<HomeRouter projectId={projectId} />} />
            <Route path="/field-trip" element={<LocalityPage projectId={projectId} onSaved={(id) => nav(`/specimen?localityId=${encodeURIComponent(id)}`)} />} />
            <Route path="/field-trip/:id" element={<LocalityPage projectId={projectId} onSaved={() => {}} />} />
            <Route path="/specimen" element={<SpecimenRouter projectId={projectId} />} />
            <Route path="/finds" element={<AllFinds projectId={projectId} />} />
            <Route path="/map" element={<MapPage projectId={projectId} />} />
            <Route path="/tides" element={<TidePage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/locality" element={<LinkToFieldTrip />} />
            <Route path="/locality/:id" element={<LinkToFieldTrip />} />
        </Routes>
      </main>
    </div>
  );
}

function LinkToFieldTrip() {
    const nav = useNavigate();
    const { id } = useParams();
    useEffect(() => {
        nav(id ? `/field-trip/${id}` : "/field-trip", { replace: true });
    }, [id, nav]);
    return null;
}

function HomeRouter({ projectId }: { projectId: string }) {
  const nav = useNavigate();
  return (
    <Home
      projectId={projectId}
      goLocality={() => nav("/field-trip")}
      goLocalityEdit={(id: string) => nav(`/field-trip/${id}`)}
      goSpecimen={(localityId?: string) => {
        const q = localityId ? `?localityId=${encodeURIComponent(localityId)}` : "";
        nav(`/specimen${q}`);
      }}
      goAllFinds={() => nav("/finds")}
      goMap={() => nav("/map")}
    />
  );
}

function SpecimenRouter({ projectId }: { projectId: string }) {
  const [params] = useSearchParams();
  const localityId = params.get("localityId");
  return <SpecimenPage projectId={projectId} localityId={localityId ?? null} />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Shell />
    </BrowserRouter>
  );
}