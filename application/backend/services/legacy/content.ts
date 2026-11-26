export const LEGAL_VERSION =
  "Draft source review 14 November 2026 · Qualified review required";
export type LegalDoc = {
  title: string;
  intro: string;
  sections: { title: string; body: string }[];
};
export const officialSources = [
  {
    title:
      "SEBI Research Analysts amendment · official October 2026 notification",
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
    area: "Market-data rights",
    status: "BLOCKED",
    evidence:
      "Owner and data lead: signed display, historical, processing, storage, derived works and redistribution entitlements required. No numeric provider configured. Numeric quotes, scans, news and calendar ingestion stay disabled. Official TradingView widgets are a separate on-request human display, with attribution and timing limitations.",
  },
  {
    area: "Financial regulatory classification",
    status: "COUNSEL REVIEW",
    evidence:
      "Indian securities counsel: classify individualized research, reports, ratings, subscriptions and strategy licences under current RA/IA rules, including October 2026 amendments and exact effective dates. Required registrations and written approval missing. Advice and public research disabled.",
  },
  {
    area: "Privacy, retention and minors",
    status: "COUNSEL REVIEW",
    evidence:
      "Privacy lead and counsel: verify phased DPDP commencement, IT duties, consent, deletion/backup handling, residency, processors and age assurance. Adult self-declaration only. Automatic old-account cleanup disabled to preserve existing data. Wider access blocked.",
  },
  {
    area: "Public community and marketplace",
    status: "BLOCKED",
    evidence:
      "Owner and moderation lead: implement and test publishing consent, abuse controls, reporting, appeals, IP rights, takedown and creator/purchaser terms. Private notes only; groups, DMs, public Souls and sales disabled.",
  },
  {
    area: "Billing, tax and pricing",
    status: "OWNER + COUNSEL",
    evidence:
      "Owner, finance and counsel: validate costs, business identity, GST/invoices, consumer rules, refunds and processor authorization. Free 5 and Premium 49 scans at ₹49/month are unapproved hypotheses. No checkout, advertising or quota charging.",
  },
  {
    area: "Security and recovery",
    status: "INDEPENDENT REVIEW",
    evidence:
      "Security lead: independent penetration test, production multi-user isolation, recovery, backups, incident notification and monitored grievance contact required. No public launch or broker connection authorized.",
  },
  {
    area: "Broker and execution boundary",
    status: "DISABLED",
    evidence:
      "Read-only portfolio sync requires scoped revocable provider consent. Future execution is a separate approved project with independent authorization, security and regulatory review. No order routing or broker credential form.",
  },
];
export const documents: Record<string, LegalDoc> = {
  about: {
    title: "About Strategic Souls",
    intro:
      "A research workspace that preserves what you thought and what changed. Global Vertex Vectors · private research foundation.",
    sections: [
      {
        title: "Three workspaces",
        body: "Strategic Global: Markets, Portfolio, Intelligence and Economic Calendar. Social Community: Feed, Groups & Conversations, Public Souls and Soul Marketplace. Soul Intelligence: Soul Builder, Soul Scan, Options Lab and Soul Graveyard.",
      },
      {
        title: "Actual capabilities",
        body: "Private immutable notebook Souls with reference timestamps, counter-theses, falsification criteria and review windows; append-only manual reviews, linked revisions, archive/restore and JSON exports; immutable strategy drafts, manual holdings, validated CSV import, private discussion drafts, an educational Black–Scholes–Merton calculator, account export and deletion. Licensed market integrations are not configured. No predictive performance or corporate/regulatory status is claimed.",
      },
    ],
  },
  terms: {
    title: "Private beta terms",
    intro:
      "Draft for qualified review. Research/analysis, not assured investment returns.",
    sections: [
      {
        title: "Eligibility",
        body: "Owner-authorized adults aged 18+ only. Your self-declaration is not verified age assurance. Do not upload broker passwords, API keys, Aadhaar, PAN, payment credentials or other unnecessary identifiers.",
      },
      {
        title: "Boundaries",
        body: "No personalized investment advice, brokerage service, automatic execution, public research sale, subscriptions or assured profits. Educational labels do not determine regulatory classification. Wider access and commerce require review and explicit owner approval.",
      },
      {
        title: "Your records",
        body: "Saving a notebook creates an immutable private research record, not a validated prediction or backtest. Formula drafts remain separate. Manual reviews are user claims; original inputs cannot be overwritten. Holdings reflect your own entries; cost is not a current quote. Export before account deletion. Provider logs and backups require separate retention review.",
      },
    ],
  },
  privacy: {
    title: "Privacy and account controls",
    intro:
      "Version 2026-11-14-v4. Restricted Site storage; no ads or default collective training. Discovery, messaging and group sharing are controlled inside Account Settings. Third-party charts are disclosed before loading.",
    sections: [
      {
        title: "Data stored",
        body: "Authenticated account ID, normalized email address, salted PBKDF2 password hash (for email accounts), hashed session tokens, display alias, age self-declaration, consent version/time, activity time, rate counters, support requests, private notebook Souls, source URLs and interpretations, review events, strategy drafts, holdings and notes. Cloudflare infrastructure and hosting providers may hold separate operational logs.",
      },
      {
        title: "Use and control",
        body: "Data supports your private research and any social features you explicitly use. Discovery is opt-in; message requests and read receipts have separate privacy settings. Group sharing does not grant Site access or model-training consent. Personal evidence reuse is separately controlled; no cross-user model is activated by default. Export and account deletion remain available. Saved scans and revisions are immutable; drafts can be versioned. Holdings and notes can be individually removed.",
      },
      {
        title: "Preservation and retention",
        body: "Existing synthetic records remain unchanged and excluded from active market views. Their ownership links are retained unless you explicitly erase your account. Automatic inactivity deletion is suspended pending a reviewed retention policy. Unlinked legacy synthetic records and provider backups are separate from app-level deletion.",
      },
      {
        title: "Unresolved public-launch gates",
        body: "Controller identity, monitored grievance contact, processor terms, encryption at rest, residency, transfer review, age assurance, applicable phased DPDP duties and backup erasure evidence require verification. Do not assume India-only hosting.",
      },
    ],
  },
  risk: {
    title: "Research risk",
    intro: "Research/analysis, not assured investment returns.",
    sections: [
      {
        title: "Evidence first",
        body: "No calibrated probability, hit rate or investment performance is claimed. Missing values remain unknown. Correlation is not causation; historical similarity does not establish prediction. Model error, leverage, costs, gaps, liquidity and corporate actions can invalidate an analysis.",
      },
      {
        title: "Options mathematics",
        body: "User-entered scenarios are hypothetical model calculations, not executable premiums. Black–Scholes–Merton assumes European exercise, continuous trading, constant parameters and lognormal prices. Contract validation, margin, option chains, IV and live Greeks are unavailable.",
      },
    ],
  },
  "data-sources": {
    title: "Sources and entitlements",
    intro:
      "Official TradingView embeds are a separate human-viewing layer. No GVV numeric market-data provider is configured or verified as entitled.",
    sections: [
      {
        title: "Required quote contract",
        body: "Provider, exact exchange and native symbol, normalized ID, currency, units, contract, update/acquisition times, session, entitlement and freshness must all be verified before a quote can be labelled live. Public visibility is not a data licence.",
      },
      {
        title: "Status policy",
        body: "NOT CONFIGURED, NOT ENTITLED, CONNECTING, LIVE CONFIRMED, EXCHANGE CLOSED, DELAYED, STALE, SOURCE ERROR and OFFLINE are distinct states. Every GVV numeric quote uses NOT CONFIGURED. Widget frames have separate loading/failure states and do not establish a numeric entitlement. No stale or synthetic fallback exists.",
      },
    ],
  },
  methodology: {
    title: "Methods and reproducibility",
    intro:
      "Notebook observations, formula drafts and verified market research are distinct.",
    sections: [
      {
        title: "Safe formula DSL",
        body: "Allowed fields: close, volume, rsi, roic, revenueGrowth and debtEquity. Allowed functions: sma(x,n), zscore(x,n), abs(x). Arithmetic and single comparisons use a bounded AST parser with units. No arbitrary JavaScript or Python executes. Only past and current completed observations may be evaluated.",
      },
      {
        title: "Learning and abstention",
        body: "Adaptive weights, similarity retrieval, statistical validation and opt-in community aggregates await authentic data and validated evaluation infrastructure. No learning or model retraining is claimed. Missing data blocks scans before quota deduction.",
      },
      {
        title: "Notebook lifecycle",
        body: "A notebook stores an immutable original with ownership, server timestamp and integrity hash. Append-only reviews, archive events and linked revisions preserve the original. Source links and manual observations remain USER SUPPLIED. No verified automatic outcome or market scan is claimed. Quantitative analysis abstains until independently verified, entitled inputs exist.",
      },
    ],
  },
  contact: {
    title: "Contact and grievance",
    intro:
      "Private request recording is available in Settings. No staffed external support service is claimed.",
    sections: [
      {
        title: "Scope",
        body: "Requests are saved to your account. No email or notification is sent. A monitored contact, responsible operator, escalation process and legally reviewed response deadlines are required before wider launch.",
      },
    ],
  },
  subscriptions: {
    title: "Proposed subscriptions",
    intro: "Not offered for purchase. Payments and advertising are disabled.",
    sections: [
      {
        title: "Business hypotheses",
        body: "Proposed Free: 5 completed scans per month. Proposed Premium: ₹49 per month, 49 completed scans, no ads. Monthly period and commercial terms await owner approval. Provider costs and feasibility have not been validated.",
      },
      {
        title: "Future ledger",
        body: "Server-side atomic quota ledger, idempotent signed payment webhooks and failed-provider refunds are required before billing. Marketplace report access and strategy licences have separate future rights and fees.",
      },
    ],
  },
};

// Optional embeds are never mounted on Portfolio or private notebook views.
documents.privacy.sections.push({
  title: "Optional TradingView display",
  body: "Charts and calendar contact TradingView only after you choose to load them. TradingView reports receiving the embedding page URL, widget type, public symbol and IP address. Do not put private details in page URLs. GVV does not send your thesis, portfolio or evidence text. Unload stops that view; attribution and vendor notices remain visible. Fonts are self-hosted under SIL OFL licences.",
});
documents["data-sources"].sections.push({
  title: "Official embedded charts",
  body: "TradingView provides free branded human-viewing widgets. Stock exchange data may be delayed; supported forex and crypto may be real-time. Some symbols are unavailable. GVV never extracts widget values or events for scans, scores, alerts, portfolio NAV or calculations. A symbol-page mapping does not prove widget availability.",
});

// X1 factual availability update. Draft legal classification remains subject to review.
documents.about.sections = [
  {
    title: "Three dashboards",
    body: "Global: official daily market references, private watchlists, manual portfolios and an exchange globe. Strategy: Soul Scan, Market Radar and Formula Lab. Community: Body profiles, private groups, shared versioned Souls and group discussions.",
  },
  {
    title: "Working and unavailable",
    body: "Daily ECB FX and US Treasury yields are connected when source retrieval succeeds. Current daily FX filters preserve immutable methods, source snapshots and actual results. Private groups enforce roles, revision conflicts, exact-revision group publication, Supers and comments. Intraday equities, calibrated predictions, public posting, independent external signup, photo uploads, broker execution and billing are not active.",
  },
];
documents["data-sources"].intro =
  "Official daily ECB FX references and US Treasury par yields are the current numerical subset. Intraday exchange entitlements are not configured. TradingView is a separate optional human-viewing layer.";
documents["data-sources"].sections[1].body =
  "Daily publications, historical observations, stale values, unavailable values and errors remain distinct. Every displayed daily value retains a provider observation date, retrieval time, units and source link. No live tick claim is made. Market sessions are scheduled states, separate from quote freshness.";
documents.methodology.sections[0].body =
  "The X1 safe typed rule language supports ALL/ANY/NOT, arithmetic, comparisons and bounded technical functions. Both Simple blocks and Advanced formulas compile to one canonical AST. Eligible daily FX close data can execute; volume, fundamental, macro, derivative, event or sentiment dependencies without eligible input yield UNKNOWN. No arbitrary JavaScript, Python or SQL executes.";
documents.methodology.sections[2].body =
  "Existing notebook originals remain immutable with append-only reviews. X1 scan snapshots preserve original method, exact eligible data, results and integrity hash. All runs appear in Scan History; only explicit review, invalidation or retirement enters the Graveyard. Retrieval-time knowledge does not establish historical point-in-time availability or a backtest.";
documents.subscriptions.sections = [
  {
    title: "No active pricing",
    body: "Simple and Advanced research currently use explicit bounded fair-use controls. No checkout or payment collection is active. Proposed three free Advanced runs and optional credit pricing remain internal concepts pending a defensible cost model and explicit approval.",
  },
  {
    title: "Before billing",
    body: "Provider rights, payment processor approval, KYC, refunds, taxes, accounting and idempotent credit handling require validation. No subscriptions, advertising, strategy sales or purchases are enabled.",
  },
];
releaseGates[0].evidence =
  "ECB attributed daily reference data and US government daily yield facts supply a documented working subset. Intraday exchange display/non-display, storage and redistribution rights remain unconfigured; no universal live coverage.";
releaseGates[3].evidence =
  "Private Body profiles, member-only groups, versioned methods, exact-revision group posts, Supers, threads, reports and moderation are implemented and locally tested. Public finance publication, marketplace sales and external signup remain disabled pending qualified review and explicit owner approval.";
releaseGates[4].evidence =
  "No active product pricing, checkout, advertising or paid quota charging. Proposed credit economics await actual cost modelling, processor/KYC, tax/consumer review and explicit owner approval.";

documents.privacy.sections.push({
  title: "Research network and erasure",
  body: "Optional Body profiles, discovery preferences, conversation requests, messages, read state, blocks, reports, bookmarks, notifications, group discussions and private chart layouts are stored in the Cloudflare D1 database. Messages are server-authorized and are not claimed end-to-end encrypted. Account erasure removes paired conversations, including recipient copies, and owned shared groups only after separate acknowledgement of that impact. Export first. Provider runtime secrets are managed separately in owner-only Cloudflare Workers settings, never in profile fields or messages. Public publishing and paid services remain inactive.",
});
