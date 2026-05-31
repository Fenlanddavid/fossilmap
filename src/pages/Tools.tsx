import React from "react";
import { Waves, BookOpen } from "lucide-react";

const TidePage = React.lazy(() => import("./TidePage"));

type Tool = "tides" | "timescale";

export default function ToolsPage() {
  const [activeTool, setActiveTool] = React.useState<Tool>("tides");

  const tools: { id: Tool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "tides",     label: "Tides",     icon: Waves    },
    { id: "timescale", label: "Timescale", icon: BookOpen },
  ];

  return (
    <div className="mx-auto max-w-5xl pb-10">
      <div className="mb-6">
        <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
          Field Tools
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Utilities for use in the field and at the bench.
        </p>
      </div>

      {/* Tool tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-black transition-colors ${
                activeTool === tool.id
                  ? "border-emerald-400 bg-emerald-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tool.label}
            </button>
          );
        })}
      </div>

      {/* Active tool content */}
      <React.Suspense fallback={
        <div className="h-96 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
      }>
        {activeTool === "tides"     && <TidePage />}
        {activeTool === "timescale" && <TimescaleReference />}
      </React.Suspense>

      {activeTool === "tides" && (
        <a
          href={import.meta.env.VITE_COMMUNITY_URL || "/fossilmapped/"}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center gap-4 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-md hover:shadow-lg hover:scale-[1.008] hover:-translate-y-px transition-all duration-200 ease-out cursor-pointer group no-underline"
        >
          <svg width="40" height="40" viewBox="0 0 512 512" fill="none" className="shrink-0">
            <defs>
              <linearGradient id="fm-tools-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="50%" stopColor="#059669" />
                <stop offset="100%" stopColor="#0d9488" />
              </linearGradient>
            </defs>
            <rect width="512" height="512" rx="112" fill="url(#fm-tools-grad)" opacity="0.15" />
            <circle cx="256" cy="256" r="160" stroke="url(#fm-tools-grad)" strokeWidth="24" fill="none" />
            <circle cx="256" cy="256" r="80" fill="url(#fm-tools-grad)" opacity="0.5" />
            <circle cx="256" cy="256" r="30" fill="url(#fm-tools-grad)" />
            <path d="M256 96 L256 176 M256 336 L256 416 M96 256 L176 256 M336 256 L416 256" stroke="url(#fm-tools-grad)" strokeWidth="20" strokeLinecap="round" opacity="0.35" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="font-black text-slate-800 dark:text-slate-100 text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">FossilMapped</div>
            <div className="text-[11px] text-slate-500/80 dark:text-slate-400/80 mt-0.5 leading-snug">See what the community is finding across the UK</div>
          </div>
          <span className="shrink-0 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-all">
            Open
          </span>
        </a>
      )}
    </div>
  );
}

function TimescaleReference() {
  const eras = [
    {
      name: "Cenozoic", color: "#fbbf24",
      periods: ["Quaternary (2.6 Ma–now)", "Neogene (23–2.6 Ma)", "Paleogene (66–23 Ma)"],
    },
    {
      name: "Mesozoic", color: "#34d399",
      periods: ["Cretaceous (145–66 Ma)", "Jurassic (201–145 Ma)", "Triassic (252–201 Ma)"],
    },
    {
      name: "Palaeozoic", color: "#60a5fa",
      periods: [
        "Permian (299–252 Ma)", "Carboniferous (359–299 Ma)", "Devonian (419–359 Ma)",
        "Silurian (444–419 Ma)", "Ordovician (485–444 Ma)", "Cambrian (541–485 Ma)",
      ],
    },
  ];

  return (
    <div className="grid gap-4">
      {eras.map((era) => (
        <div key={era.name} className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="px-4 py-2.5 text-sm font-black text-white" style={{ backgroundColor: era.color }}>
            {era.name}
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {era.periods.map((p) => (
              <li key={p} className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                {p}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
