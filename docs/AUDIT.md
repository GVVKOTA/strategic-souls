# Audit — 14 November 2026

Source opened through Sites at `6b93a4311addaeb512b4abef13cceec5ef5a5493`, saved version 3. Version 2 was the last version with an attached deployment. Live browser inspection confirmed the old dashboard, 28 unavailable quotes and accepted existing account. Current Sites access was owner-only, zero external visitors. Node 22.16.0; pnpm 11.25.0; React 19.2.8; Vinext 1.0.0-beta.5; Vite 8.1.6; Cloudflare Worker/D1.

| ID | Status / impact | Evidence and resolution |
|---|---|---|
| A01 | CONFIRMED — numeric feeds unavailable | Runtime key inventory empty; no configured adapter/entitlement. All 28 quotes stay null/unavailable. Widgets are separate display. |
| A02 | CONFIRMED — no chart/calendar surface in deployed UI | Source and browser showed only empty states. Added isolated official widget component, asset details and calendar. Browser results are in test evidence / final delivery report. |
| A03 | CONFIRMED / FIXED — test runner incompatible with Node 22.16 | Baseline verify: 21 pass, 1 test-file load failure, ERR_UNKNOWN_FILE_EXTENSION .ts. Explicit strip-types flag restores 35 existing tests. Five meaningful widget/registry/quote/contrast tests added. |
| A04 | CONFIRMED / PROTECTED — saved notebook schema not deployed | Live overview had 7 tables, no notebook tables. Complete legacy payload recovered through existing authenticated export, matching stored SHA-256. Logical restore and existing additive migration passed. No destructive migration introduced. |
| A05 | CONFIRMED / IMPROVED — tiny secondary text | Baseline screenshot and CSS showed 7–11px labels. Applied readable tokens, local licensed fonts, 44px controls and responsive layout. Actual visual verification limits are recorded. |
| A06 | CONFIRMED — unavailable rows dominated first impression | New root introduces research value; Markets starts with Create Soul and categories, original ordered universe expands below official display. Exactly three dashboard destinations remain. |
| A07 | CONFIRMED — Windows dev preview fails | Node 22: recentlyCreatedOwnerStacks; Node 24: Windows file-URL module fallback. Production Worker preview runs. No dependency migration was made to mask the issue. |

Historical 1/7 November findings are not current proof. Existing synthetic legacy records remain immutable and excluded from current market claims. No public audience, subscriptions, broker credentials or user records were reset. Public-looking product routes remain behind the Site's owner-only platform boundary.

A08 CONFIRMED / FIXED during browser QA: the second Continue button could become a submit button during the same activation. Preventing its default event and giving Next/Save separate keys preserves the explicit evidence step. Browser regression verification is recorded in the delivery report.

A09 CONFIRMED / FIXED: the revised-consent gate also blocked existing-data export and withdrawal. Those two authenticated, subject-scoped privacy controls are now independent of accepting revised terms. New saving remains gated. A route integration regression test covers stale consent, denied saving, available export and confirmed withdrawal.

A10 CONFIRMED / FIXED: the current registry audit found react-server-dom-webpack 19.2.8 affected by the critical maintained React advisory GHSA-xqc2-xf4c-x3h3 (CVE-2026-126187). React, React DOM and RSC were aligned to the patched 19.2.9 release. No framework migration or release-age policy exception was needed. Patched audit: 0 critical, 0 high, 10 moderate, 4 low; lower-severity findings remain for review. Source: https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3 (checked 14 November 2026). No attack payload was executed and no exploitation is inferred.
