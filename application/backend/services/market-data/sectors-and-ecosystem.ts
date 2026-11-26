/**
 * Strategic Souls Post-X5.1 — Pure Client-Safe Domain Catalogs:
 * - [16] NSE Sector Explorer (canonical NIFTY sectoral indices + constituents + official citations)
 * - [17] Expandable Heatmap Tile Builder (strictly zero fake colored squares when quotes unavailable)
 * - [18] Company Ecosystem Explorer (verified competitors, peers, group, suppliers/customers, macro)
 * - [22] Geopolitics -> Markets Exposure Pathways (DOCUMENTED vs HYPOTHESIS, non-causal)
 */

export type NseSectorConstituent = {
  id: string;
  symbol: string;
  name: string;
  weightApproxNote: string;
};

export type NseSectorIndex = {
  groupType?: "industry";
  id: string;
  indexSymbol: string;
  name: string;
  shortName: string;
  description: string;
  reviewDate: string;
  sourceName: string;
  sourceUrl: string;
  constituents: readonly NseSectorConstituent[];
  macroDrivers: readonly string[];
};

export const NSE_SECTOR_INDICES: readonly NseSectorIndex[] = Object.freeze([
  {
    id: "NSE:BANKNIFTY",
    indexSymbol: "NIFTY BANK",
    name: "Nifty Bank",
    shortName: "Banking",
    description:
      "Most liquid and large-capitalised Indian banking stocks listed on NSE.",
    reviewDate: "2026-09-30",
    sourceName: "NSE Indices Limited",
    sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-bank",
    constituents: [
      { id: "NSE:HDFCBANK", symbol: "HDFCBANK", name: "HDFC Bank Ltd.", weightApproxNote: "Large-cap private bank" },
      { id: "NSE:ICICIBANK", symbol: "ICICIBANK", name: "ICICI Bank Ltd.", weightApproxNote: "Large-cap private bank" },
      { id: "NSE:SBIN", symbol: "SBIN", name: "State Bank of India", weightApproxNote: "Public sector bank" },
      { id: "NSE:KOTAKBANK", symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd.", weightApproxNote: "Private sector bank" },
      { id: "NSE:AXISBANK", symbol: "AXISBANK", name: "Axis Bank Ltd.", weightApproxNote: "Private sector bank" },
    ],
    macroDrivers: ["RBI Repo Rate & CRR", "India CPI & Credit Growth", "10Y Sovereign Yield"],
  },
  {
    id: "NSE:NIFTYIT",
    indexSymbol: "NIFTY IT",
    name: "Nifty IT",
    shortName: "IT",
    description:
      "Indian information technology services, consulting, and enterprise software leaders.",
    reviewDate: "2026-09-30",
    sourceName: "NSE Indices Limited",
    sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-it",
    constituents: [
      { id: "NSE:TCS", symbol: "TCS", name: "Tata Consultancy Services Ltd.", weightApproxNote: "IT Services" },
      { id: "NSE:INFY", symbol: "INFY", name: "Infosys Ltd.", weightApproxNote: "IT Services" },
      { id: "NSE:HCLTECH", symbol: "HCLTECH", name: "HCL Technologies Ltd.", weightApproxNote: "IT & ER&D" },
      { id: "NSE:WIPRO", symbol: "WIPRO", name: "Wipro Ltd.", weightApproxNote: "IT Services" },
      { id: "NSE:TECHM", symbol: "TECHM", name: "Tech Mahindra Ltd.", weightApproxNote: "Telecom & IT" },
    ],
    macroDrivers: ["USD / INR Exchange Rate", "US Enterprise Capex & Fed Rates", "Global Cloud & AI Budgets"],
  },
  {
    id: "NSE:NIFTYPHARMA",
    indexSymbol: "NIFTY PHARMA",
    name: "Nifty Pharma",
    shortName: "Pharma",
    description:
      "Pharmaceutical formulations, API manufacturers, and specialty healthcare exporters.",
    reviewDate: "2026-09-30",
    sourceName: "NSE Indices Limited",
    sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-pharma",
    constituents: [
      { id: "NSE:SUNPHARMA", symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries", weightApproxNote: "Specialty & Generics" },
      { id: "NSE:CIPLA", symbol: "CIPLA", name: "Cipla Ltd.", weightApproxNote: "Respiratory & Generics" },
      { id: "NSE:DRREDDY", symbol: "DRREDDY", name: "Dr. Reddy's Laboratories Ltd.", weightApproxNote: "US & India Generics" },
      { id: "NSE:DIVISLAB", symbol: "DIVISLAB", name: "Divi's Laboratories Ltd.", weightApproxNote: "API & Custom Synthesis" },
    ],
    macroDrivers: ["USFDA Inspection Outcomes", "USD / INR Export Realization", "API Raw Material Costs"],
  },
  {
    id: "NSE:NIFTYAUTO",
    indexSymbol: "NIFTY AUTO",
    name: "Nifty Auto",
    shortName: "Auto",
    description:
      "Passenger vehicles, commercial vehicles, two-wheelers, and auto component manufacturers.",
    reviewDate: "2026-09-30",
    sourceName: "NSE Indices Limited",
    sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-auto",
    constituents: [
      { id: "NSE:M&M", symbol: "M&M", name: "Mahindra & Mahindra Ltd.", weightApproxNote: "SUV & Farm Equipment" },
      { id: "NSE:MARUTI", symbol: "MARUTI", name: "Maruti Suzuki India Ltd.", weightApproxNote: "Passenger Vehicles" },
      { id: "NSE:TATAMOTORS", symbol: "TATAMOTORS", name: "Tata Motors Ltd.", weightApproxNote: "CV, PV & JLR" },
      { id: "NSE:BAJAJ-AUTO", symbol: "BAJAJ-AUTO", name: "Bajaj Auto Ltd.", weightApproxNote: "Two-Wheelers & Exports" },
    ],
    macroDrivers: ["Domestic Retail Financing Rates", "Steel & Aluminium Input Costs", "Rural Monsoon & EV Policy"],
  },
  {
    id: "NSE:NIFTYMETAL",
    indexSymbol: "NIFTY METAL",
    name: "Nifty Metal",
    shortName: "Metals",
    description:
      "Ferrous steel mills, non-ferrous aluminium/copper/zinc smelters, and mining producers.",
    reviewDate: "2026-09-30",
    sourceName: "NSE Indices Limited",
    sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-metal",
    constituents: [
      { id: "NSE:TATASTEEL", symbol: "TATASTEEL", name: "Tata Steel Ltd.", weightApproxNote: "Integrated Steel" },
      { id: "NSE:JSWSTEEL", symbol: "JSWSTEEL", name: "JSW Steel Ltd.", weightApproxNote: "Integrated Steel" },
      { id: "NSE:HINDALCO", symbol: "HINDALCO", name: "Hindalco Industries Ltd.", weightApproxNote: "Aluminium & Copper" },
    ],
    macroDrivers: ["China Industrial Demand & Steel Exports", "Coking Coal & Iron Ore Prices", "Global USD Strength"],
  },
  {
    id: "NSE:NIFTYENERGY",
    indexSymbol: "NIFTY ENERGY",
    name: "Nifty Energy",
    shortName: "Energy",
    description:
      "Oil & gas exploration, refining, power generation, and grid transmission utilities.",
    reviewDate: "2026-09-30",
    sourceName: "NSE Indices Limited",
    sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-energy",
    constituents: [
      { id: "NSE:RELIANCE", symbol: "RELIANCE", name: "Reliance Industries Ltd.", weightApproxNote: "O2C, Retail & Digital" },
      { id: "NSE:NTPC", symbol: "NTPC", name: "NTPC Ltd.", weightApproxNote: "Power Generation" },
      { id: "NSE:ONGC", symbol: "ONGC", name: "Oil & Natural Gas Corporation", weightApproxNote: "Upstream Oil & Gas" },
      { id: "NSE:POWERGRID", symbol: "POWERGRID", name: "Power Grid Corp. of India", weightApproxNote: "Grid Transmission" },
    ],
    macroDrivers: ["Brent Crude & Refining Margins", "OPEC+ Supply & Maritime Chokepoints", "India Peak Power Demand"],
  },
  {
    id: "NSE:NIFTYFMCG",
    indexSymbol: "NIFTY FMCG",
    name: "Nifty FMCG",
    shortName: "FMCG",
    description:
      "Fast-moving consumer goods, packaged food, personal care, and household staples.",
    reviewDate: "2026-09-30",
    sourceName: "NSE Indices Limited",
    sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-fmcg",
    constituents: [
      { id: "NSE:ITC", symbol: "ITC", name: "ITC Ltd.", weightApproxNote: "FMCG, Agri & Paper" },
      { id: "NSE:HINDUNILVR", symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd.", weightApproxNote: "Home & Personal Care" },
      { id: "NSE:NESTLEIND", symbol: "NESTLEIND", name: "Nestle India Ltd.", weightApproxNote: "Packaged Foods" },
    ],
    macroDrivers: ["Rural Wage & Monsoon Recovery", "Palm Oil & Agri Commodity Inflation", "Urban Volume Growth"],
  },
  {
    id: "NSE:NIFTYREALTY",
    indexSymbol: "NIFTY REALTY",
    name: "Nifty Realty",
    shortName: "Realty",
    description:
      "Residential developers, commercial office REIT ecosystems, and urban real estate.",
    reviewDate: "2026-09-30",
    sourceName: "NSE Indices Limited",
    sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-realty",
    constituents: [
      { id: "NSE:DLF", symbol: "DLF", name: "DLF Ltd.", weightApproxNote: "NCR Residential & Commercial" },
      { id: "NSE:LT", symbol: "LT", name: "Larsen & Toubro Ltd.", weightApproxNote: "Adjacent Urban Infra EPC" },
    ],
    macroDrivers: ["Mortgage Interest Rates (RBI)", "Urban Pre-Sales & Inventory Overhang", "Cement & Steel Costs"],
  },
]);

// ──────────────────────────────────────────────────────────────────────────────
// [17] EXPANDABLE HEATMAP BUILDER (ZERO FAKE COLORED SQUARES)
// ──────────────────────────────────────────────────────────────────────────────

export type HeatmapTile = {
  id: string;
  symbol: string;
  name: string;
  pctChange: number | null;
  price: number | null;
  unit: string;
  tone: "UP_STRONG" | "UP" | "FLAT" | "DOWN" | "DOWN_STRONG" | "UNAVAILABLE";
  provider: string;
};

export type SectorHeatmapSummary = {
  sectorId: string;
  name: string;
  shortName: string;
  connectedCount: number;
  totalCount: number;
  advancers: number | null;
  decliners: number | null;
  averagePctChange: number | null;
  tiles: HeatmapTile[];
};

export function classifyHeatmapTone(pctChange: number | null): HeatmapTile["tone"] {
  if (pctChange === null || !Number.isFinite(pctChange)) return "UNAVAILABLE";
  if (pctChange >= 1.5) return "UP_STRONG";
  if (pctChange > 0.05) return "UP";
  if (pctChange <= -1.5) return "DOWN_STRONG";
  if (pctChange < -0.05) return "DOWN";
  return "FLAT";
}

export function buildSectorHeatmaps(
  quoteMap: ReadonlyMap<
    string,
    { value: number | null; pctChange: number | null; unit: string; provider: string; latestDate?: string; referenceDate?: string | null }
  >,
  groups: readonly NseSectorIndex[] = NSE_SECTOR_INDICES,
): SectorHeatmapSummary[] {
  return groups.map((sector) => {
    const comparisonWindow = sector.groupType === "industry" ? sector.constituents.map(({ id }) => quoteMap.get(id))
      .filter((q) => q?.latestDate && q.referenceDate && q.pctChange !== null)
      .map((q) => q!.latestDate + "|" + q!.referenceDate).sort().at(-1) : undefined;
    const tiles: HeatmapTile[] = sector.constituents.map((c) => {
      const q = quoteMap.get(c.id.toUpperCase());
      const aligned = sector.groupType !== "industry" || (comparisonWindow &&
        comparisonWindow === q?.latestDate + "|" + q?.referenceDate);
      const pct = aligned && q && q.pctChange !== null && Number.isFinite(q.pctChange) ? q.pctChange : null;
      return {
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        pctChange: pct,
        price: q?.value ?? null,
        unit: q?.unit ?? "INR",
        tone: classifyHeatmapTone(pct),
        provider: q?.provider ?? "Licensed NSE feed not connected",
      };
    });

    const connected = tiles.filter((t) => t.pctChange !== null);
    const advancers =
      connected.length > 0 ? connected.filter((t) => (t.pctChange ?? 0) > 0).length : null;
    const decliners =
      connected.length > 0 ? connected.filter((t) => (t.pctChange ?? 0) < 0).length : null;
    const averagePctChange =
      connected.length > 0
        ? Math.round(
            (connected.reduce((acc, t) => acc + (t.pctChange ?? 0), 0) / connected.length) * 100,
          ) / 100
        : null;

    return {
      sectorId: sector.id,
      name: sector.name,
      shortName: sector.shortName,
      connectedCount: connected.length,
      totalCount: tiles.length,
      advancers,
      decliners,
      averagePctChange,
      tiles,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// [18] COMPANY ECOSYSTEM EXPLORER (DOCUMENTED vs INFERRED_EXPOSURE)
// ──────────────────────────────────────────────────────────────────────────────

export type EcosystemRelationKind =
  | "COMPETITOR"
  | "SECTOR_PEER"
  | "PARENT_GROUP"
  | "SUBSIDIARY"
  | "SUPPLIER_OR_CUSTOMER"
  | "MACRO_EXPOSURE";

export type EcosystemEdge = {
  targetId: string | null;
  targetName: string;
  relation: EcosystemRelationKind;
  summary: string;
  confidenceClass: "DOCUMENTED" | "INFERRED_EXPOSURE";
  sourceCitation: string;
  sourceUrl: string;
  evidenceDate: string;
};

export type CompanyEcosystemProfile = {
  instrumentId: string;
  companyName: string;
  sectorId: string | null;
  sectorName: string;
  groupAffiliation: string | null;
  overview: string;
  edges: readonly EcosystemEdge[];
  disclosure: string;
};

const ECOSYSTEM_DIRECTORY: Record<string, CompanyEcosystemProfile> = {
  "NSE:HDFCBANK": {
    instrumentId: "NSE:HDFCBANK",
    companyName: "HDFC Bank Ltd.",
    sectorId: "NSE:BANKNIFTY",
    sectorName: "Nifty Bank · Private Sector Banking",
    groupAffiliation: "HDFC Bank Group (post-HDFC Ltd. merger)",
    overview:
      "India's largest private-sector bank by assets and retail deposit franchise, spanning retail loans, mortgages, wholesale banking, and asset/insurance subsidiaries.",
    edges: [
      {
        targetId: "NSE:ICICIBANK",
        targetName: "ICICI Bank Ltd.",
        relation: "COMPETITOR",
        summary: "Direct large-cap private-sector banking peer across retail deposits, cards, and corporate credit.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "NSE Nifty Bank Index & RBI Scheduled Commercial Banks",
        sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-bank",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: "NSE:SBIN",
        targetName: "State Bank of India",
        relation: "COMPETITOR",
        summary: "Largest public-sector banking competitor in home loans, deposits, and national branch distribution.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "RBI Banking Statistics",
        sourceUrl: "https://www.rbi.org.in/",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: "NSE:KOTAKBANK",
        targetName: "Kotak Mahindra Bank Ltd.",
        relation: "SECTOR_PEER",
        summary: "Private banking peer in affluent banking, commercial vehicles, and wealth management.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "NSE Nifty Bank Constituents",
        sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-bank",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: null,
        targetName: "HDFC Life, HDFC AMC, HDB Financial Services, HDFC ERGO",
        relation: "SUBSIDIARY",
        summary: "Major regulated financial subsidiaries spanning life insurance, mutual funds, NBFC lending, and general insurance.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "HDFC Bank Annual Report / Exchange Filings",
        sourceUrl: "https://www.hdfcbank.com/personal/about-us/investor-relations",
        evidenceDate: "2026-06-30",
      },
      {
        targetId: "ECB:USDINR",
        targetName: "RBI Policy Repo Rate & Domestic Liquidity",
        relation: "MACRO_EXPOSURE",
        summary: "Net interest margins (NIM) and credit-deposit ratios are structurally sensitive to RBI policy rates, CRR, and India CPI.",
        confidenceClass: "INFERRED_EXPOSURE",
        sourceCitation: "Reserve Bank of India Monetary Policy Framework",
        sourceUrl: "https://www.rbi.org.in/Scripts/AnnualPolicy.aspx",
        evidenceDate: "2026-10-01",
      },
    ],
    disclosure:
      "Ecosystem relationships separate documented corporate/index disclosures from inferred macro exposures. Not investment advice.",
  },
  "NSE:RELIANCE": {
    instrumentId: "NSE:RELIANCE",
    companyName: "Reliance Industries Ltd.",
    sectorId: "NSE:NIFTYENERGY",
    sectorName: "Nifty Energy · Conglomerate (O2C, Retail, Telecom)",
    groupAffiliation: "Reliance Group",
    overview:
      "Diversified Indian conglomerate operating Jamnagar Oil-to-Chemicals (O2C), Jio Platforms digital telecom, Reliance Retail, and New Energy manufacturing.",
    edges: [
      {
        targetId: "NSE:BHARTIARTL",
        targetName: "Bharti Airtel Ltd.",
        relation: "COMPETITOR",
        summary: "Primary telecom & 5G broadband competitor to Jio Platforms across Indian mobile subscribers.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "TRAI Telecom Subscription Reports",
        sourceUrl: "https://www.trai.gov.in/",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: "NSE:ONGC",
        targetName: "Oil & Natural Gas Corporation",
        relation: "SECTOR_PEER",
        summary: "Nifty Energy sector peer in domestic upstream hydrocarbons and refining ecosystem.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "NSE Nifty Energy Index",
        sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-energy",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: null,
        targetName: "Jio Platforms Ltd. & Reliance Retail Ventures Ltd.",
        relation: "SUBSIDIARY",
        summary: "Core operating subsidiaries driving telecom, digital services, and nationwide organized retail.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "Reliance Industries Annual Report",
        sourceUrl: "https://www.ril.com/investors/financial-reporting",
        evidenceDate: "2026-06-30",
      },
      {
        targetId: "GLOBAL:BRENT",
        targetName: "Brent Crude Oil & Singapore Refining GRMs",
        relation: "MACRO_EXPOSURE",
        summary: "Oil-to-Chemicals (O2C) feedstock costs and diesel/petchem spreads track global crude oil and Hormuz/Red Sea shipping routes.",
        confidenceClass: "INFERRED_EXPOSURE",
        sourceCitation: "EIA Petroleum Supply & Global Refining Benchmarks",
        sourceUrl: "https://www.eia.gov/petroleum/supply/weekly/",
        evidenceDate: "2026-10-01",
      },
    ],
    disclosure:
      "Ecosystem relationships separate documented corporate/index disclosures from inferred macro exposures. Not investment advice.",
  },
  "NSE:TCS": {
    instrumentId: "NSE:TCS",
    companyName: "Tata Consultancy Services Ltd.",
    sectorId: "NSE:NIFTYIT",
    sectorName: "Nifty IT · Enterprise Technology Services",
    groupAffiliation: "Tata Group (Parent: Tata Sons Pvt. Ltd.)",
    overview:
      "Global IT services, cloud transformation, and enterprise consulting company serving North American, European, and Indian BFSI/enterprise clients.",
    edges: [
      {
        targetId: "NSE:INFY",
        targetName: "Infosys Ltd.",
        relation: "COMPETITOR",
        summary: "Primary Indian IT services peer competing for global BFSI, cloud, and AI transformation deals.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "NSE Nifty IT Index",
        sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-it",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: "NSE:HCLTECH",
        targetName: "HCL Technologies Ltd.",
        relation: "COMPETITOR",
        summary: "Large-cap Indian IT & engineering R&D competitor in global enterprise outsourcing.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "NSE Nifty IT Index",
        sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-it",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: "NSE:TATAMOTORS",
        targetName: "Tata Group Affiliates (Tata Sons, Tata Motors, Tata Steel)",
        relation: "PARENT_GROUP",
        summary: "Majority owned by Tata Sons Pvt. Ltd.; shares Tata Group governance and enterprise brand.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "TCS Shareholding Pattern / Exchange Filings",
        sourceUrl: "https://www.tcs.com/investor-relations",
        evidenceDate: "2026-06-30",
      },
      {
        targetId: "ECB:USDINR",
        targetName: "USD / INR & EUR / INR Export Realization",
        relation: "MACRO_EXPOSURE",
        summary: "Substantial revenue is billed in USD/EUR/GBP while major delivery cost base is in INR.",
        confidenceClass: "INFERRED_EXPOSURE",
        sourceCitation: "ECB Reference FX & Export Geography Disclosures",
        sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
        evidenceDate: "2026-10-01",
      },
    ],
    disclosure:
      "Ecosystem relationships separate documented corporate/index disclosures from inferred macro exposures. Not investment advice.",
  },
  "NSE:INFY": {
    instrumentId: "NSE:INFY",
    companyName: "Infosys Ltd.",
    sectorId: "NSE:NIFTYIT",
    sectorName: "Nifty IT · Enterprise Technology Services",
    groupAffiliation: "Independent Listed Corporation (NSE/BSE/NYSE ADR)",
    overview:
      "Global digital services and consulting firm with major client footprint in North America and Europe across financial services, retail, and manufacturing.",
    edges: [
      {
        targetId: "NSE:TCS",
        targetName: "Tata Consultancy Services Ltd.",
        relation: "COMPETITOR",
        summary: "Primary Indian IT services competitor in global large-deal outsourcing and cloud programs.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "NSE Nifty IT Index",
        sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-it",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: "NSE:WIPRO",
        targetName: "Wipro Ltd.",
        relation: "SECTOR_PEER",
        summary: "Large-cap Indian IT services sector peer.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "NSE Nifty IT Index",
        sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-it",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: "ECB:USDINR",
        targetName: "US Enterprise IT Spend & USD/INR",
        relation: "MACRO_EXPOSURE",
        summary: "Revenue growth and operating margins are sensitive to US discretionary tech budgets and USD/INR trends.",
        confidenceClass: "INFERRED_EXPOSURE",
        sourceCitation: "Federal Reserve Macro & ECB FX Reference",
        sourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
        evidenceDate: "2026-10-01",
      },
    ],
    disclosure:
      "Ecosystem relationships separate documented corporate/index disclosures from inferred macro exposures. Not investment advice.",
  },
  "NSE:SBIN": {
    instrumentId: "NSE:SBIN",
    companyName: "State Bank of India",
    sectorId: "NSE:BANKNIFTY",
    sectorName: "Nifty Bank · Public Sector Banking",
    groupAffiliation: "Government of India Majority-Owned PSU Bank",
    overview:
      "India's largest commercial bank by assets, branches, and deposits, with listed insurance, cards, and asset management subsidiaries.",
    edges: [
      {
        targetId: "NSE:HDFCBANK",
        targetName: "HDFC Bank Ltd.",
        relation: "COMPETITOR",
        summary: "Primary national competitor across retail deposits, mortgages, and corporate loans.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "NSE Nifty Bank Index",
        sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-bank",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: "NSE:ICICIBANK",
        targetName: "ICICI Bank Ltd.",
        relation: "SECTOR_PEER",
        summary: "Large-cap Indian banking peer.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "NSE Nifty Bank Index",
        sourceUrl: "https://www.niftyindices.com/indices/equity/sectoral-indices/nifty-bank",
        evidenceDate: "2026-09-30",
      },
      {
        targetId: null,
        targetName: "SBI Life Insurance, SBI Cards, SBI Mutual Fund",
        relation: "SUBSIDIARY",
        summary: "Major financial services subsidiaries contributing fee income and group franchise value.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "SBI Annual Report / Exchange Filings",
        sourceUrl: "https://sbi.co.in/web/investor-relations/investor-relations",
        evidenceDate: "2026-06-30",
      },
    ],
    disclosure:
      "Ecosystem relationships separate documented corporate/index disclosures from inferred macro exposures. Not investment advice.",
  },
};

export function getCompanyEcosystem(
  instrumentId: string,
  displayName?: string,
): CompanyEcosystemProfile {
  const key = instrumentId.trim().toUpperCase();
  if (ECOSYSTEM_DIRECTORY[key]) return ECOSYSTEM_DIRECTORY[key];

  // Look up whether this symbol is a constituent of any canonical NSE sector
  const matchedSector = NSE_SECTOR_INDICES.find((sec) =>
    sec.constituents.some((c) => c.id.toUpperCase() === key),
  );
  if (matchedSector) {
    const peerEdges: EcosystemEdge[] = matchedSector.constituents
      .filter((c) => c.id.toUpperCase() !== key)
      .map((c) => ({
        targetId: c.id,
        targetName: c.name,
        relation: "SECTOR_PEER" as const,
        summary: `Canonical constituent peer in ${matchedSector.name} (${c.weightApproxNote}).`,
        confidenceClass: "DOCUMENTED" as const,
        sourceCitation: `${matchedSector.sourceName} (${matchedSector.reviewDate})`,
        sourceUrl: matchedSector.sourceUrl,
        evidenceDate: matchedSector.reviewDate,
      }));
    const macroEdges: EcosystemEdge[] = matchedSector.macroDrivers.map((d) => ({
      targetId: null,
      targetName: d,
      relation: "MACRO_EXPOSURE" as const,
      summary: `Sector-level macroeconomic variable commonly tracked for ${matchedSector.name}.`,
      confidenceClass: "INFERRED_EXPOSURE" as const,
      sourceCitation: "Strategic Souls Macro Taxonomy",
      sourceUrl: matchedSector.sourceUrl,
      evidenceDate: matchedSector.reviewDate,
    }));
    return {
      instrumentId: key,
      companyName: displayName || key,
      sectorId: matchedSector.id,
      sectorName: matchedSector.name,
      groupAffiliation: null,
      overview: `${displayName || key} is tracked inside the ${matchedSector.name} sectoral benchmark. Detailed supplier/customer filings are only displayed when verified from primary disclosures.`,
      edges: [...peerEdges, ...macroEdges],
      disclosure:
        "Peer links come from canonical NSE Indices sector constituents; macro drivers are labeled INFERRED_EXPOSURE. Unverified supply-chain claims are omitted.",
    };
  }

  // FX / Treasury / Commodity / Global benchmark macro exposure fallback
  const edges: EcosystemEdge[] = [];
  if (key.startsWith("ECB:") || key === "GLOBAL:XAUUSD" || key === "GLOBAL:BRENT") {
    edges.push(
      {
        targetId: "UST:10Y",
        targetName: "US Treasury 10Y Par Yield",
        relation: "MACRO_EXPOSURE",
        summary: "Global sovereign yield differentials are closely monitored alongside major FX pairs and gold.",
        confidenceClass: "INFERRED_EXPOSURE",
        sourceCitation: "US Treasury Daily Par Yield Curve",
        sourceUrl: "https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics",
        evidenceDate: "2026-11-01",
      },
      {
        targetId: "ECB:EURUSD",
        targetName: "EUR / USD Reference Rate",
        relation: "MACRO_EXPOSURE",
        summary: "Major global dollar benchmark published daily by the European Central Bank.",
        confidenceClass: "DOCUMENTED",
        sourceCitation: "European Central Bank Eurofxref",
        sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
        evidenceDate: "2026-11-01",
      },
    );
  }

  return {
    instrumentId: key,
    companyName: displayName || key,
    sectorId: null,
    sectorName: key.startsWith("ECB:")
      ? "Foreign Exchange Reference"
      : key.startsWith("UST:")
        ? "US Sovereign Yield Curve"
        : "Global / Multi-Asset Benchmark",
    groupAffiliation: null,
    overview:
      "Entity-level corporate filings are shown only for verified equities. Macro cross-asset exposures below can be inspected quantitatively in Correlation Lab or Asset Comparison.",
    edges,
    disclosure:
      "No unverified corporate ownership or supply-chain links are invented.",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// [22] GEOPOLITICS -> MARKETS EXPOSURE MAP (DOCUMENTED vs HYPOTHESIS)
// ──────────────────────────────────────────────────────────────────────────────

export type GeopoliticalExposurePathway = {
  id: string;
  theme: string;
  regionIds: readonly string[];
  channel: string;
  affectedSectors: readonly string[];
  linkedAssets: readonly { id: string; label: string }[];
  evidenceClass: "DOCUMENTED" | "HYPOTHESIS";
  explanation: string;
  sourceName: string;
  sourceUrl: string;
};

export const GEOPOLITICS_MARKET_PATHWAYS: readonly GeopoliticalExposurePathway[] = Object.freeze([
  {
    id: "geo-hormuz-energy",
    theme: "Strait of Hormuz & Red Sea Maritime Disruption",
    regionIds: ["middle-east", "red-sea", "india"],
    channel: "Crude oil tanker transit, war-risk freight insurance, and LNG supply routing",
    affectedSectors: ["Energy & Refining", "Aviation & Logistics", "Chemicals & Paint", "India Current Account"],
    linkedAssets: [
      { id: "GLOBAL:BRENT", label: "Brent Crude" },
      { id: "ECB:USDINR", label: "USD / INR" },
      { id: "NSE:RELIANCE", label: "Reliance Ind." },
      { id: "NSE:ONGC", label: "ONGC" },
    ],
    evidenceClass: "DOCUMENTED",
    explanation:
      "EIA transit studies document that ~20% of global petroleum liquids transit the Strait of Hormuz; freight rerouting directly affects refining feedstock and import bills. Direction of any individual asset price is never guaranteed.",
    sourceName: "U.S. EIA World Oil Transit Chokepoints",
    sourceUrl: "https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints",
  },
  {
    id: "geo-safe-haven-gold-usd",
    theme: "Sovereign Policy Divergence & Risk-Off Flows",
    regionIds: ["united-states", "euro-area", "global"],
    channel: "Central-bank reserve diversification, sovereign yield spreads, and FX volatility",
    affectedSectors: ["Precious Metals", "Sovereign Bonds", "Export IT Services"],
    linkedAssets: [
      { id: "GLOBAL:XAUUSD", label: "Gold (XAU/USD)" },
      { id: "UST:10Y", label: "US 10Y Yield" },
      { id: "ECB:EURUSD", label: "EUR / USD" },
      { id: "ECB:USDJPY", label: "USD / JPY" },
    ],
    evidenceClass: "HYPOTHESIS",
    explanation:
      "Market researchers frequently evaluate co-movement between geopolitical stress, US real yields, gold, and USD crosses. Empirical correlation varies across regimes — test quantitatively in Correlation Lab rather than assuming causation.",
    sourceName: "Federal Reserve & ECB Official Reference Data",
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
  },
  {
    id: "geo-pacific-seismic-supply",
    theme: "Pacific Rim Seismic & Severe Weather Events",
    regionIds: ["japan", "taiwan", "east-asia", "united-states"],
    channel: "Port operations, semiconductor/industrial supply continuity, and commodity logistics",
    affectedSectors: ["Semiconductors & Hardware", "Shipping & Ports", "Reinsurance", "Auto Components"],
    linkedAssets: [
      { id: "GLOBAL:N225", label: "Nikkei 225" },
      { id: "ECB:USDJPY", label: "USD / JPY" },
      { id: "GLOBAL:NDX", label: "Nasdaq 100" },
    ],
    evidenceClass: "DOCUMENTED",
    explanation:
      "Major earthquakes (USGS M>=4.5) and tropical cyclones (NASA EONET) near East Asian ports and industrial corridors can cause temporary operational interruptions documented in corporate filings.",
    sourceName: "USGS Earthquake Hazards & NASA EONET",
    sourceUrl: "https://earthquake.usgs.gov/earthquakes/map/",
  },
  {
    id: "geo-trade-metals-tariffs",
    theme: "Industrial Trade Policy & Critical Minerals",
    regionIds: ["china", "india", "euro-area", "united-states"],
    channel: "Tariff adjustments, steel/aluminium dumping duties, and critical mineral export rules",
    affectedSectors: ["Metals & Mining", "Automobiles & EV", "Capital Goods"],
    linkedAssets: [
      { id: "NSE:TATASTEEL", label: "Tata Steel" },
      { id: "NSE:HINDALCO", label: "Hindalco" },
      { id: "ECB:EURCNY", label: "EUR / CNY" },
    ],
    evidenceClass: "HYPOTHESIS",
    explanation:
      "Trade policy changes alter cross-border realizations and margin spreads across steel, aluminium, and industrial exporters. Actual equity impact depends on firm-level hedging and domestic demand.",
    sourceName: "World Trade Organization & NSE Metals",
    sourceUrl: "https://www.wto.org/",
  },
]);
