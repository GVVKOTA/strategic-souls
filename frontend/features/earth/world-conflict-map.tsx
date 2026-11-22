"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Globe2,
  Info,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { EXCHANGES, type Exchange } from "../../../backend/services/market-data/exchanges";
import {
  getEconomicCalendarEvents,
} from "../../../backend/services/market-data/economic-calendar";
import type {
  CountryProfile,
  NaturalHazardEvent,
} from "../../../backend/services/intelligence/news-and-disasters";
import type { GeopoliticalExposurePathway } from "../../../backend/services/market-data/sectors-and-ecosystem";
import type {
  ConflictEvent,
  ConflictFeedResponse,
} from "../../../backend/services/earth/conflicts";
import type { WatchRegionsState } from "../../../backend/services/user/preferences-store";
import { api, type Notice } from "../../components/workspace/shared";

export type MapFocusTarget = {
  lat: number;
  lon: number;
  zoom?: number;
  label?: string;
  exchangeId?: string;
  regionId?: string;
  nonce: number;
};

type Props = {
  hazards: readonly NaturalHazardEvent[];
  countries: readonly CountryProfile[];
  geopoliticsPathways: readonly GeopoliticalExposurePathway[];
  watchRegions: WatchRegionsState | null;
  authenticated?: boolean;
  onRequireAuth?: () => void;
  onWatchRegionsChange?: (next: WatchRegionsState) => void;
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
  notify?: Notice;
};

function latLonToPct(lat: number, lon: number): { left: string; top: string } {
  const clampedLon = Math.max(-180, Math.min(180, lon));
  const clampedLat = Math.max(-85, Math.min(85, lat));
  return {
    left: `${(((clampedLon + 180) / 360) * 100).toFixed(2)}%`,
    top: `${(((90 - clampedLat) / 180) * 100).toFixed(2)}%`,
  };
}

/**
 * Unified Inline 2D World Intelligence Map mounted DIRECTLY beneath the 3D Earth.
 * - Uses bundled natural-color NASA Blue Marble / Black Marble imagery (never renders a black box).
 * - Compact Intelligence Layers toolbar [21]: Earthquakes, Disasters, Exchanges, Conflicts, Energy/Markets.
 * - Real USGS M4.5+ & NASA EONET markers [23].
 * - My Watch Regions [24] with unread count since last seen.
 * - On-demand Country Profile drawer [25] & Geopolitics -> Markets exposure map [22].
 * - Zero duplicate standalone headers, zero 4 monitor cards, zero static 6-country grids, zero public env-var setup essays.
 */
export default function WorldConflictMap({
  hazards,
  countries,
  geopoliticsPathways,
  watchRegions,
  authenticated = false,
  onRequireAuth,
  onWatchRegionsChange,
  focusTarget = null,
  externalConflictId = null,
  onViewOnGlobe,
  onConflictsLoaded,
  onOpenAsset,
  onSelectExchange,
  notify,
}: Props) {
  const [nightMode, setNightMode] = useState(false);
  const [layerQuakes, setLayerQuakes] = useState(true);
  const [layerDisasters, setLayerDisasters] = useState(true);
  const [layerExchanges, setLayerExchanges] = useState(true);
  const [layerConflicts, setLayerConflicts] = useState(true);
  const [layerEnergy, setLayerEnergy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [watchOnly, setWatchOnly] = useState(false);
  const [busyWatch, setBusyWatch] = useState(false);

  const [conflictEvents, setConflictEvents] = useState<ConflictEvent[]>([]);
  const [conflictStatus, setConflictStatus] = useState<string>("CHECKING");

  // On-demand drawer state (never renders a cluttered static grid below the map)
  const [selectedCountry, setSelectedCountry] = useState<CountryProfile | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<NaturalHazardEvent | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<ConflictEvent | null>(null);
  const [selectedExchange, setSelectedExchange] = useState<Exchange | null>(null);
  const [focusLabel, setFocusLabel] = useState("Natural-color Earth · Tap any marker or country");

  // Quietly check sourced conflict layer (never plaster env setup instructions on public UI)
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/earth/conflicts?period=30d&category=ALL", {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<ConflictFeedResponse>) : null))
      .then((payload) => {
        if (ctrl.signal.aborted || !payload) return;
        setConflictStatus(payload.status);
        setConflictEvents(payload.events ?? []);
        onConflictsLoaded?.(
          (payload.events ?? []).map((e) => ({
            id: e.eventId,
            lat: e.latitude,
            lon: e.longitude,
          })),
        );
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setConflictStatus("UNAVAILABLE");
      });
    return () => ctrl.abort();
  }, [onConflictsLoaded]);

  // Respond to focus requests from Daily Briefing or 3D Earth
  useEffect(() => {
    if (!focusTarget) return;
    queueMicrotask(() => {
      if (focusTarget.label) setFocusLabel(focusTarget.label);
      if (focusTarget.regionId) {
        const c = countries.find((x) => x.regionId === focusTarget.regionId);
        if (c) {
          setSelectedCountry(c);
          setSelectedHazard(null);
          setSelectedConflict(null);
          setSelectedExchange(null);
        }
      } else if (focusTarget.exchangeId) {
        const ex = EXCHANGES.find((e) => e.id === focusTarget.exchangeId);
        if (ex) {
          setSelectedExchange(ex);
          setSelectedCountry(null);
          setSelectedHazard(null);
          setSelectedConflict(null);
        }
      }
    });
  }, [focusTarget, countries]);

  useEffect(() => {
    if (!externalConflictId || !conflictEvents.length) return;
    const matched = conflictEvents.find((e) => e.eventId === externalConflictId);
    if (matched) {
      queueMicrotask(() => {
        setSelectedConflict(matched);
        setSelectedCountry(null);
        setSelectedHazard(null);
        setSelectedExchange(null);
      });
    }
  }, [externalConflictId, conflictEvents]);

  const followedRegionIds = useMemo(
    () => new Set(watchRegions?.regions ?? []),
    [watchRegions],
  );

  const visibleHazards = useMemo(() => {
    return hazards.filter((h) => {
      if (h.kind === "EARTHQUAKE" && !layerQuakes) return false;
      if (h.kind === "DISASTER" && !layerDisasters) return false;
      if (watchOnly && followedRegionIds.size > 0 && !followedRegionIds.has(h.regionId)) {
        return false;
      }
      return true;
    });
  }, [hazards, layerQuakes, layerDisasters, watchOnly, followedRegionIds]);

  const newInWatchRegions = useMemo(() => {
    if (!watchRegions || !watchRegions.regions.length) return 0;
    const cutoff = Date.parse(watchRegions.lastSeenAt || "1970-01-01T00:00:00Z");
    return hazards.filter(
      (h) => followedRegionIds.has(h.regionId) && Date.parse(h.occurredAtUTC) > cutoff,
    ).length;
  }, [hazards, watchRegions, followedRegionIds]);

  async function toggleWatchRegion(regionId: string) {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    if (busyWatch) return;
    setBusyWatch(true);
    try {
      const res = await api<{ ok: boolean; watchRegions: WatchRegionsState }>(
        "/api/intelligence",
        { action: "toggle-region", regionId },
      );
      onWatchRegionsChange?.(res.watchRegions);
      const isNowFollowed = res.watchRegions.regions.includes(regionId);
      notify?.(
        isNowFollowed
          ? "Added to My Watch Regions."
          : "Removed from My Watch Regions.",
      );
    } catch (err) {
      notify?.(
        err instanceof Error ? err.message : "Could not update Watch Regions.",
        true,
      );
    } finally {
      setBusyWatch(false);
    }
  }

  async function markWatchSeen() {
    if (!authenticated || busyWatch) return;
    setBusyWatch(true);
    try {
      const res = await api<{ ok: boolean; watchRegions: WatchRegionsState }>(
        "/api/intelligence",
        { action: "mark-seen" },
      );
      onWatchRegionsChange?.(res.watchRegions);
    } catch {
      /* Ignore transient error */
    } finally {
      setBusyWatch(false);
    }
  }

  const countryUpcoming = useMemo(() => {
    if (!selectedCountry) return [];
    return getEconomicCalendarEvents({
      range: "upcoming",
      country: selectedCountry.calendarCountry,
    }).events.slice(0, 3);
  }, [selectedCountry]);

  const countryPathways = useMemo(() => {
    if (!selectedCountry) return geopoliticsPathways;
    const matched = geopoliticsPathways.filter((p) =>
      p.regionIds.includes(selectedCountry.regionId),
    );
    return matched.length ? matched : geopoliticsPathways.slice(0, 2);
  }, [selectedCountry, geopoliticsPathways]);

  const quakeCount = hazards.filter((h) => h.kind === "EARTHQUAKE").length;
  const disasterCount = hazards.filter((h) => h.kind === "DISASTER").length;

  return (
    <div id="ss-earth-2d-map" aria-label="Integrated 2D World Map and Intelligence Layers">
      {/* Compact Realistic 2D Map DIRECTLY beneath 3D Earth (always visible, zero black box) */}
      <div className="x52-inline-map-wrap">
        <div
          className={"x52-inline-map-stage" + (nightMode ? " is-night" : "")}
          role="region"
          aria-label="Interactive 2D World Intelligence Map"
        >
          {/* Country Profile interactive anchor pins [25] */}
          {countries.map((c) => {
            const pos = latLonToPct(c.lat, c.lon);
            const isSelected = selectedCountry?.code === c.code;
            return (
              <button
                key={`c-${c.code}`}
                type="button"
                className="x52-map-pin is-country"
                style={{
                  ...pos,
                  boxShadow: isSelected ? "0 0 0 4px rgba(110, 231, 183, 0.45)" : undefined,
                }}
                title={`${c.name} — Open Country Profile`}
                aria-label={`Open Country Profile for ${c.name}`}
                onClick={() => {
                  setSelectedCountry(c);
                  setSelectedHazard(null);
                  setSelectedConflict(null);
                  setSelectedExchange(null);
                  setFocusLabel(`${c.name} · Country Profile`);
                }}
              />
            );
          })}

          {/* Exchange city markers */}
          {layerExchanges &&
            EXCHANGES.map((ex) => {
              const pos = latLonToPct(ex.lat, ex.lon);
              return (
                <button
                  key={`ex-${ex.id}`}
                  type="button"
                  className="x52-map-pin is-exchange"
                  style={pos}
                  title={`${ex.city} (${ex.mic}) — ${ex.name}`}
                  aria-label={`Inspect exchange ${ex.name} in ${ex.city}`}
                  onClick={() => {
                    setSelectedExchange(ex);
                    setSelectedCountry(null);
                    setSelectedHazard(null);
                    setSelectedConflict(null);
                    setFocusLabel(`${ex.city}, ${ex.country} · ${ex.mic}`);
                    onSelectExchange?.(ex);
                  }}
                />
              );
            })}

          {/* [23] Official USGS Earthquakes & NASA EONET Disasters */}
          {visibleHazards.slice(0, 60).map((hz) => {
            const pos = latLonToPct(hz.lat, hz.lon);
            return (
              <button
                key={hz.id}
                type="button"
                className={
                  "x52-map-pin " +
                  (hz.kind === "EARTHQUAKE" ? "is-quake" : "is-disaster")
                }
                style={pos}
                title={`${hz.title} (${hz.sourceName})`}
                aria-label={`Inspect ${hz.title}`}
                onClick={() => {
                  setSelectedHazard(hz);
                  setSelectedCountry(null);
                  setSelectedConflict(null);
                  setSelectedExchange(null);
                  setFocusLabel(`${hz.sourceName} · ${hz.place}`);
                }}
              />
            );
          })}

          {/* Sourced Conflict Markers (only when connected) */}
          {layerConflicts &&
            conflictEvents.slice(0, 50).map((ev) => {
              const pos = latLonToPct(ev.latitude, ev.longitude);
              return (
                <button
                  key={ev.eventId}
                  type="button"
                  className="x52-map-pin is-conflict"
                  style={pos}
                  title={`${ev.eventTitle} (${ev.countryName})`}
                  aria-label={`Inspect sourced conflict event ${ev.eventTitle}`}
                  onClick={() => {
                    setSelectedConflict(ev);
                    setSelectedCountry(null);
                    setSelectedHazard(null);
                    setSelectedExchange(null);
                    setFocusLabel(`${ev.countryName} · Sourced event`);
                  }}
                />
              );
            })}

          <div className="x6-map-stage-badge">
            <strong>{focusLabel}</strong>
          </div>
        </div>
      </div>

      {/* [21] ONE Compact Intelligence Layers Toolbar + Country Picker + My Watch Regions [24] */}
      <div className="x52-layer-bar" role="toolbar" aria-label="Intelligence layers">
        <button
          type="button"
          className={"x51-chip" + (layerQuakes ? " is-active" : "")}
          aria-pressed={layerQuakes}
          onClick={() => setLayerQuakes((v) => !v)}
        >
          Earthquakes ({quakeCount})
        </button>
        <button
          type="button"
          className={"x51-chip" + (layerDisasters ? " is-active" : "")}
          aria-pressed={layerDisasters}
          onClick={() => setLayerDisasters((v) => !v)}
        >
          Disasters ({disasterCount})
        </button>
        <button
          type="button"
          className={"x51-chip" + (layerExchanges ? " is-active" : "")}
          aria-pressed={layerExchanges}
          onClick={() => setLayerExchanges((v) => !v)}
        >
          Exchanges ({EXCHANGES.length})
        </button>
        <button
          type="button"
          className={"x51-chip" + (layerEnergy ? " is-active" : "")}
          aria-pressed={layerEnergy}
          onClick={() => setLayerEnergy((v) => !v)}
        >
          Geo → Markets
        </button>
        {conflictEvents.length > 0 && (
          <button
            type="button"
            className={"x51-chip" + (layerConflicts ? " is-active" : "")}
            aria-pressed={layerConflicts}
            onClick={() => setLayerConflicts((v) => !v)}
          >
            Conflicts ({conflictEvents.length})
          </button>
        )}
        <button
          type="button"
          className="x51-chip"
          aria-pressed={nightMode}
          onClick={() => setNightMode((v) => !v)}
        >
          {nightMode ? <Sun size={13} /> : <Moon size={13} />}
          <span style={{ marginLeft: 4 }}>{nightMode ? "Day" : "Night"}</span>
        </button>

        {/* Quick Country Profile Jump [25] */}
        <select
          aria-label="Inspect Country Profile"
          value={selectedCountry?.code ?? ""}
          onChange={(e) => {
            const c = countries.find((x) => x.code === e.target.value) ?? null;
            setSelectedCountry(c);
            setSelectedHazard(null);
            setSelectedConflict(null);
            setSelectedExchange(null);
            if (c) {
              setFocusLabel(`${c.name} · Country Profile`);
              onViewOnGlobe?.({ lat: c.lat, lon: c.lon, label: c.name });
            }
          }}
          style={{
            background: "var(--x51-surface-card)",
            color: "var(--x1-text-primary)",
            border: "1px solid var(--x51-hairline-strong)",
            borderRadius: 999,
            padding: "5px 10px",
            fontSize: "0.8rem",
            minHeight: 34,
          }}
        >
          <option value="">Country Profile…</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>

        {/* [24] Watch Regions Filter Pill */}
        {watchRegions && watchRegions.regions.length > 0 && (
          <button
            type="button"
            className={"x51-chip" + (watchOnly ? " is-active" : "")}
            aria-pressed={watchOnly}
            onClick={() => setWatchOnly((v) => !v)}
          >
            <BookmarkCheck size={13} />
            <span style={{ marginLeft: 4 }}>
              Watch Regions ({watchRegions.regions.length})
              {newInWatchRegions > 0 ? ` · ${newInWatchRegions} new` : ""}
            </span>
          </button>
        )}

        <button
          type="button"
          className="x52-search-icon-mini"
          aria-label="Layer provenance and data sources"
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen((v) => !v)}
        >
          <Info size={15} />
        </button>
      </div>

      {/* Compact provenance behind info button (never clutters main canvas) */}
      {infoOpen && (
        <div className="x1-callout" style={{ margin: "4px 0 8px", fontSize: "0.8rem" }}>
          <strong>Sources:</strong> Earthquakes from USGS M4.5+ 7-day GeoJSON; natural
          events from NASA EONET v3; satellite earth from NASA Blue/Black Marble (public
          domain); exchange hubs from ISO 10383 MIC &amp; Natural Earth. Conflict layer
          status: {conflictStatus === "CONNECTED" ? "connected" : "awaiting optional research token"}.
        </div>
      )}

      {/* [24] Watch Regions quick bar when user has followed regions and unread updates */}
      {watchRegions && watchRegions.regions.length > 0 && newInWatchRegions > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
            padding: "8px 12px",
            borderRadius: 10,
            background: "var(--x51-blue-soft)",
            border: "1px solid var(--x51-blue-border)",
            fontSize: "0.82rem",
            marginBottom: 8,
          }}
        >
          <span>
            {newInWatchRegions} new verified natural/seismic development(s) in your
            watched regions since last check.
          </span>
          <button
            type="button"
            className="x1-text-button"
            disabled={busyWatch}
            onClick={() => void markWatchSeen()}
          >
            Mark seen
          </button>
        </div>
      )}

      {/* [22] Geopolitics -> Markets Panel (shown on toggle) */}
      {layerEnergy && (
        <div className="x52-country-drawer" aria-label="Geopolitics to Markets exposure pathways">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong style={{ color: "var(--x1-title-blue)" }}>
              Geopolitics → Markets Exposure Map
            </strong>
            <button
              type="button"
              className="x52-search-icon-mini"
              aria-label="Close exposure panel"
              onClick={() => setLayerEnergy(false)}
            >
              <X size={15} />
            </button>
          </div>
          <div className="x52-news-grid">
            {geopoliticsPathways.map((p) => (
              <div key={p.id} className="x52-news-card">
                <div>
                  <div className="x52-news-meta" style={{ marginBottom: 4 }}>
                    <span className={p.evidenceClass === "DOCUMENTED" ? "x51-pill x51-pill-green" : "x51-pill x51-pill-amber"}>
                      {p.evidenceClass}
                    </span>
                    <a
                      href={p.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--x1-title-blue)", textDecoration: "none" }}
                    >
                      {p.sourceName} <ArrowUpRight size={12} />
                    </a>
                  </div>
                  <h3>{p.theme}</h3>
                  <p className="x1-caption" style={{ margin: "4px 0" }}>{p.explanation}</p>
                </div>
                <div className="x51-chip-row">
                  {p.linkedAssets.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="x51-chip"
                      onClick={() => onOpenAsset?.(a.id)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* [25] On-Demand Country Profile Drawer */}
      {selectedCountry && (
        <article className="x52-country-drawer" aria-label={`${selectedCountry.name} Country Profile`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
            <div>
              <strong style={{ fontSize: "1.02rem", color: "var(--x1-title-blue)" }}>
                {selectedCountry.name} ({selectedCountry.currencyCode})
              </strong>
              <p className="x1-caption" style={{ margin: "2px 0 0" }}>
                {selectedCountry.headline}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                className={
                  followedRegionIds.has(selectedCountry.regionId)
                    ? "x51-accent-btn"
                    : "x1-secondary"
                }
                style={{ minHeight: 34, padding: "0 10px", fontSize: "0.8rem" }}
                disabled={busyWatch}
                onClick={() => void toggleWatchRegion(selectedCountry.regionId)}
              >
                {followedRegionIds.has(selectedCountry.regionId) ? (
                  <BookmarkCheck size={14} />
                ) : (
                  <Bookmark size={14} />
                )}
                <span>
                  {followedRegionIds.has(selectedCountry.regionId)
                    ? "Watching"
                    : "Watch Region"}
                </span>
              </button>
              <button
                type="button"
                className="x52-search-icon-mini"
                aria-label="Close country profile"
                onClick={() => setSelectedCountry(null)}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="x51-cal-metrics">
            <div className="x51-cal-metric">
              <small>Central Bank</small>
              <strong>{selectedCountry.centralBank}</strong>
            </div>
            <div className="x51-cal-metric">
              <small>Primary Benchmark</small>
              <button
                type="button"
                className="x1-text-button"
                onClick={() => onOpenAsset?.(selectedCountry.primaryBenchmark.id)}
              >
                {selectedCountry.primaryBenchmark.label} <ArrowUpRight size={13} />
              </button>
            </div>
            <div className="x51-cal-metric">
              <small>FX Reference</small>
              {selectedCountry.fxPair ? (
                <button
                  type="button"
                  className="x1-text-button"
                  onClick={() => onOpenAsset?.(selectedCountry.fxPair!.id)}
                >
                  {selectedCountry.fxPair.label} <ArrowUpRight size={13} />
                </button>
              ) : (
                <strong>{selectedCountry.currencyCode}</strong>
              )}
            </div>
          </div>

          <div>
            <span className="x1-caption" style={{ fontWeight: 600 }}>
              Official Macro Indicators:
            </span>
            <div className="x51-chip-row" style={{ marginTop: 6 }}>
              {selectedCountry.macroIndicators.map((ind) => (
                <a
                  key={ind.label}
                  href={ind.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="x51-pill"
                  style={{ textDecoration: "none" }}
                >
                  {ind.label} ({ind.agency} · {ind.cadence}) <ArrowUpRight size={11} />
                </a>
              ))}
            </div>
          </div>

          {countryUpcoming.length > 0 && (
            <div className="x1-caption">
              Next scheduled releases:{" "}
              {countryUpcoming.map((ev) => `${ev.title} (${ev.scheduledDate})`).join(" · ")}
            </div>
          )}

          {countryPathways.length > 0 && (
            <div className="x1-caption">
              Macro exposure channel ({countryPathways[0].evidenceClass}):{" "}
              {countryPathways[0].theme} — {countryPathways[0].channel}.
            </div>
          )}
        </article>
      )}

      {/* [23] On-Demand Earthquake / Disaster Event Drawer */}
      {selectedHazard && (
        <article className="x52-country-drawer" aria-label="Selected natural hazard event">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <span className="x51-pill">{selectedHazard.sourceName} · {selectedHazard.category}</span>
              <h3 style={{ margin: "6px 0 2px", fontSize: "0.98rem" }}>{selectedHazard.title}</h3>
              <p className="x1-caption" style={{ margin: 0 }}>
                Observed {selectedHazard.occurredAtUTC.slice(0, 16).replace("T", " ")} UTC ·{" "}
                {selectedHazard.lat.toFixed(2)}°, {selectedHazard.lon.toFixed(2)}°
                {selectedHazard.depthKm !== null ? ` · Depth ${selectedHazard.depthKm} km` : ""}
              </p>
            </div>
            <button
              type="button"
              className="x52-search-icon-mini"
              aria-label="Close hazard details"
              onClick={() => setSelectedHazard(null)}
            >
              <X size={15} />
            </button>
          </div>
          <div className="x1-actions" style={{ gap: 8 }}>
            <a
              href={selectedHazard.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="x1-secondary"
              style={{ minHeight: 34, fontSize: "0.8rem" }}
            >
              Official {selectedHazard.sourceName} bulletin <ArrowUpRight size={13} />
            </a>
            {onViewOnGlobe && (
              <button
                type="button"
                className="x1-secondary"
                style={{ minHeight: 34, fontSize: "0.8rem" }}
                onClick={() =>
                  onViewOnGlobe({
                    lat: selectedHazard.lat,
                    lon: selectedHazard.lon,
                    label: selectedHazard.place,
                  })
                }
              >
                <Globe2 size={14} />
                <span>Focus 3D Earth</span>
              </button>
            )}
          </div>
        </article>
      )}

      {/* On-Demand Exchange Drawer */}
      {selectedExchange && !selectedCountry && !selectedHazard && !selectedConflict && (
        <article className="x52-country-drawer" aria-label="Selected exchange hub">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <strong>{selectedExchange.name}</strong> ({selectedExchange.mic})
              <div className="x1-caption">
                {selectedExchange.city}, {selectedExchange.country} · {selectedExchange.timeZone}
              </div>
            </div>
            <button
              type="button"
              className="x52-search-icon-mini"
              aria-label="Close exchange details"
              onClick={() => setSelectedExchange(null)}
            >
              <X size={15} />
            </button>
          </div>
        </article>
      )}

      {/* On-Demand Sourced Conflict Event Drawer */}
      {selectedConflict && (
        <article className="x52-country-drawer" aria-label="Selected sourced conflict record">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <span className="x51-pill x51-pill-red">
                {selectedConflict.provider} · {selectedConflict.countryName}
              </span>
              <h3 style={{ margin: "6px 0 2px", fontSize: "0.96rem" }}>{selectedConflict.eventTitle}</h3>
              <p className="x1-caption" style={{ margin: 0 }}>
                {selectedConflict.shortSummary}
              </p>
            </div>
            <button
              type="button"
              className="x52-search-icon-mini"
              aria-label="Close conflict details"
              onClick={() => setSelectedConflict(null)}
            >
              <X size={15} />
            </button>
          </div>
          <a
            href={selectedConflict.canonicalSourceUrl}
            target="_blank"
            rel="noreferrer"
            className="x1-text-button"
          >
            Source attribution <ArrowUpRight size={13} />
          </a>
        </article>
      )}
    </div>
  );
}
