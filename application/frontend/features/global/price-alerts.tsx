"use client";

import { useEffect, useState } from "react";
import { Bell, Edit3, Trash2 } from "lucide-react";
import type { AlertRule } from "../../../backend/engines/price-alert";
import { AssetPicker, useAssetCatalog } from "../../components/workspace/asset-picker";
import { api, Empty, Modal, number, Panel } from "../../components/workspace/shared";

type Alert = {
  id: string; instrumentId: string; rule: AlertRule; threshold: number; recurring: boolean;
  state: "ACTIVE" | "PAUSED" | "FIRED"; version: number; lastSession: string | null;
  trigger: { session: string; value: number; source: string } | null;
};
type AlertList = { alerts: Alert[]; available: boolean };
type Draft = Pick<Alert, "id" | "instrumentId" | "rule" | "recurring"> & { threshold: string; version?: number };
const RULES: Record<AlertRule, string> = { ABOVE: "Closes at or above", BELOW: "Closes at or below", RISE: "Rises by at least (%)", FALL: "Falls by at least (%)" };

export default function PriceAlerts({ openAsset, selected, instrument, standalone = false }: {
  openAsset: (id: string) => void; selected?: string; instrument?: string; standalone?: boolean;
}) {
  const [list, setList] = useState<AlertList | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, reload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<Alert | null>(null);
  const { instruments, error: catalogError } = useAssetCatalog(draft !== null && !instrument);

  useEffect(() => {
    const controller = new AbortController();
    void api<AlertList>("/api/market/alerts", undefined, { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) { setList(response); setError(""); } })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [revision]);

  async function mutate(action: string, value: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<AlertList>("/api/market/alerts", { action, ...value });
      setList(result); setDraft(null); setConfirm(null);
      setNotice(action === "delete" ? "Alert deleted." : "Price alert updated.");
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  const alerts = list?.alerts.filter((alert) => !instrument || alert.instrumentId === instrument) ?? [];

  useEffect(() => {
    if (!selected || !list) return;
    document.getElementById("ss-alert-" + selected)?.scrollIntoView({ block: "center" });
  }, [selected, list]);
  const form = draft && <form className="x1-form" onSubmit={(event) => {
    event.preventDefault();
    void mutate("save", { ...draft, threshold: Number(draft.threshold) });
  }}>
    {instrument ? <strong>{instrument}</strong> :
      <AssetPicker label="NSE stock" value={draft.instrumentId} onChange={(id) => setDraft({ ...draft, instrumentId: id })}
        instruments={instruments.filter((row) => row.market === "NSE" && row.assetClass === "EQUITY")} />}
    {catalogError && <p role="alert">{catalogError}</p>}
    <label>Condition<select value={draft.rule} onChange={(event) => setDraft({ ...draft, rule: event.target.value as AlertRule })}>
      {Object.entries(RULES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <label>{draft.rule === "ABOVE" || draft.rule === "BELOW" ? "Price (INR)" : "Change (%)"}
      <input required type="number" min="0.000001" step="any" value={draft.threshold}
        onChange={(event) => setDraft({ ...draft, threshold: event.target.value })} />
    </label>
    <label><input type="checkbox" checked={draft.recurring}
      onChange={(event) => setDraft({ ...draft, recurring: event.target.checked })} /> Repeat after each crossing or qualifying session</label>
    {error && <p role="alert">{error}</p>}
    <div className="x1-actions">
      <button type="button" className="x1-secondary" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
      <button type="submit" className="x1-primary x1-motion-button" disabled={busy || !draft.instrumentId}>Save alert</button>
    </div>
  </form>;
  return <Panel title={standalone ? "Alerts for this asset" : "Price Alerts"} kicker="India API · Completed sessions">
    <p className="x1-caption">Alerts compare consecutive eligible closing prices. The first session sets the baseline. Delivery is in-app after the feed updates.</p>
    {!list && !error && <p role="status">Loading price alerts…</p>}
    {error && !draft && <p role="alert">{error} <button className="x1-text-button" onClick={() => reload((n) => n + 1)}>Retry</button></p>}
    {notice && <p role="status">{notice}</p>}
    {list && list.available && !draft && <button type="button" className="x1-primary x1-motion-button"
      onClick={() => setDraft({ id: crypto.randomUUID(), instrumentId: instrument ?? "", rule: "ABOVE", threshold: "", recurring: false })}>
      <Bell size={16} /> Set alert
    </button>}
    {list && !list.available && <p className="x1-callout">Alert monitoring is paused until licensed NSE closes are configured.</p>}
    {selected && list && !alerts.some((alert) => alert.id === selected) && <p role="status">This alert is unavailable.</p>}
    {list && !alerts.length && !draft && <Empty title="No saved price alerts">{null}</Empty>}
    {alerts.map((alert) => <div id={"ss-alert-" + alert.id} key={alert.id} className={"x1-list-item" + (selected === alert.id ? " x1-alert-selected" : "")}>
      <div>
        <button className="x1-text-button" onClick={() => openAsset(alert.instrumentId)}>{alert.instrumentId}</button>
        <p>{RULES[alert.rule]} {number(alert.threshold, 4)} · {alert.state.toLowerCase()}</p>
        {alert.trigger && <small>{number(alert.trigger.value)} INR · {alert.trigger.session} · {alert.trigger.source}</small>}
      </div>
      <div className="x1-actions">
        <button type="button" className="x1-secondary" disabled={busy || (!list?.available && alert.state !== "ACTIVE")}
          onClick={() => void mutate(alert.state === "ACTIVE" ? "pause" : "resume", alert)}>
          {alert.state === "ACTIVE" ? "Pause" : "Resume"}
        </button>
        <button type="button" className="x1-icon-button" disabled={busy || !list?.available} aria-label="Edit alert"
          onClick={() => setDraft({ ...alert, threshold: String(alert.threshold) })}><Edit3 size={16} /></button>
        <button type="button" className="x1-icon-button" disabled={busy} aria-label="Delete alert" onClick={() => setConfirm(alert)}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>)}
    {form}
    {confirm && <Modal title="Delete price alert?" onClose={() => { if (!busy) setConfirm(null); }}>
      <p>Delete the alert for {confirm.instrumentId}?</p>
      {error && <p role="alert">{error}</p>}
      <div className="x1-actions">
        <button type="button" className="x1-secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
        <button type="button" className="x1-primary" disabled={busy} onClick={() => void mutate("delete", confirm)}>Delete alert</button>
      </div>
    </Modal>}
  </Panel>;
}
