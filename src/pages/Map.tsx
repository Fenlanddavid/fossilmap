import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Specimen, Media } from "../db";
import { v4 as uuid } from "uuid";
import { MapFilterBar } from "../components/MapFilterBar";
import { LocalityPanel } from "../components/LocalityPanel";
import { SpecimenModal } from "../components/SpecimenModal";
import { LocalityQuickAddModal } from "../components/LocalityQuickAddModal";
import { useNavigate } from "react-router-dom";

const DEFAULT_CENTER: [number, number] = [-2.0, 54.5];
const DEFAULT_ZOOM = 5;

type SelectedLocality = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  sssi: boolean;
  formation: string;
  lithology: string;
  specimenCount: number;
};

type DateFilterMode = "all" | "7d" | "30d" | "custom";

export default function MapPage({ projectId }: { projectId: string }) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const nav = useNavigate();

  // Filters
  const [filterSSSIOnly, setFilterSSSIOnly] = useState(false);
  const [filterFormation, setFilterFormation] = useState<string>("");
  const [filterTaxon, setFilterTaxon] = useState("");
  const [minSpecimens, setMinSpecimens] = useState(1);

  // Date range
  const [dateMode, setDateMode] = useState<DateFilterMode>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  
  // Map Style
  const [mapStyleMode, setMapStyleMode] = useState<"streets" | "satellite">("streets");

  // Selection / modals
  const [selected, setSelected] = useState<SelectedLocality | null>(null);
  const [openSpecimenId, setOpenSpecimenId] = useState<string | null>(null);
  const [addingLocalityAt, setAddingLocalityAt] = useState<{ lat: number; lon: number } | null>(null);
  const [highlightedLocalityId, setHighlightedLocalityId] = useState<string | null>(null);

  // Data
  const localities = useLiveQuery(async () => {
    const rows = await db.localities.where("projectId").equals(projectId).toArray();
    return rows.filter((r) => typeof r.lat === "number" && typeof r.lon === "number") as Array<
      typeof rows[number] & { lat: number; lon: number }
    >;
  }, [projectId]);

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
          name: l.name || "(Unnamed trip)",
          sssi: l.sssi ? 1 : 0,
          formation: l.formation || "",
          lithology: l.lithologyPrimary || "",
          specimenCount: specimenCountByLocality.get(l.id) ?? 0,
        },
      })),
    };
  }, [filteredLocalities, specimenCountByLocality]);

  const selectedSpecimens = useLiveQuery(async () => {
    if (!selected) return [];
    const all = await db.specimens.where("localityId").equals(selected.id).reverse().sortBy("createdAt");
    return all.filter(specimenPassesDateFilter);
  }, [selected?.id, dateMode, customFrom, customTo]);

  const firstPhotoBySpecimenId = useLiveQuery(async () => {
    if (!selectedSpecimens || selectedSpecimens.length === 0) return new Map<string, Media>();
    const ids = selectedSpecimens.map((s) => s.id);
    const mediaRows = await db.media.where("specimenId").anyOf(ids).toArray();
    mediaRows.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    const m = new Map<string, Media>();
    for (const row of mediaRows) {
      if (!m.has(row.specimenId)) {
        m.set(row.specimenId, row);
      }
    }
    return m;
  }, [selectedSpecimens?.map((s) => s.id).join("|")]);

  // Map Initialization
  useEffect(() => {
    if (!mapDivRef.current) return;
    
    if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
    }

    const style: any = {
        version: 8,
        sources: {
            "raster-tiles": {
                type: "raster",
                tiles: mapStyleMode === "streets" 
                    ? ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"]
                    : ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                tileSize: 256,
                attribution: mapStyleMode === "streets" ? "© OpenStreetMap" : "© Esri World Imagery"
            }
        },
        layers: [
            { id: "simple-tiles", type: "raster", source: "raster-tiles", minzoom: 0, maxzoom: 22 }
        ]
    };

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: style,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "top-right");

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
          "circle-color": ["case", ["==", ["get", "sssi"], 1], "#d97706", "#059669"],
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
          name: props.name,
          lon: coords[0],
          lat: coords[1],
          sssi: props.sssi === 1 || props.sssi === "1",
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
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapStyleMode]); // ONLY style changes trigger re-init

  // Data Updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("localities") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(featureCollection as any);
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

  function zoomToMyLocation() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => mapRef.current?.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 13 }),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

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
    setMinSpecimens(1);
    setDateMode("all");
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-80px)]">
      <MapFilterBar 
        count={filteredLocalities.length}
        zoomToMyLocation={zoomToMyLocation}
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
      />

      <div className="flex-1 relative border-2 border-gray-100 dark:border-gray-800 rounded-3xl overflow-hidden shadow-inner bg-gray-50 dark:bg-black">
        <div ref={mapDivRef} className="absolute inset-0" />
        
        {/* Selection overlay */}
        {selected && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-10">
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
        <SpecimenModal specimenId={openSpecimenId} onClose={() => setOpenSpecimenId(null)} />
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
