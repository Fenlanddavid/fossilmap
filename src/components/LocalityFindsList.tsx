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
    <div className="mb-4">
      <div className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Latest Finds</div>
      <div className="flex flex-wrap gap-1">
        {topFinds.map((f) => (
          <span key={f.id} className="text-[9px] bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400 font-medium">
            {f.taxon || "Find"}
          </span>
        ))}
        {topFinds.length >= 5 && <span className="text-[9px] text-gray-400 flex items-center px-1">...</span>}
      </div>
    </div>
  );
}
