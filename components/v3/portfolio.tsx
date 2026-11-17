"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Download, Archive, RefreshCw } from "lucide-react";
import {
  ASSET_CLASSES,
  parseCSV,
  validateHolding,
  holdingKey,
  type Holding,
} from "../../lib/research";
type Row = {
  id: string;
  payload: Holding;
  archived_at: string | null;
  created_at: string;
};
async function api<T>(path: string, payload?: unknown): Promise<T> {
  const r = await fetch("/api/v3/" + path, {
    method: payload === undefined ? "GET" : "POST",
    headers:
      payload === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const d = (await r.json()) as { error?: string };
  if (!r.ok) throw new Error(d.error ?? "Portfolio request failed.");
  return d as T;
}
export function ManualPortfolio() {
  const [rows, setRows] = useState<Row[]>([]),
    [symbol, setSymbol] = useState(""),
    [assetClass, setAsset] = useState("Indian equity"),
    [quantity, setQuantity] = useState(""),
    [cost, setCost] = useState(""),
    [currency, setCurrency] = useState("INR"),
    [account, setAccount] = useState("Manual records"),
    [csv, setCsv] = useState(""),
    [preview, setPreview] = useState<Holding[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [showArchived, setArchived] = useState(false);
  const load = useCallback(async () => {
    let offset: number | null = 0;
    const r: Row[] = [];
    while (offset !== null) {
      const page: { rows: Row[]; nextOffset: number | null } = await api(
        "holdings?offset=" + offset,
      );
      r.push(...page.rows);
      offset = page.nextOffset;
      if (r.length > 5000)
        throw new Error(
          "Use a full operator-assisted export for this portfolio.",
        );
    }
    setRows(r);
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message));
  }, [load]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(list: Holding[]) {
    const r = await api<{ saved: number; duplicates: number }>(
      "holding-batch",
      { rows: list },
    );
    await load();
    setMessage(
      r.saved +
        " manual record(s) saved; " +
        r.duplicates +
        " duplicate(s) retained without a new row.",
    );
  }
  const active = rows.filter((r) => !r.archived_at),
    totals = active.reduce<Record<string, number>>((a, r) => {
      a[r.payload.currency] =
        (a[r.payload.currency] ?? 0) + r.payload.quantity * r.payload.cost;
      return a;
    }, {});
  return (
    <section className="v3-panel">
      <div className="v3-panel-head">
        <div>
          <p className="v3-eyebrow">STRATEGIC GLOBAL / YOUR MANUAL PORTFOLIO</p>
          <h2>Positions, with honest context.</h2>
        </div>
        <button
          className="v3-icon"
          aria-label="Refresh holdings"
          disabled={busy}
          onClick={() => run(load)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <p className="v3-callout">
        These are user-supplied acquisition costs. No current price, market
        valuation, return, P&amp;L or FX conversion is inferred.
      </p>
      {error && (
        <p className="v3-notice v3-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="v3-notice v3-success" role="status">
          {message}
        </p>
      )}
      <div className="v3-readiness-grid">
        {Object.entries(totals).map(([c, total]) => (
          <div key={c}>
            <span className="v3-eyebrow">{c} · ACQUISITION COST</span>
            <strong className="v3-number">
              {total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </strong>
            <p>Recorded cost, {c}. Not current market value.</p>
          </div>
        ))}
      </div>
      <div className="v3-home-grid">
        <form
          className="v3-wizard-fields"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              if (!quantity || !cost)
                throw new Error(
                  "Enter quantity and unit acquisition cost explicitly.",
                );
              await save([
                validateHolding({
                  symbol,
                  assetClass,
                  quantity: Number(quantity),
                  cost: Number(cost),
                  currency,
                  account,
                }),
              ]);
              setSymbol("");
              setQuantity("");
              setCost("");
            });
          }}
        >
          <h3>Add a manual position</h3>
          <label className="v3-field">
            <span>Symbol or security identifier</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              maxLength={40}
              required
            />
          </label>
          <label className="v3-field">
            <span>Asset class</span>
            <select
              value={assetClass}
              onChange={(e) => setAsset(e.target.value)}
            >
              {ASSET_CLASSES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <div className="v3-form-grid">
            <label className="v3-field">
              <span>Quantity</span>
              <input
                type="number"
                step="any"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
            <label className="v3-field">
              <span>Unit acquisition cost</span>
              <input
                type="number"
                step="any"
                min={0}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="v3-field">
            <span>Currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {["INR", "USD", "EUR", "GBP", "JPY", "USDT"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="v3-field">
            <span>Account label</span>
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
              maxLength={60}
            />
          </label>
          <button className="v3-primary" disabled={busy}>
            <Plus size={16} />
            Save private position
          </button>
        </form>
        <div className="v3-wizard-fields">
          <h3>Preview a CSV import</h3>
          <label className="v3-field">
            <span>Choose a CSV (maximum 100 KB / 100 rows)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void run(async () => {
                    if (file.size > 100000)
                      throw new Error("CSV exceeds 100 KB.");
                    setCsv(await file.text());
                    setPreview([]);
                  });
              }}
            />
          </label>
          <label className="v3-field">
            <span>CSV contents</span>
            <textarea
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview([]);
              }}
              rows={7}
              maxLength={100000}
              placeholder="symbol,assetClass,quantity,cost,currency,account"
            />
          </label>
          <button
            className="v3-secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                setPreview(parseCSV(csv));
                setMessage(
                  "Preview validated. Confirm import to save the shown rows.",
                );
              })
            }
          >
            Validate & preview
          </button>
          {preview.length > 0 && (
            <>
              <p>
                {preview.length} validated rows. No upload has occurred yet.
              </p>
              <div className="v3-soul-grid">
                {preview.slice(0, 6).map((h) => (
                  <article className="v3-quote-card" key={holdingKey(h)}>
                    <h3>{h.symbol}</h3>
                    <p>
                      {h.quantity} units · {h.currency} {h.cost} unit cost
                    </p>
                    <small>
                      {h.account} · {h.assetClass}
                    </small>
                  </article>
                ))}
              </div>
              {preview.length > 6 && (
                <p className="v3-footnote">
                  The first six rows are shown. All {preview.length} validated
                  rows will be submitted.
                </p>
              )}
              <button
                className="v3-primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await save(preview);
                    setCsv("");
                    setPreview([]);
                  })
                }
              >
                Confirm import of {preview.length} rows
              </button>
            </>
          )}
          <p className="v3-footnote">
            Nothing connects to a broker. Unsafe formula prefixes and duplicate
            CSV rows are rejected. Repeated imports are deduplicated on the
            server.
          </p>
        </div>
      </div>
      <div className="v3-library-toolbar" style={{ marginTop: 28 }}>
        <h3>Your recorded positions</h3>
        <button
          className="v3-secondary"
          aria-pressed={showArchived}
          onClick={() => setArchived(!showArchived)}
        >
          <Archive size={15} />
          {showArchived ? "Show active" : "Show archive"}
        </button>
        <button
          className="v3-text"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      notice:
                        "Manual acquisition costs only; not a market valuation",
                      holdings: rows,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "Strategic-Souls-manual-holdings.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download size={16} />
          Export JSON
        </button>
      </div>
      <div className="v3-soul-grid">
        {rows
          .filter((r) => !!r.archived_at === showArchived)
          .map((r) => (
            <article className="v3-quote-card" key={r.id}>
              <span className="v3-eyebrow">{r.payload.assetClass}</span>
              <h3>{r.payload.symbol}</h3>
              <p>
                {r.payload.quantity} units · {r.payload.currency}{" "}
                {r.payload.cost} acquisition cost per unit
              </p>
              <small>{r.payload.account}</small>
              <button
                className="v3-text"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("holding-archive", {
                      id: r.id,
                      restore: !!r.archived_at,
                    });
                    await load();
                    setMessage("Holding history retained.");
                  })
                }
              >
                {r.archived_at ? "Restore record" : "Archive record"}
              </button>
            </article>
          ))}
      </div>
      {!rows.length && (
        <p>
          No holdings loaded. Sign in, create your Body and add your own
          records.
        </p>
      )}
    </section>
  );
}
