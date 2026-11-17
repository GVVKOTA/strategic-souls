# Strategic Souls — release review

Review date: **7 November 2026 IST**. Verdict: **NOT READY**. Paid readiness: **NOT APPROVED**.

This is an implemented, locally tested release candidate for the existing Site. It is not an assurance of production security, public regulatory compliance, verified market research or zero defects. The existing live application and database have not been changed in this work.

## A. Inspected

- Exact Site ID: `appgprj_6ae0ae7364a481919dfb1af2f4fe17f0`.
- Canonical existing URL: https://strategic-souls-gvv.vishnukota20071005.chatgpt.site
- Owner role verified. Audience: custom, owner is the sole allowed viewer; no external visitors or groups. No access changes made.
- Live version 2 source: `615835411701ee6916788f18d22bd98e8daea8fc`.
- Source routes, API, schema, migrations, auth integration, security wrapper, research DSL, BSM, CSV parser, legacy synthetic engine, test harness and dependency lock inspected. Platform: React/Vinext Worker + Cloudflare D1 `DB` binding; R2 unused.
- Runtime environment variable list was empty. No commercial data, payment or AI credentials found in it.
- Seven existing D1 tables inspected read-only. One legacy Soul exists; its payload is truncated in the database tool response. No complete database backup or live restore could be verified.
- Browser: existing Site presents ChatGPT sign-in; authentication requires user interaction. Local preview CLI reports an address, but browser connection is refused. Authenticated UI, screenshots and responsive QA could not be observed.
- Source history was bundled and restored into a separate local checkout; restored HEAD matches the original commit. No worker incident was reported; production error logs were not independently sampled.

## B. Implemented changes

- Original Obsidian Eclipse landing at `/home`, explicit example hypothesis, evidence/memory/explainability sections, workflow, trust boundaries and FAQ. Added Product, How It Works, Methodology, Pricing, Trust, Terms, Help and Sign In routes. Public indexing remains OFF while owner-private.
- Preserved exactly three dashboards and the existing 28-instrument order. Kept original holdings, private notes, formula drafts, BSM calculator and legacy records.
- Added a source-linked notebook Soul workflow: required hypothesis, opposing thesis, falsification, review deadline; optional formula and up to six original source interpretations with publication/known-at timestamps.
- Original Soul records are owner-scoped and immutable. Added append-only reviews, linked new versions, archive/restore, search/status/date filters and per-Soul JSON export. Manual results remain explicitly USER_SUPPLIED, not verified outcomes.
- Additive migration 0003, database update triggers, owner indexes, foreign keys, deterministic checksums, atomic deduplicated writes and request-ID conflict handling.
- Account export/delete extended to notebooks and events. Oversized archives now fail explicitly rather than silently truncate. Consent v3 describes new records. Added sign-out navigation and bounded browser request timeout.
- Added a typed quote contract with rights/identity/timestamp/freshness validation. No provider connection was fabricated.
- Corrected a stale canonical origin and a Node 24 test compatibility issue; replaced application `any` types at the touched boundaries.
- Patched framework/runtime dependencies; removed all reported critical/high dependency findings in the candidate.
- Added reproduction scripts, CI definition and operational/legal/provider documentation. CI is authored but has not run on an external CI service.

## C. Feature matrix

Statuses describe this source candidate; WORKS means observed automated/local evidence, not a deployed claim.

| Feature | Status | Evidence / limit |
|---|---|---|
| Existing Site identity / ownership | WORKS | Native Site inspection; no audience or DB mutation |
| Three dashboards / exact watchlist | WORKS in source | Production build and watchlist test; browser widths unverified |
| Product pages / mobile CSS | PARTIAL | Compiled routes and responsive rules; visual/keyboard/screen-reader checks blocked |
| Hosted sign-in / sign-out | PARTIAL | Preserved platform integration; live sign-in wall observed; lifecycle not completed |
| Notebook save / immediate archive | WORKS locally | Actual route tested against SQLite with isolated identity |
| Immutability / version links / manual reviews | WORKS locally | DB-trigger and API tests, dedupe and cross-tenant checks |
| Source content authenticity / snapshots | GATED | Reference metadata only; no independently verified content/rights |
| Quantitative scans / automatic outcome evaluation | GATED | Server returns unavailable; no invented data or quota charge |
| Formula drafts / safe DSL | WORKS locally | Syntax, units, budget, no-lookahead and missing-data tests |
| Private holdings / CSV | PARTIAL | Validation/import preview retained; transactions, corporate actions and P&L unavailable |
| BSM hypothetical calculator | WORKS locally | Benchmark, parity and finite-difference tests; no option chains |
| Notebook/account export and deletion | WORKS locally | Owner scope and transaction tests; browser download path unverified |
| Community / marketplace / broker / trading | GATED | Private notes only; server rejects unapproved capabilities |
| Payments / premium quotas | NOT BUILT | No payment/entitlement ledger; proposed 5 and 49 monthly scans unapproved |
| Support | PARTIAL | Private request recording; no monitored contact or notifications |
| Monitoring / analytics / provider jobs | NOT BUILT | No alert transport, customer funnel analytics or automatic ingestion |
| Full live backup / restore | BLOCKED | Truncated production record; no destructive changes made |
| Production SaaS migration | NOT BUILT | Existing platform not proven unsuitable; no silent alternate destination |

## D. Test evidence

| Check | Result | Command / environment |
|---|---|---|
| Strict TypeScript | PASS after security updates | `npm run typecheck`, Node 24 |
| Application lint | PASS after security updates | `npm run lint:app` |
| Automated tests | 35 PASS after security updates | `npm test`, SQLite/VM + unit fixtures |
| Production build | PASS after security updates | Sites build helper / Vinext |
| Source restore | PASS | `git bundle verify`; restored clone HEAD equals original |
| Additive migrations / local restore | PASS | Original fixture row survives migration; restored DB integrity and triggers checked |
| Tenant isolation / CSRF / SQL parameterization | PASS for tested API paths | VM route tests; no real external identities |
| Retry/idempotency / concurrent rate counter | PASS | Repeated saves/events, conflict detection, 8 concurrent support requests with limit 5 |
| Timestamp / stale / delayed / closed / venue mismatch | PASS for pure validator | UTC/IST, leap day, explicit DST offsets; no exchange calendar service |
| DSL / CSV / BSM | PASS | Injection, division by zero, missing data, duplicates, benchmark/parity/Greeks |
| Source secret patterns | PASS, limited scan | 34 application/test/doc/config files; no matches at scan time |
| Dependency audit | PASS critical/high threshold; residual findings | After compatible patches: 0 critical, 0 high, 10 moderate, 4 low. Baseline: 3 critical / 35 high. Advisory severity is not a reachability assessment. |
| Real auth/logout/relogin / two-account browser | NOT RUN | Browser is signed out |
| 360 / 390 / 768 / 1440 px and keyboard/screen reader | NOT RUN | Managed preview browser connection refused |
| Core Web Vitals / accessibility / low-bandwidth | NOT RUN | No browser metrics fabricated |
| Live backup recovery / rollback drill | NOT RUN | Full live export unavailable |
| Economic revisions / actual calendar holidays | NOT RUN | No provider adapter |
| Paid quotas / FX/dividends/XIRR/TWR / moderation | NOT RUN | Features remain disabled or unbuilt |
| Independent penetration test / operational incident drill | NOT RUN | Requires separate qualified testing and operator setup |

## E–G. Data, legal gates and economics

See [provider matrix and ₹49 scenarios](PROVIDERS_AND_ECONOMICS.md) and [official-source legal register](LEGAL_GATES.md). All 28 quotes remain NOT_CONFIGURED, with no market timestamps or open/closed claim. There is no licence evidence. Official SEBI research-record changes and the 8 November circular effective date were found, but no counsel approval exists. DPDP clause-level commencement, controller/processor controls, CERT-In duties, tax and payments remain unapproved.

₹49 viability is unproven. Explicit hypothetical cost scenarios range from ₹32.05 contribution before tax to a ₹136 loss at heavy usage. These are sensitivities, not vendor quotes or financial forecasts. Billing remains off.

## H. Publication and rollback

Save the candidate source/build as an **undeployed version of the same Site**. Do not publish until full backup and real browser gates pass. The existing URL continues to serve version 2; it is NOT a preview of these new changes. No separate staging/public Site was created.

[Security and operations](SECURITY_AND_OPERATIONS.md) provides exact original rollback version, migration steps and preservation requirements. A future private deployment must keep the same ID, audience and DB. Do not drop additive tables during rollback. A saved candidate is not proof of runtime success.

## I. Five residual risks / accountable decisions

1. **Recoverability:** full legacy payload and production restore not verified. GVV/operator must provide supported complete backup access and verify recovery before DB migration.
2. **Runtime security:** 10 moderate / 4 low dependency findings plus untested real identity/session boundaries. Engineering/security owner must assess remaining advisory reachability and finish real two-account tests.
3. **Evidence authenticity/data rights:** no commercial sources or verified observation pipeline. GVV/data lead must approve a narrow source contract and budget; notebook references alone cannot unlock scans.
4. **Legal/privacy/customer identity:** external-customer auth, RA/IA classification, DPDP obligations and controller/grievance details unresolved. GVV and qualified counsel must sign off actual behavior.
5. **Operational/economic readiness:** no monitored support/alerts or proven ₹49 unit economics. Assign operator, test incidents and approve pricing/quotas only after measured costs. No charge can be enabled by this report.

## J. Verdict

**NOT READY.** Source candidate is materially improved and locally testable. PRIVATE ALPHA READY is not claimed because mandatory live backup and browser verification remain incomplete. INVITE-ONLY BETA READY, PUBLIC FREE READY and PAID READY are not reached.

## K. Owner launch checklist

- [ ] Complete full live DB snapshot/export and isolated restore, including the legacy Soul payload.
- [x] Candidate dependency audit reports zero critical/high findings.
- [ ] Assess 10 moderate / 4 low advisories and complete independent security review.
- [ ] Restore browser preview access; test 360/390/768/1440 px, touch, keyboard and screen reader.
- [ ] Test onboarding, sign-in/out/relogin, two-account isolation, first real notebook save/reload/review/export/delete, outage/retry and rollback.
- [ ] Obtain source rights and counsel classification; keep unavailable research features gated.
- [ ] Confirm external-customer auth support or approve an explicit separate production migration.
- [ ] Finalize privacy/terms, data retention, grievance contact, incident ownership and logs/backups.
- [ ] Configure monitored support and alerts, then exercise an operational incident.
- [ ] Validate costs; separately approve ₹49/quotas, tax/processor setup and payment tests if charging is desired.
- [ ] Deploy the reviewed candidate privately to the same Site; smoke-test the actual deployment.
- [ ] Obtain explicit owner approval for any public audience change. Paid activation requires a separate gate.
