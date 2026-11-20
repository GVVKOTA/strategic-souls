# Future Market-Data API Key Setup & Planned Capability Matrix

**Current State (Keyless Today):** Strategic Souls works cleanly right now **without any commercial market-data API key**.
- **Working keyless today:** Official daily **ECB Euro FX reference rates** and **US Treasury par yields** (clearly labelled with source, publication date, and retrieval time), interactive 24-exchange 3D Earth with IANA timezone clocks, manual watchlists, manual multi-currency portfolio ledger, 3-level Soul Scan (ECB daily FX universe), Formula Lab, and Community groups.
- **Safely unavailable until licensed:** NSE, BSE, MCX, and global equity OHLC bars, fundamentals, and publisher news via **EODHD** or **TrueData** return explicit `KEY REQUIRED` / `UNAVAILABLE` states — never fake prices or fabricated `LIVE` badges.

---

## 1. Understanding the Four Layers (Never Mix Them Up!)

| Layer | Where It Lives | What Belongs Here | What MUST NEVER Go Here |
| --- | --- | --- | --- |
| **1. GitHub Code** | `GVVKOTA/strategic-souls` | Typed adapters (`backend/services/market-data/providers.ts`), UI, tests, `.env.example` placeholders | Real API keys, passwords, tokens, vendor contracts, private user rows |
| **2. Cloudflare Secrets** | Cloudflare Dashboard -> Worker `strategic-souls` -> **Variables and Secrets** | Actual secret values (`X2_EODHD_API_TOKEN`, `X2_TRUEDATA_BEARER_TOKEN`, `X2_OWNER_SUBJECT`, optional `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) | Plaintext commit history, frontend JavaScript |
| **3. Cloudflare D1 Metadata** | Table `x2_providers` & `x2_provider_audit` in D1 `ss` | Non-secret settings: enabled flag, symbol mappings, contract reference, expiry date, owner-attested rights flags, local daily call cap, health probe status | Plaintext API keys or bearer tokens |
| **4. Frontend Display** | Browser (`frontend/features/global/`) | Authorized market figures with source name, publication date, cadence (`PUBLISHED_EOD` / `STALE` / `UNAVAILABLE`), or owner Data Connections form (no secret field!) | Raw secret values, unentitled derived indicators, fabricated quotes |

---

## 2. Currently Implemented Adapters vs. Future Vendors

| Vendor | Implemented in Code Today? | Recognized Worker Secret Name | Scope & Limits |
| --- | --- | --- | --- |
| **ECB & US Treasury** | **Yes (Active Keyless)** | *None required* | Official daily FX reference & Treasury par yields (`REFERENCE`, no invented OHLC/volume). |
| **EODHD** | **Yes (Adapter Ready)** | `X2_EODHD_API_TOKEN` | Daily OHLC, separately preserved adjusted close, entitled equity statements, publisher-linked news for owner-mapped NSE/BSE/global symbols. Not MCX futures or options chains. |
| **TrueData History** | **Yes (Adapter Ready)** | `X2_TRUEDATA_BEARER_TOKEN` | Daily raw OHLC/volume/OI for owner-mapped entitled NSE/BSE/MCX symbols (historical REST endpoint only; no streaming ticks or login refresh). |
| **Twelve Data / Global Datafeeds / Angel One / Zerodha / Kotak** | **No (Not Auto-Enabled)** | *N/A* | Adding a new vendor requires: (1) commercial redistribution/display agreement verification (personal broker accounts do **not** grant multi-user market-data redistribution rights!), (2) a new reviewed adapter branch in `backend/services/market-data/`, and (3) regression tests + release approval. |

---

## 3. Step-by-Step Guide: Activating a Supported Key Later (Zero Code Edit Required)

Once you have a legitimate commercial agreement covering your target users and use cases (display, derived display, non-display analysis, storage, caching, redistribution):

1. **Verify Legal Rights & Redistribution Terms First**
   - Confirm in writing with the vendor (and exchanges where applicable) whether your plan covers **multi-user web display**, **derived indicators/charts**, **server-side scan storage**, and **redistribution**. Never confuse a personal API plan or retail broker login with a commercial multi-user redistribution licence.
2. **Obtain Your Key Privately**
   - Generate the API token/bearer token in the vendor's dashboard. Do **not** paste the real key into chat, GitHub issues, `.env` files committed to Git, or screenshots.
3. **Set Owner Subject & Provider Secret Directly in Cloudflare**
   - Open Cloudflare Dashboard -> **Workers & Pages -> `strategic-souls` -> Settings -> Variables and Secrets**.
   - Add **`X2_OWNER_SUBJECT`** (your verified Strategic Souls user ID) so only your owner account can access Data Connections (`GET/POST /api/x2/providers` fails closed for all other users).
   - Add the applicable provider secret (`X2_EODHD_API_TOKEN` or `X2_TRUEDATA_BEARER_TOKEN`) as an **Encrypted Secret** and save/deploy the Worker secret update.
4. **Open Owner-Only Data Connections in Strategic Souls**
   - Sign in as the owner account -> open **Global -> Data Connections** (`DataControl`).
   - Add exact canonical-to-vendor instrument mappings (symbol, ISO 10383 MIC, IANA timezone, currency, unit; MCX futures require real contract expiry, lot size, and tick size).
5. **Attest Actual Licensed Rights & Local Daily Call Cap**
   - Record your contract reference, expiry date, conservative local daily request cap, and check **only** the rights genuinely granted by your written contract (`display`, `derivedDisplay`, `analysis`/non-display, `storage`, `cacheSeconds`, `redistribution`).
   - *Important:* An HTTP 200 from a vendor never proves legal rights; rights checks are enforced independently on the server.
6. **Run a Bounded Health Probe (`Test connection`)**
   - Click **Test connection** to probe one mapped instrument per market.
   - Verify the returned status (`CONNECTED`, `PARTIAL`, `AUTH_FAILED`, `RATE_LIMITED`, `PROVIDER_DOWN`, or `DISABLED`), real source publication date, retrieval timestamp, and measured latency.
7. **Inspect Enabled Views & Monitor Usage**
   - Confirm Global Market Explorer, Asset Terminal, and Strategy Soul Scan (`CONNECTED_MARKETS` / `EODHD` / `TRUEDATA`) show honest `PUBLISHED_EOD` / `STALE` badges with source attribution and timestamps.
   - Monitor local daily call counter and vendor quota dashboard so you never incur surprise overages.
8. **Instant Disable / Rollback Procedure**
   - To stop all vendor calls immediately without redeploying code: toggle the provider to **Disabled** in owner Data Connections and save (server-side checks immediately suppress in-flight and cached outputs).
   - To revoke credentials completely: delete or rotate the secret in Cloudflare Dashboard -> `strategic-souls` -> **Variables and Secrets** AND revoke the token in the vendor's portal. Key rotation automatically invalidates prior cached entries (`x2-data.test.mjs` verified).

---

## 4. Planned Future Free vs. Premium Capability & Cost Matrix (PLANNING ONLY — INACTIVE)

> [!CAUTION]
> **STRICTLY INACTIVE / NOT APPROVED FOR LAUNCH:** Strategic Souls currently has **zero billing, zero checkout, zero payment processor, zero paywall, and zero advertisements**. Do **not** announce live prices, collect payments, or enable ads without separate founder approval, legal/tax review, updated privacy disclosures, and full compliance implementation.

### Proposed Future Capability Split (Illustrative Planning Only)

| Capability | Planned Free Tier (Future) | Planned Affordable Paid Tier (Concept: ~INR 49/month) | Active Today? |
| --- | --- | --- | --- |
| Standalone account, 3D Earth, 24 exchange clocks, official ECB/Treasury feeds | Included | Included | **Yes (Free keyless)** |
| Watchlists & manual multi-currency portfolio ledger | Included (standard cap) | Expanded caps & CSV export tools | **Yes (Free keyless)** |
| 3-level Soul Scan (Beginner/Intermediate/Advanced) & Formula Lab | Included on official/free datasets | Expanded scan frequency, saved versions, licensed EOD datasets (subject to vendor rights!) | **Keyless ECB active; licensed datasets INACTIVE** |
| Community Bodies, private groups, shared Souls & discussions | Included | Same core privacy guarantees (never paywall privacy!) | **Yes (Free)** |
| Non-intrusive advertising | Considered for Free tier sustainability | Ad-free experience | **INACTIVE (0 ads)** |
| Broker order execution / personalized investment advice | **Never** | **Never** | **Permanently out of scope** |

### Infrastructure & Data Cost Reality Check (Before Any Launch)

- **Cloudflare Workers & D1:** Currently running on existing Cloudflare account with zero new paid services added by X3. Before scaling to thousands of daily users, monitor Workers requests, D1 read/write rows, and static asset egress against Cloudflare's published tier limits.
- **Commercial Market-Data Licensing Reality:** Retail/personal API sticker prices (e.g., INR 1,000–3,000/month) generally **do not** cover multi-user commercial redistribution of NSE/BSE/MCX or global exchange data. Exchange redistribution + non-display licence fees must be quoted in writing by each vendor/exchange and modeled against realistic subscriber unit economics **before** promising any ~INR 49/month paid tier with exchange feeds.
