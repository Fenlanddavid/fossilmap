import React from "react";

type DateFilterMode = "all" | "7d" | "30d" | "custom";

export function MapFilterBar(props: {
  count: number;
  zoomToMyLocation: () => void;
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
}) {
  return (
    <div className="grid gap-3">
        {props.needsKey && (
        <div className="border border-red-200 bg-red-50 text-red-800 rounded-xl p-3 text-sm flex gap-2 items-center">
            <span className="text-xl">⚠️</span>
            <span><strong>Map needs an API key.</strong> Create <code>.env</code> with <code>VITE_MAPTILER_KEY=YOUR_KEY</code> then restart.</span>
        </div>
        )}

        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-200 dark:border-gray-700 rounded-xl p-3 grid gap-3 shadow-sm">
        <div className="flex gap-2 flex-wrap items-center">
            <button onClick={props.zoomToMyLocation} className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
            📍 Zoom to Me
            </button>
            <button onClick={props.addLocalityHere} className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
            + Locality Here
            </button>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 ml-2 border border-gray-200 dark:border-gray-600">
                 <button 
                    onClick={() => props.setMapStyleMode("streets")}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${props.mapStyleMode === "streets" ? "bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300" : "opacity-70 hover:opacity-100"}`}
                 >Streets</button>
                 <button 
                    onClick={() => props.setMapStyleMode("satellite")}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${props.mapStyleMode === "satellite" ? "bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300" : "opacity-70 hover:opacity-100"}`}
                 >Satellite</button>
            </div>
            <div className="ml-auto opacity-80 text-sm font-medium bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
            {props.count} localities
            </div>
        </div>

        <div className="flex gap-3 flex-wrap items-end text-sm">
            <label className="flex gap-2 items-center bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors cursor-pointer select-none">
            <input type="checkbox" checked={props.filterSSSIOnly} onChange={(e) => props.setFilterSSSIOnly(e.target.checked)} className="rounded text-blue-600 w-4 h-4 focus:ring-blue-500" />
            SSSI only
            </label>

            <label className="grid gap-1 min-w-[140px]">
            <span className="text-xs font-medium opacity-70 ml-1">Formation</span>
            <select 
                value={props.filterFormation} 
                onChange={(e) => props.setFilterFormation(e.target.value)}
                className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
            >
                <option value="">All formations</option>
                {props.formationOptions.map((f) => (
                <option key={f} value={f}>{f}</option>
                ))}
            </select>
            </label>

            <label className="grid gap-1 min-w-[140px]">
            <span className="text-xs font-medium opacity-70 ml-1">Taxon contains</span>
            <input 
                value={props.filterTaxon} 
                onChange={(e) => props.setFilterTaxon(e.target.value)} 
                placeholder="e.g. ammonite" 
                className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            </label>

            <label className="grid gap-1 min-w-[120px]">
            <span className="text-xs font-medium opacity-70 ml-1">Min specimens: <strong>{props.minSpecimens}</strong></span>
            <input
                type="range"
                min={0}
                max={Math.max(10, props.maxSpecimensAtAnyLocality)}
                step={1}
                value={props.minSpecimens}
                onChange={(e) => props.setMinSpecimens(Number(e.target.value))}
                className="w-full accent-blue-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            </label>

            <label className="grid gap-1 min-w-[120px]">
            <span className="text-xs font-medium opacity-70 ml-1">Date range</span>
            <select 
                value={props.dateMode} 
                onChange={(e) => props.setDateMode(e.target.value as DateFilterMode)}
                className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
            >
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="custom">Custom</option>
            </select>
            </label>

            {props.dateMode === "custom" && (
            <>
                <label className="grid gap-1">
                <span className="text-xs font-medium opacity-70 ml-1">From</span>
                <input type="date" value={props.customFrom} onChange={(e) => props.setCustomFrom(e.target.value)} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                </label>
                <label className="grid gap-1">
                <span className="text-xs font-medium opacity-70 ml-1">To</span>
                <input type="date" value={props.customTo} onChange={(e) => props.setCustomTo(e.target.value)} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none" />
                </label>
            </>
            )}

            <button
            onClick={props.onClear}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-3 py-1.5 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ml-auto md:ml-0"
            >
            Clear Filters
            </button>
        </div>
        </div>
    </div>
  );
}
