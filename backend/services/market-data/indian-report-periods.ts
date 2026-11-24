export type IndianReportPeriod = { period: "ANNUAL" | "INTERIM"; end: string; statementDate: string | null;
  sections: ("BALANCE_SHEET" | "INCOME" | "CASH_FLOW")[] };

export function normalizeIndianReportPeriods(value: unknown, symbol: string, today = new Date().toISOString().slice(0, 10)) {
  const body = value as {
    companyProfile?: { exchangeCodeNse?: string; isInId?: string };
    financials?: { Type?: string; EndDate?: string; StatementDate?: string;
      stockFinancialMap?: { BAL?: unknown; CAS?: unknown; INC?: unknown } }[];
  };
  if (body?.companyProfile?.exchangeCodeNse !== symbol ||
      !/^IN[A-Z0-9]{9}[0-9]$/.test(body.companyProfile.isInId ?? "") ||
      !Array.isArray(body.financials) || body.financials.length > 80)
    throw new Error("The reported company identity or statement history is unavailable.");
  const day = (input: unknown) => {
    if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(input)) return null;
    const iso = input.slice(0, 10), timestamp = Date.parse(iso);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === iso && iso <= today ? iso : null;
  };
  const rows = new Map<string, IndianReportPeriod>();
  for (const report of body.financials) {
    const end = day(report?.EndDate), statementDate = day(report?.StatementDate);
    const period = report?.Type === "Annual" ? "ANNUAL" : report?.Type === "Interim" ? "INTERIM" : null;
    if (!period || !end || (statementDate && statementDate < end)) continue;
    const group = report.stockFinancialMap;
    const sections = ([
      ["BALANCE_SHEET", group?.BAL], ["INCOME", group?.INC], ["CASH_FLOW", group?.CAS],
    ] as const).flatMap(([name, lines]) => Array.isArray(lines) && lines.length ? [name] : []);
    if (!sections.length) continue;
    const key = period + ":" + end;
    const old = rows.get(key);
    if (!old || (statementDate ?? "") > (old.statementDate ?? "")) rows.set(key, { period, end, statementDate, sections });
  }
  return [...rows.values()].sort((a, b) => b.end.localeCompare(a.end)).slice(0, 20);
}
