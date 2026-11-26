"use client";

import { useEffect, useMemo, useState } from "react";
import { api, Empty, number, Panel } from "../../components/workspace/shared";
import type { NseSectorIndex } from "../../../backend/services/market-data/sectors-and-ecosystem";

type Quote = { id: string; value: number; pctChange: number | null; latestDate: string; referenceDate: string | null;
  volume: number | null; quality: string; attribution: { label: string; url: string } };
type Coverage = { groups?: NseSectorIndex[]; industryQuotes?: Quote[] };

export default function NiftyMarketTable({ movers = false, openAsset, onScan }: {
  movers?: boolean; openAsset: (id: string) => void; onScan: (id: string) => void;
}) {
  const [data, setData] = useState<Coverage | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "gainers" | "losers" | "volume">(movers ? "gainers" : "name");
  const [max, setMax] = useState(30);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<Coverage>("/api/market/sector-quotes", undefined, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) { setData(value); setError(""); }
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [reload]);
  const rows = useMemo(() => {
    const quotes = new Map(data?.industryQuotes?.map((q) => [q.id, q]));
    return data?.groups?.flatMap((group) => group.constituents.map((asset) =>
      ({ ...asset, industry: group.name, quote: quotes.get(asset.id) }))) ?? [];
  }, [data]);
  const eligible = rows.filter(({ quote }) => quote?.quality === "PUBLISHED_EOD" && quote.referenceDate !== null && quote.pctChange !== null);
  const session = eligible.map(({ quote }) => quote!.latestDate).sort().at(-1);
  const baseline = eligible.find(({ quote }) => quote!.latestDate === session)?.quote?.referenceDate;
  const ranked = eligible.filter(({ quote }) => quote!.latestDate === session && quote!.referenceDate === baseline);
  const term = query.trim().toLowerCase();
  const result = (sort === "name" && !movers ? rows : ranked)
    .filter(({ quote }) => sort !== "volume" || quote?.volume != null)
    .filter((row) => [row.symbol, row.name, row.industry].some((value) => value.toLowerCase().includes(term)))
    .sort((a, b) => {
      if (sort === "gainers") return (b.quote?.pctChange ?? 0) - (a.quote?.pctChange ?? 0);
      if (sort === "losers") return (a.quote?.pctChange ?? 0) - (b.quote?.pctChange ?? 0);
      if (sort === "volume") return (b.quote?.volume ?? 0) - (a.quote?.volume ?? 0);
      return a.name.localeCompare(b.name);
    });
  const rises = ranked.filter(({ quote }) => quote!.pctChange! > 0).length;
  const falls = ranked.filter(({ quote }) => quote!.pctChange! < 0).length;
  return <Panel title={movers ? "Market breadth" : "Nifty 500"} kicker="Completed NSE sessions">
    {!error && !data && <p role="status">Loading verified market coverage…</p>}
    {error && <p role="alert">{error} <button className="x1-text-button" onClick={() => setReload((value) => value + 1)}>Retry</button></p>}
    {data && !rows.length && <Empty title="Licensed Nifty 500 membership is unavailable">{null}</Empty>}
    {!!rows.length && <>
      <p className="x1-caption">
        {ranked.length} of {rows.length} instruments have comparable completed closes{session ? " for " + session : ""}.
      </p>
      {movers && !!ranked.length && <p className="x1-callout">{rises} advances · {falls} declines · {ranked.length - rises - falls} unchanged</p>}
      <div className="x1-actions">
        <label>Search<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setMax(30); }} /></label>
        <label>Rank by<select value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setMax(30); }}>
          {!movers && <option value="name">Company name</option>}
          <option value="gainers">Gainers</option><option value="losers">Losers</option><option value="volume">Volume</option>
        </select></label>
      </div>
      {result.length ? <div className="x1-table-wrap"><table>
        <thead><tr><th>Stock</th><th>Industry</th><th>Close</th><th>Change</th><th>Volume</th><th>Session</th><th>Research</th></tr></thead>
        <tbody>{result.slice(0, max).map(({ id, name, symbol, industry, quote }) => <tr key={id}>
          <td><button className="x1-text-button" onClick={() => openAsset(id)}>{symbol}</button><br /><small>{name}</small></td>
          <td>{industry}</td><td>{quote ? number(quote.value) : "Unavailable"}</td>
          <td>{quote?.pctChange == null ? "—" : number(quote.pctChange) + "%"}</td>
          <td>{quote?.volume == null ? "—" : number(quote.volume, 0)}</td>
          <td>{quote?.latestDate ?? "—"}{quote?.quality === "STALE" && " · Stale"}</td>
          <td><button className="x1-text-button" onClick={() => onScan(id)}>Scan</button></td>
        </tr>)}</tbody>
      </table></div> : <Empty title={query ? "No matching stocks" : "Comparable prices are unavailable"}>{null}</Empty>}
      {max < result.length && <button type="button" className="x1-secondary" onClick={() => setMax(max + 30)}>Show more ({result.length - max})</button>}
    </>}
  </Panel>;
}
