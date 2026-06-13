import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, MapPin, Plus, X } from "lucide-react";
import { db, type Locality } from "../db";
import { QuickFindSheet } from "./QuickFindSheet";
import {
  analyseFindForLocalitySetup,
  attachFindToLocality,
  createLocalityFromFind,
  formatDistance,
  updateLocalityFromSuggestion,
  type LocalitySetupAnalysis,
} from "../services/localitySetup";

export function GlobalQuickFind({ projectId }: { projectId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [savedPromptId, setSavedPromptId] = useState<string | null>(null);

  const activeSession = useLiveQuery(async () => {
    const sessions = await db.sessions.where("projectId").equals(projectId).filter((session) => !session.isFinished).toArray();
    return sessions.sort((a, b) => (b.updatedAt || b.startTime).localeCompare(a.updatedAt || a.startTime))[0] ?? null;
  }, [projectId]);

  const localities = useLiveQuery(async () => {
    const localities = await db.localities.where("projectId").equals(projectId).reverse().sortBy("createdAt");
    return localities;
  }, [projectId]);

  const dataCount = useLiveQuery(async () => {
    const [localities, specimens] = await Promise.all([
      db.localities.where("projectId").equals(projectId).count(),
      db.specimens.where("projectId").equals(projectId).count(),
    ]);
    return localities + specimens;
  }, [projectId]);

  const pendingCount = useLiveQuery(async () => (
    db.specimens.where("projectId").equals(projectId).filter((specimen) => !!specimen.isPending).count()
  ), [projectId]);

  const targetLocality = useLiveQuery(async () => {
    if (activeSession?.localityId) {
      return await db.localities.get(activeSession.localityId) ?? null;
    }
    return localities?.[0] ?? null;
  }, [activeSession?.localityId, localities]);

  const shouldHide = useMemo(() => {
    const path = location.pathname;
    if ((dataCount ?? 0) === 0) return true;
    if (path === "/settings") return true;
    if (path.startsWith("/specimen")) return true;
    if (path.startsWith("/location")) return true;
    if (path.startsWith("/field-trip")) return true;
    if (path.startsWith("/session")) return true;
    return false;
  }, [dataCount, location.pathname]);

  if (shouldHide) return null;

  const targetLocalityId = targetLocality?.id ?? activeSession?.localityId ?? localities?.[0]?.id ?? null;

  return (
    <>
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 sm:bottom-6 sm:right-6">
        {(pendingCount ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => navigate("/finds?view=pending")}
            className="absolute -right-1.5 -top-1.5 z-10 grid h-6 min-w-6 place-items-center rounded-full border border-white bg-amber-500 px-1.5 text-[10px] font-black text-white shadow-md dark:border-slate-950"
            aria-label={`${pendingCount} pending finds`}
          >
            {pendingCount}
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-emerald-600 text-white shadow-xl transition-all hover:bg-emerald-700 hover:shadow-emerald-600/30 active:scale-95"
          aria-label="Quick Find"
        >
          <Plus className="h-6 w-6 stroke-[2.75]" />
        </button>
      </div>

      {open && (
        <QuickFindSheet
          projectId={projectId}
          localityId={targetLocalityId}
          localities={localities ?? []}
          activeSessionId={activeSession?.id ?? null}
          activeSessionLocalityId={activeSession?.localityId ?? null}
          onClose={() => setOpen(false)}
          onSaved={(specimenId) => setSavedPromptId(specimenId)}
        />
      )}

      {savedPromptId && (
        <QuickFindLocalityPrompt
          specimenId={savedPromptId}
          onClose={() => setSavedPromptId(null)}
        />
      )}
    </>
  );
}

export default GlobalQuickFind;

function QuickFindLocalityPrompt({ specimenId, onClose }: { specimenId: string; onClose: () => void }) {
  const [analysis, setAnalysis] = useState<LocalitySetupAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    db.specimens.get(specimenId)
      .then(async (find) => {
        if (!find) return null;
        if (find.lat == null || find.lon == null) return null;
        return analyseFindForLocalitySetup(find);
      })
      .then((result) => {
        if (!active) return;
        setAnalysis(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [specimenId]);

  if (!loading && !analysis) return null;

  async function attach(locality: Locality) {
    if (!analysis) return;
    setSaving(true);
    await attachFindToLocality(analysis.find, locality, { markComplete: true });
    setMessage(`Attached to ${locality.name || "saved locality"}.`);
    window.setTimeout(onClose, 900);
  }

  async function create() {
    if (!analysis?.suggestion) return;
    setSaving(true);
    const locality = await createLocalityFromFind(analysis.find, analysis.suggestion);
    setMessage(`Created ${locality.name || "new locality"}.`);
    window.setTimeout(onClose, 900);
  }

  async function updateLinked() {
    if (!analysis?.linkedLocality || !analysis.suggestion) return;
    setSaving(true);
    await updateLocalityFromSuggestion(analysis.linkedLocality, analysis.suggestion);
    setMessage(`Updated ${analysis.linkedLocality.name || "linked locality"}.`);
    window.setTimeout(onClose, 900);
  }

  const bestNearby = analysis?.nearby[0] ?? null;
  const bestPossible = analysis?.possible[0] ?? null;

  return (
    <div className="fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 mx-auto max-w-md rounded-xl border border-emerald-200 bg-white p-3 shadow-2xl dark:border-emerald-900 dark:bg-slate-900 sm:left-auto sm:right-6">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
          {loading || saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-950 dark:text-white">{message || "Find saved."}</p>
          {loading && <p className="mt-0.5 text-xs font-medium text-slate-500">Checking saved localities and BGS data...</p>}

          {!loading && analysis?.linkedLocality && !message && (
            <>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Saved to {analysis.linkedLocality.name || "saved locality"}. No new locality will be created.</p>
              {analysis.suggestion && (
                <button
                  type="button"
                  onClick={updateLinked}
                  disabled={saving}
                  className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Update locality geology
                </button>
              )}
            </>
          )}

          {!loading && !analysis?.linkedLocality && bestNearby && !message && (
            <>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Nearby locality found: {bestNearby.locality.name || "saved locality"} ({formatDistance(bestNearby.distanceM)}).</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => attach(bestNearby.locality)} disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">Attach Here</button>
                {analysis?.suggestion && <button type="button" onClick={create} disabled={saving} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Create New</button>}
              </div>
            </>
          )}

          {!loading && !analysis?.linkedLocality && !bestNearby && bestPossible && !message && (
            <>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Possible locality within 1 mile: {bestPossible.locality.name || "saved locality"} ({formatDistance(bestPossible.distanceM)}). Review before merging.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => attach(bestPossible.locality)} disabled={saving} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">Attach</button>
                {analysis?.suggestion && <button type="button" onClick={create} disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">Create New</button>}
              </div>
            </>
          )}

          {!loading && !analysis?.linkedLocality && !bestNearby && !bestPossible && analysis?.suggestion && !message && (
            <>
              <p className="mt-0.5 text-xs font-medium text-slate-500">BGS data is available for this GPS point.</p>
              <button type="button" onClick={create} disabled={saving} className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">Create Locality</button>
            </>
          )}
        </div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Dismiss locality prompt">
          {message ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
