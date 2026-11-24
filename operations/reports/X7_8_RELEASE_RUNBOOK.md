# Strategic Souls X7.8 release runbook

## Snapshot and data dependencies

NSE Indices defines the Nifty 500 as the Nifty 100, Nifty Midcap 150, and Nifty Smallcap 250, with 500 constituent companies overall. Resolve changes from the approved official constituent delivery. NSE Indices requires authorization for index-data reuse and automated collection. [Nifty 500](https://www.niftyindices.com/indices/equity/broad-based-indices/NIFTY-500) · [Methodology](https://www.niftyindices.com/Methodology/Method_NIFTY_Equity_Indices.pdf) · [Data subscription](https://www.niftyindices.com/offerings/data-subscription) · [Terms of use](https://www.niftyindices.com/terms-of-use)

In **Data Connections → Nifty 500 constituent snapshot**, upload an authorized JSON object with the following fields.

- `effectiveDate` is the `YYYY-MM-DD` date on the constituent delivery.
- `provenance` identifies the source, delivery version, and applicable permission. Keep credentials and confidential contract terms outside this field.
- `constituents` contains exactly 500 records. Each record requires `id` (canonical `NSE:SYMBOL` cash-equity identity), `isin`, `name`, and `industry`.
- Confirm permission to use and display the metadata. The interface supplies `rightsConfirmed: true` only after confirmation.

The owner-only `PUT /api/strategy/universe` validates the file, rejects duplicate canonical IDs and duplicate ISINs, and stores an immutable digest, effective date, source, and validation time. `GET` returns active snapshot metadata to the owner. The latest effective snapshot supplies new scans. Jobs pin the version at submission. Invalid replacements leave the previous snapshot active. Import on each official rebalance or ad hoc update. Automated constituent refresh requires a permitted recurring delivery and remains pending.

Configure the licensed history provider in Data Connections under the verified display, derived display, storage, analysis, and redistribution rights that the contract actually grants. Set only the applicable Worker secret, `X2_TRUEDATA_BEARER_TOKEN` or `X2_EODHD_API_TOKEN`. Verify 500 canonical NSE mappings and coverage for the requested resolutions. Owner-only Angel One access depends on the private adapter and cannot establish member rights. Public market-data flags require their own permitted feed configuration. [Market data setup](../docs/MARKET_DATA_SETUP.md)

## Job and account behavior

- `POST /api/strategy/scan` takes an idempotency key and current request definition. Market runs ignore client-provided scope. An explicit Watchlist action resolves an account-owned list. Older separately scoped runs and existing historical snapshots retain their saved definitions.
- `GET /api/strategy/scan` lists account-owned active jobs. `GET ?jobId=…` returns progress for one owned job. `POST` with `action: "cancel"` cancels an owned queued or running job.
- Cron leases one batch at a time across accounts. Each batch handles five instruments. A scheduler invocation attempts up to four batches. Completion reconciles every pinned member. A missing history becomes unavailable. An exhausted deadline yields partial results if any instruments were evaluated. With zero evaluations the job fails and releases the allowance.
- The shared 20-run allowance resets at 00:00 IST. Active reservations count toward the limit. An idempotent retry consumes one slot in total. A run canceled before completed evaluations releases its slot. Completed or partially evaluated runs and cancellations after evaluation count. Deleting private results and reviews leaves quota accounting and independently published Souls intact.
- Commercial provider caches honor configured retention and rights. Deployed cold and warm cache performance, the adapter's availability for 500 instruments, and the exact delay under provider limits require measured live verification.
- Formula Lab and Compare use aligned shared dates and instrument-local currency. NSE/MCX data requires active entitlements. Use adjusted closes for equities when the entire loaded series supports them. Owner broker data is labelled raw. Compare and sector heatmaps carry source and dates, and futures use one resolved contract. The heatmap uses equal-area tiles for curated groups.
- Password-only signup and password changes require 15–128 characters. Existing password hashes continue to verify. Reset changes the hash, revokes existing sessions, and consumes the token in one database batch. For outbound mail, configure `RESEND_API_KEY` and an authorized `SS_EMAIL_FROM`, or an HTTPS `SS_EMAIL_WEBHOOK_URL` with optional `SS_EMAIL_WEBHOOK_TOKEN`. Verify the sender and test with one controlled inbox. Use a verified reset link to set a password on any imported legacy Google-only account before release.

## Release procedure

1. Run `node operations/scripts/check-x2-release.mjs`, `node operations/scripts/run-framework.mjs build`, and `node operations/scripts/scan-secrets.mjs`. Verify `dist/server/wrangler.json` points to the existing `strategic-souls` Worker, production D1 `ss`, and the existing private VPC binding.
2. Verify the licensed snapshot and history on an isolated preview or staging environment. Independently run Classic, Rule Builder, Discover, custom Draw, and template Draw. Record the universe version, reconciled counts, interval coverage, provider calls, latency, and cache behavior. Verify non-owner and owner access separately. Test actual entitled cross-asset and sector pairs, a controlled recovery email, and mobile and desktop flows before marking the PR ready.
3. Apply additive `drizzle/0012_x78_market_scans.sql` to the existing D1 before deploying the Worker. With the production binding verified and release authorized, use `pnpm exec wrangler d1 execute DB --remote --file drizzle/0012_x78_market_scans.sql --config dist/server/wrangler.json`. Keep existing migrations and user data.
4. Merge through the GitHub-to-Cloudflare Workers Builds pipeline on `main`. Verify the actual `/api/release` commit and revision, then exercise authenticated scan status and data-gate cases on the live Worker. Cloudflare Cron Trigger changes can take time to propagate. [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
5. If a rollback is required, select the last verified Worker version in Cloudflare Workers & Pages → strategic-souls → Deployments and verify `/api/release` afterward. Keep the additive D1 tables for investigation and future recovery. Rollback stops the new job scheduler, so review the queued jobs before re-enabling it. At 18:48 IST on 24 November 2026, Cloudflare deployed the V3.1 Worker version `6dbab6ee-aaad-4729-9ad8-b4905acfa1b1`, serving commit `b50a0b5a7a8fb728d9680e583769acdf8adc488e`.
