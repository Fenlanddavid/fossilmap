import React, { useState, useEffect, useRef, useCallback } from "react";
import { db, Locality, Specimen } from "../db";
import { v4 as uuid } from "uuid";
import { captureGPS } from "../services/gps";
import { hasCoords } from "../services/coords";
import { X, MapPin, Loader2, CheckCircle2, Zap, RefreshCw, ChevronDown } from "lucide-react";

const COMMON_TAXA = [
  "Ammonite", "Belemnite", "Bivalve", "Gastropod", "Brachiopod",
  "Echinoid", "Crinoid", "Gryphaea", "Fish", "Shark Tooth",
  "Ichthyosaur", "Plesiosaur", "Dinosaur", "Trace fossil", "Plant",
];

interface QuickFindSheetProps {
  projectId: string;
  localityId: string | null;
  localities: Locality[];
  activeSessionId?: string | null;
  activeSessionLocalityId?: string | null;
  onClose: () => void;
  onSaved: (specimenId: string) => void;
}

export function QuickFindSheet({
  projectId,
  localityId,
  localities,
  activeSessionId,
  activeSessionLocalityId,
  onClose,
  onSaved,
}: QuickFindSheetProps) {
  const [taxon, setTaxon]       = useState("");
  const [selectedLocalityId, setSelectedLocalityId] = useState(localityId ?? "");
  const [lat, setLat]           = useState<number | null>(null);
  const [lon, setLon]           = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  useEffect(() => {
    setSelectedLocalityId(localityId ?? "");
  }, [localityId]);

  const tryGPS = useCallback(() => {
    setGpsLoading(true);
    setGpsError(null);
    captureGPS()
      .then((fix) => { setLat(fix.lat); setLon(fix.lon); })
      .catch(() => setGpsError("GPS unavailable"))
      .finally(() => setGpsLoading(false));
  }, []);

  useEffect(() => { tryGPS(); }, []);

  async function handleSave() {
    if (!taxon.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const id  = uuid();
      const selectedSessionId = selectedLocalityId && selectedLocalityId === activeSessionLocalityId ? activeSessionId ?? null : null;
      const specimen: Specimen = {
        id,
        projectId,
        localityId: selectedLocalityId,
        sessionId: selectedSessionId,
        specimenCode: `QF-${Date.now().toString(36).toUpperCase()}`,
        taxon: taxon.trim(),
        taxonConfidence: "med",
        period: "",
        stage: "",
        lat,
        lon,
        gpsAccuracyM: null,
        element: "",
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
        isPending: true,
        createdAt: now,
        updatedAt: now,
      };
      await db.specimens.add(specimen);
      setSaved(true);
      onSaved(id);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (e: any) {
      console.error("Quick Find save failed:", e);
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        <div className="px-4 pb-6">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-black text-slate-950 dark:text-white">Quick Find</h2>
              {gpsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
              {hasCoords(lat, lon) && !gpsLoading && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  <MapPin className="h-2.5 w-2.5" />
                  GPS
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Taxon input */}
          <div className="mb-4">
            <input
              ref={inputRef}
              type="text"
              value={taxon}
              onChange={(e) => setTaxon(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="What did you find? e.g. Ammonite"
              list="qf-taxa"
              className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-lg font-black text-slate-950 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-emerald-900/50"
            />
            <datalist id="qf-taxa">
              {COMMON_TAXA.map(t => <option key={t} value={t} />)}
            </datalist>
            <div className="mt-2">
              <label htmlFor="qf-locality" className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Add to location
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  id="qf-locality"
                  value={selectedLocalityId}
                  onChange={(e) => setSelectedLocalityId(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm font-black text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-emerald-900/50"
                >
                  <option value="">No location yet - organise later</option>
                  {localities.map((locality) => (
                    <option key={locality.id} value={locality.id}>
                      {locality.name || "Unnamed location"}{locality.type === "trip" ? " (trip)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              {selectedLocalityId === activeSessionLocalityId && activeSessionId && (
                <p className="mt-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  This will be linked to the active trip session.
                </p>
              )}
              {!selectedLocalityId && (
                <p className="mt-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  This will stay in Pending Finds until you attach or create a locality.
                </p>
              )}
            </div>
          </div>

          {gpsError && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
              <p className="text-[11px] text-amber-700 dark:text-amber-400">{gpsError} — find will be saved without GPS.</p>
              <button
                type="button"
                onClick={tryGPS}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-black text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!taxon.trim() || saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-black text-white shadow-md transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {saved ? (
              <><CheckCircle2 className="h-4 w-4" />Logged</>
            ) : saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <><Zap className="h-4 w-4" />Log Find</>
            )}
          </button>
          <p className="mt-2 text-center text-[10px] text-slate-400">
            Saved as a draft. Add photos and details from the pending finds list.
          </p>
        </div>
      </div>
    </>
  );
}
