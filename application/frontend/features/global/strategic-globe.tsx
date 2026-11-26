"use client";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Compass,
  Info,
  Layers,
  Maximize,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  EXCHANGES,
  exchangeSession,
  type Exchange,
} from "../../../backend/services/market-data/exchanges";
import {
  GLOBE_ZOOM_MAX,
  GLOBE_ZOOM_MIN,
  clampGlobeZoom,
} from "../../../backend/services/market-data/globe";
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import type {
  CountryProfile,
  DailyBriefingItem,
  NaturalHazardEvent,
} from "../../../backend/services/intelligence/news-and-disasters";
import type { GeopoliticalExposurePathway } from "../../../backend/services/market-data/sectors-and-ecosystem";
import type { WatchRegionsState } from "../../../backend/services/user/preferences-store";
import {
  Modal,
  SourceLink,
  api,
  type Notice,
} from "../../components/workspace/shared";
import type { FocusCoords, GlobePointMarker } from "./globe-canvas";
import { MAP_ENTER_GLOBE_ZOOM, MAP_START_ZOOM, RETURN_GLOBE_ZOOM, type GeographicFocus, type RegionalFocus } from "./globe-projection";
import type { RegionalEvent } from "./regional-map";

const GlobeCanvas = lazy(() => import("./globe-canvas"));
const RegionalMap = lazy(() => import("./regional-map"));

type ConflictEventItem = {
  eventId: string;
  title: string;
  countryName: string;
  locationName: string;
  latitude: number;
  longitude: number;
  eventDate: string;
  normalizedCategory: string;
  sourceName: string;
  sourceUrl: string;
  fatalitiesEstimate: number | null;
};

type ConflictApiResponse = {
  status: "OK" | "NOT_CONFIGURED" | "UNAVAILABLE";
  events: ConflictEventItem[];
};

type SelectedEntity =
  | { kind: "EXCHANGE"; exchange: Exchange }
  | { kind: "HAZARD"; hazard: NaturalHazardEvent }
  | { kind: "COUNTRY"; country: CountryProfile }
  | { kind: "CONFLICT"; conflict: ConflictEventItem }
  | null;

type Props = {
  data: MarketSnapshot | null;
  hazards: NaturalHazardEvent[];
  briefing: {
    asOfUTC: string;
    items: DailyBriefingItem[];
    emptyMessage: string;
  } | null;
  countries: readonly CountryProfile[];
  geopoliticsPathways: readonly GeopoliticalExposurePathway[];
  watchRegions: WatchRegionsState | null;
  authenticated: boolean;
  onRequireAuth?: () => void;
  onWatchRegionsChange?: (next: WatchRegionsState) => void;
  onOpenAsset: (id: string) => void;
  earthQuality?: "auto" | "balanced" | "reduced";
  focused?: boolean;
  notify: Notice;
};

function DeferredGlobe({
  onMount,
  ...props
}: React.ComponentProps<typeof GlobeCanvas> & { onMount?: () => void }) {
  const host = useRef<HTMLDivElement>(null),
    [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setReady(true);
          onMount?.();
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onMount]);

  return (
    <div className="x1-deferred-globe" ref={host}>
      {ready ? (
        <Suspense
          fallback={
            <div className="x1-globe-loading">Preparing 3D Earth…</div>
          }
        >
          <GlobeCanvas {...props} />
        </Suspense>
      ) : (
        <div className="x1-globe-loading">
          3D Earth loads as it comes into view.
        </div>
      )}
    </div>
  );
}

export default function StrategicGlobe({
  data,
  hazards,
  briefing,
  countries,
  geopoliticsPathways,
  watchRegions,
  authenticated,
  onRequireAuth,
  onWatchRegionsChange,
  onOpenAsset,
  earthQuality = "auto",
  focused = false,
  notify,
}: Props) {
  const [selectedExchange, setSelectedExchange] = useState<Exchange | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);
  const [zoom, setZoom] = useState(1.0);
  const [globeMounted, setGlobeMounted] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [motionOverride, setMotionOverride] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [rendererFallback, setRendererFallback] = useState(false);
  const [focusCoords, setFocusCoords] = useState<FocusCoords | null>(null);
  const globeCamera = useRef<(() => GeographicFocus | null) | null>(null);
  const globeStage = useRef<HTMLDivElement>(null);
  const [regional, setRegional] = useState<RegionalFocus | null>(null);
  const [regionView, setRegionView] = useState<RegionalFocus | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapMessage, setMapMessage] = useState("");
  const [mapCommand, setMapCommand] = useState({ direction: 0, id: 0 });
  const [mapDestination, setMapDestination] = useState<(RegionalFocus & { nonce: number }) | null>(null);
  const [full, setFull] = useState(false);

  // Layer toggles
  const [showExchanges, setShowExchanges] = useState(true);
  const [showQuakes, setShowQuakes] = useState(true);
  const [showDisasters, setShowDisasters] = useState(true);
  const [showCountries, setShowCountries] = useState(true);
  const [showArcs, setShowArcs] = useState(false);

  // On-demand lightweight overlays (closed by default so 3D Earth is dominant)
  const [activePopover, setActivePopover] = useState<
    "explore" | "briefing" | "layers" | null
  >(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [exploreQuery, setExploreQuery] = useState("");
  const [savingWatch, setSavingWatch] = useState(false);

  // Sourced conflicts (ONLY rendered when UCDP/ACLED token is configured on Worker)
  const [conflicts, setConflicts] = useState<ConflictEventItem[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      const minimal =
        media.matches ||
        document.documentElement.dataset.motion === "minimal" ||
        !!document.querySelector('.x1-app[data-motion="minimal"]');
      if (minimal) setAutoRotate(false);
    };
    queueMicrotask(syncMotion);
    media.addEventListener("change", syncMotion);
    return () => media.removeEventListener("change", syncMotion);
  }, []);

  useEffect(() => {
    let alive = true;
    api<ConflictApiResponse>("/api/earth/conflicts?period=30d")
      .then((res) => {
        if (alive && res.status === "OK" && Array.isArray(res.events)) {
          setConflicts(res.events);
        }
      })
      .catch(() => {
        /* Conflicts gracefully omitted when unconfigured or offline */
      });
    return () => {
      alive = false;
    };
  }, []);

  const visibleHazardPoints = useMemo<GlobePointMarker[]>(
    () =>
      hazards
        .filter(
          (h) =>
            (h.kind === "EARTHQUAKE" && showQuakes) ||
            (h.kind === "DISASTER" && showDisasters),
        )
        .map((h) => ({
          id: h.id,
          lat: h.lat,
          lon: h.lon,
          kind: h.kind,
          label: h.title,
        })),
    [hazards, showQuakes, showDisasters],
  );

  const visibleCountryPoints = useMemo<GlobePointMarker[]>(
    () =>
      showCountries
        ? countries.map((c) => ({
            id: `country:${c.code}`,
            lat: c.lat,
            lon: c.lon,
            kind: "COUNTRY" as const,
            label: c.name,
          }))
        : [],
    [countries, showCountries],
  );

  const visibleConflictPoints = useMemo<GlobePointMarker[]>(
    () =>
      conflicts.map((c) => ({
        id: `conflict:${c.eventId}`,
        lat: c.latitude,
        lon: c.longitude,
        kind: "CONFLICT" as const,
        label: c.title,
      })),
    [conflicts],
  );

  const selectedMarkerId = useMemo(() => {
    if (!selectedEntity) return null;
    if (selectedEntity.kind === "HAZARD") return selectedEntity.hazard.id;
    if (selectedEntity.kind === "COUNTRY")
      return `country:${selectedEntity.country.code}`;
    if (selectedEntity.kind === "CONFLICT")
      return `conflict:${selectedEntity.conflict.eventId}`;
    return null;
  }, [selectedEntity]);

  const flyTo = (lat: number, lon: number, targetZoom = 2.6) => {
    setAutoRotate(false);
    if (regional) {
      setMapDestination((previous) => ({ lat, lon, zoom: MAP_START_ZOOM + .55, nonce: (previous?.nonce ?? 0) + 1 }));
      return;
    }
    changeZoom(targetZoom, { lat, lon });
    setFocusCoords((prev) => ({
      lat,
      lon,
      zoom: targetZoom,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  };

  const handleSelectExchange = (venue: Exchange) => {
    setAutoRotate(false);
    setSelectedExchange(venue);
    setSelectedEntity({ kind: "EXCHANGE", exchange: venue });
  };

  const handleSelectMarker = (marker: GlobePointMarker) => {
    setAutoRotate(false);
    setSelectedExchange(null);
    if (marker.kind === "EARTHQUAKE" || marker.kind === "DISASTER") {
      const found = hazards.find((h) => h.id === marker.id);
      if (found) setSelectedEntity({ kind: "HAZARD", hazard: found });
      return;
    }
    if (marker.kind === "COUNTRY") {
      const code = marker.id.replace(/^country:/, "");
      const found = countries.find((c) => c.code === code);
      if (found) setSelectedEntity({ kind: "COUNTRY", country: found });
      return;
    }
    if (marker.kind === "CONFLICT") {
      const id = marker.id.replace(/^conflict:/, "");
      const found = conflicts.find((c) => c.eventId === id);
      if (found) setSelectedEntity({ kind: "CONFLICT", conflict: found });
    }
  };

  const handleReset = () => {
    const minimal =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motion === "minimal" ||
      !!document.querySelector('.x1-app[data-motion="minimal"]');
    setMotionOverride(false);
    setAutoRotate(!minimal);
    setZoom(GLOBE_ZOOM_MIN);
    setSelectedExchange(null);
    setSelectedEntity(null);
    setFocusCoords(null);
    setRegional(null);
    setMapDestination(null);
    setMapReady(false);
    setMapCommand({ id: 0, direction: 0 });
    setResetToken((n) => n + 1);
  };

  function changeZoom(next: number, focus?: GeographicFocus | null) {
    const size = clampGlobeZoom(next);
    setZoom(size);
    if (size < MAP_ENTER_GLOBE_ZOOM && regional && !mapReady) {
      setRegional(null);
      setMapDestination(null);
    }
    if (size >= MAP_ENTER_GLOBE_ZOOM && !regional && !rendererFallback) {
      const anchor = focus ?? globeCamera.current?.() ?? focusCoords ?? { lat: 19.5, lon: 78 };
      const entry = { ...anchor, zoom: MAP_START_ZOOM };
      setRegionView(entry);
      setRegional(entry);
      setMapMessage("");
    }
  }

  function returnToEarth(focus: GeographicFocus) {
    setRegional(null); setMapReady(false); setMapDestination(null);
    setMapCommand({ id: 0, direction: 0 });
    setZoom(RETURN_GLOBE_ZOOM);
    setFocusCoords((previous) => ({ ...focus, zoom: RETURN_GLOBE_ZOOM, nonce: (previous?.nonce ?? 0) + 1 }));
  }

  useEffect(() => {
    const onFullscreen = () => setFull(document.fullscreenElement === globeStage.current);
    document.addEventListener("fullscreenchange", onFullscreen);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.fullscreenElement) setFull(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement === globeStage.current) { await document.exitFullscreen(); return; }
    if (full) { setFull(false); return; }
    try {
      if (!globeStage.current?.requestFullscreen) { setFull(true); return; }
      await globeStage.current.requestFullscreen();
    } catch { setFull(true); }
  }

  async function toggleWatchRegion(regionId: string) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (savingWatch) return;
    setSavingWatch(true);
    const current = watchRegions?.regions ?? [];
    const nextRegions = current.includes(regionId)
      ? current.filter((r) => r !== regionId)
      : [...current, regionId];
    try {
      const res = await api<{ ok: boolean; watchRegions: WatchRegionsState }>(
        "/api/intelligence",
        { regions: nextRegions },
      );
      onWatchRegionsChange?.(res.watchRegions);
      notify(
        nextRegions.includes(regionId)
          ? "Saved to My Watch Regions."
          : "Removed from My Watch Regions.",
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Could not update Watch Regions.",
        true,
      );
    } finally {
      setSavingWatch(false);
    }
  }

  const exploreResults = useMemo(() => {
    const q = exploreQuery.trim().toLowerCase();
    const matchedCountries = countries
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      .slice(0, q ? 6 : 5);
    const matchedVenues = EXCHANGES.filter(
      (v) =>
        !q ||
        `${v.name} ${v.city} ${v.country} ${v.mic}`.toLowerCase().includes(q),
    ).slice(0, q ? 6 : 4);
    const matchedHazards = hazards
      .filter(
        (h) =>
          !q ||
          `${h.title} ${h.place} ${h.category}`.toLowerCase().includes(q),
      )
      .slice(0, q ? 5 : 3);
    return { matchedCountries, matchedVenues, matchedHazards };
  }, [exploreQuery, countries, hazards]);

  const currentSession =
    selectedEntity?.kind === "EXCHANGE" && data
      ? exchangeSession(selectedEntity.exchange, data.asOf)
      : null;

  const watchedSet = new Set(watchRegions?.regions ?? []);

  const zoomStepIn = () => {
    setAutoRotate(false);
    if (mapReady) setMapCommand(({ id }) => ({ id: id + 1, direction: 1 }));
    else changeZoom(Math.round(clampGlobeZoom(zoom * 1.38) * 100) / 100);
  };
  const zoomStepOut = () => {
    setAutoRotate(false);
    if (mapReady) setMapCommand(({ id }) => ({ id: id + 1, direction: -1 }));
    else changeZoom(Math.round(clampGlobeZoom(zoom / 1.38) * 100) / 100);
  };
  const markers: RegionalEvent[] = regional ? [
    ...(showExchanges ? EXCHANGES.map((venue) => ({ ...venue, label: venue.name, tone: "exchange", onSelect: () => handleSelectExchange(venue) })) : []),
    ...[...visibleHazardPoints, ...visibleCountryPoints, ...visibleConflictPoints].map((marker) => ({
      ...marker, label: marker.label ?? marker.id, tone: marker.kind.toLowerCase(), onSelect: () => handleSelectMarker(marker),
    })),
  ] : [];

  return (
    <section
      className={"x53-globe-section" + (focused ? " is-focused" : "")}
      aria-labelledby="x53-globe-heading"
    >
      <div className="x53-globe-head">
        <h2 id="x53-globe-heading">Strategic Globe</h2>
        <span className="x1-caption">
          {mapReady ? "Regional map · Natural Earth" : "3D Earth · NASA Blue Marble"} · USGS &amp; NASA EONET
        </span>
      </div>

      <div
        ref={globeStage}
        className={"x53-globe-stage" + (focused ? " is-focused" : "") + (full ? " is-fullscreen" : "")}
        data-globe-zoom={zoom.toFixed(2)}
        data-projection={mapReady ? "regional" : "earth"}
      >
        {!mapReady && <DeferredGlobe
          onMount={() => setGlobeMounted(true)}
          venues={[...EXCHANGES]}
          selected={selectedExchange}
          autoRotate={autoRotate}
          motionOverride={motionOverride}
          zoom={zoom}
          resetToken={resetToken}
          focusCoords={focusCoords}
          cameraRef={globeCamera}
          hazardPoints={visibleHazardPoints}
          countryPoints={visibleCountryPoints}
          conflictPoints={visibleConflictPoints}
          selectedMarkerId={selectedMarkerId}
          showExchanges={showExchanges}
          showArcs={showArcs}
          earthQuality={earthQuality}
          onPause={() => setAutoRotate(false)}
          onSelect={handleSelectExchange}
          onSelectMarker={handleSelectMarker}
          onZoom={changeZoom}
          onFallbackChange={setRendererFallback}
        />}
        {regional && <div className={"x1-regional-layer" + (mapReady ? " is-visible" : "")} aria-hidden={!mapReady} inert={!mapReady}>
          <Suspense fallback={null}>
            <RegionalMap initial={regional} destination={mapDestination} markers={markers} selected={selectedMarkerId ?? selectedExchange?.id ?? null}
              command={mapCommand} showGeography={showCountries}
              onReady={() => setMapReady(true)} onChange={setRegionView} onExit={returnToEarth}
              onUnavailable={() => { returnToEarth(regionView ?? regional); setMapMessage("Regional map unavailable. The 3D globe is available."); }} />
          </Suspense>
        </div>}
        {mapMessage && <p className="x1-map-status" role="status">{mapMessage}</p>}
        {regionView && mapReady && <a className="x1-map-attribution" href="https://www.naturalearthdata.com/about/terms-of-use/"
          target="_blank" rel="noreferrer">Natural Earth · 1:50m</a>}

        {/* Top-left lightweight overlay controls */}
        <div className="x53-globe-overlay-tl" role="toolbar" aria-label="Globe tools">
          <button
            type="button"
            className={
              "x53-globe-pill" + (activePopover === "explore" ? " is-active" : "")
            }
            aria-expanded={activePopover === "explore"}
            onClick={() =>
              setActivePopover((p) => (p === "explore" ? null : "explore"))
            }
          >
            <Search size={14} aria-hidden="true" />
            <span>Explore</span>
          </button>
          <button
            type="button"
            className={
              "x53-globe-pill" + (activePopover === "briefing" ? " is-active" : "")
            }
            aria-expanded={activePopover === "briefing"}
            onClick={() =>
              setActivePopover((p) => (p === "briefing" ? null : "briefing"))
            }
          >
            <Sparkles size={14} aria-hidden="true" />
            <span>Briefing</span>
          </button>
          <button
            type="button"
            className={
              "x53-globe-pill" + (activePopover === "layers" ? " is-active" : "")
            }
            aria-expanded={activePopover === "layers"}
            onClick={() =>
              setActivePopover((p) => (p === "layers" ? null : "layers"))
            }
          >
            <Layers size={14} aria-hidden="true" />
            <span>Layers</span>
          </button>
        </div>

        {/* Top-right Info & Accessibility button */}
        <div className="x53-globe-overlay-tr">
          <button type="button" className="x53-globe-icon-btn" aria-label={full ? "Exit fullscreen" : "Fullscreen map"}
            onClick={() => void toggleFullscreen()}><Maximize size={16} /></button>
          <button
            type="button"
            className="x53-globe-icon-btn"
            aria-label="Globe sources, resolution and accessible event index"
            onClick={() => setInfoOpen(true)}
          >
            <Info size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Bottom-left Zoom + Rotation + Reset controls */}
        <div
          className="x53-globe-overlay-bl"
          role="group"
          aria-label="Globe camera controls"
        >
          <button
            type="button"
            className="x53-globe-icon-btn"
            aria-label={autoRotate ? "Pause globe rotation" : "Start globe rotation"}
            aria-pressed={autoRotate}
            disabled={!globeMounted || rendererFallback || !!regional}
            onClick={() => {
              setMotionOverride(true);
              setAutoRotate((v) => !v);
            }}
          >
            {autoRotate ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            type="button"
            className="x53-globe-icon-btn"
            aria-label="Zoom out"
            disabled={!globeMounted || rendererFallback || (!regional && zoom <= GLOBE_ZOOM_MIN + 0.01)}
            onClick={zoomStepOut}
          >
            <Minus size={15} />
          </button>
          <span
            className="x53-globe-zoom-readout"
            aria-live="polite"
            title="Current camera magnification"
          >
            {mapReady ? "Map" : zoom.toFixed(1) + "×"}
          </span>
          <button
            type="button"
            className="x53-globe-icon-btn"
            aria-label="Zoom in"
            disabled={!globeMounted || rendererFallback || (mapReady ? (regionView?.zoom ?? 0) >= 7 : zoom >= GLOBE_ZOOM_MAX - 0.01)}
            onClick={zoomStepIn}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="x53-globe-icon-btn"
            aria-label="Reset globe to full Earth view"
            disabled={!globeMounted || rendererFallback}
            onClick={handleReset}
          >
            <RotateCcw size={15} />
          </button>
        </div>

        {/* Subtle gesture hint */}
        <span className="x53-globe-hint" aria-hidden="true">
          {rendererFallback
            ? "Static natural-color Earth"
            : mapReady ? "Drag to pan · Zoom out to return to 3D" : regional ? "Preparing regional map…" : "Drag · Pinch or double-tap to zoom"}
        </span>

        {/* On-demand Popover: Explore / Search */}
        {activePopover === "explore" && (
          <div
            className="x53-globe-popover"
            role="dialog"
            aria-label="Explore countries, exchanges and events on globe"
          >
            <div className="x53-globe-popover-head">
              <strong>Explore on 3D Globe</strong>
              <button
                type="button"
                className="x1-icon-button"
                aria-label="Close explore panel"
                onClick={() => setActivePopover(null)}
              >
                <X size={15} />
              </button>
            </div>
            <input
              type="search"
              value={exploreQuery}
              onChange={(e) => setExploreQuery(e.target.value)}
              aria-label="Search country, exchange, or hazard"
              placeholder="India, Tokyo, NYSE, earthquake…"
              style={{ width: "100%", fontSize: "16px" }}
            />
            <div className="x53-globe-popover-list">
              {exploreResults.matchedCountries.length > 0 && (
                <>
                  <small className="x1-caption">Countries &amp; Regions</small>
                  {exploreResults.matchedCountries.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      className="x53-globe-popover-row"
                      onClick={() => {
                        setSelectedExchange(null);
                        setSelectedEntity({ kind: "COUNTRY", country: c });
                        flyTo(c.lat, c.lon, 2.4);
                        setActivePopover(null);
                      }}
                    >
                      <span>
                        <strong>{c.name}</strong> · {c.currencyCode}
                      </span>
                      <Compass size={14} aria-hidden="true" />
                    </button>
                  ))}
                </>
              )}
              {exploreResults.matchedVenues.length > 0 && (
                <>
                  <small className="x1-caption">Exchange Hubs</small>
                  {exploreResults.matchedVenues.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="x53-globe-popover-row"
                      onClick={() => {
                        setSelectedExchange(v);
                        setSelectedEntity({ kind: "EXCHANGE", exchange: v });
                        flyTo(v.lat, v.lon, 3.0);
                        setActivePopover(null);
                      }}
                    >
                      <span>
                        <strong>{v.mic}</strong> · {v.city}, {v.country}
                      </span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </>
              )}
              {exploreResults.matchedHazards.length > 0 && (
                <>
                  <small className="x1-caption">Live Hazards (USGS / NASA)</small>
                  {exploreResults.matchedHazards.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className="x53-globe-popover-row"
                      onClick={() => {
                        setSelectedExchange(null);
                        setSelectedEntity({ kind: "HAZARD", hazard: h });
                        flyTo(h.lat, h.lon, 3.2);
                        setActivePopover(null);
                      }}
                    >
                      <span>
                        <strong>{h.sourceName}</strong> · {h.title}
                      </span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* On-demand Popover: Daily World Briefing */}
        {activePopover === "briefing" && (
          <div
            className="x53-globe-popover"
            role="dialog"
            aria-label="Daily World Briefing"
          >
            <div className="x53-globe-popover-head">
              <strong>Daily World Briefing</strong>
              <button
                type="button"
                className="x1-icon-button"
                aria-label="Close briefing panel"
                onClick={() => setActivePopover(null)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="x53-globe-popover-list">
              {briefing && briefing.items.length > 0 ? (
                briefing.items.slice(0, 5).map((item) => (
                  <div key={item.id} className="x53-briefing-card">
                    <div className="x52-news-meta">
                      <span className="x51-pill">{item.sourceName}</span>
                      <span>{item.occurredAtUTC.slice(0, 10)}</span>
                    </div>
                    <strong style={{ fontSize: "0.86rem" }}>
                      {item.headline}
                    </strong>
                    <p className="x1-caption" style={{ margin: 0 }}>
                      {item.detail}
                    </p>
                    <div className="x1-actions" style={{ justifyContent: "space-between", gap: 6 }}>
                      <button
                        type="button"
                        className="x1-text-button"
                        onClick={() => {
                          flyTo(item.lat, item.lon, 3.2);
                          const matchHazard = hazards.find(
                            (h) => `brief:${h.id}` === item.id,
                          );
                          if (matchHazard) {
                            setSelectedExchange(null);
                            setSelectedEntity({ kind: "HAZARD", hazard: matchHazard });
                          }
                          setActivePopover(null);
                        }}
                      >
                        Explore on globe <ArrowRight size={12} />
                      </button>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="x1-caption"
                        style={{ color: "var(--x1-title-blue)", textDecoration: "none" }}
                      >
                        Source <ArrowUpRight size={11} />
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <p className="x1-caption" style={{ margin: 0 }}>
                  {briefing?.emptyMessage ?? "No verified developments loaded."}
                </p>
              )}
            </div>
          </div>
        )}

        {/* On-demand Popover: Layers & Watch Regions */}
        {activePopover === "layers" && (
          <div
            className="x53-globe-popover"
            role="dialog"
            aria-label="Globe data layers and watch regions"
          >
            <div className="x53-globe-popover-head">
              <strong>Globe Layers</strong>
              <button
                type="button"
                className="x1-icon-button"
                aria-label="Close layers panel"
                onClick={() => setActivePopover(null)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="x51-chip-row">
              <button
                type="button"
                className={"x51-chip" + (showExchanges ? " is-active" : "")}
                aria-pressed={showExchanges}
                onClick={() => setShowExchanges((v) => !v)}
              >
                Exchanges ({EXCHANGES.length})
              </button>
              <button
                type="button"
                className={"x51-chip" + (showQuakes ? " is-active" : "")}
                aria-pressed={showQuakes}
                onClick={() => setShowQuakes((v) => !v)}
              >
                USGS Quakes ({hazards.filter((h) => h.kind === "EARTHQUAKE").length})
              </button>
              <button
                type="button"
                className={"x51-chip" + (showDisasters ? " is-active" : "")}
                aria-pressed={showDisasters}
                onClick={() => setShowDisasters((v) => !v)}
              >
                NASA Events ({hazards.filter((h) => h.kind === "DISASTER").length})
              </button>
              <button
                type="button"
                className={"x51-chip" + (showCountries ? " is-active" : "")}
                aria-pressed={showCountries}
                onClick={() => setShowCountries((v) => !v)}
              >
                Countries ({countries.length})
              </button>
              <button
                type="button"
                className={"x51-chip" + (showArcs ? " is-active" : "")}
                aria-pressed={showArcs}
                onClick={() => setShowArcs((v) => !v)}
              >
                Hub Arcs
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <small className="x1-caption" style={{ display: "block", marginBottom: 6 }}>
                My Watch Regions ({watchedSet.size} saved)
              </small>
              <div className="x51-chip-row">
                {countries.map((c) => {
                  const watched = watchedSet.has(c.regionId);
                  return (
                    <button
                      key={c.regionId}
                      type="button"
                      className={"x51-chip" + (watched ? " is-active" : "")}
                      aria-pressed={watched}
                      disabled={savingWatch}
                      onClick={() => void toggleWatchRegion(c.regionId)}
                    >
                      <Bookmark size={12} aria-hidden="true" />
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Compact On-Demand Contextual Marker Drawer */}
      {selectedEntity && (
        <div
          className="x53-globe-drawer"
          role="region"
          aria-label="Selected globe marker details"
        >
          <div className="x53-globe-drawer-head">
            <div>
              {selectedEntity.kind === "EXCHANGE" && (
                <>
                  <span className="x1-kicker">
                    {selectedEntity.exchange.city},{" "}
                    {selectedEntity.exchange.country} ·{" "}
                    {selectedEntity.exchange.mic}
                  </span>
                  <h3>{selectedEntity.exchange.name}</h3>
                </>
              )}
              {selectedEntity.kind === "HAZARD" && (
                <>
                  <span className="x1-kicker">
                    {selectedEntity.hazard.sourceName} ·{" "}
                    {selectedEntity.hazard.category} ·{" "}
                    {selectedEntity.hazard.occurredAtUTC.slice(0, 16).replace("T", " ")} UTC
                  </span>
                  <h3>{selectedEntity.hazard.title}</h3>
                </>
              )}
              {selectedEntity.kind === "COUNTRY" && (
                <>
                  <span className="x1-kicker">
                    {selectedEntity.country.centralBank} ·{" "}
                    {selectedEntity.country.currencyCode}
                  </span>
                  <h3>{selectedEntity.country.name}</h3>
                </>
              )}
              {selectedEntity.kind === "CONFLICT" && (
                <>
                  <span className="x1-kicker">
                    {selectedEntity.conflict.sourceName} ·{" "}
                    {selectedEntity.conflict.eventDate}
                  </span>
                  <h3>{selectedEntity.conflict.title}</h3>
                </>
              )}
            </div>
            <button
              type="button"
              className="x1-icon-button"
              aria-label="Close marker details"
              onClick={() => {
                setSelectedEntity(null);
                setSelectedExchange(null);
              }}
            >
              <X size={16} />
            </button>
          </div>

          {selectedEntity.kind === "EXCHANGE" && (
            <>
              <p className="x1-caption" style={{ margin: 0 }}>
                {currentSession?.label || "Schedule unknown"} ·{" "}
                {currentSession?.localTime || selectedEntity.exchange.timeZone} ·{" "}
                {currentSession?.reason || "Official exchange hours reference."}
              </p>
              <div className="x1-actions" style={{ flexWrap: "wrap", gap: 8 }}>
                <SourceLink href={selectedEntity.exchange.website}>
                  Exchange website
                </SourceLink>
                <SourceLink href={selectedEntity.exchange.calendarUrl}>
                  Official calendar
                </SourceLink>
              </div>
            </>
          )}

          {selectedEntity.kind === "HAZARD" && (
            <>
              <p className="x1-caption" style={{ margin: 0 }}>
                Location: {selectedEntity.hazard.place} ({selectedEntity.hazard.lat.toFixed(2)}°,{" "}
                {selectedEntity.hazard.lon.toFixed(2)}°) · Precision:{" "}
                {selectedEntity.hazard.geoPrecision === "EXACT_COORDINATE"
                  ? "Exact coordinate"
                  : "Event centroid"}
                {selectedEntity.hazard.depthKm !== null
                  ? ` · Depth ${selectedEntity.hazard.depthKm} km`
                  : ""}
                . Documented physical observation; not a price forecast.
              </p>
              <div className="x1-actions" style={{ flexWrap: "wrap", gap: 8 }}>
                <SourceLink href={selectedEntity.hazard.sourceUrl}>
                  Primary {selectedEntity.hazard.sourceName} record
                </SourceLink>
              </div>
            </>
          )}

          {selectedEntity.kind === "COUNTRY" && (
            <>
              <p className="x1-caption" style={{ margin: 0 }}>
                {selectedEntity.country.headline}
              </p>
              <div className="x1-actions" style={{ flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className="x51-accent-btn"
                  style={{ minHeight: 36, fontSize: "0.82rem", padding: "0 11px" }}
                  onClick={() =>
                    onOpenAsset(selectedEntity.country.primaryBenchmark.id)
                  }
                >
                  <span>{selectedEntity.country.primaryBenchmark.label}</span>
                  <ArrowUpRight size={14} />
                </button>
                {selectedEntity.country.fxPair && (
                  <button
                    type="button"
                    className="x1-secondary"
                    style={{ minHeight: 36, fontSize: "0.82rem" }}
                    onClick={() =>
                      onOpenAsset(selectedEntity.country.fxPair!.id)
                    }
                  >
                    <span>{selectedEntity.country.fxPair.label}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="x1-secondary"
                  style={{ minHeight: 36, fontSize: "0.82rem" }}
                  disabled={savingWatch}
                  onClick={() =>
                    void toggleWatchRegion(selectedEntity.country.regionId)
                  }
                >
                  <Bookmark size={14} />
                  <span>
                    {watchedSet.has(selectedEntity.country.regionId)
                      ? "Watching"
                      : "Watch region"}
                  </span>
                </button>
              </div>
              {geopoliticsPathways.length > 0 && (
                <details className="x1-small-details">
                  <summary>
                    Geopolitics → Markets reference pathways (Hypothesis vs Documented)
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {geopoliticsPathways
                      .filter(
                        (pw) =>
                          pw.regionIds.includes(selectedEntity.country.regionId) ||
                          pw.regionIds.includes("global"),
                      )
                      .slice(0, 3)
                      .map((pw) => (
                        <div key={pw.id} className="x1-caption">
                          <strong>{pw.theme}</strong>{" "}
                          <span className="x51-pill">{pw.evidenceClass}</span> ·{" "}
                          {pw.channel} — {pw.explanation}
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </>
          )}

          {selectedEntity.kind === "CONFLICT" && (
            <>
              <p className="x1-caption" style={{ margin: 0 }}>
                {selectedEntity.conflict.locationName},{" "}
                {selectedEntity.conflict.countryName} · Category:{" "}
                {selectedEntity.conflict.normalizedCategory}
                {selectedEntity.conflict.fatalitiesEstimate !== null
                  ? ` · Source estimate: ${selectedEntity.conflict.fatalitiesEstimate}`
                  : " · Fatalities: not reported"}
              </p>
              <SourceLink href={selectedEntity.conflict.sourceUrl}>
                Primary {selectedEntity.conflict.sourceName} dataset
              </SourceLink>
            </>
          )}
        </div>
      )}

      {/* Info, Resolution Disclosure & Accessible Non-Visual Event/Venue Index */}
      {infoOpen && (
        <Modal
          title="Strategic Globe · Sources, Resolution & Accessibility"
          onClose={() => setInfoOpen(false)}
        >
          <dl className="x1-details">
            <div>
              <dt>Earth Imagery Resolution</dt>
              <dd>
                Locally hosted NASA Blue Marble Next Generation &amp; NASA VIIRS
                Black Marble historical composites (public domain, up to
                2048×1024px). Designed for global &amp; regional exploration up
                to 5× zoom — not live street-level satellite telemetry.
              </dd>
            </div>
            <div>
              <dt>Verified Event Layers</dt>
              <dd>
                24 canonical exchange venues, live USGS M4.5+ earthquakes (7-day
                GeoJSON), live NASA EONET open natural events, and 8 macro
                country profiles. Armed conflict pins display only when licensed
                UCDP/ACLED tokens are configured.
              </dd>
            </div>
            <div>
              <dt>Keyboard &amp; Touch Controls</dt>
              <dd>
                Focus the globe canvas and use Arrow keys to rotate,{" "}
                <code>+</code> / <code>−</code> to zoom (1.0× to 5.0×), and{" "}
                <code>0</code> or <code>Home</code> to reset. Touch supports
                one-finger drag and two-finger pinch zoom; double-tap zooms
                toward the tapped region.
              </dd>
            </div>
          </dl>

          <details className="x1-small-details" style={{ marginTop: 12 }}>
            <summary>
              Accessible text index ({EXCHANGES.length} exchanges · {hazards.length} live hazards)
            </summary>
            <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {EXCHANGES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="x53-globe-popover-row"
                  onClick={() => {
                    setInfoOpen(false);
                    setSelectedExchange(v);
                    setSelectedEntity({ kind: "EXCHANGE", exchange: v });
                    flyTo(v.lat, v.lon, 3.0);
                  }}
                >
                  <span>
                    <strong>{v.mic}</strong> · {v.name} ({v.city}, {v.country})
                  </span>
                  <ArrowRight size={13} />
                </button>
              ))}
              {hazards.slice(0, 15).map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="x53-globe-popover-row"
                  onClick={() => {
                    setInfoOpen(false);
                    setSelectedExchange(null);
                    setSelectedEntity({ kind: "HAZARD", hazard: h });
                    flyTo(h.lat, h.lon, 3.2);
                  }}
                >
                  <span>
                    <strong>{h.sourceName}</strong> · {h.title}
                  </span>
                  <ArrowRight size={13} />
                </button>
              ))}
            </div>
          </details>
        </Modal>
      )}
    </section>
  );
}
