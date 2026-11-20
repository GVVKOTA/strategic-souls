"use client";
import { useEffect, useRef, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import type {
  ProviderConfig,
  ProviderHealth,
  ProviderId,
} from "../../../backend/services/market-data/data-types";
type ProviderView = {
  id: ProviderId;
  label: string;
  secret: string;
  docs: string;
  rightsUrl: string;
  markets: string[];
  datasets: string[];
  secretConfigured: boolean;
  config: ProviderConfig | null;
  health: ProviderHealth;
};
type Settings = {
  isOwner: boolean;
  providers: ProviderView[];
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
    [enabled, setEnabled] = useState(false);
  const active = useRef(false),
    key = useRef<string | null>(null);
  const current = state?.providers.find((p) => p.id === selected);
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
      setDatasets(c?.datasets ?? ["candles"]);
      setEnabled(c?.enabled ?? false);
      key.current = null;
    });
  }, [selected, current?.config]);
  async function run(op: "configure" | "test") {
    if (active.current) return;
    active.current = true;
    setBusy(op === "test" ? "Testing source…" : "Saving configuration…");
    setError("");
    try {
      let payload: unknown;
      if (op === "configure") {
        let instruments;
        try {
          instruments = JSON.parse(mapping);
        } catch {
          throw new Error("Instrument mappings must be a JSON array.");
        }
        key.current ??= crypto.randomUUID();
        payload = {
          op,
          config: {
            provider: selected,
            version: current?.config?.version ?? 0,
            lastWrite: key.current,
            enabled,
            priority,
            dailyCallLimit: quota,
            instruments,
            datasets,
            rights: {
              ...rights,
              cacheSeconds: cache,
              contractReference: contract,
              expiresAt: expiry + "T23:59:59.000Z",
            },
          },
        };
      } else payload = { op, provider: selected };
      const result = await request<Settings>(payload);
      setState(result);
      window.dispatchEvent(new Event("x2-data-updated"));
      key.current = null;
      notify?.(
        op === "test"
          ? "Source test recorded. Review actual coverage."
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
      {!state ? (
        <p role="status">{busy || "Settings unavailable. Reload to retry."}</p>
      ) : (
        <>
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
          <div className="x2-provider-status">
            <strong>{current?.health.state.replaceAll("_", " ")}</strong>
            <span>
              Server secret:{" "}
              {current?.secretConfigured ? "Configured" : "Not configured"}
            </span>
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
                  max="1000"
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
