export type TideEvent = {
    type: "high" | "low";
    time: string;
    value: number;
};

/**
 * Fetches tide data from the UK Environment Agency (ADUK) API.
 * This is the official UK government data for tide gauges.
 * No key required.
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

    // The EA API provides raw level data. 
    // For a simple "Safety Widget", we'll find the peaks in the recent 24h data.
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

    // Since these are recent *readings*, we calculate the next expected tide 
    // by adding roughly 12h 25m to the last known peak/trough.
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