import React, { useEffect, useState } from "react";
import { db } from "../db";
import { useLiveQuery } from "dexie-react-hooks";

export default function Settings() {
  const [collectorName, setCollectorName] = useState("");
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null);

  const settings = useLiveQuery(() => db.settings.toArray());
  const lastBackup = settings?.find(s => s.key === "lastBackup")?.value;
  const defaultCollector = settings?.find(s => s.key === "defaultCollector")?.value;
  const theme = settings?.find(s => s.key === "theme")?.value ?? "dark";

  useEffect(() => {
    if (defaultCollector) {
      setCollectorName(defaultCollector);
    }
  }, [defaultCollector]);

  useEffect(() => {
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(setIsPersisted);
    }
  }, []);

  async function saveCollector() {
    await db.settings.put({ key: "defaultCollector", value: collectorName });
    alert("Settings saved!");
  }

  async function toggleTheme() {
    const newTheme = theme === "dark" ? "light" : "dark";
    await db.settings.put({ key: "theme", value: newTheme });
  }

  async function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      const persisted = await navigator.storage.persist();
      setIsPersisted(persisted);
      if (persisted) {
        alert("Storage is now persistent! Your data is safer from browser cleanup.");
      } else {
        alert("Storage persistence could not be granted. This is usually due to browser policy.");
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h2 className="text-3xl font-black mb-6">Settings</h2>

      <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <h3 className="text-lg font-bold mb-4">Appearance</h3>
        <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
          <div>
            <div className="font-medium">Theme</div>
            <div className="text-sm text-gray-500">
              Default is Dark mode.
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>
      </section>

      <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Default Collector Name
            </label>
            <input
              type="text"
              value={collectorName}
              onChange={(e) => setCollectorName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              This name will be automatically filled in for new field trips.
            </p>
          </div>
          <button
            onClick={saveCollector}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
          >
            Save Preferences
          </button>
        </div>
      </section>

      <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <h3 className="text-lg font-bold mb-4">Storage & Backup</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
            <div>
              <div className="font-medium">Storage Status</div>
              <div className="text-sm text-gray-500">
                {isPersisted ? "✅ Persistent (Safe from eviction)" : "⚠️ Best-effort (May be cleared if disk is full)"}
              </div>
            </div>
            {!isPersisted && (
              <button
                onClick={requestPersistence}
                className="text-sm font-bold text-blue-600 hover:underline"
              >
                Request Persistence
              </button>
            )}
          </div>
          
          <div className="flex justify-between items-center py-2">
            <div>
              <div className="font-medium">Last JSON Backup</div>
              <div className="text-sm text-gray-500">
                {lastBackup ? new Date(lastBackup).toLocaleString() : "Never"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="text-center text-sm text-gray-500 mt-12">
        FossilMap is strictly local. All data and settings are stored on this device.
      </div>
    </div>
  );
}
