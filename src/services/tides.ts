export type TideEvent = {
    type: "high" | "low";
    time: string;
    value: number;
};

/**
 * Fetches RECENT GAUGE READINGS from the UK Environment Agency flood-monitoring API.
 * These are historical observations, NOT official tide predictions.
 * The "next tide" estimate is approximate (last peak ± 12h 25m) and should NOT
 * be used for safety-critical decisions. For authoritative predictions use
 * the Admiralty EasyTide or a dedicated tide-table service.
 */
export async function getTidesUK(lat: number, lon: number): Promise<TideEvent[]> {
    // 1. Find the nearest tidal station
    // The API allows filtering by distance
    const stationUrl = `https://environment.data.gov.uk/flood-monitoring/id/stations?lat=${lat}&long=${lon}&dist=50&parameter=level&qualifier=TidalLevel`;
    
    const sResp = await fetch(stationUrl);
    if (!sResp.ok) throw new Error("Failed to find nearby UK tide station");
    
    const sData = await sResp.json();
    const stations = sData.items;
    
    if (!stations || stations.length === 0) {
        throw new Error("No UK tidal stations found within 50km.");
    }

    // Use the first station returned (nearest)
    const station = stations[0];
    const stationId = station.notation;

    // 2. Fetch recent gauge readings for this station. This is not an official
    // prediction source; callers should label the result as an estimate.
    const tideUrl = `https://environment.data.gov.uk/flood-monitoring/id/stations/${stationId}/readings?_sorted&_limit=96`;
    
    const tResp = await fetch(tideUrl);
    if (!tResp.ok) throw new Error("Failed to fetch UK gauge readings");
    
    const tData = await tResp.json();
    const readings = (Array.isArray(tData.items) ? tData.items : [])
        .filter((reading: any) => Number.isFinite(Number(reading.value)) && reading.dateTime)
        .map((reading: any) => ({
            dateTime: reading.dateTime,
            value: Number(reading.value),
        }))
        .sort((a: any, b: any) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

    // The EA API provides raw level data — peaks and troughs in recent 24h readings.
    const events: TideEvent[] = [];
    const MIN_DELTA = 0.05;
    
    for (let i = 2; i < readings.length - 2; i++) {
        const prev2 = readings[i + 2].value; // Readings are newest first
        const prev1 = readings[i + 1].value;
        const curr = readings[i].value;
        const next1 = readings[i - 1].value;
        const next2 = readings[i - 2].value;

        const isHigh =
            curr > prev1 && curr > next1 &&
            curr >= prev2 && curr >= next2 &&
            (curr - Math.min(prev2, next2)) > MIN_DELTA;
        const isLow =
            curr < prev1 && curr < next1 &&
            curr <= prev2 && curr <= next2 &&
            (Math.max(prev2, next2) - curr) > MIN_DELTA;

        if (isHigh) {
            events.push({
                type: "high",
                time: readings[i].dateTime,
                value: curr
            });
        } else if (isLow) {
            events.push({
                type: "low",
                time: readings[i].dateTime,
                value: curr
            });
        }
    }

    // Rough estimate only: opposite tide follows about half a lunar tidal cycle later.
    // This will be wrong near neap/spring transitions and at irregular coastlines.
    if (events.length > 0) {
        const last = events[0];
        const halfCycleMs = (6 * 60 + 12.5) * 60 * 1000;
        let nextTimeMs = new Date(last.time).getTime() + halfCycleMs;
        let nextType: TideEvent["type"] = last.type === "high" ? "low" : "high";
        while (nextTimeMs < Date.now()) {
            nextTimeMs += halfCycleMs;
            nextType = nextType === "high" ? "low" : "high";
        }
        
        events.unshift({
            type: nextType,
            time: new Date(nextTimeMs).toISOString(),
            value: last.value // Approximation
        });
    }

    return events;
}
