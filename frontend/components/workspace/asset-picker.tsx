"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { scoreCanonicalInstrument, type SearchableInstrument } from "../../../backend/services/market-data/instrument-registry";
import { api, Modal } from "./shared";

export type CatalogInstrument = SearchableInstrument & { category: string; inWatchlist: boolean };
const CATEGORIES = ["All", "Stocks", "Indices", "Sectors", "Commodities", "Forex", "ETFs", "Watchlist"];

export function useAssetCatalog(enabled: boolean) {
  const [instruments, setInstruments] = useState<CatalogInstrument[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void api<{ instruments: CatalogInstrument[] }>("/api/compare?catalog=1", undefined, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setInstruments(value.instruments); })
      .catch(() => { if (!controller.signal.aborted) setError("Instrument catalog unavailable. Reopen this tool to retry."); });
    return () => controller.abort();
  }, [enabled]);
  return { instruments, error };
}

export function AssetPicker({ label, value, onChange, instruments, onlySectors = false }: {
  label: string; value: string; onChange: (id: string) => void;
  instruments: CatalogInstrument[]; onlySectors?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [visible, setVisible] = useState(30);
  const queryId = useId();
  const selected = instruments.find((item) => item.id === value);
  const source = useMemo(() => instruments.filter((item) => !onlySectors || item.category === "Sectors"), [instruments, onlySectors]);
  const results = useMemo(() => source
    .filter((item) => category === "All" || (category === "Watchlist" ? item.inWatchlist : item.category === category))
    .map((item) => ({ item, score: scoreCanonicalInstrument(query, item) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)), [source, query, category]);
  const categories = CATEGORIES.filter((item) => item === "All" || source.some((row) =>
    item === "Watchlist" ? row.inWatchlist : row.category === item));
  return (
    <div style={{ minWidth: 0 }}>
      <span className="x1-caption">{label}</span>
      <button type="button" className="x1-secondary" aria-label={label + ": " + (selected?.name ?? value ?? "")}
        aria-haspopup="dialog" onClick={() => { setQuery(""); setCategory("All"); setVisible(30); setOpen(true); }}
        style={{ width: "100%", minHeight: 44, justifyContent: "flex-start", textAlign: "left" }}>
        {selected?.name || value.split(":").at(-1) || "Choose an instrument"}
      </button>
      {open && <Modal title={label} onClose={() => setOpen(false)}>
        <div className="x1-form">
          <label htmlFor={queryId}>Search ticker, name or exchange</label>
          <input id={queryId} type="search" autoFocus value={query}
            onChange={(event) => { setQuery(event.target.value); setVisible(30); }} />
          {!onlySectors && <div className="x1-actions" aria-label="Asset categories">{categories.map((item) =>
            <button key={item} type="button" className="x1-secondary" aria-pressed={category === item}
              onClick={() => { setCategory(item); setVisible(30); }}>{item}</button>)}</div>}
          <p className="x1-caption" role="status">{results.length} instruments</p>
          <div className="x1-form" style={{ maxHeight: "48dvh", overflowY: "auto" }}>
            {results.slice(0, visible).map(({ item }) => <button key={item.id} type="button" className="x1-secondary"
              aria-pressed={value === item.id} style={{ minHeight: 44, textAlign: "left", display: "grid", justifyContent: "start" }}
              onClick={() => { onChange(item.id); setOpen(false); }}>
              <strong>{item.name}</strong>
              <small>{[item.label ?? item.id.split(":").at(-1), item.market, item.currency,
                item.expiry, item.availabilityState === "ENTITLEMENT_REQUIRED" ? "History access required" : null].filter(Boolean).join(" · ")}</small>
            </button>)}
            {visible < results.length && <button type="button" className="x1-secondary" onClick={() => setVisible(visible + 30)}>Show more</button>}
          </div>
        </div>
      </Modal>}
    </div>
  );
}
