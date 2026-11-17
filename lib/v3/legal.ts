import type { LegalDoc } from "../content";
export const V3_LEGAL: Record<string, LegalDoc> = {
  terms: {
    title: "V3 local research terms",
    intro:
      "Implementation draft dated 14 November 2026. Qualified legal review and a verified consumer authentication journey are still required before release.",
    sections: [
      {
        title: "Adults and independent identity",
        body: "This local research workspace is intended for adults aged 18 or older. Age is self-declared; verified age assurance is not implemented. Google and email-code sign-in require a running, configured Supabase Auth service. No production consumer-access claim is made.",
      },
      {
        title: "Research, without execution",
        body: "A Soul records authored reasoning and dated evidence. It does not establish a predicted return, an executed trade or a statistically valid standalone win rate. The platform does not route orders, request broker passwords, activate subscriptions or provide public publishing. Public research and personalized recommendations remain disabled pending qualified review.",
      },
      {
        title: "History and collaboration",
        body: "Committed snapshots and reviews append to history. Revisions do not overwrite originals. Team sharing is explicit and members have database-enforced roles. Sharing must not disclose material you lack permission to share. Automated moderation is screening only; no SEBI compliance or staffed moderation guarantee is claimed.",
      },
      {
        title: "Software and data limitations",
        body: "Market values are unavailable without verified provider rights and freshness. Fixtures and software benchmarks are not investment results. Quantitative calculations have declared assumptions and abstain for missing evidence or unsupported actions. Independent operational, security, accessibility and legal certification are not complete.",
      },
    ],
  },
  privacy: {
    title: "V3 privacy disclosures",
    intro:
      "Local implementation disclosures, 14 November 2026. These drafts do not certify compliance or a completed production migration.",
    sections: [
      {
        title: "Information and purpose",
        body: "Supabase Auth handles verified sign-in credentials. The app records a unique handle, display name, optional bio/avatar, privacy settings, user-authored research, source links, Team memberships, comments, tasks, moderation requests and audit events. Legacy ChatGPT owner records remain in the existing D1 system; no automatic ownership transfer by email occurs.",
      },
      {
        title: "Private by default",
        body: "Personal research is private until a separate Team choice. Opting into profile visibility does not publish private research, holdings, email or full membership history. Avatar files use a private bucket. Browser-facing APIs keep authentication tokens in HttpOnly cookies; private research is not saved in browser local storage. In-memory drafts are lost on page reload.",
      },
      {
        title: "Local and external processing",
        body: "The accepted development backend is a local containerized Supabase stack. That stack is currently blocked by missing Windows/container prerequisites. Hosted Supabase provisioning and private-data uploads to new external destinations have not been authorized. Vendor widgets connect to TradingView only after a separate load action; they do not supply raw scan data. No India-only residency or verified encryption-at-rest claim is made.",
      },
      {
        title: "Access, export and withdrawal",
        body: "The API provides authorized research export and an explicit private V3 withdrawal action. Withdrawal anonymizes the profile, removes personal V3 research and leaves pseudonymous shared attribution. Team owners and externally referenced private histories require a deliberate privacy/ownership process first. External Auth identity deletion, private Storage cleanup, legacy D1 data and backup retention require separate operator handling; complete deletion across all systems is not certified.",
      },
      {
        title: "Remaining obligations",
        body: "Processor terms, retention schedules, grievance staffing, incident response, age assurance, phased DPDP applicability, production restore rehearsals and independent tenant-isolation testing need review. Do not upload broker secrets, government identifiers or sensitive information unrelated to research.",
      },
    ],
  },
};
