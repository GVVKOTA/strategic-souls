# Sources, entitlements and economics

## Provider matrix

No commercial credentials, executed data agreements, verified market timestamps or paid accounts were found. Runtime environment variable list was empty. No quote is labeled live.

| Coverage | Exact venue/symbol | Cost | Lawful use / rights | Timestamp / state |
|---|---|---|---|---|
| NSE/BSE/MCX indices, derivatives and volatility | Unresolved per instrument | UNKNOWN: provider quote required | NOT ENTITLED; no display/history/derived/redistribution licence | null / NOT_CONFIGURED |
| Global index/futures/volatility markets | Unresolved | UNKNOWN | Same gate | null / NOT_CONFIGURED |
| Sovereign yields, FX and spot metals | Unresolved; no benchmark conflation | UNKNOWN | Same gate | null / NOT_CONFIGURED |
| BTCUSDT / ETHUSDT / SOLUSDT | Exact exchange unresolved | UNKNOWN | No commercial display/analysis rights assumed | null / NOT_CONFIGURED |
| News and global calendar | No approved source | UNKNOWN | No copying or fabricated consensus/events | null / NOT_CONFIGURED |
| Official macro material | User may link the original publisher | No ingestion contract procured | Reference links only; reuse rights need dataset-specific review | User-provided times / USER_SUPPLIED |

`WATCHLIST` preserves exactly all 28 identities and their requested order. Continuous futures are watchlist concepts, not tradeable contract IDs. `lib/quotes.ts` is a tested typed contract and validation function only; it is not a connected provider adapter. No claim of full market-calendar, holiday or DST scheduling support is made.

Before a provider is connected, record vendor, signed contract/effective dates, venue/native symbol, currency, units, multiplier, futures roll, official session calendar, live/delayed SLA, display/cache/history/derived/redistribution rights, retention, user caps, cost, outage policy and responsible owner. Keep keys server-side. Test missing, stale, delayed, closed, zero/negative legitimate values, identity mismatch, corporate actions and revised observations. Do not accept entitlement or provider identity from the browser.

## ₹49 price: viability is unproven

No real billing or vendor invoices were available. The following is sensitivity analysis using explicit planning assumptions, NOT provider pricing or a revenue forecast. Inputs should be replaced with written quotes and measured use.

Let contribution per paid user per month be:

`C = net subscription receipts - data allocation - hosting allocation - AI cost - payment cost - support allocation`.

For a hypothetical 49 completed scans per month: `AI cost = 49 × cost per scan`.

| Explicit hypothetical scenario | Data allocation | Hosting | AI per scan × 49 | Payment allowance | Support | Contribution from ₹49 before tax |
|---|---:|---:|---:|---:|---:|---:|
| Very lean, low AI usage | ₹5 | ₹3 | ₹0.05 ×49 = ₹2.45 | ₹1.50 | ₹5 | ₹32.05 |
| Higher-use scenario | ₹20 | ₹8 | ₹0.50 ×49 = ₹24.50 | ₹2 | ₹15 | −₹20.50 |
| Expensive licensed/AI scenario | ₹50 | ₹10 | ₹2 ×49 = ₹98 | ₹2 | ₹25 | −₹136 |

These estimates exclude tax, acquisition costs, refunds, fraud, fixed minimum vendor fees, engineering and counsel. ₹49 cannot be certified viable without those inputs. If GST were applicable at an assumed 18% and price included it, net receipts before other charges would be `49 / 1.18 ≈ ₹41.53`; this is a mathematical sensitivity, not a tax classification.

Recommended sequence: test the private notebook value first, obtain source and hosting cost quotes, measure completion/return rates with user consent, then choose a price and usage cap. Proposed Free 5/month and Premium 49/month are not approved commercial quotas. No live scan executes or consumes a quota. A paid transactional entitlement ledger, signed payment webhooks, refund path and quota concurrency suite are NOT BUILT.
