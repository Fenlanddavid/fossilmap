import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Specimen, Media } from "../db";
import { v4 as uuid } from "uuid";
import { MapFilterBar } from "../components/MapFilterBar";
import { LocalityPanel } from "../components/LocalityPanel";
import { LocalityQuickAddModal } from "../components/LocalityQuickAddModal";
import { useNavigate } from "react-router-dom";
import { Map as MapIcon, MapPinPlus, Satellite } from "lucide-react";

const SpecimenModal = React.lazy(() =>
  import("../components/SpecimenModal").then((mod) => ({ default: mod.SpecimenModal }))
);

const DEFAULT_CENTER: [number, number] = [-2.0, 54.5];
const DEFAULT_ZOOM = 5;
const PALETTE = ["#059669", "#2563eb", "#7c3aed", "#d97706", "#dc2626", "#0891b2", "#4f46e5", "#65a30d"];
type MapStyleMode = "streets" | "satellite";

function rasterStyle(mode: MapStyleMode): any {
  const isStreets = mode === "streets";
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: isStreets
          ? ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]
          : ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: isStreets ? "© OpenStreetMap contributors" : "© Esri World Imagery",
        maxzoom: isStreets ? 19 : 23,
      },
    },
    layers: [
      { id: "simple-tiles", type: "raster", source: "raster-tiles", minzoom: 0, maxzoom: 24 },
    ],
  };
}

function hashColor(value: string, fallback = "#64748b") {
  const key = value.trim();
  if (!key) return fallback;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

type SelectedLocality = {
  id: string;
  name: string;
  type: "location" | "trip";
  lat: number;
  lon: number;
  sssi: boolean;
  rigs: boolean;
  period: string;
  stage: string;
  formation: string;
  lithology: string;
  specimenCount: number;
};

type DateFilterMode = "all" | "7d" | "30d" | "custom";

export default function MapPage({ projectId, tripOnly = false }: { projectId: string; tripOnly?: boolean }) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const cameraRef = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number } | null>(null);
  const nav = useNavigate();

  // Filters
  const [filterSSSIOnly, setFilterSSSIOnly] = useState(false);
  const [filterFormation, setFilterFormation] = useState<string>("");
  const [filterTaxon, setFilterTaxon] = useState("");
  const [minSpecimens, setMinSpecimens] = useState(0);

  // Date range
  const [dateMode, setDateMode] = useState<DateFilterMode>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  
  // Map Style
  const [mapStyleMode, setMapStyleMode] = useState<MapStyleMode>("streets");
  const [colorMode, setColorMode] = useState<"status" | "period" | "formation" | "taxon">("status");

  // Selection / modals
  const [selected, setSelected] = useState<SelectedLocality | null>(null);
  const [openSpecimenId, setOpenSpecimenId] = useState<string | null>(null);
  const [addingLocalityAt, setAddingLocalityAt] = useState<{ lat: number; lon: number } | null>(null);
  const [highlightedLocalityId, setHighlightedLocalityId] = useState<string | null>(null);
  const [tileErrorCount, setTileErrorCount] = useState(0);

  // Data
  const localities = useLiveQuery(async () => {
    const rows = await db.localities
      .where("projectId").equals(projectId)
      .filter((l) => !tripOnly || l.type === "trip")
      .toArray();
    return rows.filter((r) => typeof r.lat === "number" && typeof r.lon === "number") as Array<
      typeof rows[number] & { lat: number; lon: number }
    >;
  }, [projectId, tripOnly]);

  const specimens = useLiveQuery(async () => db.specimens.where("projectId").equals(projectId).toArray(), [projectId]);

  // Derived state
  const formationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of localities ?? []) {
      const f = (l.formation || "").trim();
      if (f) set.add(f);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [localities]);

  const maxSpecimensAtAnyLocality = useMemo(() => {
    let max = 0;
    const counts = new Map<string, number>();
    for (const s of specimens ?? []) {
      const c = (counts.get(s.localityId) ?? 0) + 1;
      counts.set(s.localityId, c);
      if (c > max) max = c;
    }
    return max;
  }, [specimens]);

  const specimenPassesDateFilter = useMemo(() => {
    const now = new Date();
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const now0 = startOfDay(now);
    let from: Date | null = null;
    let to: Date | null = null;

    if (dateMode === "7d") {
      from = new Date(now0); from.setDate(from.getDate() - 7); to = now0;
    } else if (dateMode === "30d") {
      from = new Date(now0); from.setDate(from.getDate() - 30); to = now0;
    } else if (dateMode === "custom") {
      if (customFrom) from = startOfDay(new Date(customFrom));
      if (customTo) { to = startOfDay(new Date(customTo)); to.setHours(23, 59, 59, 999); }
    }

    return (s: { createdAt: string }) => {
      if (dateMode === "all") return true;
      const d = new Date(s.createdAt);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    };
  }, [dateMode, customFrom, customTo]);

  const specimenCountByLocality = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of specimens ?? []) {
      if (!specimenPassesDateFilter(s)) continue;
      map.set(s.localityId, (map.get(s.localityId) ?? 0) + 1);
    }
    return map;
  }, [specimens, specimenPassesDateFilter]);

  const dominantTaxonByLocality = useMemo(() => {
    const counts = new Map<string, Map<string, number>>();
    for (const s of specimens ?? []) {
      if (!specimenPassesDateFilter(s)) continue;
      const taxon = (s.taxon || "Unidentified").trim() || "Unidentified";
      if (!counts.has(s.localityId)) counts.set(s.localityId, new Map());
      const taxonCounts = counts.get(s.localityId)!;
      taxonCounts.set(taxon, (taxonCounts.get(taxon) ?? 0) + 1);
    }
    const out = new Map<string, string>();
    for (const [localityId, taxonCounts] of counts) {
      const top = Array.from(taxonCounts.entries()).sort((a, b) => b[1] - a[1])[0];
      if (top) out.set(localityId, top[0]);
    }
    return out;
  }, [specimens, specimenPassesDateFilter]);

  const markerMetaByLocality = useMemo(() => {
    const out = new Map<string, { markerColor: string; colorLabel: string }>();
    for (const l of localities ?? []) {
      if (colorMode === "period") {
        const label = l.period || "No period";
        out.set(l.id, { markerColor: hashColor(label, "#64748b"), colorLabel: label });
      } else if (colorMode === "formation") {
        const label = l.formation || "No formation";
        out.set(l.id, { markerColor: hashColor(label, "#64748b"), colorLabel: label });
      } else if (colorMode === "taxon") {
        const label = dominantTaxonByLocality.get(l.id) || "No finds";
        out.set(l.id, { markerColor: hashColor(label, "#64748b"), colorLabel: label });
      } else {
        const label = l.sssi || l.rigs ? "Protected flag" : (l.type === "trip" ? "Trip" : "Location");
        out.set(l.id, {
          markerColor: l.sssi || l.rigs ? "#d97706" : l.type === "trip" ? "#059669" : "#2563eb",
          colorLabel: label,
        });
      }
    }
    return out;
  }, [localities, colorMode, dominantTaxonByLocality]);

  const filteredLocalities = useMemo(() => {
    let out = localities ?? [];
    if (filterFormation.trim()) out = out.filter((l) => (l.formation || "").trim() === filterFormation.trim());
    if (filterSSSIOnly) out = out.filter((l) => !!l.sssi);
    if (minSpecimens > 0) out = out.filter((l) => (specimenCountByLocality.get(l.id) ?? 0) >= minSpecimens);

    const fTaxon = filterTaxon.trim().toLowerCase();
    if (fTaxon) {
      const matchingLocalityIds = new Set<string>();
      for (const s of specimens ?? []) {
        if (!specimenPassesDateFilter(s)) continue;
        if ((s.taxon || "").toLowerCase().includes(fTaxon)) matchingLocalityIds.add(s.localityId);
      }
      out = out.filter((l) => matchingLocalityIds.has(l.id));
    }
    return out;
  }, [localities, specimens, filterFormation, filterSSSIOnly, filterTaxon, minSpecimens, specimenCountByLocality]);

  const featureCollection = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: filteredLocalities.map((l) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [l.lon, l.lat] as [number, number] },
        properties: {
          id: l.id,
          type: l.type || "location",
          name: l.name || "(Unnamed)",
          sssi: l.sssi ? 1 : 0,
          rigs: l.rigs ? 1 : 0,
          period: l.period || "",
          stage: l.stage || "",
          formation: l.formation || "",
          lithology: l.lithologyPrimary || "",
          specimenCount: specimenCountByLocality.get(l.id) ?? 0,
          dominantTaxon: dominantTaxonByLocality.get(l.id) || "",
          markerColor: markerMetaByLocality.get(l.id)?.markerColor || "#059669",
          colorLabel: markerMetaByLocality.get(l.id)?.colorLabel || "",
        },
      })),
    };
  }, [filteredLocalities, specimenCountByLocality, dominantTaxonByLocality, markerMetaByLocality]);

  const legendItems = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of filteredLocalities) {
      const meta = markerMetaByLocality.get(l.id);
      if (!meta) continue;
      map.set(meta.colorLabel, meta.markerColor);
      if (map.size >= 8) break;
    }
    return Array.from(map.entries()).map(([label, color]) => ({ label, color }));
  }, [filteredLocalities, markerMetaByLocality]);

  const selectedSpecimens = useLiveQuery(async () => {
    if (!selected) return [];
    const all = await db.specimens.where("localityId").equals(selected.id).reverse().sortBy("createdAt");
    return all.filter(specimenPassesDateFilter);
  }, [selected?.id, dateMode, customFrom, customTo]);

  const firstPhotoBySpecimenId = useLiveQuery(async () => {
    if (!selectedSpecimens || selectedSpecimens.length === 0) return new Map<string, Media>();
    const ids = selectedSpecimens.map((s) => s.id);
    const mediaRows = await db.media.where("specimenId").anyOf(ids).toArray();
    mediaRows.sort((a, b) => {
        const aDate = a?.createdAt || "";
        const bDate = b?.createdAt || "";
        return aDate.localeCompare(bDate);
    });
    const m = new Map<string, Media>();
    for (const row of mediaRows) {
      if (row.specimenId && !m.has(row.specimenId)) {
        m.set(row.specimenId, row);
      }
    }
    return m;
  }, [selectedSpecimens?.map((s) => s.id).join("|")]);

  // Map Initialization
  useEffect(() => {
    if (!mapDivRef.current) return;
    const camera = cameraRef.current;

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: rasterStyle(mapStyleMode),
      center: camera?.center ?? DEFAULT_CENTER,
      zoom: camera?.zoom ?? DEFAULT_ZOOM,
      bearing: camera?.bearing ?? 0,
      pitch: camera?.pitch ?? 0,
      maxZoom: 22,
      clickTolerance: 40 // Improved hit-testing for mobile touch
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "top-right");
    map.on("error", () => setTileErrorCount((count) => Math.min(count + 1, 10)));

    map.on("load", () => {
      map.addSource("localities", {
        type: "geojson",
        data: featureCollection as any,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 12,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "localities",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": ["step", ["get", "point_count"], 16, 25, 20, 100, 28],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "localities",
        filter: ["has", "point_count"],
        layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "unclustered",
        type: "circle",
        source: "localities",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["step", ["get", "specimenCount"], 8, 1, 10, 5, 12, 20, 14],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-color": ["get", "markerColor"],
        },
      });

      map.addLayer({
        id: "unclustered-highlight",
        type: "circle",
        source: "localities",
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], "___NONE___"]] as any,
        paint: {
          "circle-radius": 18,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
          "circle-color": "rgba(0,0,0,0)",
        },
      });
      
      map.addLayer({
          id: "unclustered-highlight-ring",
          type: "circle",
          source: "localities",
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], "___NONE___"]] as any,
          paint: {
            "circle-radius": 22,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#000000",
            "circle-color": "rgba(0,0,0,0)",
            "circle-opacity": 0.5
          }
      });

      if (highlightedLocalityId) {
        const filter = ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], highlightedLocalityId]] as any;
        if (map.getLayer("unclustered-highlight")) map.setFilter("unclustered-highlight", filter);
        if (map.getLayer("unclustered-highlight-ring")) map.setFilter("unclustered-highlight-ring", filter);
      }

      map.addLayer({
        id: "unclustered-count",
        type: "symbol",
        source: "localities",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["case", [">", ["get", "specimenCount"], 0], ["to-string", ["get", "specimenCount"]], ""],
          "text-offset": [0, 0],
          "text-size": 10,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.on("click", "clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource("localities") as any;
        if (!clusterId || !source.getClusterExpansionZoom) return;
        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          const coords = (features[0].geometry as any).coordinates as [number, number];
          map.easeTo({ center: coords, zoom });
        });
      });

      map.on("click", "unclustered", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const coords = (f.geometry as any).coordinates as [number, number];
        const props = f.properties as any;
        const id = String(props.id);
        
        setHighlightedLocalityId(id);
        setSelected({
          id,
          type: props.type || "location",
          name: props.name,
          lon: coords[0],
          lat: coords[1],
          sssi: props.sssi === 1 || props.sssi === "1",
          rigs: props.rigs === 1 || props.rigs === "1",
          period: props.period || "",
          stage: props.stage || "",
          formation: props.formation || "",
          lithology: props.lithology || "",
          specimenCount: Number(props.specimenCount ?? 0),
        });

        const currentZoom = map.getZoom();
        const targetZoom = Math.max(currentZoom, 13);
        map.easeTo({ center: coords, zoom: targetZoom, duration: 450 });
        
        const filter = ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], id]] as any;
        if (map.getLayer("unclustered-highlight")) map.setFilter("unclustered-highlight", filter);
        if (map.getLayer("unclustered-highlight-ring")) map.setFilter("unclustered-highlight-ring", filter);
      });

      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "unclustered", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered", () => (map.getCanvas().style.cursor = ""));

      setTimeout(() => map.resize(), 0);
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    if (mapDivRef.current) ro.observe(mapDivRef.current);

    return () => {
      const current = mapRef.current;
      if (current) {
        const center = current.getCenter();
        cameraRef.current = {
          center: [center.lng, center.lat],
          zoom: current.getZoom(),
          bearing: current.getBearing(),
          pitch: current.getPitch(),
        };
      }
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [mapStyleMode]); // ONLY style changes trigger re-init

  // Data Updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mapInstance = map;

    function applyData() {
      const src = mapInstance.getSource("localities") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(featureCollection as any);
    }

    if (mapInstance.isStyleLoaded() && mapInstance.getSource("localities")) {
      applyData();
    } else {
      mapInstance.once("load", applyData);
    }

    return () => {
      mapInstance.off("load", applyData);
    };
  }, [featureCollection]); // Update pins when data changes

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (selected) {
      const stillThere = featureCollection.features.some((f) => String((f.properties as any).id) === String(selected.id));
      if (!stillThere) {
        setSelected(null);
        setHighlightedLocalityId(null);
        const filter = ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], "___NONE___"]] as any;
        if (map.getLayer("unclustered-highlight")) map.setFilter("unclustered-highlight", filter);
        if (map.getLayer("unclustered-highlight-ring")) map.setFilter("unclustered-highlight-ring", filter);
      } else if (highlightedLocalityId) {
         const filter = ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], highlightedLocalityId]] as any;
         if (map.getLayer("unclustered-highlight")) map.setFilter("unclustered-highlight", filter);
         if (map.getLayer("unclustered-highlight-ring")) map.setFilter("unclustered-highlight-ring", filter);
      }
    }
  }, [selected, highlightedLocalityId, featureCollection]);

  function addLocalityHere() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setAddingLocalityAt({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function createLocalityAt(name: string) {
    if (!addingLocalityAt) return;
    const { lat, lon } = addingLocalityAt;
    const now = new Date().toISOString();
    
    const defaultCollector = await db.settings.get("defaultCollector").then(s => s?.value || "");

    await db.localities.add({
      id: uuid(),
      projectId,
      type: tripOnly ? "trip" : "location",
      name: name.trim() || "New field trip",
      lat,
      lon,
      gpsAccuracyM: null,
      observedAt: now,
      collector: defaultCollector,
      exposureType: "other",
      sssi: false,
      permissionGranted: false,
      formation: "",
      member: "",
      bed: "",
      lithologyPrimary: "other",
      notes: "",
      createdAt: now,
      updatedAt: now,
    } as any);
    setAddingLocalityAt(null);
  }

  function clearFilters() {
    setFilterSSSIOnly(false);
    setFilterFormation("");
    setFilterTaxon("");
    setMinSpecimens(0);
    setDateMode("all");
    setCustomFrom("");
    setCustomTo("");
  }

  const compactMapStyleButton = (mode: "streets" | "satellite", label: string, Icon: typeof MapIcon) => (
    <button
      type="button"
      onClick={() => setMapStyleMode(mode)}
      aria-pressed={mapStyleMode === mode}
      title={label}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-black transition-colors ${
        mapStyleMode === mode
          ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-950 dark:text-emerald-300"
          : "text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-950/60 dark:hover:text-slate-100"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {tripOnly ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <button
            type="button"
            onClick={addLocalityHere}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800"
          >
            <MapPinPlus className="h-4 w-4" />
            <span>New trip here</span>
          </button>
          <div className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800" aria-label="Map style">
            {compactMapStyleButton("streets", "Streets", MapIcon)}
            {compactMapStyleButton("satellite", "Satellite", Satellite)}
          </div>
          <div className="ml-auto rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-black text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            {filteredLocalities.length} trips
          </div>
        </div>
      ) : (
        <MapFilterBar
          count={filteredLocalities.length}
          addLocalityHere={addLocalityHere}
          filterSSSIOnly={filterSSSIOnly}
          setFilterSSSIOnly={setFilterSSSIOnly}
          filterFormation={filterFormation}
          setFilterFormation={setFilterFormation}
          formationOptions={formationOptions}
          filterTaxon={filterTaxon}
          setFilterTaxon={setFilterTaxon}
          minSpecimens={minSpecimens}
          setMinSpecimens={setMinSpecimens}
          maxSpecimensAtAnyLocality={maxSpecimensAtAnyLocality}
          dateMode={dateMode}
          setDateMode={setDateMode}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          onClear={clearFilters}
          needsKey={false}
          mapStyleMode={mapStyleMode}
          setMapStyleMode={setMapStyleMode}
          colorMode={colorMode}
          setColorMode={setColorMode}
        />
      )}

      <div className="fossilmap-map-frame relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner dark:border-slate-800 dark:bg-slate-900">
        <div
          ref={mapDivRef}
          className="h-[calc(100svh-360px)] min-h-[320px] w-full sm:h-[calc(100svh-335px)] sm:min-h-[430px] md:h-[calc(100svh-270px)]"
        />
        {tileErrorCount >= 3 && (
          <div className="absolute right-14 top-3 z-10 max-w-xs rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 shadow-lg dark:border-amber-900 dark:bg-amber-950/80 dark:text-amber-100">
            <strong className="block font-black">Map tiles are having trouble loading</strong>
            <span className="mt-1 block leading-relaxed">Your fossil records and filters still work. Check your connection if the base map stays blank.</span>
          </div>
        )}
        {filteredLocalities.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center p-6">
            <div className="max-w-sm rounded-2xl border border-white/15 bg-slate-950/85 p-5 text-center text-white shadow-xl backdrop-blur">
              <h3 className="text-base font-black">No mapped records yet</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/72">
                Add GPS to a locality or specimen, then use the filters and colour modes to review patterns.
              </p>
            </div>
          </div>
        )}
        <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-5.75rem)] rounded-xl border border-white/70 bg-white/90 p-2.5 text-xs shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
          <div className="mb-2 font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Legend: {colorMode}</div>
          <div className="flex flex-wrap gap-2">
            {legendItems.length > 0 ? legendItems.map(item => (
              <span key={item.label} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            )) : (
              <span className="text-slate-500 dark:text-slate-400">No mapped records in this filter.</span>
            )}
          </div>
        </div>
        
        {/* Selection overlay */}
        {selected && (
          <div className="absolute bottom-3 left-3 right-3 z-10 sm:bottom-4 sm:left-auto sm:right-4 sm:w-96">
            <LocalityPanel 
              selected={selected}
              selectedSpecimens={selectedSpecimens as Specimen[]}
              firstPhotoBySpecimenId={firstPhotoBySpecimenId}
              onOpenSpecimen={(sid) => setOpenSpecimenId(sid)}
              onEdit={() => nav(`/field-trip/${selected.id}`)}
              onClose={() => {
                setSelected(null);
                setHighlightedLocalityId(null);
                const filter = ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], "___NONE___"]] as any;
                if (mapRef.current?.getLayer("unclustered-highlight")) mapRef.current.setFilter("unclustered-highlight", filter);
                if (mapRef.current?.getLayer("unclustered-highlight-ring")) mapRef.current.setFilter("unclustered-highlight-ring", filter);
              }}
            />
          </div>
        )}
      </div>

      {openSpecimenId && (
        <React.Suspense fallback={null}>
          <SpecimenModal specimenId={openSpecimenId} onClose={() => setOpenSpecimenId(null)} />
        </React.Suspense>
      )}

      {addingLocalityAt && (
        <LocalityQuickAddModal 
          lat={addingLocalityAt.lat}
          lon={addingLocalityAt.lon}
          onCancel={() => setAddingLocalityAt(null)}
          onCreate={createLocalityAt}
        />
      )}
    </div>
  );
}
