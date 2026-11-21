# Strategic Souls — X4 Deployment & Live Smoke Verification Report

- **Release:** `X4` (`4.0.0-x4`)
- **Revision Marker:** `x4-intelligent-scanner-search-community-2026-11-21`
- **GitHub Repository:** `https://github.com/GVVKOTA/strategic-souls`
- **Feature Branch:** `feat/x4-reliability-scan-search-ux`
- **Production Branch:** `main`
- **Live Deployed Website:** `https://strategic-souls.vishnukota20071005.workers.dev/`

---

## 1. Pre-Deployment Baseline & Rollback Target

- **Pre-X4 `main` Commit (X3.1):** `e3526a628581a81ae61c76778699ca64297189ed`
- **Pre-X4 Cloudflare Worker Version ID (Rollback Target):** `1e29b1a9-6ce6-46c5-a81f-a6660b552b8a`
- **Pre-X4 Cloudflare Worker Deployment ID:** `fe198f6c-7e1a-45c7-a3e3-9d6ec246f08c`
- **Cloudflare Account ID:** `2aebd1ad7593f7bba045eb56d9cabd58`
- **Cloudflare Worker Name / Tag:** `strategic-souls` (`b0ad3e732c704e84a7aad4eff2aef4da`)
- **Cloudflare D1 Database:** `ss` (`1cda2b05-6b99-4d04-896f-b3542ad2ce7f`) — **43 tables + 11 immutability triggers across applied migrations `drizzle/0000`–`0007`. Zero destructive schema changes or resets required for X4.**

---

## 2. Deployment Pipeline & Pre-Push Verification

1. **Secret & Whitespace Gate:**
   - `node operations/scripts/scan-secrets.mjs` -> `PASS` (`0` findings across repository and `dist/` bundle)
   - `git diff --check` -> `0` whitespace or merge-marker issues
2. **Release Verification Gate:**
   - `node operations/scripts/check-x2-release.mjs` -> `typecheck: 0`, `lint: 0`, `tests: 267/267 pass`
   - `uv run --project backend/quant pytest backend/quant/tests -q` -> `29/29 pass`
3. **GitHub Actions CI (`verify.yml`):**
   - Pushed `feat/x4-reliability-scan-search-ux` to `origin` and merged into `main`.
4. **Cloudflare Workers Builds (`0727e904-48ad-4e75-9b26-1d2123ec5063`):**
   - Automatic build (`pnpm run build`) and deployment (`npx wrangler deploy`) triggered on `main`.

---

## 3. Live Production Smoke Verification Matrix (`https://strategic-souls.vishnukota20071005.workers.dev/`)

| Endpoint / Surface | Expected Live Behavior | Verification Status |
| :--- | :--- | :--- |
| `GET /` & `GET /workspace` | HTTP `200`, X4 workspace chrome (`"About Strategic Souls"`, `"Run a Soul Scan"`, Quick Discovery Bar, zero `"About X2"` strings) | Verified on local compiled Worker & live production Worker |
| `GET /signin` | HTTP `200`, native Cloudflare D1 email/password authentication form | Verified on local compiled Worker & live production Worker |
| `GET /api/release` | HTTP `200`, `release: "X4"`, `revisionMarker: "x4-intelligent-scanner-search-community-2026-11-21"` | Verified on local compiled Worker & live production Worker |
| `GET /api/market/instruments?q=HDFC` | HTTP `200`, top match `id: "NSE:HDFCBANK"`, `name: "HDFC Bank (NSE)"`, zero private broker price exposure | Verified on local compiled Worker & live production Worker |
| `GET /api/market/instruments?q=SBI` | HTTP `200`, top match `id: "NSE:SBIN"`, `name: "State Bank of India (NSE)"` | Verified on local compiled Worker & live production Worker |
| `GET /api/markets/public` | HTTP `200`, official ECB daily reference FX and US Treasury / macro snapshots | Verified on local compiled Worker & live production Worker |
| `GET /api/market/health` | HTTP `200`, `ok: false`, `errorCode: "PUBLIC_RESTRICTED"`, `sourceMode: "UNAVAILABLE"` for anonymous visitors | Verified on local compiled Worker & live production Worker |
| `GET /api/market/quote?ids=NSE:HDFCBANK` | HTTP `401` (`UNAUTHORIZED`) for anonymous visitors (fail-closed) | Verified on local compiled Worker & live production Worker |
| `GET /api/x1/workspace` | HTTP `401` for anonymous visitors (fail-closed) | Verified on local compiled Worker & live production Worker |
