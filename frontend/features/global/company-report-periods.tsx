"use client";

import { useEffect, useState } from "react";
import type { IndianReportPeriod } from "../../../backend/services/market-data/providers";
import { api } from "../../components/workspace/shared";

type Response = { state: "AVAILABLE" | "PENDING" | "UNAVAILABLE" | "REQUIRES_RIGHTS";
  reports: IndianReportPeriod[]; attribution?: { label: string; url: string } };
const SECTIONS = { BALANCE_SHEET: "Balance sheet", INCOME: "Income", CASH_FLOW: "Cash flow" };

export default function CompanyReportPeriods({ instrument }: { instrument: string }) {
  const [response, setResponse] = useState<Response | null>(null);
  const [error, setError] = useState("");
  const [attempt, refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<Response>("/api/market/company-reports?id=" + encodeURIComponent(instrument), undefined, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) { setResponse(value); setError(""); } })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [instrument, attempt]);
  if (error) return <p role="alert">{error} <button className="x1-text-button" onClick={() => refresh((n) => n + 1)}>Retry</button></p>;
  if (!response) return <p role="status">Loading reported financial periods…</p>;
  if (response.state === "REQUIRES_RIGHTS") return <p className="x1-caption">Licensed Indian API company statements are unavailable for this instrument.</p>;
  if (response.state !== "AVAILABLE") return <p className="x1-caption">
    Company statement periods are temporarily unavailable. <button className="x1-text-button" onClick={() => refresh((n) => n + 1)}>Check again</button>
  </p>;
  return <div className="x1-table-wrap">
    <table><thead><tr><th>Period</th><th>End date</th><th>Statement date</th><th>Reported sections</th></tr></thead>
      <tbody>{response.reports.map((report) => <tr key={report.period + report.end}>
        <td>{report.period === "ANNUAL" ? "Annual" : "Interim"}</td><td>{report.end}</td>
        <td>{report.statementDate ?? "Unavailable"}</td><td>{report.sections.map((section) => SECTIONS[section]).join(", ")}</td>
      </tr>)}</tbody>
    </table>
    <p className="x1-caption">Statement periods and sections only. Financial values require verified currency, units and reporting basis.</p>
    {response.attribution && <a href={response.attribution.url} target="_blank" rel="noreferrer">{response.attribution.label}</a>}
  </div>;
}
