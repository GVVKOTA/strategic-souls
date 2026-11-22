"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  X,
  ArrowUpRight,
  UserPlus,
  Clock,
  Star,
  Trash2,
} from "lucide-react";
import { api } from "./shared";
import type { MarketSnapshot } from "../../../backend/services/market-data/market-data";
import {
  X2_INSTRUMENTS,
  searchCanonicalInstruments,
  type SearchableInstrument,
} from "../../../backend/services/market-data/instrument-registry";
import type {
  SearchHistoryEntry,
  SearchHistoryState,
} from "../../../backend/services/user/preferences-store";

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

const GUEST_HISTORY_KEY = "ss-x52-guest-search-history-v1";

function loadGuestHistory(): SearchHistoryState {
  try {
    const raw = window.localStorage.getItem(GUEST_HISTORY_KEY);
    if (!raw) return { recents: [], favorites: [], optedOut: false, updatedAt: null };
    const parsed = JSON.parse(raw) as Partial<SearchHistoryState>;
    return {
      recents: Array.isArray(parsed.recents) ? parsed.recents.slice(0, 12) : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.slice(0, 12) : [],
      optedOut: parsed.optedOut === true,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return { recents: [], favorites: [], optedOut: false, updatedAt: null };
  }
}

function saveGuestHistory(next: SearchHistoryState) {
  try {
    window.localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* Storage optional */
  }
}

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
    [focused, setFocused] = useState(false),
    [scope, setScope] = useState<string>("all"),
    [social, setSocial] = useState<SocialResults | null>(null),
    [remoteAssets, setRemoteAssets] = useState<SearchableInstrument[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [activeIndex, setActiveIndex] = useState(-1),
    [history, setHistory] = useState<SearchHistoryState>({
      recents: [],
      favorites: [],
      optedOut: false,
      updatedAt: null,
    });
  const [registry, setRegistry] = useState<SearchableInstrument[]>([
    ...X2_INSTRUMENTS,
  ]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Load Smart Search History [11]
  useEffect(() => {
    let active = true;
    if (authenticated) {
      api<SearchHistoryState>("/api/search/history")
        .then((res) => {
          if (active) setHistory(res);
        })
        .catch(() => {
          /* Ignore transient failure */
        });
    } else {
      queueMicrotask(() => {
        if (active) setHistory(loadGuestHistory());
      });
    }
    return () => {
      active = false;
    };
  }, [authenticated]);

  const recordSearch = useCallback(
    (entry: Omit<SearchHistoryEntry, "id" | "savedAt">) => {
      const nowIso = new Date().toISOString();
      const full: SearchHistoryEntry = {
        ...entry,
        id: `${entry.kind}:${entry.target.toLowerCase()}`,
        savedAt: nowIso,
      };
      if (history.optedOut) return;
      if (!authenticated) {
        setHistory((prev) => {
          const next: SearchHistoryState = {
            ...prev,
            recents: [full, ...prev.recents.filter((r) => r.id !== full.id)].slice(0, 12),
            updatedAt: nowIso,
          };
          saveGuestHistory(next);
          return next;
        });
        return;
      }
      setHistory((prev) => ({
        ...prev,
        recents: [full, ...prev.recents.filter((r) => r.id !== full.id)].slice(0, 12),
      }));
      void api<SearchHistoryState & { ok: boolean }>("/api/search/history", {
        action: "record",
        entry: full,
      })
        .then((res) => setHistory(res))
        .catch(() => {});
    },
    [authenticated, history.optedOut],
  );

  const mutateHistory = useCallback(
    async (
      action: "toggle-favorite" | "remove" | "clear" | "set-opt-out",
      payload: Record<string, unknown> = {},
    ) => {
      const nowIso = new Date().toISOString();
      if (!authenticated) {
        setHistory((prev) => {
          let recents = [...prev.recents];
          let favorites = [...prev.favorites];
          let optedOut = prev.optedOut;
          if (action === "toggle-favorite" && payload.entry) {
            const e = payload.entry as SearchHistoryEntry;
            favorites = favorites.some((f) => f.id === e.id)
              ? favorites.filter((f) => f.id !== e.id)
              : [e, ...favorites].slice(0, 12);
          } else if (action === "remove") {
            const eid = String(payload.id ?? "");
            recents = recents.filter((r) => r.id !== eid);
            favorites = favorites.filter((f) => f.id !== eid);
          } else if (action === "clear") {
            recents = [];
          } else if (action === "set-opt-out") {
            optedOut = Boolean(payload.optedOut);
            if (optedOut) recents = [];
          }
          const next = { recents, favorites, optedOut, updatedAt: nowIso };
          saveGuestHistory(next);
          return next;
        });
        return;
      }
      try {
        const res = await api<SearchHistoryState & { ok: boolean }>(
          "/api/search/history",
          { action, ...payload },
        );
        setHistory(res);
      } catch {
        /* Keep local view stable */
      }
    },
    [authenticated],
  );

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
        .then((res) =>
          res.ok ? (res.json() as Promise<RemoteInstrumentResponse>) : null,
        )
        .then((payload) => {
          if (!controller.signal.aborted && Array.isArray(payload?.instruments)) {
            setRemoteAssets(payload.instruments);
          }
        })
        .catch(() => {});
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
    const marketQuotes = (data as { marketQuotes?: { id: string }[] } | null)
      ?.marketQuotes;
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
      return ranked.filter(
        (x) =>
          ["FX", "BOND_YIELD"].includes(
            (x.assetClass ?? x.segment ?? "").toUpperCase(),
          ) ||
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
            setError("Community search is temporarily unavailable.");
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

  const openAssetResult = useCallback(
    (id: string, label: string) => {
      recordSearch({ kind: "ASSET", target: id, label });
      onAsset(id);
      updateQuery("");
      setFocused(false);
    },
    [onAsset, recordSearch],
  );

  const openCommunityResult = useCallback(
    (kind: "BODY" | "GROUP" | "SOUL" | "QUERY", target: string, label: string) => {
      recordSearch({ kind, target, label });
      onCommunity(target);
      updateQuery("");
      setFocused(false);
    },
    [onCommunity, recordSearch],
  );

  const runHistoryEntry = (entry: SearchHistoryEntry) => {
    if (entry.kind === "ASSET") {
      openAssetResult(entry.target, entry.label);
    } else {
      openCommunityResult(entry.kind, entry.target, entry.label);
    }
  };

  const actionableItems = useMemo(() => {
    const list: { key: string; run: () => void }[] = [];
    for (const a of assets) {
      list.push({
        key: `asset:${a.id}`,
        run: () => openAssetResult(a.id, a.name),
      });
    }
    for (const b of social?.bodies ?? []) {
      list.push({
        key: `body:${b.handle}`,
        run: () => openCommunityResult("BODY", "@" + b.handle, "@" + b.handle),
      });
    }
    for (const g of social?.groups ?? []) {
      list.push({
        key: `group:${g.id}`,
        run: () => openCommunityResult("GROUP", g.name, g.name),
      });
    }
    for (const s of social?.souls ?? []) {
      list.push({
        key: `soul:${s.id}`,
        run: () => openCommunityResult("SOUL", s.title, s.title),
      });
    }
    return list;
  }, [assets, openAssetResult, openCommunityResult, social]);

  function availabilityLabel(item: SearchableInstrument): string {
    const id = item.id.toUpperCase();
    if (connectedIds.has(id) || id.startsWith("ECB:") || id.startsWith("UST:")) {
      return "Daily reference";
    }
    if (item.availabilityState === "DATA_CONNECTED") {
      return "Owner feed";
    }
    return "Catalog entry";
  }

  const totalCount =
    assets.length +
    (social?.bodies.length ?? 0) +
    (social?.groups.length ?? 0) +
    (social?.souls.length ?? 0);

  const favIds = useMemo(
    () => new Set(history.favorites.map((f) => f.id)),
    [history.favorites],
  );

  const showHistoryDropdown =
    focused && !q && (history.favorites.length > 0 || history.recents.length > 0 || history.optedOut);

  return (
    <div className="x2-omnisearch" ref={containerRef}>
      <Search size={18} />
      <input
        aria-label="Universal search"
        placeholder="Search HDFC, NIFTY, GOLD, @handle, Rooms, Souls…"
        type="search"
        autoComplete="off"
        value={query}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setFocused(true);
          updateQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            updateQuery("");
            setFocused(false);
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
          } else if (
            e.key === "Enter" &&
            activeIndex >= 0 &&
            actionableItems[activeIndex]
          ) {
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

      {/* [11] Smart Search History & Pinned Favorites when focused with empty query */}
      {showHistoryDropdown && (
        <div
          className="x2-search-results"
          role="region"
          aria-label="Recent searches and favorites"
        >
          {history.favorites.length > 0 && (
            <div>
              <div className="x52-search-history-head">
                <span>Pinned Favorites</span>
              </div>
              {history.favorites.map((entry) => (
                <div key={`fav-${entry.id}`} className="x52-search-history-row">
                  <button
                    type="button"
                    className="x52-search-history-btn"
                    onClick={() => runHistoryEntry(entry)}
                  >
                    <Star size={14} className="is-fav" />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <strong>{entry.label}</strong>{" "}
                      <small className="x1-caption">{entry.target}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="x52-search-icon-mini is-fav"
                    aria-label={`Unpin ${entry.label}`}
                    onClick={() =>
                      void mutateHistory("toggle-favorite", { entry })
                    }
                  >
                    <Star size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!history.optedOut && history.recents.length > 0 && (
            <div>
              <div className="x52-search-history-head">
                <span>Recent Searches</span>
                <button
                  type="button"
                  className="x1-text-button"
                  onClick={() => void mutateHistory("clear")}
                >
                  Clear recents
                </button>
              </div>
              {history.recents.slice(0, 6).map((entry) => {
                const isFav = favIds.has(entry.id);
                return (
                  <div key={`rec-${entry.id}`} className="x52-search-history-row">
                    <button
                      type="button"
                      className="x52-search-history-btn"
                      onClick={() => runHistoryEntry(entry)}
                    >
                      <Clock size={14} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <strong>{entry.label}</strong>{" "}
                        <small className="x1-caption">{entry.target}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={"x52-search-icon-mini" + (isFav ? " is-fav" : "")}
                      aria-label={isFav ? `Unpin ${entry.label}` : `Pin ${entry.label} as favorite`}
                      onClick={() =>
                        void mutateHistory("toggle-favorite", { entry })
                      }
                    >
                      <Star size={14} />
                    </button>
                    <button
                      type="button"
                      className="x52-search-icon-mini"
                      aria-label={`Remove ${entry.label} from recents`}
                      onClick={() =>
                        void mutateHistory("remove", { id: entry.id })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="x52-search-history-head" style={{ borderTop: "1px solid var(--x51-hairline)", paddingTop: 8 }}>
            <span>
              {history.optedOut
                ? "Search history paused"
                : authenticated
                  ? "Private to your account"
                  : "Stored locally on this device"}
            </span>
            <button
              type="button"
              className="x1-text-button"
              onClick={() =>
                void mutateHistory("set-opt-out", {
                  optedOut: !history.optedOut,
                })
              }
            >
              {history.optedOut ? "Resume history" : "Pause history"}
            </button>
          </div>
        </div>
      )}

      {q && (
        <div
          className="x2-search-results"
          role="region"
          aria-label="Universal search results"
        >
          <div className="x2-scope">
            <span>
              {totalCount} {totalCount === 1 ? "match" : "matches"}
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
            const entryId = `ASSET:${x.id.toLowerCase()}`;
            const isFav = favIds.has(entryId);
            return (
              <div
                key={x.id}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <button
                  style={{ flex: 1 }}
                  data-active={activeIndex === idx ? "true" : undefined}
                  onClick={() => openAssetResult(x.id, x.name)}
                >
                  <span>
                    <strong>{x.name}</strong>
                    <small>
                      {x.id} · {marketBadge} · {availabilityLabel(x)}
                    </small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
                <button
                  type="button"
                  className={"x52-search-icon-mini" + (isFav ? " is-fav" : "")}
                  aria-label={isFav ? `Unpin ${x.name}` : `Pin ${x.name}`}
                  onClick={() =>
                    void mutateHistory("toggle-favorite", {
                      entry: {
                        id: entryId,
                        kind: "ASSET",
                        target: x.id,
                        label: x.name,
                        savedAt: new Date().toISOString(),
                      },
                    })
                  }
                >
                  <Star size={14} />
                </button>
              </div>
            );
          })}

          {social?.bodies.map((x, i) => {
            const idx = assets.length + i;
            return (
              <button
                key={x.handle}
                data-active={activeIndex === idx ? "true" : undefined}
                onClick={() =>
                  openCommunityResult("BODY", "@" + x.handle, "@" + x.handle)
                }
              >
                <span>
                  <strong>@{x.handle}</strong>
                  <small>{x.displayName} · Researcher</small>
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
                onClick={() => openCommunityResult("GROUP", x.name, x.name)}
              >
                <span>
                  <strong>{x.name}</strong>
                  <small>Research Room</small>
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
                onClick={() => openCommunityResult("SOUL", x.title, x.title)}
              >
                <span>
                  <strong>{x.title}</strong>
                  <small>Shared Soul</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            );
          })}

          {authenticated &&
            social?.callerHasBody === false &&
            (q.startsWith("@") ||
              ["bodies", "groups", "souls"].includes(scope)) && (
              <button
                type="button"
                onClick={() => openCommunityResult("QUERY", q, q)}
              >
                <span>
                  <strong>Set your Body ID in Profile to search researchers</strong>
                  <small>Requires an @handle in Profile settings.</small>
                </span>
                <UserPlus size={14} />
              </button>
            )}

          {busy && <p role="status">Searching…</p>}
          {error && <p role="status">{error}</p>}
          {!busy &&
            !assets.length &&
            !social?.bodies.length &&
            !social?.groups.length &&
            !social?.souls.length && (
              <p>No matching instrument or permitted research found for “{q}”.</p>
            )}
        </div>
      )}
    </div>
  );
}
