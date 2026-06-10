import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  CloudOff,
  Database,
  Download,
  ExternalLink,
  FileText,
  Map,
  MapPin,
  Microscope,
  Mountain,
  Route,
  ShieldCheck,
  Smartphone,
  Waves,
  X,
} from "lucide-react";
import { db } from "../db";

const FLAG = "fm_onboarding_done";
const FORCE_FLAG = "fm_onboarding_force";

const FORCED_THIS_LOAD = (() => {
  try {
    const forced = localStorage.getItem(FORCE_FLAG) === "1";
    if (forced) localStorage.removeItem(FORCE_FLAG);
    return forced;
  } catch {
    return false;
  }
})();

type Step = "welcome" | "choose" | "workflow" | "install" | "safety" | "community" | "done";

function IconBadge({ children, tone = "emerald" }: { children: React.ReactNode; tone?: "emerald" | "blue" | "amber" | "slate" }) {
  const tones = {
    emerald: "bg-emerald-500/15 text-emerald-200 border-emerald-400/25",
    blue: "bg-sky-500/15 text-sky-200 border-sky-400/25",
    amber: "bg-amber-500/15 text-amber-200 border-amber-400/25",
    slate: "bg-white/8 text-white/75 border-white/10",
  };
  return (
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border ${tones[tone]}`}>
      {children}
    </div>
  );
}

function Dots({ active }: { active: number }) {
  return (
    <div className="mb-7 flex items-center justify-center gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${i === active ? "w-6 bg-emerald-300" : "w-2 bg-white/20"}`}
        />
      ))}
    </div>
  );
}

export default function OnboardingFlow({ suppress = false }: { suppress?: boolean }) {
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(FLAG) || FORCED_THIS_LOAD;
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState<Step>("welcome");
  const [pendingDestination, setPendingDestination] = useState("/");
  const navigate = useNavigate();

  useEffect(() => {
    if (!visible || FORCED_THIS_LOAD) return;
    Promise.all([db.localities.count(), db.specimens.count()])
      .then(([locations, finds]) => {
        if (locations > 0 || finds > 0) dismiss();
      })
      .catch(() => dismiss());
  }, [visible]);

  const platform = useMemo(() => {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "desktop";
  }, []);

  function markDone() {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {}
  }

  function dismiss() {
    markDone();
    setVisible(false);
  }

  function go(destination: string) {
    markDone();
    setPendingDestination(destination);
    setStep("done");
  }

  function leave() {
    setVisible(false);
    navigate(pendingDestination);
  }

  if (suppress || !visible) return null;

  const skipButton = (
    <button
      onClick={dismiss}
      className="mt-5 text-xs font-bold text-white/45 transition-colors hover:text-white"
    >
      Skip for now
    </button>
  );

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-slate-950/85 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-950 p-6 text-white shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-7">
        <div className="mb-2 flex justify-end">
          <button
            onClick={dismiss}
            aria-label="Close quick start"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "welcome" && (
          <>
            <Dots active={0} />
            <div className="mb-7 text-center">
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl border border-emerald-400/25 bg-emerald-500/15 text-emerald-200">
                <Microscope className="h-8 w-8" />
              </div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200/70">FossilMap quick start</p>
              <h1 className="text-2xl font-black leading-tight tracking-tight">Build a proper fossil field record from the first find.</h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/62">
                FossilMap keeps locations, trips, specimens, photographs, stratigraphy and sharing decisions together in one local-first field book.
              </p>
            </div>

            <div className="mb-5 grid gap-2.5">
              {[
                { icon: <MapPin className="h-5 w-5" />, title: "Record the exact locality", detail: "GPS, exposure type, formation, stage and access notes.", tone: "blue" as const },
                { icon: <Camera className="h-5 w-5" />, title: "Photograph and annotate", detail: "Attach field and lab images, scale them, and mark details.", tone: "emerald" as const },
                { icon: <Database className="h-5 w-5" />, title: "Keep the data yours", detail: "Everything stays on this device unless you choose to share.", tone: "amber" as const },
              ].map((item) => (
                <div key={item.title} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3.5">
                  <IconBadge tone={item.tone}>{item.icon}</IconBadge>
                  <div>
                    <p className="text-sm font-black text-white">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-white/48">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
                <p className="text-sm leading-snug text-amber-100/85">
                  Browser storage is not a substitute for backups. Use FossilMap's JSON backup before changing devices or clearing browser data.
                </p>
              </div>
            </div>

            <button
              onClick={() => setStep("choose")}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-400"
            >
              Get started
              <ChevronRight className="h-4 w-4" />
            </button>
            {skipButton}
          </>
        )}

        {step === "choose" && (
          <>
            <Dots active={1} />
            <div className="mb-6 text-center">
              <h2 className="text-xl font-black tracking-tight">What do you want to do first?</h2>
              <p className="mt-2 text-sm text-white/50">Choose a starting point. You can come back to the rest later.</p>
            </div>

            <div className="grid gap-3">
              {[
                { icon: <Route className="h-5 w-5" />, title: "Start a field trip", detail: "Best for a day out collecting several specimens.", action: () => go("/field-trip"), tone: "emerald" as const },
                { icon: <MapPin className="h-5 w-5" />, title: "Create a known locality", detail: "Save a repeat location, quarry, foreshore or exposure.", action: () => go("/location"), tone: "blue" as const },
                { icon: <Microscope className="h-5 w-5" />, title: "Record a specimen", detail: "Log a find now and attach photos after saving.", action: () => go("/specimen"), tone: "slate" as const },
                { icon: <FileText className="h-5 w-5" />, title: "Understand the workflow", detail: "See how locations, trips, finds and reports connect.", action: () => setStep("workflow"), tone: "amber" as const },
                { icon: <Smartphone className="h-5 w-5" />, title: "Install and protect data", detail: "Home screen install, local storage and backups.", action: () => setStep("install"), tone: "blue" as const },
                { icon: <Map className="h-5 w-5" />, title: "Sharing and community map", detail: "Understand what stays private and what can be published.", action: () => setStep("community"), tone: "slate" as const },
                { icon: <Waves className="h-5 w-5" />, title: "Safety and access", detail: "Tides, cliffs, SSSI/RIGS and permission checks.", action: () => setStep("safety"), tone: "amber" as const },
              ].map((item) => (
                <button
                  key={item.title}
                  onClick={item.action}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3.5 text-left transition-all hover:border-emerald-400/35 hover:bg-emerald-500/10"
                >
                  <IconBadge tone={item.tone}>{item.icon}</IconBadge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-white transition-colors group-hover:text-emerald-100">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-white/45">{item.detail}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/30 group-hover:text-emerald-200" />
                </button>
              ))}
            </div>

            <button onClick={() => setStep("welcome")} className="mt-5 flex items-center justify-center gap-1 text-xs font-bold text-white/35 hover:text-white/70">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            {skipButton}
          </>
        )}

        {step === "workflow" && (
          <>
            <Dots active={2} />
            <div className="mb-6">
              <h2 className="text-xl font-black tracking-tight">The FossilMap workflow</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/58">
                You can record a quick specimen at any time, but the strongest records keep the field context attached.
              </p>
            </div>

            <div className="mb-5 grid gap-3">
              {[
                ["1", "Location", "A repeatable geological place with GPS, access and stratigraphy."],
                ["2", "Field trip", "A collecting visit. Use this for conditions, day notes and grouped finds."],
                ["3", "Specimen", "The individual fossil, with taxon, element, dimensions, context and photos."],
                ["4", "Report", "A printable field record with the locality and specimens in one place."],
              ].map(([num, title, detail]) => (
                <div key={title} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-400 text-sm font-black text-slate-950">{num}</div>
                  <div>
                    <p className="text-sm font-black text-white">{title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-white/48">{detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => go("/field-trip")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3.5 text-sm font-black text-white transition-colors hover:bg-emerald-400"
            >
              Start a field trip
              <Route className="h-4 w-4" />
            </button>
            <button onClick={() => setStep("choose")} className="mt-5 flex items-center justify-center gap-1 text-xs font-bold text-white/35 hover:text-white/70">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            {skipButton}
          </>
        )}

        {step === "install" && (
          <>
            <Dots active={2} />
            <div className="mb-6">
              <h2 className="text-xl font-black tracking-tight">Install it like a field app</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/58">
                FossilMap works best from your home screen. You still need regular backups because the records live on this device.
              </p>
            </div>

            <div className="mb-5 grid gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                <p className="text-sm font-black text-white">{platform === "ios" ? "iPhone / iPad" : platform === "android" ? "Android" : "Desktop / laptop"}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/48">
                  {platform === "ios"
                    ? "Open FossilMap in Safari, tap Share, then Add to Home Screen. Chrome on iOS cannot install PWAs."
                    : platform === "android"
                      ? "Open FossilMap in Chrome, tap the three-dot menu, then Add to Home Screen or Install App."
                      : "Use the install icon in the browser address bar where available, or keep FossilMap bookmarked."}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
                <div className="flex gap-3">
                  <Download className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
                  <p className="text-sm leading-snug text-amber-100/85">
                    Backup creates a JSON file containing locations, trips, specimens, settings and photos. Keep a copy outside the browser.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                <div className="flex gap-3">
                  <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-sky-200" />
                  <p className="text-sm leading-snug text-white/58">
                    Most record keeping works offline. Maps, tides and community sharing need a connection.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => go("/settings")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3.5 text-sm font-black text-white transition-colors hover:bg-emerald-400"
            >
              Open settings
              <ExternalLink className="h-4 w-4" />
            </button>
            <button onClick={() => setStep("choose")} className="mt-5 flex items-center justify-center gap-1 text-xs font-bold text-white/35 hover:text-white/70">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            {skipButton}
          </>
        )}

        {step === "safety" && (
          <>
            <Dots active={2} />
            <div className="mb-6">
              <h2 className="text-xl font-black tracking-tight">Safety and access checks</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/58">
                Good fossil records should not come at the cost of unsafe collecting or protected-site damage.
              </p>
            </div>

            <div className="mb-5 grid gap-3">
              {[
                { icon: <Waves className="h-5 w-5" />, title: "Foreshore collecting", detail: "Use the Tide page as a planning aid, then still check local conditions and cut-off points." },
                { icon: <Mountain className="h-5 w-5" />, title: "Cliffs and quarries", detail: "Record fallen material safely. Do not hammer faces where prohibited or unstable." },
                { icon: <ShieldCheck className="h-5 w-5" />, title: "SSSI and RIGS", detail: "Mark protected-site status and keep designation notes with the locality." },
                { icon: <Archive className="h-5 w-5" />, title: "Important specimens", detail: "Keep strong context, photos and contact details so researchers can follow up." },
              ].map((item) => (
                <div key={item.title} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3.5">
                  <IconBadge tone="amber">{item.icon}</IconBadge>
                  <div>
                    <p className="text-sm font-black text-white">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-white/48">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => go("/tides")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3.5 text-sm font-black text-white transition-colors hover:bg-emerald-400"
            >
              Check tide tools
              <Waves className="h-4 w-4" />
            </button>
            <button onClick={() => setStep("choose")} className="mt-5 flex items-center justify-center gap-1 text-xs font-bold text-white/35 hover:text-white/70">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            {skipButton}
          </>
        )}

        {step === "community" && (
          <>
            <Dots active={2} />
            <div className="mb-6">
              <h2 className="text-xl font-black tracking-tight">Sharing is a separate choice</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/58">
                FossilMapped is the public-facing sister map. FossilMap stays private unless you share a specimen.
              </p>
            </div>
            <button
              onClick={() => go("/finds")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3.5 text-sm font-black text-white transition-colors hover:bg-emerald-400"
            >
              Review finds
              <Map className="h-4 w-4" />
            </button>
            <button onClick={() => setStep("choose")} className="mt-5 flex items-center justify-center gap-1 text-xs font-bold text-white/35 hover:text-white/70">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            {skipButton}
          </>
        )}

        {step === "done" && (
          <>
            <div className="mb-7 text-center">
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl border border-emerald-400/25 bg-emerald-500/15 text-emerald-200">
                <Check className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-black tracking-tight">You are ready.</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/58">
                The quick start is saved on this device. You can show it again from Settings.
              </p>
            </div>
            <button
              onClick={leave}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3.5 text-sm font-black text-white transition-colors hover:bg-emerald-400"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
