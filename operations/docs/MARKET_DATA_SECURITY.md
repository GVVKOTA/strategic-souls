# Strategic Souls — Market-Data Security Model

**Version:** X3.1 | **Last Audited:** 2026-11-21

---

## 1. Secret Storage Boundaries (Strict Separation)

| Secret / Credential | Permitted Location | Forbidden Locations |
| --- | --- | --- |
| `ANGELONE_API_KEY`, `ANGELONE_CLIENT_ID`, `ANGELONE_MPIN`, optional `ANGELONE_TOTP_SECRET` | Local gitignored `.secrets/angelone.env` (Windows `icacls` owner-only ACL / POSIX `0600`) on the private adapter host ONLY | Git repo, Git history, `.env.example`, `.dev.vars.example`, Cloudflare Worker Secrets/Vars, Cloudflare D1, browser `localStorage`, cookies, frontend bundles, logs, AI chat |
| Short-lived 6-digit TOTP | Ephemeral POST body from authenticated owner -> Worker -> Adapter -> Angel One | Never written to disk, D1, logs, or state |
| `jwtToken`, `refreshToken`, `feedToken` | Private adapter process memory ONLY; cleared on shutdown or auth error | Disk, D1, KV, cookies, browser, API responses |
| `MARKET_ADAPTER_AUTH_TOKEN` (256-bit random) | Cloudflare Worker Encrypted Secret + `.secrets/angelone.env` (and `.dev.vars` locally) | Git repo, browser bundles, logs |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | Cloudflare Worker Encrypted Secrets (for remote Named Tunnel) | Git repo, browser, D1 |
| `X2_OWNER_SUBJECT` | Cloudflare Worker Encrypted Secret / `.dev.vars` | Client-supplied headers or public config |

---

## 2. Defense-in-Depth Access Controls

1. **Server-Side Owner Enforcement (Never Hidden UI Buttons):**
   - `/api/market/quote`, `/api/market/candles`, and `/api/market/auth` verify the existing standalone Cloudflare D1 `HttpOnly; SameSite=Lax; Secure` session cookie (`__ss_session`), adult consent status, AND server-side `isDataOwner(user.userId)` against `X2_OWNER_SUBJECT`.
   - Unauthenticated requests return `401 UNAUTHENTICATED`.
   - Authenticated non-owner users receive `403 PUBLIC_LICENSE_REQUIRED` whenever `ENABLE_PUBLIC_EXCHANGE_QUOTES=false` (the hardcoded safe default).
   - `GET /api/market/health` returns only sanitized `PUBLIC_RESTRICTED` metadata (`authState: "HIDDEN"`) for non-owner and public callers.
2. **Service-to-Service Authentication:**
   - The local private adapter binds strictly to loopback `127.0.0.1` (never `0.0.0.0`).
   - Every `/internal/*` route verifies `X-SS-Adapter-Token` with `crypto.timingSafeEqual` (default deny -> `401 ADAPTER_AUTH_FAILED`).
   - Remote tunnel connectivity adds Cloudflare Access service token verification (`CF-Access-Client-Id` + `CF-Access-Client-Secret`).
   - `parseGatewayConfig` enforces `https://` for any non-loopback `MARKET_DATA_ADAPTER_URL`, rejecting plain HTTP or embedded credentials.
3. **Zero Order / Trading Capability:**
   - Strictly read-only endpoints only (`/loginByPassword`, `/generateTokens`, `/getProfile`, `/market/v1/quote/`, `/historical/v1/getCandleData`).
   - Automated unit test (`x31-angelone-provider.test.mjs`) statically asserts zero occurrences of order, GTT, position mutation, or funds transfer routes across `backend/services/market-data/angelone/` and `app/api/market/`.
4. **Zero-Leak Redaction & Automated Secret Scanning:**
   - `redactText()` scrubs known secrets, JWTs (`eyJ...`), Bearer tokens, and key-value secret patterns from every adapter error and diagnostic output.
   - `getProfile` discards client name, email, phone, PAN, and client code immediately, retaining only the exchange code list (`["NSE", "BSE", "MCX"]`).
   - `node operations/scripts/scan-secrets.mjs` scans tracked files, untracked non-ignored files, staged git diffs, and compiled `dist/` bundles for secret patterns AND exact matches against any local `.secrets/angelone.env` / `.dev.vars` values — printing only `PASS`/`FAIL`, filename, rule, and remediation (never secret values!).

---

## 3. Incident Response & Credential Rotation Checklist

If an Angel One credential is ever pasted into chat, screenshots, terminal transcripts, or accidentally staged:
1. **Do NOT push** affected commits.
2. Open [smartapi.angelone.in](https://smartapi.angelone.in/) -> delete/regenerate the SmartAPI App API Key.
3. Open the Angel One mobile/web app -> change your **Trading MPIN**.
4. Re-enroll **TOTP** at `https://smartapi.angelone.in/enable-totp` to issue a brand new authenticator secret.
5. Run `node operations/scripts/setup-broker-secrets.mjs` locally (concealed terminal input) to store the rotated values and generate a fresh `MARKET_ADAPTER_AUTH_TOKEN`.
6. Update `MARKET_ADAPTER_AUTH_TOKEN` in Cloudflare Worker Encrypted Secrets if using remote tunnel mode.
7. Run `node operations/scripts/scan-secrets.mjs` to confirm `result: "PASS"` across source and `dist/`.
