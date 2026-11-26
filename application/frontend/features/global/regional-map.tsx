"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { MAP_EXIT_ZOOM, mapFocus, type RegionalFocus } from "./globe-projection";

export type RegionalEvent = { id: string; lat: number; lon: number; label: string; tone: string; onSelect: () => void };
type Place = { geometry: { coordinates: [number, number] }; properties: { name: string; population: number; capital: boolean } };
type MarkerCtor = typeof MapLibreMarker;

export default function RegionalMap({ initial, destination, markers, selected, command, showGeography, onReady, onExit, onChange, onUnavailable }: {
  initial: RegionalFocus; destination: (RegionalFocus & { nonce: number }) | null;
  markers: RegionalEvent[]; selected: string | null; command: { direction: number; id: number };
  showGeography: boolean; onReady: () => void; onExit: (focus: RegionalFocus) => void;
  onChange: (focus: RegionalFocus) => void; onUnavailable: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const instance = useRef<MapLibreMap | null>(null);
  const markerCtorRef = useRef<MarkerCtor | null>(null);
  const applyGeography = useRef<(() => void) | null>(null);
  const applyMarkers = useRef<(() => void) | null>(null);
  const initialRef = useRef(initial);
  const [mapLoaded, setMapLoaded] = useState(false);
  const events = useRef({ onReady, onExit, onChange, onUnavailable, showGeography, markers, selected });
  useEffect(() => {
    events.current = { onReady, onExit, onChange, onUnavailable, showGeography, markers, selected };
  }, [onReady, onExit, onChange, onUnavailable, showGeography, markers, selected]);

  useEffect(() => {
    if (typeof window === "undefined" || !box.current) return;
    const container = box.current;
    const start = initialRef.current;
    const normalized = mapFocus(start);
    let map: MapLibreMap | null = null;
    let disposed = false;
    let deadline: number | null = null;
    let resize: ResizeObserver | null = null;
    const controller = new AbortController();
    const labels: MapLibreMarker[] = [];
    const activeMarkers: MapLibreMarker[] = [];
    const clearLabels = () => labels.splice(0).forEach((marker) => marker.remove());
    const clearMarkers = () => activeMarkers.splice(0).forEach((marker) => marker.remove());
    const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "minimal" ||
      !!document.querySelector('.x1-app[data-motion="minimal"]');

    void Promise.all([
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ]).then(([maplibre, workerMod]) => {
      if (disposed || !container.isConnected) return;
      const MapConstructor = maplibre.Map;
      const MarkerConstructor = maplibre.Marker;
      markerCtorRef.current = MarkerConstructor;
      maplibre.setWorkerUrl(workerMod.default);
      map = new MapConstructor({
        container, center: [normalized.lon, normalized.lat], zoom: start.zoom, minZoom: 2,
        maxZoom: 7, maxPitch: 0, dragRotate: false, pitchWithRotate: false,
        attributionControl: false, renderWorldCopies: true, fadeDuration: reduced() ? 0 : 120,
        style: {
          version: 8,
          sources: {
            land: { type: "geojson", data: "/data/regional-land.json", maxzoom: 7 },
            borders: { type: "geojson", data: "/data/regional-borders.json", maxzoom: 7 },
          },
          layers: [
            { id: "ocean", type: "background", paint: { "background-color": "#101f2e" } },
            { id: "land", type: "fill", source: "land", paint: { "fill-color": "#2a393e", "fill-opacity": 0.94 } },
            { id: "coast", type: "line", source: "land", paint: { "line-color": "#536c73", "line-width": .8 } },
            { id: "borders", type: "line", source: "borders", filter: ["==", ["get", "disputed"], false],
              paint: { "line-color": "#86999d", "line-width": 1 } },
            { id: "disputes", type: "line", source: "borders", filter: ["==", ["get", "disputed"], true],
              paint: { "line-color": "#a5b4b3", "line-width": 1, "line-dasharray": [2, 2] } },
          ],
        },
      });
      const currentMap = map;
      instance.current = currentMap;
      currentMap.touchZoomRotate.disableRotation();
      currentMap.getCanvas().setAttribute("aria-label", "Regional map. Use arrow keys to pan, and plus or minus to zoom.");
      let places: Place[] = [];
      let usable = false;
      let exited = false;
      const drawLabels = () => {
        clearLabels();
        if (!events.current.showGeography || !places.length) return;
        const zoom = currentMap.getZoom(), bounds = currentMap.getBounds();
        const occupied = new Set<string>();
        for (const entry of places) {
          const coordinates = entry.geometry.coordinates;
          if ((!entry.properties.capital && zoom < 4.3 && entry.properties.population < 600_000) ||
            !bounds.contains(coordinates)) continue;
          const p = currentMap.project(coordinates), cell = Math.floor(p.x / 90) + ":" + Math.floor(p.y / 25);
          if (occupied.has(cell)) continue;
          occupied.add(cell);
          const label = document.createElement("span");
          label.className = "x1-map-place";
          label.textContent = entry.properties.name;
          labels.push(new MarkerConstructor({ element: label, anchor: "center" }).setLngLat(coordinates).addTo(currentMap));
          if (labels.length >= 36) break;
        }
      };
      const drawVisibleMarkers = () => {
        clearMarkers();
        const bounds = currentMap.getBounds();
        const visibleList = events.current.markers.filter((entry) => {
          const point = mapFocus(entry);
          return bounds.contains([point.lon, point.lat]);
        });
        visibleList.forEach((entry, index) => {
          const element = document.createElement("button");
          element.type = "button";
          element.className = "x1-map-marker is-" + entry.tone;
          element.setAttribute("aria-label", entry.label);
          element.setAttribute("aria-pressed", String(events.current.selected === entry.id));
          element.title = entry.label;
          element.onclick = entry.onSelect;
          const point = mapFocus(entry);
          const samePosition = visibleList.slice(0, index).filter(({ lat, lon }) => lat === entry.lat && lon === entry.lon).length;
          activeMarkers.push(new MarkerConstructor({ element, offset: [samePosition * 14, 0] }).setLngLat([point.lon, point.lat]).addTo(currentMap));
        });
      };
      applyMarkers.current = drawVisibleMarkers;
      const onSettled = () => {
        if (!usable || exited) return;
        const center = currentMap.getCenter(), zoom = currentMap.getZoom();
        const next = { ...mapFocus({ lat: center.lat, lon: center.lng }), zoom };
        if (zoom <= MAP_EXIT_ZOOM) {
          exited = true;
          events.current.onExit(next);
        } else {
          events.current.onChange(next);
          drawLabels();
          drawVisibleMarkers();
        }
      };
      const onLost = () => { if (!exited) { exited = true; events.current.onUnavailable(); } };
      deadline = window.setTimeout(onLost, 9000);
      const syncGeography = () => {
        if (!currentMap.isStyleLoaded()) return;
        for (const layer of ["borders", "disputes"])
          currentMap.setLayoutProperty(layer, "visibility", events.current.showGeography ? "visible" : "none");
        drawLabels();
      };
      currentMap.on("load", () => {
        if (exited || disposed) return;
        if (deadline !== null) window.clearTimeout(deadline);
        usable = true;
        setMapLoaded(true);
        syncGeography();
        drawVisibleMarkers();
        events.current.onReady();
      });
      currentMap.on("error", onLost);
      currentMap.on("moveend", onSettled);
      currentMap.on("webglcontextlost", onLost);
      applyGeography.current = syncGeography;
      void fetch("/data/regional-places.json", { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ features: Place[] }>;
      }).then((catalog) => {
        if (!controller.signal.aborted && !disposed) {
          places = catalog.features.sort((a, b) =>
            +b.properties.capital - +a.properties.capital || b.properties.population - a.properties.population);
          if (usable) drawLabels();
        }
      }).catch(() => { /* Retain the base map and selectable event markers without place labels. */ });
      resize = new ResizeObserver(() => currentMap.resize());
      resize.observe(container);
    }).catch(() => {
      if (!disposed) events.current.onUnavailable();
    });

    return () => {
      disposed = true;
      controller.abort();
      if (deadline !== null) window.clearTimeout(deadline);
      resize?.disconnect();
      clearLabels();
      clearMarkers();
      instance.current = null;
      markerCtorRef.current = null;
      applyGeography.current = null;
      applyMarkers.current = null;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    if (mapLoaded) applyMarkers.current?.();
  }, [mapLoaded, markers, selected]);

  useEffect(() => {
    if (!destination || !instance.current) return;
    const { lat, lon } = mapFocus(destination);
    instance.current.jumpTo({ center: [lon, lat], zoom: destination.zoom });
  }, [destination]);

  useEffect(() => {
    const map = instance.current;
    if (command.id && map) map.setZoom(map.getZoom() + command.direction * .55);
  }, [command]);
  useEffect(() => { applyGeography.current?.(); }, [showGeography]);

  return <div ref={box} className="x1-regional-map" />;
}
