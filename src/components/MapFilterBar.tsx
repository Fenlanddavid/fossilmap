import React from "react";
import {
  CalendarDays,
  Map as MapIcon,
  MapPinPlus,
  Palette,
  RotateCcw,
  Satellite,
  Search,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { CoachTip } from "./CoachTip";

type DateFilterMode = "all" | "7d" | "30d" | "custom";

export function MapFilterBar(props: {
  count: number;
  addLocalityHere: () => void;
  filterSSSIOnly: boolean;
  setFilterSSSIOnly: (v: boolean) => void;
  filterFormation: string;
  setFilterFormation: (v: string) => void;
  formationOptions: string[];
  filterTaxon: string;
  setFilterTaxon: (v: string) => void;
  minSpecimens: number;
  setMinSpecimens: (v: number) => void;
  maxSpecimensAtAnyLocality: number;
  dateMode: DateFilterMode;
  setDateMode: (v: DateFilterMode) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  onClear: () => void;
  needsKey: boolean;
  mapStyleMode: "streets" | "satellite";
  setMapStyleMode: (v: "streets" | "satellite") => void;
  colorMode: "status" | "period" | "formation" | "taxon";
  setColorMode: (v: "status" | "period" | "formation" | "taxon") => void;
}) {
  const activeFilterCount = [
    props.filterSSSIOnly,
    props.filterFormation.trim(),
    props.filterTaxon.trim(),
    props.minSpecimens > 0,
    props.dateMode !== "all",
  ].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = React.useState(activeFilterCount > 0);

  React.useEffect(() => {
    if (activeFilterCount > 0) setFiltersOpen(true);
  }, [activeFilterCount]);

  const mapStyleButton = (mode: "streets" | "satellite", label: string, Icon: typeof MapIcon) => (
    <button
      type="button"
      onClick={() => props.setMapStyleMode(mode)}
      aria-pressed={props.mapStyleMode === mode}
      title={label}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-black transition-colors ${
        props.mapStyleMode === mode
          ? "bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300"
          : "text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-950/60 dark:hover:text-slate-100"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="grid gap-2">
      {props.needsKey && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <Shield className="h-4 w-4 shrink-0" />
          <span><strong>Map needs an API key.</strong> Create <code>.env</code> with <code>VITE_MAPTILER_KEY=YOUR_KEY</code> then restart.</span>
        </div>
      )}

      <CoachTip storageKey="fm_tip_map_filters" title="Map filters" tone="sky">
        Use colour mode first, then narrow by formation, taxon, protected status, find count or date when the map gets crowded.
      </CoachTip>

      <div className="rounded-xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex flex-wrap items-center gap-2 p-2">
          <button
            type="button"
            onClick={props.addLocalityHere}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800"
          >
            <MapPinPlus className="h-4 w-4" />
            <span>Locality here</span>
          </button>

          <div className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800" aria-label="Map style">
            {mapStyleButton("streets", "Streets", MapIcon)}
            {mapStyleButton("satellite", "Satellite", Satellite)}
          </div>

          <label className="relative h-10 min-w-[9.5rem] flex-1 sm:flex-none">
            <span className="sr-only">Colour by</span>
            <Palette className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <select
              value={props.colorMode}
              onChange={(e) => props.setColorMode(e.target.value as any)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="status">Status</option>
              <option value="period">Period</option>
              <option value="formation">Formation</option>
              <option value="taxon">Top taxon</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-black transition-colors ${
              filtersOpen
                ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/45 dark:text-blue-300"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1.5 text-[10px] text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="ml-auto rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-black text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            {props.count} localities
          </div>
        </div>

        {filtersOpen && (
          <div className="grid gap-3 border-t border-slate-200 p-3 text-sm dark:border-slate-800">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[auto_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(9rem,1fr)]">
              <label className="flex h-10 cursor-pointer select-none items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={props.filterSSSIOnly}
                  onChange={(e) => props.setFilterSSSIOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <Shield className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                SSSI
              </label>

              <label className="grid gap-1">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Formation</span>
                <select
                  value={props.filterFormation}
                  onChange={(e) => props.setFilterFormation(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All formations</option>
                  {props.formationOptions.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Taxon</span>
                <span className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={props.filterTaxon}
                    onChange={(e) => props.setFilterTaxon(e.target.value)}
                    placeholder="Ammonite"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </span>
              </label>

              <label className="grid gap-1">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Minimum finds: {props.minSpecimens}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(10, props.maxSpecimensAtAnyLocality)}
                  step={1}
                  value={props.minSpecimens}
                  onChange={(e) => props.setMinSpecimens(Number(e.target.value))}
                  className="h-10 w-full cursor-pointer accent-blue-600"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Date range</span>
                <span className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={props.dateMode}
                    onChange={(e) => props.setDateMode(e.target.value as DateFilterMode)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="all">All time</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="custom">Custom</option>
                  </select>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {props.dateMode === "custom" && (
                <>
                  <label className="grid min-w-[9rem] flex-1 gap-1 sm:flex-none">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">From</span>
                    <input
                      type="date"
                      value={props.customFrom}
                      onChange={(e) => props.setCustomFrom(e.target.value)}
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="grid min-w-[9rem] flex-1 gap-1 sm:flex-none">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">To</span>
                    <input
                      type="date"
                      value={props.customTo}
                      onChange={(e) => props.setCustomTo(e.target.value)}
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                </>
              )}

              <button
                type="button"
                onClick={props.onClear}
                disabled={activeFilterCount === 0}
                className="ml-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-4 w-4" />
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
