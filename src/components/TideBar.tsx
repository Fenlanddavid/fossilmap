import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Waves } from "lucide-react";
import { captureGPS } from "../services/gps";
import { getTidesUK, TideEvent } from "../services/tides";

type TideBarState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; next: TideEvent }
  | { status: "inland" }
  | { status: "error"; message: string };

function timeUntil(isoTime: string): string {
  const diff = new Date(isoTime).getTime() - Date.now();
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TideBar({ lat, lon }: { lat?: number | null; lon?: number | null }) {
  const [state, setState] = useState<TideBarState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const hasProvidedCoords = Number.isFinite(lat) && Number.isFinite(lon);
        const pos = hasProvidedCoords
          ? { lat: lat as number, lon: lon as number }
          : await captureGPS();
        const events = await getTidesUK(pos.lat, pos.lon);
        if (cancelled) return;
        if (events.length === 0) {
          setState({ status: "inland" });
          return;
        }
        const next = events.find((event) => new Date(event.time).getTime() > Date.now()) ?? events[0];
        setState({ status: "ok", next });
      } catch (e: any) {
        if (cancelled) return;
        if (e?.message?.includes("No UK tidal")) {
          setState({ status: "inland" });
        } else {
          setState({ status: "error", message: e?.message ?? "Tide data unavailable" });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  if (state.status === "idle" || state.status === "inland") return null;

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-600 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-300">
        <Waves className="h-3.5 w-3.5 animate-pulse" />
        <span>Checking tides...</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
        <Waves className="h-3.5 w-3.5 opacity-40" />
        <span>Tide data unavailable</span>
      </div>
    );
  }

  const { next } = state;
  const isHigh = next.type === "high";
  const timeStr = new Date(next.time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const until = timeUntil(next.time);
  const Arrow = isHigh ? ArrowUp : ArrowDown;
  const colour = isHigh
    ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/25 dark:text-sky-300"
    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-300";

  return (
    <div className={`flex flex-col gap-2 rounded-lg border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between ${colour}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Arrow className="h-3.5 w-3.5 shrink-0" />
        <span className="font-black uppercase tracking-wide">{isHigh ? "Estimated high water" : "Estimated low water"}</span>
        <span className="font-mono font-bold">{timeStr}</span>
        <span className="opacity-60">in {until}</span>
        {next.value > 0 && <span className="opacity-60">{next.value.toFixed(1)}m</span>}
      </div>
      <div className="flex items-center gap-1.5 opacity-55">
        <AlertTriangle className="h-3 w-3" />
        <span className="text-[10px]">Recent gauge estimate - not a safety forecast</span>
      </div>
    </div>
  );
}
