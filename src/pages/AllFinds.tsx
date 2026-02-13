import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { useNavigate } from "react-router-dom";

export default function AllFinds(props: { projectId: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const specimens = useLiveQuery(
    async () => {
      let collection = db.specimens.where("projectId").equals(props.projectId);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return collection
          .filter(s => 
            s.taxon.toLowerCase().includes(q) || 
            s.specimenCode.toLowerCase().includes(q) ||
            s.notes.toLowerCase().includes(q)
          )
          .reverse()
          .sortBy("createdAt");
      }
      return collection.reverse().sortBy("createdAt");
    },
    [props.projectId, searchQuery]
  );

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">All Finds</h2>
          <p className="text-gray-500 text-sm">Browse and search every recorded specimen.</p>
        </div>
        
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">🔍</span>
          <input 
            type="text"
            placeholder="Search by taxon, code, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-3 pl-10 pr-4 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
      </div>

      {(!specimens || specimens.length === 0) ? (
        <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-gray-500 italic">
            {searchQuery ? "No finds match your search." : "No finds recorded yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specimens.map((s) => (
            <div 
              key={s.id} 
              onClick={() => navigate(`/specimen?localityId=${s.localityId}`)} // Simple navigation for now
              className="group border border-gray-200 dark:border-gray-700 rounded-2xl p-5 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer"
            >
              <div className="flex justify-between items-start mb-3">
                <span className="font-mono text-xs font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                  {s.specimenCode}
                </span>
                <span className="text-[10px] opacity-50 font-medium">
                  {new Date(s.createdAt).toLocaleDateString()}
                </span>
              </div>
              
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1 group-hover:text-blue-600 transition-colors">
                {s.taxon || "Unidentified Specimen"}
              </h3>
              
              <div className="flex flex-wrap gap-2 mt-3">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                  s.taxonConfidence === "high" ? "bg-green-50 border-green-100 text-green-700" :
                  s.taxonConfidence === "med" ? "bg-amber-50 border-amber-100 text-amber-700" :
                  "bg-red-50 border-red-100 text-red-700"
                }`}>
                  {s.taxonConfidence} confidence
                </span>
                {s.element !== "unknown" && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                    {s.element}
                  </span>
                )}
              </div>

              {s.notes && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 line-clamp-2 italic">
                  "{s.notes}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}