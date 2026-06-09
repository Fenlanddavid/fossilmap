import React from "react";
import { AlertTriangle, Waves } from "lucide-react";
import { TideWidget } from "../components/TideWidget";

export default function TidePage() {
  return (
    <div className="mx-auto grid max-w-2xl gap-5 py-4">
      <header>
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Foreshore planning</p>
        <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Tide times</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Check nearby Environment Agency gauge readings before planning foreshore or cliff-base collecting.
        </p>
      </header>

      <TideWidget />

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/25">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300" />
          <h3 className="font-black text-amber-900 dark:text-amber-100">Safety first</h3>
        </div>
        <ul className="grid gap-2 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/75">
          <li className="flex gap-2">
            <Waves className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Tide times are estimated from Environment Agency gauge readings and are for planning purposes only. Always verify with official sources, such as Admiralty EasyTide, before accessing tidal or cliff-base locations.</span>
          </li>
          <li className="flex gap-2">
            <Waves className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Identify cut-off points on beaches below cliffs and landslips.</span>
          </li>
          <li className="flex gap-2">
            <Waves className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Leave enough time to return before the tide turns.</span>
          </li>
          <li className="flex gap-2">
            <Waves className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Gauge readings are approximations and can be affected by weather or surge.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
