import React, { useState } from "react";
import { AlertTriangle, LocateFixed, RefreshCw, Waves } from "lucide-react";
import { TideEvent, getTidesUK } from "../services/tides";
import { captureGPS } from "../services/gps";

export function TideWidget() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tides, setTides] = useState<TideEvent[]>([]);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);

  async function refreshTides() {
    setLoading(true);
    setError(null);
    try {
      const pos = await captureGPS();
      setLocation({ lat: pos.lat, lon: pos.lon });
      const events = await getTidesUK(pos.lat, pos.lon);
      setTides(events);
    } catch (e: any) {
      setError(e?.message || "Could not get tide data for your current location.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/35 dark:text-sky-200">
            <Waves className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-950 dark:text-white">UK coast tides</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Recent EA gauge readings — not a tide prediction.</p>
          </div>
        </div>
        <button
          onClick={refreshTides}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {!location && !loading && tides.length === 0 && (
        <button
          onClick={refreshTides}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-700"
        >
          <LocateFixed className="h-4 w-4" />
          Use current location
        </button>
      )}

      {loading && (
        <div className="space-y-2">
          <div className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        </div>
      )}

      {tides.length > 0 && (
        <div className="grid gap-2">
          {tides.slice(0, 3).map((t, i) => {
            const date = new Date(t.time);
            const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const isHigh = t.type === "high";
            const isFuture = date.getTime() > Date.now();

            return (
              <div key={`${t.time}-${i}`} className={`relative flex items-center justify-between overflow-hidden rounded-lg border p-3 ${isHigh ? "border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/25" : "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/25"}`}>
                {isFuture && (
                  <div className="absolute right-0 top-0 rounded-bl-lg bg-sky-600 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide text-white">Next</div>
                )}
                <div>
                  <span className={`text-[9px] font-black uppercase tracking-wide ${isHigh ? "text-sky-700 dark:text-sky-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                    {isHigh ? "High water" : "Low water"}
                  </span>
                  <span className="block font-mono text-lg font-black leading-none text-slate-950 dark:text-white">
                    {timeStr}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-slate-800 dark:text-slate-100">{t.value.toFixed(2)}m</div>
                  <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">Gauge level</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {location && (
        <div className="mt-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          UK Gov gauge network
        </div>
      )}

      <p className="mt-3 text-center text-[10px] italic leading-tight text-slate-400 dark:text-slate-500">
        Live readings from Environment Agency. Calculations are approximations. Not for navigation.
      </p>
    </div>
  );
}
