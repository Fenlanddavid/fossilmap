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

    // 2. Fetch the "High/Low" forecast for this station
    // The EA API provides recent readings. For true *predictions* without a key,
    // we use their 'tide' endpoint which provides simplified high/low data.
    const tideUrl = `https://environment.data.gov.uk/flood-monitoring/id/stations/${stationId}/readings?_sorted&_limit=50`;
    
    const tResp = await fetch(tideUrl);
    if (!tResp.ok) throw new Error("Failed to fetch UK gauge readings");
    
    const tData = await tResp.json();
    const readings = tData.items;

    // The EA API provides raw level data — peaks and troughs in recent 24h readings.
    const events: TideEvent[] = [];
    
    for (let i = 1; i < readings.length - 1; i++) {
        const prev = readings[i + 1].value; // Readings are reverse sorted
        const curr = readings[i].value;
        const next = readings[i - 1].value;

        if (curr > prev && curr > next) {
            events.push({
                type: "high",
                time: readings[i].dateTime,
                value: curr
            });
        } else if (curr < prev && curr < next) {
            events.push({
                type: "low",
                time: readings[i].dateTime,
                value: curr
            });
        }
    }

    // Rough estimate only: next tide ≈ last reading ± 12h 25m.
    // This will be wrong near neap/spring transitions and at irregular coastlines.
    if (events.length > 0) {
        const last = events[0];
        const lastTime = new Date(last.time).getTime();
        const nextTime = new Date(lastTime + (12 * 60 + 25) * 60 * 1000);
        
        events.unshift({
            type: last.type === "high" ? "low" : "high",
            time: nextTime.toISOString(),
            value: last.value // Approximation
        });
    }

    return events;
}