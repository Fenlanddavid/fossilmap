import React from "react";
import { AlertTriangle, BookOpen, Check, Copy, Layers, Loader2, MapPin, Waves } from "lucide-react";
import { getCommunityUrl } from "../services/community";
import { lookupBGSGeology, type BGSResult } from "../services/bgs";
import { captureGPS, type GPSFix } from "../services/gps";
import { checkSSSI, type SSSIResult } from "../services/sssi";

const TidePage = React.lazy(() => import("./TidePage"));

type Tool = "tides" | "timescale" | "bgs";

export default function ToolsPage() {
  const [activeTool, setActiveTool] = React.useState<Tool>("tides");

  const tools: { id: Tool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "tides",     label: "Tides",     icon: Waves    },
    { id: "timescale", label: "Timescale", icon: BookOpen },
    { id: "bgs",       label: "BGS",       icon: Layers   },
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
        {activeTool === "bgs"       && <BGSLookupTool />}
      </React.Suspense>

      {activeTool === "tides" && (
        <a
          href={getCommunityUrl()}
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

function BGSLookupTool() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fix, setFix] = React.useState<GPSFix | null>(null);
  const [result, setResult] = React.useState<BGSResult | null>(null);
  const [sssiResult, setSssiResult] = React.useState<SSSIResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  const runLookup = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    setSssiResult(null);
    try {
      const gps = await captureGPS();
      setFix(gps);
      const [geology, sssi] = await Promise.allSettled([
        lookupBGSGeology(gps.lat, gps.lon),
        checkSSSI(gps.lat, gps.lon),
      ]);
      if (sssi.status === "fulfilled") setSssiResult(sssi.value);
      if (geology.status === "fulfilled") {
        setResult(geology.value);
      } else {
        setResult(null);
        setError(geology.reason instanceof Error ? geology.reason.message : "BGS lookup failed");
      }
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "BGS lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    const text = [
      result.formation ? `Formation: ${result.formation}` : null,
      result.period ? `Period: ${result.period}` : null,
      result.stage ? `Stage: ${result.stage}` : null,
      result.description ? `Description: ${result.description}` : null,
      fix ? `GPS: ${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}` : null,
    ].filter(Boolean).join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-black text-slate-950 dark:text-white">
            BGS Geology Lookup
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Bedrock formation from your current GPS position.
          </p>
        </div>
        <button
          type="button"
          onClick={runLookup}
          disabled={loading}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {loading ? "Looking up" : "Use current GPS"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}

      {result ? (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <BGSField label="Formation" value={result.formation || "Unknown"} />
            <BGSField label="Period" value={result.period || "Unknown"} />
            <BGSField label="Stage" value={result.stage || "Not recorded"} />
            <BGSField label="Rock type" value={result.description || "Not recorded"} />
          </div>

          {fix && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
              GPS {fix.lat.toFixed(6)}, {fix.lon.toFixed(6)}
              {fix.accuracyM != null && ` · ±${Math.round(fix.accuracyM)}m`}
            </div>
          )}

          {sssiResult && sssiResult.isSSSI && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                <div>
                  <span className="font-black text-amber-800 dark:text-amber-200">SSSI: </span>
                  <span className="text-amber-700 dark:text-amber-300">{sssiResult.siteName || "Designated site"}</span>
                  <p className="mt-1 text-[10px] text-amber-700/70 dark:text-amber-300/70">
                    {sssiResult.country === "scotland"
                      ? "© NatureScot, Open Government Licence v3.0"
                      : "© Natural England, Open Government Licence v3.0"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {sssiResult && !sssiResult.isSSSI && (
            <div className="text-xs text-slate-400">
              {sssiResult.nearbySiteName
                ? `No SSSI exactly at this location. Nearby within ${Math.round((sssiResult.nearbySearchRadiusM ?? 3000) / 1000)}km: ${sssiResult.nearbySiteName}`
                : "No SSSI designation at this location"}
              {sssiResult.country === "wales" ? " (Wales - check NRW Lle portal for full coverage)" : ""}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={copyResult}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 sm:w-auto"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        !error && (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
            No lookup yet
          </div>
        )
      )}
    </div>
  );
}

function BGSField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
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
