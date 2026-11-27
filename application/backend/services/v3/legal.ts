import type { LegalDoc } from "../legacy/content";

/**
 * Strategic Souls X 3.0 — Authoritative Privacy Policy and Terms of Use.
 * Truthfully reflects first-party Cloudflare D1 accounts, explicit public Soul publishing,
 * private daily SOUL MEMORY with 00:00 IST reset, and unresolved formal counsel review.
 */
export const V3_LEGAL: Record<string, LegalDoc> = {
  terms: {
    title: "Strategic Souls X 3.0 Terms of Use",
    intro:
      "Effective draft 28 November 2026 · Global Vertex Vectors. Educational financial research workspace — not investment advice, brokerage execution, or assured returns. Formal Indian securities and privacy counsel review remains pending.",
    sections: [
      {
        title: "Eligibility and adult access (18+)",
        body: "Strategic Souls is intended strictly for adults aged 18 or older. Creating and saving workspace records requires self-declaring that you are 18+ and accepting these Terms and Privacy disclosures. Self-declaration is not verified government-ID age assurance. Never enter broker passwords, Aadhaar, PAN, bank details, or payment credentials anywhere in the workspace.",
      },
      {
        title: "Educational research without advice or execution",
        body: "Strategy formulas, Classic 50-rule presets, Advanced Blueprint/Build/Draw scans, Formula Lab calculators, and SOUL MEMORY rankings are deterministic educational and analytical tools. Global Vertex Vectors does not claim SEBI Investment Adviser or Research Analyst registration, does not provide personalized investment advice, does not route orders, and does not guarantee trading outcomes or win rates.",
      },
      {
        title: "Private research vs explicit public sharing",
        body: "Watchlists, manual portfolios, price alerts, GRAVEYARD scan archives, direct messages, and SOUL MEMORY daily states are private to your account by default. Publishing a Soul to the public Soul Feed or a Room requires an explicit action by you and shares only safe derived strategy summaries (formula, timeframe, match count, and thesis note) — never your portfolio holdings, email, or account secrets. You must have permission to share any text you publish.",
      },
      {
        title: "Reproducibility, immutability and SOUL MEMORY",
        body: "Completed scans are archived in your GRAVEYARD with immutable original formulas, timeframe cutoffs, and canonical lineage digests. Re-running a scan creates a new linked snapshot without overwriting history. SOUL MEMORY is a deterministic bounded 0–100 relative ranking index computed from your private daily scan observations and reset automatically at 00:00 IST; resetting SOUL MEMORY never deletes or mutates your GRAVEYARD archive.",
      },
      {
        title: "Market data rights and availability",
        body: "Official public references (ECB daily FX, US Treasury yields, USGS earthquakes, NASA EONET events) are displayed with source attribution. Exchange quotes and historical OHLCV bars require configured, entitled commercial provider keys and valid exchange session schedules. Unentitled, delayed, or missing instruments fail closed honestly rather than fabricating synthetic prices. Optional TradingView embeds are a separate human-viewing display layer and never supply numeric scan inputs.",
      },
      {
        title: "No active billing or commercial guarantees",
        body: "Strategic Souls X 3.0 currently operates under bounded server-side fair-use allowances (20 Classic scans per IST day; 1 Advanced scan per rolling 60 minutes; failed runs do not deduct quota). No paid subscriptions, checkout, advertising, or marketplace sales are active.",
      },
    ],
  },
  privacy: {
    title: "Strategic Souls X 3.0 Privacy Policy",
    intro:
      "Effective draft 28 November 2026 · Global Vertex Vectors. Private by default, zero ad trackers, and transparent account export and permanent deletion controls. Formal DPDP and legal counsel review remains pending.",
    sections: [
      {
        title: "Account and workspace data we store",
        body: "First-party accounts are stored in Cloudflare D1 and record your normalized email address, salted PBKDF2 password hash, SHA-256 hashed session tokens, Body ID handle, display name, chosen avatar and banner presets, 18+ self-declaration and consent timestamp, active session metadata, watchlists, manual portfolio entries, price alerts, immutable GRAVEYARD scan snapshots, reproducible lineage metadata, and any Community Souls, rooms, comments, or direct messages you create.",
      },
      {
        title: "SOUL MEMORY daily state and 00:00 IST reset",
        body: "When you run scans, SOUL MEMORY records private per-account daily observations and a frozen point-in-time ranking snapshot to surface consistent relative candidates without look-ahead bias. Daily SOUL MEMORY state resets automatically at 00:00 IST (18:30 UTC). Your historical GRAVEYARD scan records remain intact across resets.",
      },
      {
        title: "Cookies, sessions and security",
        body: "Authentication uses strictly necessary HttpOnly session cookies stored server-side as SHA-256 hashes. Browser local storage is used only for non-sensitive UI state such as unsaved Strategy formula drafts and dismissed tips — never session tokens or private credentials. Direct messages are server-authorized and are not claimed end-to-end encrypted. Operational Worker logs redact query strings and never print passwords, tokens, or secrets.",
      },
      {
        title: "Private by default and third-party services",
        body: "Your portfolios, watchlists, price alerts, GRAVEYARD history, and draft scans are private and never indexed publicly or used for cross-user model training or advertising. Optional TradingView chart embeds connect to TradingView only when you open them and receive standard browser metadata (IP address and public symbol); GVV never sends your portfolio or private notes to third-party chart widgets. Fonts are self-hosted.",
      },
      {
        title: "Export, active sessions and permanent deletion",
        body: "Inside Settings -> Privacy you can download a JSON export of your account data at any time or permanently delete your account after explicit confirmation (which removes your profile, sessions, watchlists, portfolios, scans, and messages). Inside Settings -> Active Sessions you can inspect and revoke individual devices or all other sessions. Infrastructure backups and provider operational logs may persist briefly under Cloudflare retention policies.",
      },
      {
        title: "Support, contact and regulatory disclosures",
        body: "For support, privacy requests, or data questions, contact Global Vertex Vectors at strategicsoulsgvv@gmail.com. No 24/7 staffed support SLA, India-only hosting residency guarantee, or completed legal certification is claimed; formal DPDP and Indian securities counsel review remains in progress prior to wider commercial release.",
      },
    ],
  },
};
