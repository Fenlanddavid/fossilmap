import React, { useState, useEffect, useRef } from "react";
import { db, Specimen } from "../db";
import { v4 as uuid } from "uuid";
import { captureGPS } from "../services/gps";
import { X, MapPin, Loader2, CheckCircle2, Zap } from "lucide-react";

const COMMON_TAXA = [
  "Ammonite", "Belemnite", "Bivalve", "Gastropod", "Brachiopod",
  "Echinoid", "Crinoid", "Gryphaea", "Fish", "Shark Tooth",
  "Ichthyosaur", "Plesiosaur", "Dinosaur", "Trace fossil", "Plant",
];

const ELEMENTS = [
  "shell", "vertebra", "rib", "tooth", "bone fragment", "coprolite",
  "burrow / trace", "body fossil", "other",
];

interface QuickFindSheetProps {
  projectId: string;
  localityId: string | null;
  onClose: () => void;
  onSaved: (specimenId: string) => void;
}

export function QuickFindSheet({ projectId, localityId, onClose, onSaved }: QuickFindSheetProps) {
  const [taxon, setTaxon]           = useState("");
  const [element, setElement]       = useState("shell");
  const [confidence, setConfidence] = useState<"high" | "med" | "low">("med");
  const [lat, setLat]               = useState<number | null>(null);
  const [lon, setLon]               = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError]     = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  useEffect(() => {
    setGpsLoading(true);
    captureGPS()
      .then((fix) => {
        setLat(fix.lat);
        setLon(fix.lon);
      })
      .catch(() => setGpsError("GPS unavailable"))
      .finally(() => setGpsLoading(false));
  }, []);

  async function handleSave() {
    if (!taxon.trim()) return;
    setSaving(true);
    try {
      let targetLocalityId = localityId;
      if (!targetLocalityId) {
        targetLocalityId = uuid();
        const now = new Date().toISOString();
        const defaultCollector = await db.settings.get("defaultCollector").then(s => s?.value || "");
        await db.localities.add({
          id: targetLocalityId,
          projectId,
          type: "trip",
          name: `Quick trip ${new Date().toLocaleDateString("en-GB")}`,
          lat,
          lon,
          gpsAccuracyM: null,
          observedAt: now,
          collector: defaultCollector,
          exposureType: "other",
          sssi: false,
          rigs: false,
          permissionGranted: false,
          period: "",
          stage: "",
          formation: "",
          member: "",
          bed: "",
          lithologyPrimary: "other",
          notes: "Created from Quick Find",
          designationNotes: "",
          createdAt: now,
          updatedAt: now,
        } as any);
      }

      const now = new Date().toISOString();
      const id  = uuid();
      const specimen: Specimen = {
        id,
        projectId,
        localityId: targetLocalityId,
        sessionId: null,
        specimenCode: `QF-${Date.now().toString(36).toUpperCase()}`,
        taxon: taxon.trim(),
        taxonConfidence: confidence,
        period: "",
        stage: "",
        lat,
        lon,
        gpsAccuracyM: null,
        element,
        preservation: "body fossil",
        taphonomy: "",
        findContext: "",
        weightG: null,
        lengthMm: null,
        widthMm: null,
        thicknessMm: null,
        bagBoxId: "",
        storageLocation: "",
        notes: "",
        hrid: undefined,
        repository: undefined,
        accessionId: undefined,
        qualityScore: undefined,
        isShared: false,
        sharedAt: undefined,
        createdAt: now,
        updatedAt: now,
      };
      await db.specimens.add(specimen);
      setSaved(true);
      onSaved(id);
      setTimeout(() => {
        setTaxon("");
        setElement("shell");
        setConfidence("med");
        setSaved(false);
        setSaving(false);
        inputRef.current?.focus();
      }, 800);
    } catch (e: any) {
      console.error("Quick Find save failed:", e);
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Handle bar */}
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        <div className="px-4 pb-4">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-black text-slate-950 dark:text-white">Quick Find</h2>
              {lat && lon && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  <MapPin className="h-2.5 w-2.5" />
                  GPS
                </span>
              )}
              {gpsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Taxon input */}
          <div className="mb-3">
            <input
              ref={inputRef}
              type="text"
              value={taxon}
              onChange={(e) => setTaxon(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Taxon / identification…"
              list="qf-taxa"
              className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-lg font-black text-slate-950 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-emerald-900/50"
            />
            <datalist id="qf-taxa">
              {COMMON_TAXA.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>

          {/* Element chips */}
          <div className="mb-3">
            <div className="-mx-1 flex flex-wrap gap-1">
              {ELEMENTS.map((el) => (
                <button
                  key={el}
                  type="button"
                  onClick={() => setElement(el)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                    element === el
                      ? "border-emerald-400 bg-emerald-600 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {el}
                </button>
              ))}
            </div>
          </div>

          {/* Confidence */}
          <div className="mb-4 flex gap-2">
            {(["high", "med", "low"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setConfidence(c)}
                className={`flex-1 rounded-lg border py-2 text-[11px] font-black uppercase transition-colors ${
                  confidence === c
                    ? c === "high" ? "border-green-400 bg-green-600 text-white"
                      : c === "med" ? "border-amber-400 bg-amber-500 text-white"
                      : "border-red-400 bg-red-500 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {gpsError && (
            <p className="mb-3 text-[11px] text-amber-600 dark:text-amber-400">{gpsError} — find will be saved without GPS coordinates.</p>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!taxon.trim() || saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-black text-white shadow-md transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {saved ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Saved — tap again to add another
              </>
            ) : saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Save Find
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[10px] text-slate-400">
            Photos and details can be added from the Finds page afterwards.
          </p>
        </div>
      </div>
    </>
  );
}
