# Strategic Souls X 1.0 market data and release evidence

## Production and acceptance

The production application uses the existing `strategic-souls` Worker and `ss` D1 database. Production Version 32 was the safe serving version when the X 1.0 work began. PR #7 tracks `feat/strategic-souls-x1`. Full release requires all eight requested BharatStock feeds, an authorized official Nifty 500 snapshot, and successful production scans on a standard account. Test evidence from a version with zero default traffic identifies the candidate separately from the serving application.

## Provider checks on 25 November 2026 IST

| Feed | Authenticated response from the existing Worker secrets | Permitted scope |
| --- | --- | --- |
| BharatStock | HTTP 200 for NIFTY 50, BANK NIFTY and NIFTY MIDCAP 100. The NIFTY 50 sample contained 35 daily bars from 5 October to 23 November 2026. The SENSEX index-history request returned 404. No documented matching MCX or USD/INR endpoint was established. | The account owner confirmed the free tier and no separate exchange licence. Dashboard display and shared storage stay disabled. |
| Indian API | HTTP 200 for the RELIANCE NSE one-year price endpoint. The response contained 247 daily records with volume and dates between 25 November 2025 and 23 November 2026. The adapter and scan engine evaluated the accepted completed observations in a single-instrument diagnostic. The three-year request was weekly. The intraday and usage requests returned 404 on the configured host. | The account owner confirmed the free tier and no verified exchange redistribution rights. NSE shared history, ordinary-account scans, valuation marks, heatmaps and alert monitoring stay gated. |
| Nifty Indices | Production D1 had the explicit-scope sentinel and zero licensed constituent snapshots. | An official Nifty 500 delivery and corresponding display and internal analysis rights are required for import. |

The sole real-data engine diagnostic found a match for both the Classic `close > sma(close,20)` and Advanced `rsi(close,14)>50 AND ema(close,12)>ema(close,26)` rules. Its comparison with an impossible close correctly returned one evaluated instrument and zero matches. ATR returned insufficient data because the response supplied prices and volume. An account-level, full-universe scan remains a separate acceptance test.

Provider and source terms reviewed on 25 November 2026 IST. [BharatStock API reference](https://bharatstockapi.com/reference) · [BharatStock terms](https://bharatstockapi.com/terms) · [Indian API documentation](https://indianapi.in/documentation/indian-stock-market) · [Indian API terms](https://indianapi.in/legal/terms) · [NSE data policy](https://betanseapi.nseindia.com/static/market-data/nse-data-policy) · [Nifty Indices data subscription](https://www.niftyindices.com/offerings/data-subscription)

## Server configuration and activation

- Wrangler binds encrypted `BHARATSTOCK_API_KEY` and `INDIA_API_KEY`. The Vite Worker configuration sets `INDIA_API_HOST` to `stock.indianapi.in`. A plan change requires a verified hostname and a separate configuration review.
- Data Connections is restricted to the configured application owner. Provider records require a verified contract reference, expiry, permitted datasets, display and analysis permissions, storage and redistribution rights, source attribution, retention, documented lag, and the confirmed account credit window. The runtime checks grants independently of key presence. Every ordinary account uses the same approved snapshots after consent.
- Activate BharatStock with the exact documented index mappings. Extending coverage requires the vendor's exact BSE, MCX and traded currency-pair identifiers and verified support for their timestamps, contracts and units. Keep the eight-card order and use the unsupported state for any missing instrument.
- After authorizing the official constituent delivery, submit its exact effective date, official count, rights expiry, provenance and NSE symbol, ISIN, company name and industry rows through the owner-restricted `POST /api/strategy/universe` route. Select the verified universe in Data Connections when mapping Indian API. Each snapshot is versioned and each scan pins the selected version. Importing a new snapshot leaves historical holdings and scan definitions intact.
- Indian API uses the verified daily close series and matching volume. Weekly and monthly views come from eligible completed daily observations. Genuine per-session open, high and low and intraday intervals require separately verified data. Missing inputs remain unknown.
- Indian API's RELIANCE company endpoint confirmed the exact NSE symbol and identified annual and interim statements. The candidate displays statement periods and reported sections with a separately enabled `fundamentals` dataset. Financial amounts remain withheld until the units and reporting basis are verified.

## Capacity and coverage

One durable SQLite transaction reserves the minute, day and confirmed provider-credit buckets. Provider backoff honors `Retry-After` and gates the shared ingestion scheduler. Each scheduled ingestion tick attempts at most four upstream requests. With a two-minute tick and one request per instrument, the theoretical minimum for an initial 500-symbol load is 250 minutes before contention and rate limits. A warm scan processes up to 30 symbols per minute across accounts, which gives approximately 17–18 minutes at the single-job scheduling ceiling. These are configuration bounds. Actual capacity depends on quota, provider latency, refresh frequency and coverage.

Authenticated market health reports when a verified membership exists, eligible history intervals, and whether fresh daily observations cover the complete membership. Production acceptance requires a reconciled per-symbol coverage report and real ordinary-account Classic and Advanced results. Tickets for missing series remain open with their coverage or entitlement reason.

## Migration, verification and rollback

1. Confirm the exact Worker name, D1 binding and database UUID in `dist/server/wrangler.json`. Check the working tree and a clean full SHA for the build.
2. Read the existing migration state and back up via a D1 Time Travel bookmark. Apply only reviewed chronological migrations. `0012` and `0013` add shared scans and history, `0014` adds constituent grants, `0015` adds alerts and account notifications, `0016` adds narrowly scoped cleanup for Soul deletion, `0017` adds immutable portfolio corrections, and `0018` adds the licensed company report cache. The changes preserve existing source rows and support the present serving Worker.
3. Run TypeScript, ESLint, the Node integration suites, Python quant tests, dependency audit and the secret scan. Test migration and restore in an isolated database. Test loss of rights with a disposable user. Run production checks on the exact built SHA.
4. A zero-traffic candidate can be tested with a Cloudflare version override. Verify `/api/release` and `workerVersionId` to distinguish the app serving ordinary traffic from the candidate. Restore the sole safe 100% version after the check.
5. Merge and release once the master prompt's critical gates pass. Check the main build, Worker version, release identity, dashboard source dates and complete real scans. A Worker rollback picks the previous version with its bindings while retaining the additive D1 schema. Backups may contain deleted records until retention expires. Reconcile recorded user deletions before restoring a database.

See the [existing deployment runbook](DEPLOYMENT_RUNBOOK.md) and [Cloudflare's version override instructions](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/).
