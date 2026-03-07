import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

/**
 * Lightweight component to fetch and display the first 5 finds for a specific session.
 */
export function SessionFindsList({ sessionId }: { sessionId: string }) {
  const topFinds = useLiveQuery(async () => {
    return await db.specimens
      .where("sessionId")
      .equals(sessionId)
      .limit(5)
      .toArray();
  }, [sessionId]);

  if (!topFinds || topFinds.length === 0) return null;

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-1">
        {topFinds.map((f) => (
          <span key={f.id} className="text-[9px] bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/50 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400 font-medium">
            {f.taxon || "Find"}
          </span>
        ))}
        {topFinds.length >= 5 && <span className="text-[9px] text-gray-400 flex items-center px-1">...</span>}
      </div>
    </div>
  );
}
