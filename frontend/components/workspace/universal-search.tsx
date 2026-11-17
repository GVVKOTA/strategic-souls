"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, X, ArrowUpRight } from "lucide-react";
import { api } from "./shared";
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import { X2_INSTRUMENTS } from "../../../backend/services/market-data/instrument-registry";
type SocialResults = {
  bodies: { handle: string; displayName: string }[];
  groups: { id: string; name: string }[];
  souls: { id: string; title: string }[];
};
export default function UniversalSearch({
  data,
  onAsset,
  onCommunity,
}: {
  data: MarketSnapshot | null;
  onAsset: (id: string) => void;
  onCommunity: (query: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [scope, setScope] = useState("all"),
    [social, setSocial] = useState<SocialResults | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [registry, setRegistry] = useState<{ id: string; name: string }[]>([
    ...X2_INSTRUMENTS,
  ]);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<{ instruments: { id: string; name: string }[] }>(
        "/api/x2/data?view=instruments",
      )
        .then((r) => {
          if (active && Array.isArray(r.instruments))
            setRegistry(r.instruments);
        })
        .catch(() => {});
    load();
    window.addEventListener("x2-data-updated", load);
    return () => {
      active = false;
      window.removeEventListener("x2-data-updated", load);
    };
  }, []);
  const q = query.trim();
  const assets = useMemo(() => {
    const all = [...(data?.quotes || []), ...(data?.yields || [])]
      .map((x) => ({ id: x.id, name: x.label }))
      .concat(registry);
    return all
      .filter(
        (x, i, a) =>
          a.findIndex((v) => v.id === x.id) === i &&
          (x.id + " " + x.name).toLowerCase().includes(q.toLowerCase()),
      )
      .slice(0, 8);
  }, [data, q, registry]);
  useEffect(() => {
    if (q.length < 2 || scope === "assets") {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      api<SocialResults>(
        "/api/x2/social?view=search&q=" +
          encodeURIComponent(q.replace(/^@/, "")) +
          "&kind=" +
          scope,
        undefined,
        { signal: controller.signal },
      )
        .then(setSocial)
        .catch(() => {
          if (!controller.signal.aborted)
            setError(
              "Community search is unavailable. Open Community to review your profile settings.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, scope]);
  const updateQuery = (value: string) => {
    setQuery(value);
    setSocial(null);
    setBusy(false);
    setError("");
  };
  return (
    <div className="x2-omnisearch">
      <Search size={18} />
      <input
        aria-label="Universal search"
        placeholder="Search assets, @Bodies, Souls…"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => updateQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") updateQuery("");
        }}
      />
      {q && (
        <button aria-label="Clear search" onClick={() => updateQuery("")}>
          <X size={16} />
        </button>
      )}
      {q && (
        <div
          className="x2-search-results"
          role="region"
          aria-label="Universal search results"
        >
          <label className="x2-scope">
            Search scope
            <select
              aria-label="Search scope"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setSocial(null);
                setBusy(false);
                setError("");
              }}
            >
              {["all", "assets", "bodies", "groups", "souls"].map((x) => (
                <option key={x} value={x}>
                  {x[0].toUpperCase() + x.slice(1)}
                </option>
              ))}
            </select>
          </label>
          {["all", "assets"].includes(scope) &&
            assets.map((x) => (
              <button
                key={x.id}
                onClick={() => {
                  onAsset(x.id);
                  updateQuery("");
                }}
              >
                <span>
                  <strong>{x.name}</strong>
                  <small>Asset · {x.id}</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          {social?.bodies.map((x) => (
            <button
              key={x.handle}
              onClick={() => {
                onCommunity("@" + x.handle);
                updateQuery("");
              }}
            >
              <span>
                <strong>@{x.handle}</strong>
                <small>{x.displayName} · Body</small>
              </span>
            </button>
          ))}
          {social?.groups.map((x) => (
            <button
              key={x.id}
              onClick={() => {
                onCommunity(x.name);
                updateQuery("");
              }}
            >
              <span>
                <strong>{x.name}</strong>
                <small>Group</small>
              </span>
            </button>
          ))}
          {social?.souls.map((x) => (
            <button
              key={x.id}
              onClick={() => {
                onCommunity(x.title);
                updateQuery("");
              }}
            >
              <span>
                <strong>{x.title}</strong>
                <small>Soul · permitted research</small>
              </span>
            </button>
          ))}
          {busy && <p role="status">Searching permitted research…</p>}
          {error && <p role="status">{error}</p>}
          {!busy &&
            !assets.length &&
            !social?.bodies.length &&
            !social?.groups.length &&
            !social?.souls.length && <p>No permitted results.</p>}
          <small>Private content and opted-out profiles are excluded.</small>
        </div>
      )}
    </div>
  );
}
