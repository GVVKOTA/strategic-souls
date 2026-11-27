export const LEGAL_VERSION =
  "Strategic Souls X 3.0 · Updated 28 November 2026 · Formal counsel review pending";

export type LegalDoc = {
  title: string;
  intro: string;
  sections: { title: string; body: string }[];
};

export const officialSources = [
  {
    title: "SEBI Research Analysts amendment · official October 2026 notification",
    url: "https://www.sebi.gov.in/web/?file=https%3A%2F%2Fwww.sebi.gov.in%2Fsebi_data%2Fattachdocs%2Foct-2026%2F1791796596784.pdf",
  },
  {
    title: "SEBI official regulations · verify current IA and RA obligations",
    url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListingLegal=yes&sid=1&ssid=3",
  },
  {
    title:
      "MeitY Digital Personal Data Protection Rules 2025 and commencement documents",
    url: "https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025",
  },
  {
    title: "NSE Data Sharing & Usage Policy",
    url: "https://www.nseindia.com/static/market-data/nse-data-policy",
  },
];

export const releaseGates = [
  {
    area: "Market-data commercial rights",
    status: "PROVIDER KEY / LICENCE GATE",
    evidence:
      "Official daily ECB FX, US Treasury yields, USGS earthquakes, and NASA EONET feeds are active with source attribution. Shared commercial NSE/BSE/MCX intraday/EOD display and redistribution require an active licensed provider key (MARKET_DATA_API_KEY or provider-specific secret) and commercial exchange agreement; unentitled symbols fail closed honestly.",
  },
  {
    area: "Financial regulatory classification",
    status: "COUNSEL REVIEW",
    evidence:
      "Indian securities counsel review is required to classify educational deterministic scans, published Community Souls, and any future commercial tiers under SEBI IA/RA rules (including October 2026 amendments). No investment advice, SEBI registration, or automated trade routing is offered.",
  },
  {
    area: "Privacy, retention and minors (DPDP)",
    status: "COUNSEL REVIEW",
    evidence:
      "Self-declared 18+ consent, JSON export, active session revocation, and confirmed permanent deletion are implemented in Settings -> Privacy & Active Sessions. Formal DPDP commencement review, grievance officer appointment, processor terms, and backup retention certification remain under counsel review.",
  },
  {
    area: "Community publishing and safety",
    status: "IMPLEMENTED · GOVERNANCE REVIEW",
    evidence:
      "Body ID profiles, opt-in public Soul publishing (derived-only payloads), member-only Rooms, direct messages, blocks, reports, and adult consent gates are implemented and tested. Staffed 24/7 moderation SLAs and marketplace commerce are not claimed or enabled.",
  },
  {
    area: "Billing, tax and pricing",
    status: "DISABLED",
    evidence:
      "No paid subscriptions, checkout flows, advertising, or strategy marketplace billing are active. Server-side fair-use scan quotas (20 Classic/IST day; 1 Advanced/60m) apply without financial charges.",
  },
  {
    area: "Security, email transport and recovery",
    status: "VERIFY BEFORE PUBLIC LAUNCH",
    evidence:
      "PBKDF2 password hashing, SHA-256 HttpOnly session cookies, query-string log redaction, atomic reset/email-change batches, full-schema SQLite restore drills, and cron heartbeat monitoring are implemented. Production outbound transactional email requires configuring RESEND_API_KEY or SS_EMAIL_WEBHOOK_URL in Cloudflare Worker secrets.",
  },
  {
    area: "Broker and execution boundary",
    status: "DISABLED",
    evidence:
      "Strategic Souls never requests broker login passwords, never routes orders, and never executes trades. Portfolio tracking is strictly manual or user-imported CSV.",
  },
];

export const documents: Record<string, LegalDoc> = {
  about: {
    title: "About Strategic Souls",
    intro:
      "Strategic Souls X 3.0 — Market intelligence that remembers. A deterministic financial research workspace and Soul Network by Global Vertex Vectors.",
    sections: [
      {
        title: "Three connected workspaces",
        body: "Global: 8-tile Markets overview, manual Portfolio with exact fixed-point math, Watchlists, Price Alerts, Economic Calendar, Market Intelligence, Sector Heatmap, and an interactive 3D Strategic Globe. Strategy: Soul Scan (Classic 50 editable presets + Advanced Discover/Build/Draw), SOUL MEMORY daily ranking, GRAVEYARD immutable scan archive, and Formula Lab calculators. Community: Soul Feed, Body ID profiles, private Rooms, and direct messages.",
      },
      {
        title: "Design principles",
        body: "Deterministic calculations on completed historical bars, strict fail-closed market-data entitlement checks (never fabricating live quotes), immutable GRAVEYARD lineage snapshots, and private-by-default personal research. No SEBI registration, investment advice, brokerage execution, or active billing is claimed.",
      },
    ],
  },
  terms: {
    title: "Strategic Souls X 3.0 Terms of Use",
    intro:
      "Updated 28 November 2026 · Global Vertex Vectors. Educational financial research only — not investment advice or trade execution. Formal legal counsel review remains pending.",
    sections: [
      {
        title: "Eligibility (18+)",
        body: "Intended for adults aged 18 or older using self-declared adult confirmation (verified ID age assurance is not implemented). Do not enter broker passwords, Aadhaar, PAN, or payment credentials.",
      },
      {
        title: "Educational research boundaries",
        body: "No personalized investment advice, SEBI RA/IA registration, brokerage execution, automated trade routing, assured returns, or paid subscriptions. Deterministic scans, Formula Lab math, and SOUL MEMORY daily rankings are analytical study tools.",
      },
      {
        title: "Immutable records and explicit publishing",
        body: "Completed scans are stored in your private GRAVEYARD with immutable original formulas, cutoffs, and canonical lineage digests; re-runs create new linked snapshots. Watchlists, portfolios, and direct messages stay private unless you explicitly publish a derived-only Soul to the Soul Feed or a Room.",
      },
      {
        title: "Market data and fair use",
        body: "Exchange prices require configured, entitled provider keys and completed exchange sessions; unavailable symbols fail closed honestly. Fair-use quotas allow 20 completed Classic scans per IST day and 1 completed Advanced scan per rolling 60 minutes (failed scans do not deduct quota).",
      },
    ],
  },
  privacy: {
    title: "Strategic Souls X 3.0 Privacy Policy",
    intro:
      "Updated 28 November 2026 · Global Vertex Vectors. Private by default, zero advertising trackers, self-hosted fonts, and built-in export and deletion controls.",
    sections: [
      {
        title: "Data stored",
        body: "First-party Cloudflare D1 accounts store normalized email, salted PBKDF2 password hashes, SHA-256 hashed HttpOnly session tokens, Body ID handle, display name, avatar/banner selection, 18+ consent timestamp, watchlists, manual portfolios, price alerts, immutable GRAVEYARD scan snapshots, reproducible lineage metadata, private daily SOUL MEMORY state, and any Community posts, rooms, or direct messages you explicitly create.",
      },
      {
        title: "SOUL MEMORY and daily IST reset",
        body: "Private per-account SOUL MEMORY observations and frozen daily scoring snapshots reset automatically at 00:00 IST (18:30 UTC). This reset clears only the daily adaptive memory state and never deletes or alters your permanent GRAVEYARD archive.",
      },
      {
        title: "Private defaults and third-party embeds",
        body: "Portfolios, watchlists, alerts, GRAVEYARD scans, and direct messages are never public by default and are never used for advertising or cross-user model training. Direct messages are server-authorized and are not claimed end-to-end encrypted. Optional TradingView display embeds load only on explicit action and receive standard browser metadata (IP and public symbol) without accessing your private notes or portfolio.",
      },
      {
        title: "Export, active sessions and deletion",
        body: "Use Settings -> Privacy to export your data as JSON or permanently delete your account after explicit confirmation, and Settings -> Active Sessions to revoke devices. Infrastructure operational logs redact query strings; Cloudflare backups follow infrastructure retention schedules. Formal DPDP counsel review and India-only residency certification are not claimed.",
      },
    ],
  },
  risk: {
    title: "Research risk disclosures",
    intro: "Educational market analysis — never assured investment returns.",
    sections: [
      {
        title: "Evidence and non-prediction",
        body: "Historical pattern similarity, technical indicator matches, and SOUL MEMORY daily rankings do not predict future returns or establish calibrated win probabilities. Missing data remains unknown rather than extrapolated. Leverage, slippage, liquidity gaps, taxes, and corporate actions can invalidate any historical thesis.",
      },
      {
        title: "Formula Lab calculators",
        body: "Black–Scholes–Merton options pricing, implied volatility, CAGR, XIRR, and manual historical investment calculators evaluate user-entered mathematical scenarios under standard textbook assumptions (e.g. European exercise, constant volatility) and do not represent live executable option chains or guaranteed returns.",
      },
    ],
  },
  "data-sources": {
    title: "Data sources and entitlements",
    intro:
      "Official public references are active; commercial exchange feeds require valid provider entitlements and fail closed when absent.",
    sections: [
      {
        title: "Connected public and environmental feeds",
        body: "Daily ECB FX reference rates, US Treasury par yields, USGS M4.5+ earthquakes, NASA EONET natural hazard events, and NASA Blue/Black Marble 3D Earth textures are retrieved with attribution and cached safely.",
      },
      {
        title: "Universal exchange gateway and rights gating",
        body: "Commercial exchange OHLCV bars and quotes flow through the provider-neutral Universal Market Data Gateway using configured server-side secrets. Every displayed price carries explicit attribution, exchange session state, and rights flags (FULL_DISPLAY vs DERIVED_ONLY). Unentitled or stale symbols never fall back to fabricated prices.",
      },
      {
        title: "Optional TradingView viewing widgets",
        body: "TradingView embeds are an optional human-viewing chart layer only. Strategic Souls never scrapes or extracts widget prices for scans, alerts, SOUL MEMORY, or portfolio calculations.",
      },
    ],
  },
  methodology: {
    title: "Methods, timeframes and reproducibility",
    intro:
      "Five canonical timeframes, safe AST formula execution, immutable GRAVEYARD lineage, and daily point-in-time SOUL MEMORY.",
    sections: [
      {
        title: "Five canonical scan timeframes",
        body: "Strategic Souls X 3.0 evaluates new scans across five exact timeframes: 30m (7-day window), 1H (14-day window), 3H (1-month calendar-clamped window), 6H (2-month calendar-clamped window), and 24H / Daily (12-month calendar-clamped window). 3H and 6H candles are session-anchored to native exchange open hours (e.g. NSE 09:15 IST, MCX 09:00 IST) with incomplete stubs dropped and null volumes preserved honestly. Archived weekly and monthly scans remain readable in GRAVEYARD.",
      },
      {
        title: "Safe deterministic AST and reproducible lineage",
        body: "Both Classic 50 presets and Advanced formulas compile into one bounded, side-effect-free AST evaluated strictly on completed historical bars (never executing arbitrary JavaScript, Python, or SQL). Every completed scan persists its canonical universe hash, formula AST digest, timeframe cutoff, and optional rerun parent ID so historical results can be verified or re-run cleanly.",
      },
      {
        title: "SOUL MEMORY daily ranking (0–100)",
        body: "SOUL MEMORY computes a deterministic, bounded 0–100 relative ranking index from point-in-time frozen daily observations with volume renormalization and Bayesian shrinkage — never peeking at future bars. State is scoped per account and IST trading day and resets cleanly at 00:00 IST without touching your GRAVEYARD archive.",
      },
    ],
  },
  contact: {
    title: "Help & Support",
    intro:
      "Strategic Souls X 3.0 · Global Vertex Vectors. Find workspace guidance or contact us directly via our verified support email.",
    sections: [
      {
        title: "Verified contact email",
        body: "Reach Global Vertex Vectors for technical help, account questions, bug reports, or privacy requests at strategicsoulsgvv@gmail.com. Please include your Body ID handle (never your password or private keys) when writing about an account issue.",
      },
      {
        title: "Self-service account controls",
        body: "Signed-in members can manage profile details, email verification, password changes, active device revocation, JSON data export, and confirmed permanent account deletion directly inside Workspace -> Settings.",
      },
      {
        title: "Support scope disclosure",
        body: "Global Vertex Vectors operates Strategic Souls as an independent research project. No 24/7 staffed support desk, guaranteed turnaround SLA, or formally appointed statutory grievance officer is claimed at this stage.",
      },
    ],
  },
  subscriptions: {
    title: "Usage allowances and pricing",
    intro: "Strategic Souls X 3.0 has no paid subscriptions, checkout, or ads.",
    sections: [
      {
        title: "Fair-use scan allowances",
        body: "Classic Soul Scan allows up to 20 completed scans per IST civil day (resetting at 00:00 IST). Advanced Soul Scan (Discover, Build, and Draw) allows 1 completed scan per rolling 60-minute window. Failed or unentitled runs never deduct quota.",
      },
      {
        title: "No active billing",
        body: "No credit card forms, paid tiers, strategy marketplace fees, or advertising networks are enabled. Any future commercial offering would require separate commercial market-data licensing, tax/GST setup, and legal counsel review.",
      },
    ],
  },
};
