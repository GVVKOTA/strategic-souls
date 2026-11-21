"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ArrowUpRight, UserPlus } from "lucide-react";
import { api } from "./shared";
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import {
  X2_INSTRUMENTS,
  searchCanonicalInstruments,
  type SearchableInstrument,
} from "../../../backend/services/market-data/instrument-registry";

type SocialResults = {
  bodies: { handle: string; displayName: string; bio?: string }[];
  groups: { id: string; name: string; handle?: string }[];
  souls: { id: string; title: string; authorHandle?: string }[];
  callerHasBody?: boolean;
  callerDiscoverable?: boolean;
};

type RemoteInstrumentResponse = {
  source?: string;
  accessScope?: string;
  instruments?: SearchableInstrument[];
};

const SCOPE_OPTIONS = [
  { id: "all", label: "All" },
  { id: "assets", label: "All Assets" },
  { id: "stocks", label: "Stocks" },
  { id: "indices", label: "Indices" },
  { id: "futures", label: "Futures" },
  { id: "currencies", label: "FX & Yields" },
  { id: "bodies", label: "Researchers (@handle)" },
  { id: "groups", label: "Research Rooms" },
  { id: "souls", label: "Souls" },
] as const;

export default function UniversalSearch({
  data,
  authenticated = false,
  onAsset,
  onCommunity,
}: {
  data: MarketSnapshot | null;
  authenticated?: boolean;
  onAsset: (id: string) => void;
  onCommunity: (query: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [scope, setScope] = useState<string>("all"),
    [social, setSocial] = useState<SocialResults | null>(null),
    [remoteAssets, setRemoteAssets] = useState<SearchableInstrument[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [activeIndex, setActiveIndex] = useState(-1);
  const [registry, setRegistry] = useState<SearchableInstrument[]>([
    ...X2_INSTRUMENTS,
  ]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    const load = () =>
      api<{ instruments: SearchableInstrument[] }>(
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
  }, [authenticated]);

  const q = query.trim();

  // Debounced server-side instrument discovery (/api/market/instruments) with AbortController
  useEffect(() => {
    const cleanQ = q.replace(/^@/, "");
    if (
      cleanQ.length < 2 ||
      ["bodies", "groups", "souls"].includes(scope) ||
      q.startsWith("@")
    ) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(
        "/api/market/instruments?q=" +
          encodeURIComponent(cleanQ) +
          "&limit=20",
        {
          cache: "no-store",
          signal: controller.signal,
        },
      )
        .then((res) => (res.ok ? (res.json() as Promise<RemoteInstrumentResponse>) : null))
        .then((payload) => {
          if (!controller.signal.aborted && Array.isArray(payload?.instruments)) {
            setRemoteAssets(payload.instruments);
          }
        })
        .catch(() => {
          /* Local canonical registry remains active on network/offline errors. */
        });
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, scope]);

  const connectedIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of [...(data?.quotes || []), ...(data?.yields || [])]) {
      set.add(item.id.toUpperCase());
    }
    const marketQuotes = (data as { marketQuotes?: { id: string }[] } | null)?.marketQuotes;
    if (Array.isArray(marketQuotes)) {
      for (const mq of marketQuotes) set.add(mq.id.toUpperCase());
    }
    return set;
  }, [data]);

  const assets = useMemo(() => {
    if (!q || q.startsWith("@") || ["bodies", "groups", "souls"].includes(scope)) {
      return [];
    }
    const livePoints: SearchableInstrument[] = [
      ...(data?.quotes || []),
      ...(data?.yields || []),
    ].map((x) => ({
      id: x.id,
      label: x.id.split(":")[1] ?? x.id,
      name: x.label,
      market: x.provider,
      assetClass: x.assetClass,
      currency: x.currency ?? undefined,
      availabilityState: "DATA_CONNECTED" as const,
    }));

    const combined: SearchableInstrument[] = [
      ...remoteAssets,
      ...livePoints,
      ...registry,
      ...X2_INSTRUMENTS,
    ];

    const classFilter =
      scope === "stocks"
        ? "EQUITY"
        : scope === "indices"
          ? "INDEX"
          : scope === "futures"
            ? "FUTURE"
            : undefined;

    const ranked = searchCanonicalInstruments(q, combined, {
      limit: 12,
      assetClass: classFilter,
    });

    if (scope === "currencies") {
      return ranked.filter((x) =>
        ["FX", "BOND_YIELD"].includes((x.assetClass ?? x.segment ?? "").toUpperCase()) ||
        x.id.startsWith("ECB:") ||
        x.id.startsWith("UST:"),
      );
    }
    return ranked;
  }, [data, q, registry, remoteAssets, scope]);

  useEffect(() => {
    const socialScopes = ["all", "bodies", "groups", "souls"];
    if (!authenticated || q.length < 1 || !socialScopes.includes(scope)) {
      return;
    }
    const cleanSocialQ = q.replace(/^@/, "").trim();
    if (cleanSocialQ.length < 1) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      const socialKind = ["bodies", "groups", "souls"].includes(scope)
        ? scope
        : "all";
      api<SocialResults>(
        "/api/x2/social?view=search&q=" +
          encodeURIComponent(cleanSocialQ) +
          "&kind=" +
          socialKind,
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
    }, 170);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [authenticated, q, scope]);

  const updateQuery = (value: string) => {
    setQuery(value);
    setActiveIndex(-1);
    if (!value.trim()) {
      setSocial(null);
      setRemoteAssets([]);
      setBusy(false);
      setError("");
    }
  };

  const actionableItems = useMemo(() => {
    const list: { key: string; run: () => void }[] = [];
    for (const a of assets) {
      list.push({
        key: `asset:${a.id}`,
        run: () => {
          onAsset(a.id);
          updateQuery("");
        },
      });
    }
    for (const b of social?.bodies ?? []) {
      list.push({
        key: `body:${b.handle}`,
        run: () => {
          onCommunity("@" + b.handle);
          updateQuery("");
        },
      });
    }
    for (const g of social?.groups ?? []) {
      list.push({
        key: `group:${g.id}`,
        run: () => {
          onCommunity(g.name);
          updateQuery("");
        },
      });
    }
    for (const s of social?.souls ?? []) {
      list.push({
        key: `soul:${s.id}`,
        run: () => {
          onCommunity(s.title);
          updateQuery("");
        },
      });
    }
    return list;
  }, [assets, onAsset, onCommunity, social]);

  function availabilityLabel(item: SearchableInstrument): string {
    const id = item.id.toUpperCase();
    if (connectedIds.has(id) || id.startsWith("ECB:") || id.startsWith("UST:")) {
      return "Daily reference connected";
    }
    if (item.availabilityState === "DATA_CONNECTED") {
      return "Owner broker feed connected";
    }
    if (
      item.mappingStatus === "CONTRACT_SELECTION_REQUIRED" ||
      item.availabilityState === "CONTRACT_SELECTION_REQUIRED"
    ) {
      return "Dated contract selection";
    }
    return "Identity verified · market data not connected";
  }

  const totalCount =
    assets.length +
    (social?.bodies.length ?? 0) +
    (social?.groups.length ?? 0) +
    (social?.souls.length ?? 0);

  return (
    <div className="x2-omnisearch" ref={containerRef}>
      <Search size={18} />
      <input
        aria-label="Universal search"
        placeholder="Search HDFC, SBIN, NIFTY, GOLD, @handle, Rooms, Souls…"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => updateQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            updateQuery("");
            return;
          }
          if (!q || !actionableItems.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % actionableItems.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) =>
              prev <= 0 ? actionableItems.length - 1 : prev - 1,
            );
          } else if (e.key === "Enter" && activeIndex >= 0 && actionableItems[activeIndex]) {
            e.preventDefault();
            actionableItems[activeIndex].run();
          }
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
          <div className="x2-scope">
            <span>
              Search scope ({totalCount} {totalCount === 1 ? "match" : "matches"})
            </span>
            <select
              aria-label="Search scope"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setActiveIndex(-1);
                setSocial(null);
                setBusy(false);
                setError("");
              }}
            >
              {SCOPE_OPTIONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>

          {assets.map((x, idx) => {
            const marketBadge = (
              x.market ??
              x.exchange ??
              x.id.split(":")[0] ??
              "ASSET"
            ).toUpperCase();
            const classBadge = (
              x.assetClass ??
              x.segment ??
              "INSTRUMENT"
            ).toUpperCase();
            return (
              <button
                key={x.id}
                data-active={activeIndex === idx ? "true" : undefined}
                onClick={() => {
                  onAsset(x.id);
                  updateQuery("");
                }}
              >
                <span>
                  <strong>{x.name}</strong>
                  <small>
                    {x.id} · {marketBadge} {classBadge} · {availabilityLabel(x)}
                  </small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            );
          })}

          {social?.bodies.map((x, i) => {
            const idx = assets.length + i;
            return (
              <button
                key={x.handle}
                data-active={activeIndex === idx ? "true" : undefined}
                onClick={() => {
                  onCommunity("@" + x.handle);
                  updateQuery("");
                }}
              >
                <span>
                  <strong>@{x.handle}</strong>
                  <small>{x.displayName} · Discoverable researcher</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            );
          })}

          {social?.groups.map((x, i) => {
            const idx = assets.length + (social?.bodies.length ?? 0) + i;
            return (
              <button
                key={x.id}
                data-active={activeIndex === idx ? "true" : undefined}
                onClick={() => {
                  onCommunity(x.name);
                  updateQuery("");
                }}
              >
                <span>
                  <strong>{x.name}</strong>
                  <small>Discoverable Research Room</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            );
          })}

          {social?.souls.map((x, i) => {
            const idx =
              assets.length +
              (social?.bodies.length ?? 0) +
              (social?.groups.length ?? 0) +
              i;
            return (
              <button
                key={x.id}
                data-active={activeIndex === idx ? "true" : undefined}
                onClick={() => {
                  onCommunity(x.title);
                  updateQuery("");
                }}
              >
                <span>
                  <strong>{x.title}</strong>
                  <small>Shared Soul · Research Room</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            );
          })}

          {authenticated &&
            social?.callerHasBody === false &&
            (q.startsWith("@") || ["bodies", "groups", "souls"].includes(scope)) && (
              <button
                type="button"
                onClick={() => {
                  onCommunity(q);
                  updateQuery("");
                }}
              >
                <span>
                  <strong>Set your @handle in Profile to search researchers</strong>
                  <small>
                    Community researcher discovery requires your own @handle profile.
                  </small>
                </span>
                <UserPlus size={14} />
              </button>
            )}

          {busy && <p role="status">Searching permitted research…</p>}
          {error && <p role="status">{error}</p>}
          {!busy &&
            !assets.length &&
            !social?.bodies.length &&
            !social?.groups.length &&
            !social?.souls.length && (
              <p>
                {q.startsWith("@") || scope === "bodies"
                  ? `No discoverable profile matched "${q}". Profiles stay private unless the researcher enables discovery in Settings.`
                  : `No matching instrument or permitted research found for "${q}".`}
              </p>
            )}
          <small>
            Instrument identity discovery is separate from live price access.
            Opted-out profiles and private rooms stay hidden.
          </small>
        </div>
      )}
    </div>
  );
}
