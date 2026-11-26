"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import mapWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_EXIT_ZOOM, mapFocus, type RegionalFocus } from "./globe-projection";

export type RegionalEvent = { id: string; lat: number; lon: number; label: string; tone: string; onSelect: () => void };
type Place = { geometry: { coordinates: [number, number] }; properties: { name: string; population: number; capital: boolean } };

export default function RegionalMap({ initial, destination, markers, selected, command, showGeography, onReady, onExit, onChange, onUnavailable }: {
  initial: RegionalFocus; destination: (RegionalFocus & { nonce: number }) | null;
  markers: RegionalEvent[]; selected: string | null; command: { direction: number; id: number };
  showGeography: boolean; onReady: () => void; onExit: (focus: RegionalFocus) => void;
  onChange: (focus: RegionalFocus) => void; onUnavailable: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const instance = useRef<MapLibreMap | null>(null);
  const applyGeography = useRef<(() => void) | null>(null);
  const initialRef = useRef(initial);
  const events = useRef({ onReady, onExit, onChange, onUnavailable, showGeography });
  useEffect(() => { events.current = { onReady, onExit, onChange, onUnavailable, showGeography }; },
    [onReady, onExit, onChange, onUnavailable, showGeography]);

  useEffect(() => {
    if (!box.current) return;
    const start = initialRef.current;
    const normalized = mapFocus(start);
    let map: MapLibreMap;
    const controller = new AbortController();
    const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "minimal" ||
      !!document.querySelector('.x1-app[data-motion="minimal"]');
    try {
      setWorkerUrl(mapWorker);
      map = new MapLibreMap({
        container: box.current, center: [normalized.lon, normalized.lat], zoom: start.zoom, minZoom: 2,
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
    } catch {
      events.current.onUnavailable();
      return;
    }
    instance.current = map;
    map.touchZoomRotate.disableRotation();
    map.getCanvas().setAttribute("aria-label", "Regional map. Use arrow keys to pan, and plus or minus to zoom.");
    const labels: Marker[] = [];
    let places: Place[] = [];
    let usable = false;
    let exited = false;
    const clearLabels = () => labels.splice(0).forEach((marker) => marker.remove());
    const drawLabels = () => {
      clearLabels();
      if (!events.current.showGeography || !places.length) return;
      const zoom = map.getZoom(), bounds = map.getBounds();
      const occupied = new Set<string>();
      for (const entry of places) {
        const coordinates = entry.geometry.coordinates;
        if ((!entry.properties.capital && zoom < 4.3 && entry.properties.population < 600_000) ||
          !bounds.contains(coordinates)) continue;
        const p = map.project(coordinates), cell = Math.floor(p.x / 90) + ":" + Math.floor(p.y / 25);
        if (occupied.has(cell)) continue;
        occupied.add(cell);
        const label = document.createElement("span");
        label.className = "x1-map-place";
        label.textContent = entry.properties.name;
        labels.push(new Marker({ element: label, anchor: "center" }).setLngLat(coordinates).addTo(map));
        if (labels.length >= 36) break;
      }
    };
    const onSettled = () => {
      if (!usable || exited) return;
      const center = map.getCenter(), zoom = map.getZoom();
      const next = { ...mapFocus({ lat: center.lat, lon: center.lng }), zoom };
      if (zoom <= MAP_EXIT_ZOOM) {
        exited = true;
        events.current.onExit(next);
      } else {
        events.current.onChange(next);
        drawLabels();
      }
    };
    const onLost = () => { if (!exited) { exited = true; events.current.onUnavailable(); } };
    const deadline = window.setTimeout(onLost, 9000);
    const syncGeography = () => {
      if (!map.isStyleLoaded()) return;
      for (const layer of ["borders", "disputes"])
        map.setLayoutProperty(layer, "visibility", events.current.showGeography ? "visible" : "none");
      drawLabels();
    };
    map.on("load", () => {
      if (exited) return;
      window.clearTimeout(deadline);
      usable = true;
      syncGeography();
      events.current.onReady();
    });
    map.on("error", onLost);
    map.on("moveend", onSettled);
    map.on("webglcontextlost", onLost);
    applyGeography.current = syncGeography;
    void fetch("/data/regional-places.json", { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error();
      return response.json() as Promise<{ features: Place[] }>;
    }).then((catalog) => {
      if (!controller.signal.aborted) {
        places = catalog.features.sort((a, b) =>
          +b.properties.capital - +a.properties.capital || b.properties.population - a.properties.population);
        if (usable) drawLabels();
      }
    }).catch(() => { /* Retain the base map and selectable event markers without place labels. */ });
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(box.current);
    return () => {
      controller.abort();
      window.clearTimeout(deadline);
      resize.disconnect();
      clearLabels();
      instance.current = null;
      applyGeography.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = instance.current;
    if (!map) return;
    const entries = markers.map((entry, index) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "x1-map-marker is-" + entry.tone;
      element.setAttribute("aria-label", entry.label);
      element.setAttribute("aria-pressed", String(selected === entry.id));
      element.title = entry.label;
      element.onclick = entry.onSelect;
      const point = mapFocus(entry);
      const samePosition = markers.slice(0, index).filter(({ lat, lon }) => lat === entry.lat && lon === entry.lon).length;
      return new Marker({ element, offset: [samePosition * 14, 0] }).setLngLat([point.lon, point.lat]).addTo(map);
    });
    return () => entries.forEach((marker) => marker.remove());
  }, [markers, selected]);

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
