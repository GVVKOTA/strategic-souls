# Security and release gates — 14 November 2026

Existing Sites authentication, owner-only audience, request identity and D1 tenant filters are retained. APIs reject missing identity, require current explicit private-storage consent, reject cross-origin/non-JSON writes, bound bodies, rate-limit atomically and use parameterized SQL. Notebook originals/events have database immutability triggers; writes are deduplicated and cross-owner access fails. The formula language is bounded and never evaluates JavaScript or Python. Imports validate values and dangerous CSV input. Local QA identities, backups and tokens are excluded from deployable source.

Worker headers retain noindex/noarchive, nosniff, restricted referrer and permissions policy. CSP adds specific official TradingView script/frame origins; no broad wildcard scripts or third-party parent data connections. Charts are opt-in and absent from sensitive portfolio/research views. Vendor attribution remains visible. Private record URLs do not include thesis or holdings.

A logical application backup and isolated restore passed, including matching the immutable legacy payload SHA-256 and applying pending additive migration 0003. This does not certify a provider-managed transactional D1 restore or backup retention/deletion policy. Operational counters/activity values were read separately. Public beta still needs routine provider backups and a hosted restore drill.

UNAPPROVED: public access, customer onboarding beyond platform membership, paid scans, checkout, advertisements, marketplace, public posting, broker sync and order execution. No legal classification or exchange redistribution permission is claimed. An educational disclaimer does not settle RA/IA classification.

Current official review references: [SEBI regulations](https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&smid=0-4&ssid=3), [October 2026 RA notification](https://www.sebi.gov.in/web/?file=https%3A%2F%2Fwww.sebi.gov.in%2Fsebi_data%2Fattachdocs%2Foct-2026%2F1791796596784.pdf), [NSE data policy](https://www.nseindia.com/static/market-data/nse-data-policy), [MeitY DPDP documents](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025).

Counsel must check legal publication/effective dates, phased DPDP duties, grievance contact, processors, minors, consent, retention, tax/GST, refunds and consumer terms before broader or paid release. No sign-off was obtained. Existing users must accept any newly required legal terms themselves; automation does not consent for them.

Privacy regression correction: authenticated subject-scoped account export and explicit confirmed withdrawal remain available even when a newer consent policy is pending. Ordinary saves still require current consent; no identity or CSRF check is bypassed.

A10 CONFIRMED / FIXED: the current registry audit found react-server-dom-webpack 19.2.8 affected by the critical maintained React advisory GHSA-xqc2-xf4c-x3h3 (CVE-2026-126187). React, React DOM and RSC were aligned to the patched 19.2.9 release. No framework migration or release-age policy exception was needed. Patched audit: 0 critical, 0 high, 10 moderate, 4 low; lower-severity findings remain for review. Source: https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3 (checked 14 November 2026). No attack payload was executed and no exploitation is inferred.

Run npm run audit:security for the current high/critical registry gate. A clean severity threshold is not a complete security certification; the 14 lower-severity advisories and other release gates remain explicit.
