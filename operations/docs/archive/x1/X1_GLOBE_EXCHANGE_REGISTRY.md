# X1 globe exchange registry

Verified 17 November 2026. This is a maintained geography/identity registry, not a market-data entitlement or venue-health feed.

The 24 MICs, names and market cities were checked against the [official ISO 10383 CSV](https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC.csv). The [registration authority](https://www.iso20022.org/market-identifier-codes) states publication on 9 November 2026 and implementation of that batch on 23 November 2026; the selected established MIC records were ACTIVE in the downloaded file.

Coordinates were looked up in the primary [Natural Earth populated places dataset](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson), matching both city and country to avoid the London/Sydney namesakes. Natural Earth is [public-domain cartography](https://www.naturalearthdata.com/about/terms-of-use/). These are approximate CITY points, explicitly not the location of a building, exchange server or corporate headquarters. KRX is mapped to its ISO stock-market city Seoul; its corporate headquarters in Busan is a distinct fact. NSE/BSE, NYSE/Nasdaq and CME/CBOT deliberately share city points and must cluster in the globe/list.

| MIC | Venue | Market city | Country | Latitude | Longitude | IANA timezone | Official source/calendar portal |
|---|---|---|---|---:|---:|---|---|
| XNYS | New York Stock Exchange | New York | United States | 40.721562 | -73.995718 | America/New_York | [Official source](https://www.nyse.com/trade/hours-calendars) |
| XNAS | Nasdaq | New York | United States | 40.721562 | -73.995718 | America/New_York | [Official source](https://www.nasdaqtrader.com/Trader.aspx?id=calendar) |
| XTSE | Toronto Stock Exchange | Toronto | Canada | 43.664645 | -79.389459 | America/Toronto | [Official source](https://www.tsx.com/en/trading/calendars-and-trading-hours/calendar) |
| BVMF | B3 — Brasil Bolsa Balcão | São Paulo | Brazil | -23.556734 | -46.626966 | America/Sao_Paulo | [Official source](https://www.b3.com.br/pt_br/noticias/calendario-de-negociacao-da-b3-confira-o-funcionamento-da-bolsa-em-2026.htm) |
| XCME | Chicago Mercantile Exchange | Chicago | United States | 41.847961 | -87.635237 | America/Chicago | [Official source](https://www.cmegroup.com/trading-hours.html) |
| XCBT | Chicago Board of Trade | Chicago | United States | 41.847961 | -87.635237 | America/Chicago | [Official source](https://www.cmegroup.com/trading-hours.html) |
| XLON | London Stock Exchange | London | United Kingdom | 51.501941 | -0.118668 | Europe/London | [Official source](https://www.londonstockexchange.com/en) |
| XPAR | Euronext Paris | Paris | France | 48.858092 | 2.352992 | Europe/Paris | [Official source](https://www.euronext.com/en/trading/trading-hours-holidays) |
| XAMS | Euronext Amsterdam | Amsterdam | Netherlands | 52.351914 | 4.914694 | Europe/Amsterdam | [Official source](https://www.euronext.com/en/trading/trading-hours-holidays) |
| XBRU | Euronext Brussels | Brussels | Belgium | 50.835263 | 4.331371 | Europe/Brussels | [Official source](https://www.euronext.com/en/trading/trading-hours-holidays) |
| XETR | Deutsche Börse — Xetra | Frankfurt | Germany | 50.099977 | 8.675015 | Europe/Berlin | [Official source](https://www.eurexgroup.com/xetra-en/newsroom/trading-calendar) |
| XSWX | SIX Swiss Exchange | Zürich | Switzerland | 47.381934 | 8.548064 | Europe/Zurich | [Official source](https://www.six-group.com/en/market-data/news-tools/trading-currency-holiday-calendar.html) |
| XJSE | Johannesburg Stock Exchange | Johannesburg | South Africa | -26.168099 | 28.028064 | Africa/Johannesburg | [Official source](https://clientportal.jse.co.za/reports/trading-calendars) |
| XSAU | Saudi Exchange | Riyadh | Saudi Arabia | 24.634497 | 46.720487 | Asia/Riyadh | [Official source](https://www.saudiexchange.sa/wps/portal/saudiexchange/rules-guidance/capital-market-overview/trading-cycle-and-times?locale=en) |
| XDFM | Dubai Financial Market | Dubai | United Arab Emirates | 25.214912 | 55.286946 | Asia/Dubai | [Official source](https://www.dfm.ae/the-exchange/news-disclosures/settlement-trading-calendar) |
| XNSE | National Stock Exchange of India | Mumbai | India | 19.068408 | 72.875839 | Asia/Kolkata | [Official source](https://www.nseindia.com/resources/exchange-communication-holidays) |
| XBOM | BSE | Mumbai | India | 19.068408 | 72.875839 | Asia/Kolkata | [Official source](https://www.bseindia.com/static/markets/marketinfo/listholi.aspx) |
| XSES | Singapore Exchange | Singapore | Singapore | 1.294979 | 103.853875 | Asia/Singapore | [Official source](https://www.sgx.com/securities/trading) |
| XHKG | Hong Kong Exchanges and Clearing | Hong Kong | Hong Kong SAR | 22.306927 | 114.183064 | Asia/Hong_Kong | [Official source](https://www.hkex.com.hk/Services/Trading/Securities/Overview/Trading-Calendar-and-Holiday-Schedule?sc_lang=en) |
| XSHG | Shanghai Stock Exchange | Shanghai | China | 31.218398 | 121.434559 | Asia/Shanghai | [Official source](https://english.sse.com.cn/start/trading/schedule/) |
| XSHE | Shenzhen Stock Exchange | Shenzhen | China | 22.548097 | 114.061154 | Asia/Shanghai | [Official source](https://www.szse.cn/English/services/trading/calendar/index.html) |
| XTKS | Japan Exchange Group — Tokyo Stock Exchange | Tokyo | Japan | 35.686963 | 139.749462 | Asia/Tokyo | [Official source](https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html) |
| XKRX | Korea Exchange — stock market | Seoul | South Korea | 37.568295 | 126.997785 | Asia/Seoul | [Official source](https://global.krx.co.kr) |
| XASX | Australian Securities Exchange | Sydney | Australia | -33.871373 | 151.212548 | Australia/Sydney | [Official source](https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours/trading-calendar) |

## Calendar coverage and semantics

Only NYSE and Nasdaq have a shipped calendar model. Its coverage is 1 January–31 December 2026, regular cash-equity CORE session 09:30–16:00 New York local time, using IANA America/New_York (DST aware), 10 published full-day holidays and the 27 November/24 December 13:00 closes. The primary sources are [NYSE holidays and hours](https://www.nyse.com/trade/hours-calendars) and [Nasdaq's 2026 calendar](https://www.nasdaqtrader.com/Trader.aspx?id=calendar). The source does NOT list a 2 July 2026 equity early close; the tests protect against copying that error from secondary calendars.

The return label says Scheduled open/closed/holiday. Live halts, emergency closure notices, individual-stock auctions, extended sessions and live venue operation are UNKNOWN. These scheduled statuses are never a claim of live index quotes. Source verification is 17 November 2026; refresh official changes before relying on later sessions. Beyond 2026, the function returns SCHEDULE_UNKNOWN rather than extrapolating dates.

The other 22 venues intentionally return SCHEDULE_UNKNOWN until a complete versioned per-product session/holiday/half-day dataset is ingested and checked. A local clock is not an open-state inference. The function requires a timestamp argument; the UI should supply the markets API's server asOf, not use animation or the device clock as evidence.

All official URLs were syntactically checked as HTTPS and probed where available. Sources that reject automated HEAD/GET are not bypassed: JSE/CME/SGX/Saudi returned access restrictions; SIX certificate-chain validation failed in the Python client; HKEX's old securities-calendar path returned 503. The ISO CSV GET succeeded although its HEAD returned 500. The LSE old business-days deep link returned 404 during the direct probe, so this registry links to its verified official portal and keeps schedule unknown. KRX likewise links to the official portal. A portal link is not an ingested verified calendar. Shenzhen's old tradingschedule path returned 404 and was corrected to the tested calendar path. Do not count linked portals as working session integrations.

## Tests and renderer boundary

Executed: node --experimental-strip-types --test tests/x1-market.test.mjs — 22 tests passed, 0 failed (latest run 238.3 ms). Relevant cases verify MIC uniqueness, geographic range/timezone validity, intentional co-location, unsupported coverage, DST open boundaries, holidays, weekends and exact half-day close. Those tests validate data and calendar logic; they do not certify globe pointer handling, browser WebGL, or phone frame rate. The lead agent owns renderer/browser evidence.

Benchmarks are informational labels only, and neither imply exchange ownership of the index nor license access. All custom index values remain unavailable without an actual entitled adapter. Geographic connection arcs are representational navigation only, never real capital flows.
