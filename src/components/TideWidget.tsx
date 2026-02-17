import React, { useEffect, useState } from "react";
import { TideEvent, getTidesUK } from "../services/tides";
import { captureGPS } from "../services/gps";

export function TideWidget() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tides, setTides] = useState<TideEvent[]>([]);
    const [location, setLocation] = useState<{lat: number, lon: number} | null>(null);

    async function refreshTides() {
        setLoading(true);
        setError(null);
        try {
            const pos = await captureGPS();
            setLocation({ lat: pos.lat, lon: pos.lon });
            const events = await getTidesUK(pos.lat, pos.lon);
            
            // EA API returns latest readings first.
            // We want the most recent past and the upcoming predicted.
            setTides(events);
        } catch (e: any) {
            console.error("Tide error:", e);
            setError(e.message || "Failed to fetch tides");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refreshTides();
    }, []);

    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    🌊 UK Coast Tides
                </h3>
                <button 
                    onClick={refreshTides} 
                    disabled={loading}
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                >
                    {loading ? "..." : "Refresh"}
                </button>
            </div>

            {error && (
                <div className="text-red-500 text-[10px] font-bold mb-2 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                    ⚠️ {error}
                </div>
            )}

            {!location && !loading && !error && (
                <button onClick={refreshTides} className="w-full py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold animate-pulse">
                    Detect Location & Get Tides
                </button>
            )}

            {loading && (
                <div className="space-y-2">
                    <div className="h-12 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-xl" />
                    <div className="h-12 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-xl" />
                </div>
            )}

            {tides.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                    {tides.slice(0, 3).map((t, i) => {
                        const date = new Date(t.time);
                        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const isHigh = t.type === "high";
                        const isFuture = date.getTime() > Date.now();
                        
                        return (
                            <div key={i} className={`flex items-center justify-between p-2.5 rounded-xl border relative overflow-hidden ${isHigh ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/50' : 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/50'}`}>
                                {isFuture && (
                                    <div className="absolute top-0 right-0 bg-blue-600 text-white text-[7px] px-1.5 py-0.5 font-bold uppercase rounded-bl-lg">Next</div>
                                )}
                                <div className="flex flex-col">
                                    <span className={`text-[9px] font-black uppercase tracking-tight ${isHigh ? 'text-blue-600' : 'text-emerald-600'}`}>
                                        {isHigh ? "High Water" : "Low Water"}
                                    </span>
                                    <span className="text-lg font-mono font-black text-gray-800 dark:text-gray-100 leading-none">
                                        {timeStr}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-black opacity-80">{t.value.toFixed(2)}m</div>
                                    <div className="text-[8px] font-bold opacity-40 uppercase">Gauge Level</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            
            {location && (
                <div className="mt-3 text-[8px] opacity-40 font-bold text-center uppercase tracking-widest flex items-center justify-center gap-2">
                    <span className="w-1 h-1 bg-green-500 rounded-full" />
                    UK Gov Gauge Network
                </div>
            )}
            
            <p className="mt-3 text-[8px] text-center opacity-30 italic leading-tight">
                Live readings from Environment Agency. Calculations are approximations. Not for navigation.
            </p>
        </div>
    );
}