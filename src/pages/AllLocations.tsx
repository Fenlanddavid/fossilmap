import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { useNavigate } from "react-router-dom";

export default function AllLocations(props: { projectId: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const locations = useLiveQuery(
    async () => {
      let collection = db.localities.where("projectId").equals(props.projectId);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return collection
          .filter(l => 
            l.name.toLowerCase().includes(q) || 
            (l.notes?.toLowerCase().includes(q) ?? false) ||
            (l.formation?.toLowerCase().includes(q) ?? false)
          )
          .reverse()
          .sortBy("createdAt");
      }
      return collection.reverse().sortBy("createdAt");
    },
    [props.projectId, searchQuery]
  );

  return (
    <div className="max-w-5xl mx-auto pb-10 px-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8 mt-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight">Locations & Trips</h2>
          <p className="text-gray-500 text-sm font-medium">Browse and search every recorded geological location or field trip.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-xl lg:justify-end">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">🔍</span>
            <input 
              type="text"
              placeholder="Search by name, formation, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 sm:py-3 pl-10 pr-4 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
            />
          </div>
          <button 
            onClick={() => navigate("/location")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 sm:py-3 rounded-xl font-bold shadow-md transition-all whitespace-nowrap text-sm"
          >
            + New Location
          </button>
        </div>
      </div>

      {(!locations || locations.length === 0) ? (
        <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <div className="text-4xl mb-4">📍</div>
          <p className="text-gray-500 italic font-medium">
            {searchQuery ? "No results match your search." : "No locations or trips recorded yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((l) => (
            <div 
              key={l.id} 
              onClick={() => navigate(`/location/${l.id}`)}
              className="group border border-gray-200 dark:border-gray-700 rounded-2xl p-5 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-900 transition-all cursor-pointer flex flex-col relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 group-hover:text-blue-600 transition-colors line-clamp-1">
                  {l.name || "(Unnamed)"}
                </h3>
                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${l.type === 'trip' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                    {l.type === 'trip' ? 'Trip' : 'Location'}
                </span>
              </div>
              
              <div className="text-sm opacity-70 space-y-2 mb-4 flex-1">
                <div className="flex items-center gap-2">
                   <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                      {l.lat && l.lon ? `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}` : "No GPS"}
                   </span>
                </div>
                {l.formation && (
                    <div className="text-xs font-bold text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-1">
                        🏔️ {l.formation}
                    </div>
                )}
                {l.lithologyPrimary && <div className="text-[10px] font-medium opacity-60 capitalize">{l.lithologyPrimary}</div>}
              </div>

              <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                <span className="text-[10px] opacity-40 font-medium">
                  {new Date(l.createdAt).toLocaleDateString()}
                </span>
                {l.sssi && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">⚠️ SSSI</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
