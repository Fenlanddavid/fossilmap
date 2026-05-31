import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

/**
 * Lightweight component to fetch and display the first 5 finds for a locality.
 * Moving this out of the main Home query prevents whole-page crashes if one query fails.
 */
export function LocalityFindsList({ localityId }: { localityId: string }) {
  const topFinds = useLiveQuery(async () => {
    return await db.specimens
      .where("localityId")
      .equals(localityId)
      .limit(5)
      .toArray();
  }, [localityId]);

  if (!topFinds || topFinds.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mb-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400">Latest finds</div>
      <div className="flex flex-wrap gap-1">
        {topFinds.map((f) => (
          <span key={f.id} className="rounded border border-white bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            {f.taxon || "Find"}
          </span>
        ))}
        {topFinds.length >= 5 && <span className="flex items-center px-1 text-[9px] text-slate-400">...</span>}
      </div>
    </div>
  );
}
