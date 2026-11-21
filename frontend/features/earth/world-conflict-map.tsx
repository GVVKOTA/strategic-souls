"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ArrowUpRight,
  Compass,
  Globe2,
  Grid,
  HelpCircle,
  Layers,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Table2,
  X,
} from "lucide-react";
import { EXCHANGES, type Exchange } from "../../../backend/services/market-data/exchanges";
import {
  EARTH_REGIONS,
  searchEarthRegions,
  type EarthRegionEntry,
} from "../../../backend/services/earth/locations";
import type {
  ConflictCategory,
  ConflictEvent,
  ConflictFeedResponse,
  ConflictPeriod,
} from "../../../backend/services/earth/conflicts";
import { Panel, SourceLink, moment } from "../../components/workspace/shared";

type BasemapId = "satellite" | "terrain" | "night";

export type MapFocusTarget = {
  lat: number;
  lon: number;
  zoom?: number;
  label?: string;
  exchangeId?: string;
  nonce: number;
};

type Props = {
  focusTarget?: MapFocusTarget | null;
  externalConflictId?: string | null;
  onViewOnGlobe?: (coords: {
    lat: number;
    lon: number;
    label: string;
    exchangeId?: string;
    conflictId?: string;
  }) => void;
  onConflictsLoaded?: (points: { id: string; lat: number; lon: number }[]) => void;
  onOpenAsset?: (instrumentId: string) => void;
  onSelectExchange?: (exchange: Exchange) => void;
};

const NASA_TILES: Record<BasemapId, { url: string; label: string; attribution: string }> = {
  satellite: {
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/2004-07-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
    label: "Satellite",
    attribution: "NASA GIBS Blue Marble Next Generation (2004 historical composite, Public Domain)",
  },
  terrain: {
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-07-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
    label: "Terrain Relief",
    attribution: "NASA GIBS Shaded Relief & Bathymetry (Public Domain)",
  },
  night: {
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png",
    label: "Night Lights",
    attribution: "NASA GIBS VIIRS Black Marble (2016 historical composite, Public Domain)",
  },
};

const REFERENCE_COASTLINES =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Coastlines_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png";
const REFERENCE_FEATURES =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Reference_Features_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png";
const REFERENCE_LABELS =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Reference_Labels_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png";

function buildGraticuleGeoJson() {
  const features: {
    type: "Feature";
    properties: Record<string, never>;
    geometry: { type: "LineString"; coordinates: [number, number][] };
  }[] = [];
  for (let lon = -150; lon <= 180; lon += 30) {
    const coords: [number, number][] = [];
    for (let lat = -80; lat <= 80; lat += 10) coords.push([lon, lat]);
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const coords: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 10) coords.push([lon, lat]);
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

function buildExchangesGeoJson() {
  return {
    type: "FeatureCollection" as const,
    features: EXCHANGES.map((e) => ({
      type: "Feature" as const,
      properties: {
        id: e.id,
        name: e.name,
        mic: e.mic,
        city: e.city,
        country: e.country,
        region: e.region,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [e.lon, e.lat],
      },
    })),
  };
}

function buildConflictsGeoJson(events: ConflictEvent[]) {
  return {
    type: "FeatureCollection" as const,
    features: events.map((ev) => ({
      type: "Feature" as const,
      properties: {
        eventId: ev.eventId,
        title: ev.eventTitle,
        country: ev.countryName,
        category: ev.normalizedCategory,
        fatalities: ev.fatalitiesEstimate ?? 0,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [ev.longitude, ev.latitude],
      },
    })),
  };
}

function buildMapStyle(initialBasemap: BasemapId): StyleSpecification {
  const fullWorldCoords: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ] = [
    [-180, 85.05],
    [180, 85.05],
    [180, -85.05],
    [-180, -85.05],
  ];
  return {
    version: 8,
    sources: {
      "bundled-day": {
        type: "image",
        url: "/data/earth-day.jpg",
        coordinates: fullWorldCoords,
      },
      "bundled-night": {
        type: "image",
        url: "/data/earth-night.jpg",
        coordinates: fullWorldCoords,
      },
      "nasa-satellite": {
        type: "raster",
        tiles: [NASA_TILES.satellite.url],
        tileSize: 256,
        maxzoom: 8,
        attribution: NASA_TILES.satellite.attribution,
      },
      "nasa-terrain": {
        type: "raster",
        tiles: [NASA_TILES.terrain.url],
        tileSize: 256,
        maxzoom: 8,
        attribution: NASA_TILES.terrain.attribution,
      },
      "nasa-night": {
        type: "raster",
        tiles: [NASA_TILES.night.url],
        tileSize: 256,
        maxzoom: 8,
        attribution: NASA_TILES.night.attribution,
      },
      "nasa-coastlines": {
        type: "raster",
        tiles: [REFERENCE_COASTLINES],
        tileSize: 256,
        maxzoom: 13,
      },
      "nasa-features": {
        type: "raster",
        tiles: [REFERENCE_FEATURES],
        tileSize: 256,
        maxzoom: 13,
      },
      "nasa-labels": {
        type: "raster",
        tiles: [REFERENCE_LABELS],
        tileSize: 256,
        maxzoom: 13,
      },
    },
    layers: [
      {
        id: "bg",
        type: "background",
        paint: { "background-color": "#07111e" },
      },
      {
        id: "layer-bundled-day",
        type: "raster",
        source: "bundled-day",
        layout: { visibility: initialBasemap === "night" ? "none" : "visible" },
      },
      {
        id: "layer-bundled-night",
        type: "raster",
        source: "bundled-night",
        layout: { visibility: initialBasemap === "night" ? "visible" : "none" },
      },
      {
        id: "layer-satellite",
        type: "raster",
        source: "nasa-satellite",
        layout: { visibility: initialBasemap === "satellite" ? "visible" : "none" },
      },
      {
        id: "layer-terrain",
        type: "raster",
        source: "nasa-terrain",
        layout: { visibility: initialBasemap === "terrain" ? "visible" : "none" },
      },
      {
        id: "layer-night",
        type: "raster",
        source: "nasa-night",
        layout: { visibility: initialBasemap === "night" ? "visible" : "none" },
      },
      {
        id: "layer-coastlines",
        type: "raster",
        source: "nasa-coastlines",
        paint: { "raster-opacity": 0.45 },
      },
      {
        id: "layer-features",
        type: "raster",
        source: "nasa-features",
        paint: { "raster-opacity": 0.65 },
      },
      {
        id: "layer-labels",
        type: "raster",
        source: "nasa-labels",
        paint: { "raster-opacity": 0.92 },
      },
    ],
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  ALL: "All categories",
  BATTLES: "Battles",
  VIOLENCE_AGAINST_CIVILIANS: "Civilians",
  EXPLOSIONS_REMOTE_VIOLENCE: "Explosions & Remote",
  ARMED_CONFLICT: "Armed conflict",
};

/**
 * SS Earth X4 — Real Navigable 2D Satellite World Map + Sourced Conflict Layer.
 * Mounted immediately below the 3D WebGL Globe with two-way coordinate synchronization.
 */
export default function WorldConflictMap({
  focusTarget = null,
  externalConflictId = null,
  onViewOnGlobe,
  onConflictsLoaded,
  onOpenAsset,
  onSelectExchange,
}: Props) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [tableMode, setTableMode] = useState(false);
  const [basemap, setBasemap] = useState<BasemapId>("satellite");
  const [showBorders, setShowBorders] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showDensity, setShowDensity] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);

  // Conflict intelligence state (strictly server-sourced)
  const [period, setPeriod] = useState<ConflictPeriod>("30d");
  const [category, setCategory] = useState<string>("ALL");
  const [feed, setFeed] = useState<ConflictFeedResponse | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState("");

  // Search & active inspection state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ConflictEvent | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<EarthRegionEntry | null>(
    EARTH_REGIONS[0] ?? null,
  );
  const [selectedExchange, setSelectedExchange] = useState<Exchange | null>(null);
  const [viewportNote, setViewportNote] = useState("World view · NASA Blue Marble");

  const eventsRef = useRef<ConflictEvent[]>([]);

  // Fetch sourced conflict intelligence from /api/earth/conflicts
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoadingFeed(true);
        setFeedError("");
      }
    });
    const params = new URLSearchParams({ period, category });
    fetch(`/api/earth/conflicts?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const payload = (await res.json()) as ConflictFeedResponse & { error?: string };
        if (!res.ok) {
          throw new Error(payload.error || "Conflict monitor service is unavailable.");
        }
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setFeed(payload);
        eventsRef.current = payload.events;
        onConflictsLoaded?.(
          payload.events.map((e) => ({
            id: e.eventId,
            lat: e.latitude,
            lon: e.longitude,
          })),
        );
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setFeedError(
          err instanceof Error ? err.message : "Could not load conflict monitor.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingFeed(false);
      });
    return () => controller.abort();
  }, [period, category, onConflictsLoaded]);

  // Select event when clicked on 3D Globe
  useEffect(() => {
    if (!externalConflictId || !feed?.events.length) return;
    const match = feed.events.find((e) => e.eventId === externalConflictId);
    if (!match) return;
    let alive = true;
    mapRef.current?.flyTo({
      center: [match.longitude, match.latitude],
      zoom: 5.5,
      duration: 900,
    });
    queueMicrotask(() => {
      if (!alive) return;
      setSelectedEvent(match);
      setSelectedRegion(null);
      setSelectedExchange(null);
    });
    return () => {
      alive = false;
    };
  }, [externalConflictId, feed]);

  // Initialize MapLibre GL JS (client-only dynamic import)
  useEffect(() => {
    if (tableMode || mapFailed) return;
    const container = mapHostRef.current;
    if (!container) return;

    let alive = true;
    let instance: MapLibreMap | null = null;

    const init = async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (!alive || !mapHostRef.current) return;

        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

        instance = new maplibre.Map({
          container: mapHostRef.current,
          style: buildMapStyle("satellite"),
          center: [78.96, 20.59],
          zoom: 1.7,
          minZoom: 1.1,
          maxZoom: 11,
          renderWorldCopies: true,
          cooperativeGestures: true,
          attributionControl: { compact: true },
          fadeDuration: reducedMotion ? 0 : 180,
        });

        mapRef.current = instance;

        instance.on("load", () => {
          if (!alive || !instance) return;

          // Coordinate graticule
          instance.addSource("graticule", {
            type: "geojson",
            data: buildGraticuleGeoJson(),
          });
          instance.addLayer({
            id: "graticule-lines",
            type: "line",
            source: "graticule",
            layout: { visibility: "none" },
            paint: {
              "line-color": "rgba(185, 195, 206, 0.25)",
              "line-width": 1,
              "line-dasharray": [3, 3],
            },
          });

          // 24 Exchange hubs
          instance.addSource("exchanges", {
            type: "geojson",
            data: buildExchangesGeoJson(),
          });
          instance.addLayer({
            id: "exchange-points",
            type: "circle",
            source: "exchanges",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 4, 6, 7],
              "circle-color": "#E8EDF2",
              "circle-stroke-color": "#76C0FF",
              "circle-stroke-width": 1.8,
              "circle-opacity": 0.92,
            },
          });

          // Sourced conflict events (RED markers + clustering + density heatmap)
          instance.addSource("conflicts", {
            type: "geojson",
            data: buildConflictsGeoJson(eventsRef.current),
            cluster: true,
            clusterMaxZoom: 6,
            clusterRadius: 42,
          });
          instance.addLayer({
            id: "conflict-heatmap",
            type: "heatmap",
            source: "conflicts",
            layout: { visibility: "none" },
            paint: {
              "heatmap-weight": 1,
              "heatmap-intensity": 1.1,
              "heatmap-radius": 24,
              "heatmap-opacity": 0.68,
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "rgba(220, 38, 38, 0)",
                0.25,
                "rgba(239, 68, 68, 0.35)",
                0.6,
                "rgba(220, 38, 38, 0.65)",
                1,
                "rgba(153, 27, 27, 0.9)",
              ],
            },
          });
          instance.addLayer({
            id: "conflict-clusters",
            type: "circle",
            source: "conflicts",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": [
                "step",
                ["get", "point_count"],
                "#EF4444",
                10,
                "#DC2626",
                30,
                "#991B1B",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                13,
                10,
                17,
                30,
                22,
              ],
              "circle-stroke-color": "#FECACA",
              "circle-stroke-width": 2,
              "circle-opacity": 0.9,
            },
          });
          instance.addLayer({
            id: "conflict-points",
            type: "circle",
            source: "conflicts",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 5.5, 6, 8],
              "circle-color": "#DC2626",
              "circle-stroke-color": "#FEE2E2",
              "circle-stroke-width": 2,
              "circle-opacity": 0.95,
            },
          });

          // Click handlers
          instance.on("click", "conflict-clusters", async (e) => {
            if (!instance) return;
            const feature = e.features?.[0];
            const clusterId = feature?.properties?.cluster_id;
            const src = instance.getSource("conflicts") as GeoJSONSource | undefined;
            if (!feature || typeof clusterId !== "number" || !src) return;
            try {
              const expansionZoom = await src.getClusterExpansionZoom(clusterId);
              const coords = (feature.geometry as { coordinates: [number, number] }).coordinates;
              instance.easeTo({
                center: coords,
                zoom: Math.min(expansionZoom + 0.6, 10),
                duration: 500,
              });
            } catch {
              /* Ignore cluster expansion race. */
            }
          });

          instance.on("click", "conflict-points", (e) => {
            const eventId = e.features?.[0]?.properties?.eventId;
            if (typeof eventId !== "string") return;
            const matched = eventsRef.current.find((ev) => ev.eventId === eventId);
            if (matched) {
              setSelectedEvent(matched);
              setSelectedRegion(null);
              setSelectedExchange(null);
              setViewportNote(`${matched.countryName} · Sourced conflict record`);
            }
          });

          instance.on("click", "exchange-points", (e) => {
            const exId = e.features?.[0]?.properties?.id;
            if (typeof exId !== "string") return;
            const ex = EXCHANGES.find((x) => x.id === exId);
            if (ex) {
              setSelectedExchange(ex);
              setSelectedEvent(null);
              setSelectedRegion(null);
              setViewportNote(`${ex.city}, ${ex.country} · ${ex.mic}`);
              onSelectExchange?.(ex);
            }
          });

          for (const layerId of [
            "conflict-clusters",
            "conflict-points",
            "exchange-points",
          ]) {
            instance.on("mouseenter", layerId, () => {
              if (instance) instance.getCanvas().style.cursor = "pointer";
            });
            instance.on("mouseleave", layerId, () => {
              if (instance) instance.getCanvas().style.cursor = "";
            });
          }

          setMapReady(true);
        });

        instance.on("error", (ev) => {
          // Do not crash the map for individual tile misses, only WebGL context errors
          if (ev?.error && /webgl/i.test(String(ev.error.message ?? ""))) {
            if (alive) setMapFailed(true);
          }
        });
      } catch {
        if (alive) setMapFailed(true);
      }
    };

    void init();

    return () => {
      alive = false;
      setMapReady(false);
      if (instance) {
        instance.remove();
        mapRef.current = null;
      }
    };
  }, [tableMode, mapFailed, onSelectExchange]);

  // Sync conflict GeoJSON when feed updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("conflicts") as GeoJSONSource | undefined;
    if (src) {
      src.setData(buildConflictsGeoJson(feed?.events ?? []));
    }
  }, [feed, mapReady]);

  // Sync basemap & overlay layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const setVis = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
      }
    };
    setVis("layer-bundled-day", basemap !== "night");
    setVis("layer-bundled-night", basemap === "night");
    setVis("layer-satellite", basemap === "satellite");
    setVis("layer-terrain", basemap === "terrain");
    setVis("layer-night", basemap === "night");
    setVis("layer-coastlines", showBorders);
    setVis("layer-features", showBorders);
    setVis("layer-labels", showBorders);
    setVis("graticule-lines", showGrid);
    setVis("conflict-heatmap", showDensity && (feed?.events.length ?? 0) > 0);
  }, [basemap, showBorders, showGrid, showDensity, feed, mapReady]);

  // Two-way Globe -> Map flyTo sync
  const flyToLocation = useCallback(
    (lat: number, lon: number, zoom = 4.6, label?: string) => {
      if (label) setViewportNote(label);
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      map.flyTo({
        center: [lon, lat],
        zoom,
        duration: reducedMotion ? 0 : 850,
      });
    },
    [mapReady],
  );

  useEffect(() => {
    if (!focusTarget) return;
    let alive = true;
    const map = mapRef.current;
    if (map && mapReady) {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      map.flyTo({
        center: [focusTarget.lon, focusTarget.lat],
        zoom: focusTarget.zoom ?? 4.8,
        duration: reducedMotion ? 0 : 850,
      });
    }
    queueMicrotask(() => {
      if (!alive) return;
      setViewportNote(focusTarget.label || "Focused from 3D Earth");
      if (focusTarget.exchangeId) {
        const ex = EXCHANGES.find((e) => e.id === focusTarget.exchangeId);
        if (ex) {
          setSelectedExchange(ex);
          setSelectedEvent(null);
          setSelectedRegion(null);
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [focusTarget, mapReady]);

  // Combined search across regions, exchanges, and loaded conflict events
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { regions: EARTH_REGIONS.slice(0, 6), exchanges: [], events: [] };
    const regions = searchEarthRegions(q).slice(0, 6);
    const exchanges = EXCHANGES.filter((e) =>
      `${e.name} ${e.city} ${e.country} ${e.mic}`.toLowerCase().includes(q),
    ).slice(0, 5);
    const events = (feed?.events ?? [])
      .filter((ev) =>
        `${ev.eventTitle} ${ev.countryName} ${ev.adminRegion} ${ev.placeName}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 5);
    return { regions, exchanges, events };
  }, [searchQuery, feed]);

  const hasConnectedConflicts =
    feed?.status === "CONNECTED" || feed?.status === "HISTORICAL_DATASET" || feed?.status === "STALE";

  const statusHeadline = loadingFeed
    ? "Checking conflict provider…"
    : feed?.status === "CONNECTED"
      ? `${feed.providerLabel} connected`
      : feed?.status === "HISTORICAL_DATASET"
        ? `${feed.providerLabel} · Historical`
        : feed?.status === "STALE"
          ? `${feed.providerLabel} · Stale cache`
          : feed?.status === "NOT_CONFIGURED"
            ? "Conflict feed: Not configured"
            : "Conflict feed unavailable";

  const activeCoords = selectedEvent
    ? {
        lat: selectedEvent.latitude,
        lon: selectedEvent.longitude,
        label: `${selectedEvent.placeName || selectedEvent.countryName}`,
        conflictId: selectedEvent.eventId,
      }
    : selectedExchange
      ? {
          lat: selectedExchange.lat,
          lon: selectedExchange.lon,
          label: `${selectedExchange.city}, ${selectedExchange.country}`,
          exchangeId: selectedExchange.id,
        }
      : selectedRegion
        ? {
            lat: selectedRegion.lat,
            lon: selectedRegion.lon,
            label: selectedRegion.name,
          }
        : null;

  return (
    <Panel
      title="World Conflict & Geopolitical Map"
      kicker="Strategic Globe · Real NASA GIBS satellite basemap + sourced conflict intelligence"
      className="x6-world-map-panel"
      action={
        <div className="x1-actions">
          <button
            type="button"
            className="x6-map-chip"
            aria-pressed={tableMode || mapFailed}
            onClick={() => setTableMode((v) => !v)}
          >
            <Table2 size={14} />
            <span>{tableMode || mapFailed ? "Interactive Map" : "2D / Table"}</span>
          </button>
          <button
            type="button"
            className="x6-map-chip"
            aria-expanded={learnOpen}
            onClick={() => setLearnOpen((v) => !v)}
          >
            <HelpCircle size={14} />
            <span>Learn</span>
          </button>
        </div>
      }
    >
      {/* Global Pulse Summary Bar — strictly honest, never fakes 0 or LIVE */}
      <div className="x6-map-pulse-bar" aria-label="Global conflict monitor status">
        <div className="x6-pulse-stat">
          <span>Monitor Status</span>
          <strong>{statusHeadline}</strong>
          <small>Not a live emergency feed</small>
        </div>
        <div className="x6-pulse-stat">
          <span>Sourced Events ({period})</span>
          <strong>
            {hasConnectedConflicts && feed?.summary.totalEvents !== null
              ? String(feed?.summary.totalEvents)
              : "Not configured"}
          </strong>
          <small>
            {hasConnectedConflicts
              ? `${feed?.summary.countriesCount ?? 0} countries in window`
              : "Zero placeholder markers"}
          </small>
        </div>
        <div className="x6-pulse-stat">
          <span>Active Basemap</span>
          <strong>{NASA_TILES[basemap].label}</strong>
          <small>NASA GIBS Public Domain</small>
        </div>
        <div className="x6-pulse-stat">
          <span>Coverage Reference</span>
          <strong>
            {feed?.summary.coverageEnd
              ? feed.summary.coverageEnd.slice(0, 10)
              : "24 hubs · 22 regions"}
          </strong>
          <small>
            {feed?.providerUpdatedAt
              ? `Synced ${moment(feed.providerUpdatedAt)}`
              : "Awaiting UCDP / ACLED key"}
          </small>
        </div>
      </div>

      {/* Search + Time Window + Category Toolbar */}
      <div className="x6-map-toolbar">
        <div className="x6-map-search-wrap">
          <Search size={15} />
          <input
            type="search"
            aria-label="Search country, region, exchange, or conflict location"
            placeholder="Jump to country, region, or exchange (India, Ukraine, Red Sea, Tokyo)…"
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="x1-icon-button"
              aria-label="Clear map search"
              onClick={() => setSearchQuery("")}
            >
              <X size={14} />
            </button>
          )}
          {searchOpen && (
            <div className="x6-map-search-dropdown" role="listbox" aria-label="Geographic matches">
              {searchMatches.regions.map((r) => (
                <button
                  key={`reg-${r.id}`}
                  type="button"
                  className="x6-map-search-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedRegion(r);
                    setSelectedEvent(null);
                    setSelectedExchange(null);
                    setSearchOpen(false);
                    setSearchQuery(r.name);
                    flyToLocation(r.lat, r.lon, r.zoom, `${r.name} · ${r.region}`);
                  }}
                >
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.region} · Region reference</small>
                  </span>
                  <MapPin size={14} />
                </button>
              ))}
              {searchMatches.exchanges.map((ex) => (
                <button
                  key={`ex-${ex.id}`}
                  type="button"
                  className="x6-map-search-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedExchange(ex);
                    setSelectedEvent(null);
                    setSelectedRegion(null);
                    setSearchOpen(false);
                    setSearchQuery(ex.city);
                    flyToLocation(ex.lat, ex.lon, 5.4, `${ex.city}, ${ex.country} · ${ex.mic}`);
                    onSelectExchange?.(ex);
                  }}
                >
                  <span>
                    <strong>
                      {ex.city} ({ex.mic})
                    </strong>
                    <small>{ex.name}</small>
                  </span>
                  <Compass size={14} />
                </button>
              ))}
              {searchMatches.events.map((ev) => (
                <button
                  key={`ev-${ev.eventId}`}
                  type="button"
                  className="x6-map-search-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedEvent(ev);
                    setSelectedRegion(null);
                    setSelectedExchange(null);
                    setSearchOpen(false);
                    setSearchQuery(ev.countryName);
                    flyToLocation(
                      ev.latitude,
                      ev.longitude,
                      5.8,
                      `${ev.countryName} · Sourced conflict event`,
                    );
                  }}
                >
                  <span>
                    <strong>{ev.eventTitle}</strong>
                    <small>
                      {ev.countryName} · {ev.eventStartAt.slice(0, 10)}
                    </small>
                  </span>
                  <span className="x6-glyph-conflict" aria-hidden="true" />
                </button>
              ))}
              {!searchMatches.regions.length &&
                !searchMatches.exchanges.length &&
                !searchMatches.events.length && (
                  <p className="x1-caption" style={{ padding: "8px 10px", margin: 0 }}>
                    No matching region, exchange, or loaded conflict record.
                  </p>
                )}
            </div>
          )}
        </div>

        <div className="x6-map-controls-group">
          <div className="x1-segment" role="group" aria-label="Conflict time window">
            {(["7d", "30d", "90d", "365d"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <select
            aria-label="Conflict event category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map(
              (cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      {/* Basemap & Overlay Controls */}
      <div className="x6-map-toggle-row" role="group" aria-label="Map layers">
        {(["satellite", "terrain", "night"] as const).map((b) => (
          <button
            key={b}
            type="button"
            className="x6-map-chip"
            aria-pressed={basemap === b}
            onClick={() => setBasemap(b)}
          >
            <Layers size={14} />
            <span>{NASA_TILES[b].label}</span>
          </button>
        ))}
        <button
          type="button"
          className="x6-map-chip"
          aria-pressed={showBorders}
          onClick={() => setShowBorders((v) => !v)}
        >
          <span>Borders &amp; Labels</span>
        </button>
        <button
          type="button"
          className="x6-map-chip"
          aria-pressed={showGrid}
          onClick={() => setShowGrid((v) => !v)}
        >
          <Grid size={14} />
          <span>Lat/Lon Grid</span>
        </button>
        {hasConnectedConflicts && (
          <button
            type="button"
            className="x6-map-chip"
            aria-pressed={showDensity}
            onClick={() => setShowDensity((v) => !v)}
          >
            <span>Intensity Density</span>
          </button>
        )}
      </div>

      {/* Real MapLibre 2D World Map Viewport (or Accessible 2D Fallback) */}
      <div className="x6-map-stage" id="ss-earth-2d-map">
        {!tableMode && !mapFailed ? (
          <>
            <div
              ref={mapHostRef}
              className="x6-map-canvas"
              role="region"
              aria-label="Interactive NASA GIBS 2D World Satellite Map with global exchange hubs and sourced conflict layer"
            />
            {!mapReady && (
              <div className="x6-map-loading-overlay" role="status">
                <span>Loading NASA GIBS satellite world map…</span>
              </div>
            )}
            <div className="x6-map-stage-badge">
              <strong>{viewportNote}</strong>
            </div>
            <div className="x6-map-floating-controls" aria-label="Map zoom and reset">
              <button
                type="button"
                aria-label="Zoom in map"
                onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
              >
                <Plus size={16} />
              </button>
              <button
                type="button"
                aria-label="Zoom out map"
                onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                aria-label="Reset world view"
                onClick={() => {
                  setViewportNote("World view · NASA Blue Marble");
                  mapRef.current?.flyTo({
                    center: [20, 18],
                    zoom: 1.4,
                    duration: 600,
                  });
                }}
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </>
        ) : (
          <div className="x6-map-fallback-stage">
            <img
              src="/data/earth-day.jpg"
              alt="NASA Blue Marble equirectangular world map compatibility view"
            />
            {EXCHANGES.map((ex) => {
              const left = `${((ex.lon + 180) / 360) * 100}%`;
              const top = `${((90 - ex.lat) / 180) * 100}%`;
              return (
                <button
                  key={ex.id}
                  type="button"
                  className="x6-map-fallback-pin is-exchange"
                  style={{ left, top }}
                  title={`${ex.city}, ${ex.country} (${ex.mic})`}
                  aria-label={`Inspect ${ex.name} in ${ex.city}`}
                  onClick={() => {
                    setSelectedExchange(ex);
                    setSelectedEvent(null);
                    setSelectedRegion(null);
                    onSelectExchange?.(ex);
                  }}
                />
              );
            })}
            {(feed?.events ?? []).slice(0, 120).map((ev) => {
              const left = `${((ev.longitude + 180) / 360) * 100}%`;
              const top = `${((90 - ev.latitude) / 180) * 100}%`;
              return (
                <button
                  key={ev.eventId}
                  type="button"
                  className="x6-map-fallback-pin is-conflict"
                  style={{ left, top }}
                  title={`${ev.eventTitle} (${ev.countryName})`}
                  aria-label={`Inspect conflict event ${ev.eventTitle}`}
                  onClick={() => {
                    setSelectedEvent(ev);
                    setSelectedExchange(null);
                    setSelectedRegion(null);
                  }}
                />
              );
            })}
            <div className="x6-map-stage-badge">
              <strong>
                {mapFailed
                  ? "2D Equirectangular Compatibility View (WebGL unavailable)"
                  : "2D Equirectangular + Accessible Table Mode"}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Explicit Color-Blind-Safe Map Legend */}
      <div className="x6-map-legend" aria-label="Map legend">
        <div className="x6-legend-items">
          <span className="x6-legend-item">
            <i className="x6-glyph-conflict" aria-hidden="true" />
            <span>RED marker = Sourced conflict event (UCDP / ACLED)</span>
          </span>
          <span className="x6-legend-item">
            <i className="x6-glyph-cluster" aria-hidden="true" />
            <span>Cluster = Grouped events (click to zoom)</span>
          </span>
          <span className="x6-legend-item">
            <i className="x6-glyph-exchange" aria-hidden="true" />
            <span>Exchange Hub (24 global cities)</span>
          </span>
        </div>
        <span>Historical NASA GIBS tiles · Ctrl+scroll or +/− to zoom</span>
      </div>

      {/* Honest Conflict Provider Status Callout when NOT_CONFIGURED or Error */}
      {(feed?.status === "NOT_CONFIGURED" || feedError) && (
        <div className="x6-status-callout" role="status">
          <strong>
            {feedError
              ? "Conflict intelligence provider unavailable"
              : "Sourced conflict markers await a licensed data token"}
          </strong>
          <p>
            {feedError || feed?.message}{" "}
            {feed?.setupHint ? feed.setupHint : ""}
          </p>
          <div className="x1-actions">
            <SourceLink href="https://ucdp.uu.se/apidocs/">
              UCDP GED API (CC BY 4.0)
            </SourceLink>
            <SourceLink href="https://acleddata.com/">
              ACLED Research API
            </SourceLink>
          </div>
        </div>
      )}

      {/* Compact Learn Mode Disclosure */}
      {learnOpen && (
        <div className="x6-status-callout" role="note" aria-label="How to read Strategic Globe">
          <strong>How to read the World Conflict &amp; Satellite Map</strong>
          <p>
            <strong>Red markers</strong> represent verified geolocated conflict events
            returned strictly by configured public-interest research datasets (Uppsala
            Conflict Data Program UCDP GED or ACLED). Strategic Souls never fabricates
            events or claims real-time battlefield awareness.
          </p>
          <p>
            <strong>Blank areas</strong> mean no event was reported in the active dataset
            and time window — they do not guarantee safety or absence of unrest.
          </p>
          <p>
            <strong>Dates &amp; Basemap:</strong> Event date (when it happened), reported
            date (when published), and sync date (when fetched) are shown separately.
            NASA GIBS Blue Marble &amp; Black Marble tiles are public-domain historical
            satellite composites.
          </p>
        </div>
      )}

      {/* Selected Conflict Event / Exchange / Region Evidence Drawer */}
      {selectedEvent && (
        <article className="x6-evidence-card" aria-label="Conflict event evidence">
          <div className="x6-evidence-head">
            <div>
              <span className="x1-kicker">
                {selectedEvent.provider === "UCDP_GED" ? "UCDP GED" : "ACLED"} ·{" "}
                {CATEGORY_LABELS[selectedEvent.normalizedCategory as ConflictCategory] ||
                  selectedEvent.eventType}
              </span>
              <h3>{selectedEvent.eventTitle}</h3>
            </div>
            <div className="x1-actions">
              {onViewOnGlobe && activeCoords && (
                <button
                  type="button"
                  className="x1-secondary"
                  onClick={() => onViewOnGlobe(activeCoords)}
                >
                  <Globe2 size={15} />
                  <span>View on 3D Earth</span>
                </button>
              )}
              <button
                type="button"
                className="x1-icon-button"
                aria-label="Close evidence panel"
                onClick={() => setSelectedEvent(null)}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <p className="x1-caption">{selectedEvent.shortSummary}</p>
          <dl className="x6-evidence-grid">
            <div>
              <dt>Location</dt>
              <dd>
                {[selectedEvent.placeName, selectedEvent.adminRegion, selectedEvent.countryName]
                  .filter(Boolean)
                  .join(", ")}
              </dd>
            </div>
            <div>
              <dt>Coordinates</dt>
              <dd>
                {selectedEvent.latitude.toFixed(3)}, {selectedEvent.longitude.toFixed(3)} (
                {selectedEvent.geocodeConfidence})
              </dd>
            </div>
            <div>
              <dt>Event date</dt>
              <dd>{selectedEvent.eventStartAt.slice(0, 10)}</dd>
            </div>
            <div>
              <dt>Reported / Dataset</dt>
              <dd>
                {selectedEvent.reportedAt
                  ? selectedEvent.reportedAt.slice(0, 10)
                  : selectedEvent.dataVersion}
              </dd>
            </div>
            <div>
              <dt>Reported fatalities</dt>
              <dd>
                {selectedEvent.fatalitiesEstimate === null
                  ? "Not reported"
                  : String(selectedEvent.fatalitiesEstimate)}
              </dd>
            </div>
            <div>
              <dt>Geographic precision</dt>
              <dd>{selectedEvent.geographicPrecision}</dd>
            </div>
          </dl>
          <div className="x1-actions">
            <SourceLink href={selectedEvent.canonicalSourceUrl}>
              View source attribution
            </SourceLink>
          </div>
        </article>
      )}

      {!selectedEvent && selectedExchange && (
        <article className="x6-evidence-card" aria-label="Selected exchange hub">
          <div className="x6-evidence-head">
            <div>
              <span className="x1-kicker">
                Exchange Hub · {selectedExchange.mic} · {selectedExchange.region}
              </span>
              <h3>
                {selectedExchange.name} ({selectedExchange.city}, {selectedExchange.country})
              </h3>
            </div>
            <div className="x1-actions">
              {onViewOnGlobe && activeCoords && (
                <button
                  type="button"
                  className="x1-secondary"
                  onClick={() => onViewOnGlobe(activeCoords)}
                >
                  <Globe2 size={15} />
                  <span>View on 3D Earth</span>
                </button>
              )}
              <button
                type="button"
                className="x1-icon-button"
                aria-label="Close exchange panel"
                onClick={() => setSelectedExchange(null)}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <p className="x1-caption">
            Coordinates: {selectedExchange.lat.toFixed(3)}, {selectedExchange.lon.toFixed(3)} ·
            Timezone: {selectedExchange.timeZone} · City center coordinates (illustrative hub marker).
          </p>
        </article>
      )}

      {!selectedEvent && !selectedExchange && selectedRegion && (
        <article className="x6-evidence-card" aria-label="Selected geographic region">
          <div className="x6-evidence-head">
            <div>
              <span className="x1-kicker">
                Geographic Focus · {selectedRegion.region}
              </span>
              <h3>{selectedRegion.name}</h3>
            </div>
            <div className="x1-actions">
              {onViewOnGlobe && activeCoords && (
                <button
                  type="button"
                  className="x1-secondary"
                  onClick={() => onViewOnGlobe(activeCoords)}
                >
                  <Globe2 size={15} />
                  <span>View on 3D Earth</span>
                </button>
              )}
            </div>
          </div>
          <p className="x1-caption">{selectedRegion.summary}</p>
          {selectedRegion.relatedInstruments.length > 0 && onOpenAsset && (
            <div className="x1-actions">
              <span className="x1-caption">Explore economic context (informational):</span>
              {selectedRegion.relatedInstruments.map((inst) => (
                <button
                  key={inst}
                  type="button"
                  className="x6-map-chip"
                  onClick={() => onOpenAsset(inst)}
                >
                  <span>{inst}</span>
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          )}
        </article>
      )}

      {/* Hotspot Explorer (when conflict feed is connected) OR Regional Quick-Jump Strip */}
      {hasConnectedConflicts && feed && feed.hotspots.length > 0 ? (
        <div className="x6-hotspot-strip" aria-label="Active conflict hotspots">
          {feed.hotspots.slice(0, 6).map((h) => (
            <button
              key={h.regionKey}
              type="button"
              className="x6-hotspot-card"
              onClick={() => {
                flyToLocation(
                  h.latitude,
                  h.longitude,
                  5.4,
                  `${h.countryName} · ${h.eventCount} events`,
                );
                const firstEvent = feed.events.find(
                  (e) =>
                    e.countryName === h.countryName &&
                    (!h.adminRegion || e.adminRegion === h.adminRegion),
                );
                if (firstEvent) {
                  setSelectedEvent(firstEvent);
                  setSelectedRegion(null);
                  setSelectedExchange(null);
                }
              }}
            >
              <div className="x6-hotspot-card-head">
                <strong>
                  {h.adminRegion ? `${h.adminRegion}, ${h.countryName}` : h.countryName}
                </strong>
                <span className="x6-glyph-conflict" aria-hidden="true" />
              </div>
              <small>
                {h.eventCount} reported {h.eventCount === 1 ? "event" : "events"} · latest{" "}
                {h.latestEventAt.slice(0, 10)}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <div className="x6-hotspot-strip" aria-label="Regional quick focus">
          {EARTH_REGIONS.slice(0, 6).map((r) => (
            <button
              key={r.id}
              type="button"
              className="x6-hotspot-card"
              onClick={() => {
                setSelectedRegion(r);
                setSelectedEvent(null);
                setSelectedExchange(null);
                flyToLocation(r.lat, r.lon, r.zoom, `${r.name} · ${r.region}`);
              }}
            >
              <div className="x6-hotspot-card-head">
                <strong>{r.name}</strong>
                <MapPin size={14} />
              </div>
              <small>{r.region} · Focus map &amp; economic context</small>
            </button>
          ))}
        </div>
      )}

      {/* Accessible Screen-Reader / Keyboard Table View when 2D/Table is toggled */}
      {(tableMode || mapFailed) && (
        <div className="x6-accessible-table-wrap">
          <table className="x6-accessible-table">
            <thead>
              <tr>
                <th>{hasConnectedConflicts ? "Location / Country" : "Region / Hub"}</th>
                <th>Category / Region</th>
                <th>Coordinates</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {hasConnectedConflicts && feed?.events.length
                ? feed.events.slice(0, 30).map((ev) => (
                    <tr key={ev.eventId}>
                      <td>
                        <strong>{ev.eventTitle}</strong> ({ev.countryName})
                      </td>
                      <td>{ev.eventType}</td>
                      <td>
                        {ev.latitude.toFixed(2)}, {ev.longitude.toFixed(2)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="x1-text-button"
                          onClick={() => setSelectedEvent(ev)}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))
                : EARTH_REGIONS.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                      </td>
                      <td>{r.region}</td>
                      <td>
                        {r.lat.toFixed(2)}, {r.lon.toFixed(2)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="x1-text-button"
                          onClick={() => {
                            setSelectedRegion(r);
                            onViewOnGlobe?.({
                              lat: r.lat,
                              lon: r.lon,
                              label: r.name,
                            });
                          }}
                        >
                          Focus on Earth
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
