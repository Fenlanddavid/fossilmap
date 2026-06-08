import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { db } from "../db";
import { QuickFindSheet } from "./QuickFindSheet";

export function GlobalQuickFind({ projectId }: { projectId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const activeSession = useLiveQuery(async () => {
    const sessions = await db.sessions.where("projectId").equals(projectId).filter((session) => !session.isFinished).toArray();
    return sessions.sort((a, b) => (b.updatedAt || b.startTime).localeCompare(a.updatedAt || a.startTime))[0] ?? null;
  }, [projectId]);

  const fallbackLocality = useLiveQuery(async () => {
    const localities = await db.localities.where("projectId").equals(projectId).reverse().sortBy("createdAt");
    return localities[0] ?? null;
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
    return fallbackLocality ?? null;
  }, [activeSession?.localityId, fallbackLocality?.id]);

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

  const targetLocalityId = targetLocality?.id ?? activeSession?.localityId ?? fallbackLocality?.id ?? null;

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
          localityName={targetLocality?.name ?? null}
          onClose={() => setOpen(false)}
          onSaved={() => {}}
        />
      )}
    </>
  );
}

export default GlobalQuickFind;
