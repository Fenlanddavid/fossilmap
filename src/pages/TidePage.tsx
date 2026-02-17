import React from "react";
import { TideWidget } from "../components/TideWidget";

export default function TidePage() {
    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h2 className="text-3xl font-black text-gray-800 dark:text-gray-100 mb-2">Tide Times</h2>
                <p className="text-gray-500 dark:text-gray-400">
                    Real-time tidal data from the UK Environment Agency gauge network. 
                    Useful for planning safe foreshore and cliff-base collecting.
                </p>
            </div>

            <div className="grid gap-6">
                <TideWidget />
                
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-6 rounded-2xl">
                    <h3 className="font-bold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-2">
                        ⚠️ Safety First
                    </h3>
                    <ul className="text-sm text-amber-800/80 dark:text-amber-400/80 space-y-2 list-disc ml-4">
                        <li>Always check local weather and sea conditions before heading out.</li>
                        <li>Be aware of cut-off points on beaches with high cliffs.</li>
                        <li>Give yourself plenty of time to return before the tide turns.</li>
                        <li>Gauge readings are approximations and can be affected by weather/surges.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
