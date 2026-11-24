# X7 repair baseline

Recorded on 24 November 2026 IST. The checkout was clean at `41324f4fe3f595edc395239e800be9ea5ad1b45a` on `fix/x6-marketdata-soulscan-reliability`. GitHub `main` was `5af810c08abb2bfa583bea935ed61e2dbd79bd1f`. Draft PR #4 carried 13 changed files spanning scanner UI, research and market-data services, and fixtures. The prior 340 Node tests and 29 Python tests are recorded in X6_PROGRESS.md. [PR diff](https://github.com/GVVKOTA/strategic-souls/pull/4/files) · [Baseline CI](https://github.com/GVVKOTA/strategic-souls/actions/runs/45239529425)

## Reproduction

| Priority | Observation | Evidence |
| --- | --- | --- |
| P0 | A fresh live Strategy form selected ECB FX. The builder's default came from the state initializer in `frontend/features/strategy/workspace.tsx`. | Signed-in live browser at about 02:08 IST, with no scan submitted. [Baseline initializer](https://github.com/GVVKOTA/strategic-souls/blob/41324f4fe3f595edc395239e800be9ea5ad1b45a/frontend/features/strategy/workspace.tsx#L404) |
| P0 | An eligible non-match appeared as “Failed” and chart coverage used only the evaluated result rows. | A saved NSE:SBIN run showed 1 eligible, 0 matched, 1 “Failed”, and 100% coverage for a one-symbol request. [Baseline chart](https://github.com/GVVKOTA/strategic-souls/blob/41324f4fe3f595edc395239e800be9ea5ad1b45a/frontend/features/strategy/evidence-charts.tsx#L22) |
| P0 | The reported 01:46 IST RSI run was absent from the four visible records in the connected owner session. | The live default was reproduced. The historical click sequence, owner identity of the reported run, and its immutable payload were unverified. No conclusion about which market the user clicked follows from the 0/13 tally. |
| P0 | The deployed Worker still advertised X5.6. | At 02:07:58 IST, `GET /api/release` returned `x5.6-classic50-banners8-states36-chats-2026-11-23`. The Cloudflare connector requested reauthentication and the local Wrangler deployment query returned nonzero. The exact active Worker version ID, deployment timestamp, and Git SHA were unverified in X7. [Release](https://strategic-souls.vishnukota20071005.workers.dev/api/release) |
| P0 | Guest access failed closed. | At approximately 02:08 IST, public references returned 13 FX series and 5 yields, guest health reported `PUBLIC_RESTRICTED`, and a private NSE candle request returned 401. [Public references](https://strategic-souls.vishnukota20071005.workers.dev/api/markets/public) |

## Route and binding audit

The Strategy form submits a typed scope, interval, instruments, and formula to `POST /api/strategy/scan`. The compatibility route is `POST /api/x1/workspace`. Both enforce native session authentication, adult consent, same-origin JSON, and body limits before calling `mutateWorkspace`. That service resolves the scope, calls the entitled reference/market adapter or CSV parser, evaluates the canonical rule or Draw objective, and stores snapshots in D1. `GET /api/x1/workspace?scanId=…` reads an owned snapshot. Fixed-size and idempotency gates apply to writes.

Market surfaces include `/api/market/health`, `/api/market/instruments`, `/api/market/quote`, `/api/market/candles`, and `/api/x2/data` for the asset terminal. The build config declares D1 `DB`, Workers VPC `MARKET_DATA_ADAPTER`, and variable `ENABLE_PRIVATE_BROKER_DATA`. Private session checks reference `X2_OWNER_SUBJECT` and `MARKET_ADAPTER_AUTH_TOKEN`. This inventory is from source and generated config. Remote binding type/name verification remains blocked by the Cloudflare connection. No secret value was read.
