"use client";
import { useEffect, useRef, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import type {
  ProviderConfig,
  ProviderHealth,
  ProviderId,
} from "../../../backend/services/market-data/data-types";
import type { MarketHealthResponse } from "../../../backend/services/market-data/angelone/types";
import { fetchMarketHealth, submitManualTotpUnlock } from "./private-market-client";
type ProviderView = {
  id: ProviderId;
  label: string;
  secret: string;
  docs: string;
  rightsUrl: string;
  markets: string[];
  datasets: string[];
  secretConfigured: boolean;
  secretSource?: "MARKET_DATA_API_KEY" | "PROVIDER_SECRET" | "MISSING";
  config: ProviderConfig | null;
  health: ProviderHealth;
};
type SharedIngestionRow = {
  provider: string;
  config_version: number;
  last_error: string | null;
  paused_until: number;
  mapped_intervals: number;
  fetched_intervals: number;
  due_intervals: number;
  oldest_checked: number | null;
  newest_checked: number | null;
};
type Settings = {
  isOwner: boolean;
  providers: ProviderView[];
  canonicalSecret?: {
    providerTarget: ProviderId | null;
    keyConfigured: boolean;
  };
  sharedIngestion?: SharedIngestionRow[];
  universe?: {
    version: string;
    effectiveDate: string;
    validatedAt: string;
    expectedCount: number;
    distinctCount: number;
    count: number;
    rightsExpiresAt: string;
    provenance: string;
  } | null;
  secretSetup: string;
  audit: {
    provider: string;
    action: string;
    version: number;
    created_at: string;
  }[];
};
const mappingTemplate = JSON.stringify(
  [
    {
      id: "NSE:SBIN",
      name: "State Bank of India",
      symbol: "SBIN",
      providerSymbol: "REPLACE_WITH_VERIFIED_VENDOR_SYMBOL",
      market: "NSE",
      mic: "XNSE",
      type: "EQUITY",
      currency: "INR",
      unit: "INR per share",
      timezone: "Asia/Kolkata",
    },
  ],
  null,
  2,
);
async function request<T>(body?: unknown): Promise<T> {
  const ctrl = new AbortController(),
    timeout = setTimeout(() => ctrl.abort(), 45000);
  try {
    const response = await fetch(
        "/api/x2/providers",
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: ctrl.signal,
            }
          : { signal: ctrl.signal },
      ),
      data = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(data.error ?? "Data control unavailable.");
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}
export default function DataControl({
  notify,
}: {
  notify?: (text: string, error?: boolean) => void;
}) {
  const [state, setState] = useState<Settings | null>(null),
    [selected, setSelected] = useState<ProviderId>("TRUEDATA"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("Loading"),
    [mapping, setMapping] = useState(mappingTemplate),
    [sharedGrant, setSharedGrant] = useState(""),
    [useNiftyUniverse, setUseNiftyUniverse] = useState(false),
    [includeBharatStockIndices, setIncludeBharatStockIndices] = useState(false),
    [universeFile, setUniverseFile] = useState<File | null>(null),
    [universeImportBusy, setUniverseImportBusy] = useState(false),
    [universeStatus, setUniverseStatus] = useState(""),
    [rightsConfirmed, setRightsConfirmed] = useState(false),
    [contract, setContract] = useState(""),
    [expiry, setExpiry] = useState(""),
    [priority, setPriority] = useState(1),
    [quota, setQuota] = useState(20),
    [cache, setCache] = useState(0),
    [rights, setRights] = useState({
      display: false,
      analysis: false,
      storage: false,
      redistribution: false,
      derivedDisplay: false,
      verified: false,
    }),
    [datasets, setDatasets] = useState<string[]>(["candles"]),
    [enabled, setEnabled] = useState(false),
    [brokerHealth, setBrokerHealth] = useState<MarketHealthResponse | null>(null),
    [totpCode, setTotpCode] = useState(""),
    [totpBusy, setTotpBusy] = useState(false);
  const active = useRef(false),
    key = useRef<string | null>(null);
  const current = state?.providers.find((p) => p.id === selected);
  async function importUniverse(event: React.FormEvent) {
    event.preventDefault();
    if (!universeFile || !rightsConfirmed || universeImportBusy) return;
    if (universeFile.size > 190_000) {
      setUniverseStatus("The JSON snapshot exceeds 190 KB.");
      return;
    }
    setUniverseImportBusy(true);
    setUniverseStatus("");
    try {
      const snapshot = JSON.parse(await universeFile.text()) as Record<string, unknown>;
      const response = await fetch("/api/strategy/universe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...snapshot, rightsConfirmed: true }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json()) as {
        count?: number;
        version?: string;
        active?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Snapshot import failed.");
      setUniverseStatus(
        (result.active ? "Active" : "Saved historical") +
          " snapshot · " +
          result.count +
          " constituents · " +
          (result.version ?? "").slice(0, 12),
      );
      setState(await request<Settings>());
      window.dispatchEvent(new Event("x2-data-updated"));
    } catch (err) {
      setUniverseStatus((err as Error).message);
    } finally {
      setUniverseImportBusy(false);
    }
  }
  useEffect(() => {
    let alive = true;
    fetchMarketHealth()
      .then((h) => {
        if (alive) setBrokerHealth(h);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  async function unlockAngelSession(e: React.FormEvent) {
    e.preventDefault();
    if (totpBusy) return;
    setTotpBusy(true);
    setError("");
    try {
      await submitManualTotpUnlock(totpCode.trim());
      setTotpCode("");
      setBrokerHealth(await fetchMarketHealth());
      window.dispatchEvent(new Event("x2-data-updated"));
      notify?.("Exchange read-only feed session authenticated in memory.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTotpBusy(false);
    }
  }
  useEffect(() => {
    let alive = true;
    request<Settings>()
      .then((v) => {
        if (alive) setState(v);
      })
      .catch((e) => {
        if (alive)
          setError(
            e.name === "AbortError" ? "Settings request timed out." : e.message,
          );
      })
      .finally(() => {
        if (alive) setBusy("");
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const c = current?.config;
    queueMicrotask(() => {
      setMapping(c ? JSON.stringify(c.instruments, null, 2) : mappingTemplate);
      setSharedGrant(c?.sharedHistory ? JSON.stringify(c.sharedHistory, null, 2) : "");
      setUseNiftyUniverse(false);
      setIncludeBharatStockIndices(false);
      setContract(c?.rights.contractReference ?? "");
      setExpiry(c?.rights.expiresAt.slice(0, 10) ?? "");
      setPriority(c?.priority ?? 1);
      setQuota(c?.dailyCallLimit ?? 20);
      setCache(c?.rights.cacheSeconds ?? 0);
      setRights(
        c
          ? {
              display: c.rights.display,
              analysis: c.rights.analysis,
              storage: c.rights.storage,
              redistribution: c.rights.redistribution,
              derivedDisplay: c.rights.derivedDisplay === true,
              verified: c.rights.verified,
            }
          : {
              display: false,
              analysis: false,
              storage: false,
              redistribution: false,
              derivedDisplay: false,
              verified: false,
            },
      );
      setDatasets(c?.datasets ?? [selected === "INDIANAPI" ? "prices" : "candles"]);
      setEnabled(c?.enabled ?? false);
      key.current = null;
    });
  }, [selected, current?.config]);
  async function run(op: "configure" | "test" | "refresh-history") {
    if (active.current) return;
    active.current = true;
    setBusy(
      op === "test"
        ? "Testing source…"
        : op === "refresh-history"
          ? "Refreshing shared history…"
          : "Saving configuration…",
    );
    setError("");
    try {
      let payload: unknown;
      if (op === "configure") {
        let instruments;
        try {
          instruments = useNiftyUniverse ? [] : JSON.parse(mapping);
        } catch {
          throw new Error("Instrument mappings must be a JSON array.");
        }
        let sharedHistory;
        if (sharedGrant.trim()) {
          try {
            sharedHistory = JSON.parse(sharedGrant);
          } catch {
            throw new Error("Shared-history authorization must be valid JSON.");
          }
        }
        key.current ??= crypto.randomUUID();
        payload = {
          op,
          ...(useNiftyUniverse ? { useNiftyUniverse: true } : {}),
          ...(selected === "BHARATSTOCK" && useNiftyUniverse && includeBharatStockIndices
            ? { includeBharatStockIndices: true }
            : {}),
          config: {
            provider: selected,
            version: current?.config?.version ?? 0,
            lastWrite: key.current,
            enabled,
            priority,
            dailyCallLimit: quota,
            instruments,
            datasets,
            ...(sharedHistory ? { sharedHistory } : {}),
            rights: {
              ...rights,
              cacheSeconds: cache,
              contractReference: contract,
              expiresAt: expiry + "T23:59:59.000Z",
            },
          },
        };
      } else if (op === "refresh-history") {
        payload = { op };
      } else payload = { op, provider: selected };
      const response = await request<Settings & { history?: SharedIngestionRow[] }>(payload);
      const result = op === "refresh-history" ? await request<Settings>() : response;
      setState(result);
      window.dispatchEvent(new Event("x2-data-updated"));
      key.current = null;
      notify?.(
        op === "test"
          ? "Source test recorded. Review actual coverage."
          : op === "refresh-history"
            ? "Shared market-data ingestion batch completed."
            : "Provider configuration saved.",
      );
    } catch (e) {
      setError(
        (e as Error).name === "AbortError"
          ? "Request timed out. Check saved status before retrying."
          : (e as Error).message,
      );
    } finally {
      active.current = false;
      setBusy("");
    }
  }
  const edit = () => {
    key.current = null;
  };
  return (
    <section className="x2-data-control" aria-busy={!!busy}>
      <header>
        <h2>Data Connections</h2>
        <details className="x2-inline-help">
          <summary aria-label="About provider entitlements">
            <Info size={17} />
          </summary>
          <p>
            Owner-only controls. A successful key authenticates one provider; it
            does not prove market, display, scanning or redistribution rights.
            Record the actual contract and exact source symbol mapping.
          </p>
        </details>
      </header>
      {error && (
        <p role="alert" className="x2-error">
          {error}
        </p>
      )}
      {brokerHealth && (
        <div className="x2-provider-status" aria-label="Configured Exchange Feed Adapter">
          <strong>
            Configured Exchange Read-Only Feed ·{" "}
            {brokerHealth.adapterReachable ? "REACHABLE" : "OFFLINE / UNCONFIGURED"}
          </strong>
          <span>Mode: {brokerHealth.mode} ({brokerHealth.accessScope})</span>
          <span>Session state: {brokerHealth.authState}</span>
          <span>
            Active segments:{" "}
            {brokerHealth.enabledExchanges.length
              ? brokerHealth.enabledExchanges.join(", ")
              : "None verified yet"}
          </span>
          <span>
            Public quotes gate:{" "}
            {brokerHealth.flags.publicExchangeQuotesEnabled
              ? "ENABLED"
              : "LOCKED OFF (private owner only)"}
          </span>
          <span>
            ScripMaster indexed: {brokerHealth.scripMasterCount ?? "Not loaded"}
          </span>
          <span>
            Last verified fetch: {brokerHealth.lastSuccessfulFetchAt ?? "None yet"}
          </span>
          <p>{brokerHealth.message}</p>
          {brokerHealth.adapterReachable && (
            <form className="x31-totp-form" onSubmit={(e) => void unlockAngelSession(e)}>
              <label>
                Manual 6-digit TOTP (ephemeral, never stored)
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="6-digit TOTP"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </label>
              <button type="submit" disabled={totpBusy || totpCode.length !== 6}>
                {totpBusy ? "Authenticating…" : "Authenticate read-only session"}
              </button>
            </form>
          )}
        </div>
      )}
      {!state ? (
        <p role="status">{busy || "Settings unavailable. Reload to retry."}</p>
      ) : (
        <>
          {state.isOwner && (
            <details className="x2-inline-help">
              <summary>
                Nifty 500 constituent snapshot{" "}
                {state.universe
                  ? `(${state.universe.distinctCount} active · eff. ${state.universe.effectiveDate})`
                  : "(Not imported)"}
              </summary>
              <form className="x1-form" onSubmit={(event) => void importUniverse(event)}>
                <label>
                  Approved constituent snapshot JSON (with rights expiry)
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(event) => setUniverseFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="x2-checkbox">
                  <input
                    type="checkbox"
                    checked={rightsConfirmed}
                    onChange={(event) => setRightsConfirmed(event.target.checked)}
                  />
                  The authorized source permits use and display of these constituent identities.
                </label>
                <button
                  type="submit"
                  disabled={!universeFile || !rightsConfirmed || universeImportBusy}
                >
                  {universeImportBusy ? "Validating snapshot…" : "Import snapshot"}
                </button>
                {universeStatus && <p role="status">{universeStatus}</p>}
              </form>
            </details>
          )}
          <details className="x2-inline-help">
            <summary>Shared history authorization (credit window &amp; cache)</summary>
            <label>
              Verified shared-history grant JSON (leave blank for private/legacy mapping)
              <textarea
                rows={7}
                spellCheck={false}
                value={sharedGrant}
                onChange={(event) => {
                  edit();
                  setSharedGrant(event.target.value);
                }}
              />
            </label>
            <p>
              For derived-only screening grants (e.g. BharatStock Paid Customer Derivatives), keep{" "}
              <code>display</code> and <code>redistribution</code> unchecked while enabling{" "}
              <code>analysis</code>, <code>storage</code>, <code>derivedDisplay</code>, and{" "}
              <code>verified</code>.
            </p>
            <button
              type="button"
              onClick={() => {
                if (sharedGrant.trim()) return;
                edit();
                setSharedGrant(
                  JSON.stringify(
                    {
                      intervals: ["1d"],
                      lagMinutes: 30,
                      retentionHours: 48,
                      dailyLookbackDays: 400,
                      dailyRefreshMinutes: 720,
                      intradayRefreshMinutes: 120,
                      attribution: "REPLACE_WITH_ACTUAL_ATTRIBUTION",
                      attributionUrl: "https://REPLACE_WITH_ACTUAL_DOCS_URL",
                      creditWindow: {
                        startsAt: "REPLACE_WITH_ACTUAL_ISO_START",
                        endsAt: "REPLACE_WITH_ACTUAL_ISO_END",
                        availableCredits: 1,
                        callsPerMinute: 1,
                      },
                    },
                    null,
                    2,
                  ),
                );
              }}
              disabled={!!sharedGrant.trim()}
            >
              Insert schema template
            </button>
          </details>
          <label>
            Implemented provider
            <select
              value={selected}
              disabled={!!busy}
              onChange={(e) => setSelected(e.target.value as ProviderId)}
            >
              {state.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {(selected === "INDIANAPI" || selected === "BHARATSTOCK") && (
            <>
              <label className="x2-checkbox">
                <input
                  type="checkbox"
                  checked={useNiftyUniverse}
                  onChange={(event) => {
                    edit();
                    setUseNiftyUniverse(event.target.checked);
                    if (!event.target.checked) setIncludeBharatStockIndices(false);
                  }}
                />
                Map the current licensed Nifty 500 snapshot as NSE equities
              </label>
              {selected === "BHARATSTOCK" && useNiftyUniverse && (
                <label className="x2-checkbox">
                  <input
                    type="checkbox"
                    checked={includeBharatStockIndices}
                    onChange={(event) => {
                      edit();
                      setIncludeBharatStockIndices(event.target.checked);
                    }}
                  />
                  Also map BharatStock documented NSE indices (NIFTY 50, BANK NIFTY, NIFTY MIDCAP 100)
                </label>
              )}
            </>
          )}
          {state.sharedIngestion && state.sharedIngestion.length > 0 && (
            <div className="x2-provider-status" aria-label="Shared ingestion progress">
              <strong>Shared history scheduler</strong>
              {state.sharedIngestion.map((row) => (
                <span key={`${row.provider}-${row.config_version}`}>
                  {row.provider} v{row.config_version}: {row.fetched_intervals ?? 0}/
                  {row.mapped_intervals} fetched · {row.due_intervals ?? 0} due
                  {row.last_error ? ` · last error: ${row.last_error}` : ""}
                </span>
              ))}
            </div>
          )}
          <div className="x2-provider-status">
            <strong>{current?.health.state.replaceAll("_", " ")}</strong>
            <span>
              Server secret:{" "}
              {current?.secretConfigured
                ? current.secretSource === "MARKET_DATA_API_KEY"
                  ? "Configured (MARKET_DATA_API_KEY)"
                  : "Configured (provider secret)"
                : "Not configured"}
            </span>
            {state.canonicalSecret && (
              <span>
                Canonical single-key binding:{" "}
                {state.canonicalSecret.keyConfigured && state.canonicalSecret.providerTarget
                  ? `MARKET_DATA_API_KEY → ${state.canonicalSecret.providerTarget}`
                  : "Not set (set MARKET_DATA_PROVIDER + MARKET_DATA_API_KEY for one-key rotation)"}
              </span>
            )}
            <span>Checked: {current?.health.checkedAt ?? "Never"}</span>
            <span>
              Latest accepted event:{" "}
              {current?.health.lastEventAt ?? "Unavailable"}
            </span>
            <span>
              Recorded calls / local cap: {current?.health.callsToday ?? 0} /{" "}
              {current?.config?.dailyCallLimit ?? quota}
            </span>
            <span>
              Remaining local allowance: {current?.health.quotaRemaining ?? 0}
            </span>
            <span>
              Provider billing quota: not exposed by the implemented endpoint
            </span>
            <p>{current?.health.message}</p>
          </div>
          <details open>
            <summary>1 · Secure secret setup</summary>
            <p>
              Configure server-only secrets in Cloudflare Workers Settings →
              Variables and Secrets (or via <code>wrangler secret put</code>).
              Set the server-only secret <code>{current?.secret}</code>. This
              page never accepts, stores or returns a provider key.
            </p>
            <p>
              For TrueData this is a current historical-service Bearer token;
              automatic credential/login-token refresh is not claimed. For EODHD
              use an approved commercial API token. Runtime secret changes take
              effect on the updated Worker deployment; this page tests the
              configuration currently running.
            </p>
            <a href={current?.docs} target="_blank" rel="noopener noreferrer">
              Official endpoint documentation
            </a>{" "}
            ·{" "}
            <a
              href={current?.rightsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Provider licensing
            </a>
            <p>
              Supported markets: {current?.markets.join(", ")}. Supported
              datasets: {current?.datasets.join(", ")}. Unsupported dataset keys
              do not unlock capabilities.
            </p>
          </details>
          <details open>
            <summary>2 · Contract and rights</summary>
            <div className="x2-provider-form">
              <label>
                Contract reference · no secrets
                <input
                  value={contract}
                  maxLength={200}
                  onChange={(e) => {
                    edit();
                    setContract(e.target.value);
                  }}
                />
              </label>
              <label>
                Rights expiry
                <input
                  type="date"
                  value={expiry}
                  onChange={(e) => {
                    edit();
                    setExpiry(e.target.value);
                  }}
                />
              </label>
              {(
                [
                  "display",
                  "analysis",
                  "storage",
                  "redistribution",
                  "derivedDisplay",
                  "verified",
                ] as const
              ).map((k) => (
                <label className="x2-checkbox" key={k}>
                  <input
                    type="checkbox"
                    checked={rights[k]}
                    onChange={(e) => {
                      edit();
                      setRights((v) => ({ ...v, [k]: e.target.checked }));
                    }}
                  />
                  {k === "derivedDisplay"
                    ? "Derived display (indicators/comparisons)"
                    : k === "verified"
                      ? "Owner reviewed the actual contract"
                      : k === "analysis"
                        ? "Non-display scans/calculations"
                        : k === "display"
                          ? "In-app display"
                          : k === "storage"
                            ? "Historical snapshot retention"
                            : "Redistribution / sharing"}
                </label>
              ))}
              <label>
                Permitted cache seconds
                <input
                  type="number"
                  min="0"
                  max="900"
                  value={cache}
                  onChange={(e) => {
                    edit();
                    setCache(Number(e.target.value));
                  }}
                />
              </label>
            </div>
            <p>
              Owner declarations are explicitly recorded as owner-attested.
              These endpoints cannot independently verify a legal licence.
              Public audience and payments stay unchanged.
            </p>
          </details>
          <details open>
            <summary>3 · Exact instrument mappings</summary>
            <p>
              Replace the template with vendor-confirmed symbols, MIC, type,
              currency and units. MCX futures additionally require exact expiry,
              lotSize and tickSize. No continuous contract is treated as a
              current execution contract.
            </p>
            <label>
              Instrument mappings · JSON
              <textarea
                rows={10}
                spellCheck={false}
                value={mapping}
                onChange={(e) => {
                  edit();
                  setMapping(e.target.value);
                }}
              />
            </label>
            <div className="x2-provider-form">
              {current?.datasets.map((k) => (
                <label className="x2-checkbox" key={k}>
                  <input
                    type="checkbox"
                    checked={datasets.includes(k)}
                    onChange={(e) => {
                      edit();
                      setDatasets((v) =>
                        e.target.checked ? [...v, k] : v.filter((x) => x !== k),
                      );
                    }}
                  />
                  {k}
                </label>
              ))}
              <label>
                Daily provider-call cap
                <input
                  type="number"
                  min="1"
                  max="30000"
                  value={quota}
                  onChange={(e) => {
                    edit();
                    setQuota(Number(e.target.value));
                  }}
                />
              </label>
              <label>
                Routing priority · 1 first
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={priority}
                  onChange={(e) => {
                    edit();
                    setPriority(Number(e.target.value));
                  }}
                />
              </label>
              <label className="x2-checkbox">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    edit();
                    setEnabled(e.target.checked);
                  }}
                />
                Enabled
              </label>
            </div>
          </details>
          <div className="x2-terminal-actions">
            <button disabled={!!busy} onClick={() => run("configure")}>
              {busy === "Saving configuration…" ? busy : "Save metadata"}
            </button>
            <button
              disabled={!!busy || !current?.config || !current.secretConfigured}
              onClick={() => run("test")}
            >
              <RefreshCw size={15} />
              {busy === "Testing source…" ? busy : "Test connection"}
            </button>
            <button
              disabled={!!busy || !(state.sharedIngestion?.length || (current?.config?.enabled && current.secretConfigured))}
              onClick={() => run("refresh-history")}
            >
              <RefreshCw size={15} />
              {busy === "Refreshing shared history…" ? busy : "Refresh shared history"}
            </button>
          </div>
          <p role="status">{busy}</p>
          <p>
            Calls are capped, cached only within recorded rights, and never
            cause a purchase. The INR 3,000 reserve is not authorization to
            subscribe or proof it covers commercial licensing.
          </p>
          <details>
            <summary>Accepted / rejected test symbols</summary>
            <p>Accepted: {current?.health.accepted.join(", ") || "None"}</p>
            <p>Rejected: {current?.health.rejected.join(", ") || "None"}</p>
          </details>
          <details>
            <summary>Configuration audit</summary>
            {state.audit.length ? (
              state.audit.map((a, i) => (
                <p key={a.created_at + i}>
                  {a.created_at} · {a.provider} · {a.action} · version{" "}
                  {a.version}
                </p>
              ))
            ) : (
              <p>No configuration writes.</p>
            )}
          </details>
        </>
      )}
    </section>
  );
}
