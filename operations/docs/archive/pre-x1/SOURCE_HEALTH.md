# Source health — 14 November 2026

Hosted runtime environment key inventory was empty. GVV numeric coverage is 0/28. No actual quote tick, news feed, structured calendar API or EIA dataset is connected. Fresh retrieval time is never presented as a market event time.

Official widget scripts for Market Overview, Advanced Chart and Economic Calendar returned HTTP 200 at their documented TradingView embedding endpoints. HTTP success is not proof of chart data availability. Browser load observations and exact unsupported cases are recorded in the final delivery report alongside screenshots.

The typed widget wrapper mounts after explicit visitor choice and intersection, cleans up on unmount, uses fixed identity allowlists, sets explicit heights, preserves attribution, adds source links and offers retry/unload. Script error, timeout and CSP violation produce an explanatory fallback. An iframe load is labelled only as a frame opening, not as verified live data. GVV never inspects frame contents, price text, messages or vendor WebSockets.

Worker CSP permits only the official embed script origin and specific TradingView frame origins. Portfolio and notebook views do not mount third-party charts. Third-party requests expose page URL, widget type, public symbols and IP as described by TradingView; private holdings and source interpretations are not sent.

Future numeric adapters must establish exact contract identity, display/analysis rights, event timestamps, official session, expected delay and freshness before enabling a consumer. Keep every provider key server-only. This release does not configure a live numeric adapter. Outage fallback never manufactures quotes or calendar events.

Local Chromium observations: Economic Calendar displays real vendor content. NSE:NIFTY and TVC:US10Y Advanced Chart report “This symbol is only available on TradingView”; the asset view now uses explicit source-link fallbacks. The initial four-symbol overview showed “No data here yet”. A selected Binance BTCUSDT display is being tested separately and does not resolve the original unspecified watchlist venue. No source price is extracted or ingested.

Additional local observation: the explicitly selected BINANCE:BTCUSDT Advanced Chart rendered candlesticks and vendor attribution. No displayed value was used by GVV. The original BTCUSDT venue remains unverified.
