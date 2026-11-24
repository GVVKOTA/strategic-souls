# Strategic Souls X6 progress

Branch `fix/x6-marketdata-soulscan-reliability` · [Draft PR #4](https://github.com/GVVKOTA/strategic-souls/pull/4)

| Status | Item | Evidence |
| --- | --- | --- |
| Done | Owner historical scan acquisition | Commit `3ddf23f508afdb25649e1963726f5ce980f79a6c` sizes Classic candle windows, evaluates completed broker bars, and surfaces coverage shortfalls. The Golden Cross fixture saved 215 bars and separately reported 201 required with 124 available. [CI](https://github.com/GVVKOTA/strategic-souls/actions/runs/45236486589) |
| Done | Scope and calendar periods | Commit `0f41b337fb790960a7e843e25d98d61032dc687b` makes the scan service enforce NSE/BSE cash equities, active dated MCX futures, the account's first active saved watchlist, ECB references, and imported dated Daily CSVs. NSE and BSE listings remain separate canonical instruments. Weekly and Monthly scan inputs exclude developing calendar groups. |
| Done | Unsupported intraday requests | The scanner disables 30-minute and hourly choices. Both scan routes reject them before requesting candles. |
| Done | Real production owner baseline | At 23:58 IST on 23 November 2026, `/api/market/health` reported owner scope, reachable adapter, authenticated session, and NSE/BSE/MCX. Real closed-market quotes and Daily history returned for NSE:SBIN, BSE:SBIN, and MCX:GOLD04DEC26FUT. Bar counts were 233 over 345 calendar days, 30 over 45, and 32 over 45, respectively. All three series ended on the 23 November IST session date. |
| Done | Real production owner scan | At 23:59 IST on 23 November, the deployed baseline reported 1 of 1 eligible for NSE:SBIN. The Classic EMA(20) cross scan evaluated one instrument with zero matches and zero unknowns. The saved run remained in GRAVEYARD after browser reload. |
| Incomplete | Extended history and operations | The broker request window remains capped at 365 calendar days. Requests that need more time report available coverage. Multi-window pagination and end-to-end correlation IDs remain open. |
| Not verifiable | Production verification of the draft | The live Worker reported revision `x5.6-classic50-banners8-states36-chats-2026-11-23`. The real owner results above apply to that deployed baseline. PR #4 still needs production release approval and deployment before those checks can verify the new code. |

The source for the production observations was the [live Strategic Souls Worker](https://strategic-souls.vishnukota20071005.workers.dev/). Broker reads used the existing owner session. The account used one Classic scan for the requested persistence check.

## Verification on 24 November 2026 IST

- `node operations/scripts/check-x2-release.mjs` passed typecheck, ESLint, and 340 Node tests. Isolated fixtures cover the scope filters, watchlist ownership, closed ECB groups, prior candle shortfalls, and scan persistence and replay.
- `uv run --project backend/quant pytest backend/quant/tests -q` passed 29 Python tests.
- `node operations/scripts/run-framework.mjs build` completed the Worker build.
- `node operations/scripts/scan-secrets.mjs` passed across tracked files, the staged diff, and the Worker bundle. The checkout had no configured local secret-value comparisons.
- `pnpm audit --audit-level high` reported two moderate advisories and zero high or critical findings.
- At 00:00 IST, the guest Worker returned 13 ECB FX series dated 23 November and five US Treasury yield series dated 20 November. Guest quote and candle requests returned `401 UNAUTHENTICATED`.
