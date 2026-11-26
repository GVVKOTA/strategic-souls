# Strategic Souls Production Monitoring & Incident Inbox Runbook

This runbook documents the automated production health monitor and GitHub Issues incident workflow for **Strategic Souls** (`Global Vertex Vectors`).

---

## 1. Architecture & Canonical Target

- **Canonical Production Origin:** `https://strategic-souls.vishnukota20071005.workers.dev`
- **Configurable Override:** Repository variable `SS_PRODUCTION_URL` (or `workflow_dispatch` `target_url` input). Must be a valid `https://` public URL — `http://`, `localhost`, loopback, and private-network addresses fail closed.
- **Workflow:** [`.github/workflows/production-monitor.yml`](../../.github/workflows/production-monitor.yml)
- **Implementation:**
  - [`operations/monitoring/config.mjs`](config.mjs) — URL validation & threshold defaults
  - [`operations/monitoring/monitor.mjs`](monitor.mjs) — 6 read-only HTTPS probes with bounded retries & payload caps
  - [`operations/monitoring/github-incidents.mjs`](github-incidents.mjs) — fingerprint deduplication, anti-spam updates & recovery auto-close
  - [`operations/monitoring/run-monitor.mjs`](run-monitor.mjs) — CLI runner & GitHub Step Summary emitter
  - [`application/app/api/health/route.ts`](../../application/app/api/health/route.ts) — sanitized Worker + D1 readiness endpoint

---

## 2. Check Inventory & Thresholds

| Check ID | Path(s) | Severity | Expected Behavior |
| --- | --- | --- | --- |
| `homepage-html` | `/`, `/gvv-approved.jpg`, sampled `/_next/static/*` | `critical` (asset failure: `high`) | HTTP 200 HTML with `Strategic Souls`, CSP & HSTS headers, valid static JS/CSS/logo delivery |
| `release-identity` | `/api/release` | `high` | HTTP 200 `no-store` JSON with `provenance: "IDENTIFIED"`, 40-hex `buildCommit`, `workerVersionId` |
| `health-readiness` | `/api/health` | `critical` | HTTP 200 `no-store` JSON with `status: "ok"`, `worker.ok: true`, `database.ok: true` (`SELECT 1`) |
| `public-market-references` | `/api/markets/public` | `medium` | HTTP 200 JSON with valid `asOf` within `7` days (weekend/holiday-tolerant) and non-empty `providers` |
| `public-market-overview` | `/api/markets/overview?source=public-cache` | `high` (`critical` on rights leak) | HTTP 200 JSON with 8 distinct cards; every guest card `value === null` OR `redistributable === true` |
| `auth-session-and-isolation` | `/api/auth/session`, `/api/x1/workspace`, `/api/x2/providers` | `critical` | Guest session returns `200` (`authenticated: false`); private endpoints fail closed (`401`/`403`) |

**Retry & Threshold Policy:**
- **Within a run:** Each probe retries up to `2` times (`3` total attempts; `1s`, `2.5s` backoff) with `15s` request timeout and `512 KiB` body cap.
- **Latency:** Warning logged above `4000ms` (`SS_MONITOR_WARN_LATENCY_MS`); sustained latency above `8000ms` (`SS_MONITOR_FAIL_LATENCY_MS`) classifies as `HIGH_LATENCY` (`medium`).
- **Incident Confirmation:** `critical` outages open an issue after `1` confirmed failing run (`3` failed probe attempts); `high`/`medium` require `2` consecutive failing scheduled runs (tracked via workflow artifact `production-monitor-state`).
- **Deduplication & Anti-Spam:** Open issues use `<!-- ss-monitor-fingerprint:prod:<checkId>:<category> -->`. Subsequent failing runs `PATCH` the open issue body with updated `Last seen (UTC / IST)` and counts without posting repetitive comments.
- **Auto-Recovery:** After `2` consecutive passing runs, the monitor posts a single concise recovery summary and closes **only** automation-owned issues (must carry both the `automated` label and the fingerprint marker). Human-filed issues are never touched.

---

## 3. Schedule, Limitations & Honest Blind Spots

- **Cadence:** Scheduled `cron: "*/15 * * * *"` plus manual `workflow_dispatch` (including `dry_run: true`).
- **Best-Effort Timing:** GitHub Actions `schedule` triggers are best-effort and may run several minutes late during GitHub queue congestion. This is **not** a guaranteed 15-minute SLA or staffed 24/7 NOC.
- **Explicit Blind Spots:**
  - Client-side browser JavaScript exceptions, WebGL shader errors, and mobile layout regressions are **not** observable by server-side HTTP probes.
  - Authenticated user flows (login/signup/Soul Scan execution/Chats/Rooms) and the private owner Angel One VPC adapter (`MARKET_DATA_ADAPTER`) are **not** probed continuously in production to avoid synthetic user spam, D1 quota noise, or broker API usage.
  - Entitlement-blocked markets (`value: null`), market closures, weekends, and public holiday delays are treated as **normal** states, not incidents.

---

## 4. Owner Notification Setup (`GVVKOTA`)

Automation assigns incident issues to `GVVKOTA` and applies labels `incident`, `production`, `automated`, `severity:*`, `needs-attention`. **GitHub only sends email or mobile push notifications based on the owner's personal GitHub account settings:**

1. Open `https://github.com/GVVKOTA/strategic-souls`.
2. Click **Watch -> Custom** and enable at least **Issues** and **Actions** (so both newly opened incident issues and failed monitor workflow runs notify you).
3. Verify your personal notification routing in **GitHub Settings -> Notifications** (Email and/or GitHub Mobile push for **Participating, @mentions and custom**).

---

## 5. Manual Run, Dry Run, Triage & Safe Disable

- **Local Dry Run (no GitHub writes):**
  ```powershell
  node operations/monitoring/run-monitor.mjs --dry-run
  ```
- **Manual Workflow Dispatch (GitHub Actions UI):**
  Run **Production website monitor** with `dry_run: true` to inspect probe status without touching Issues, or `dry_run: false` for a live check.
- **Monitor Self-Test Suite:**
  ```powershell
  node --test operations/monitoring/monitor.test.mjs
  ```
- **Triage & Rollback:** When an incident opens, check the linked Actions run summary, inspect Cloudflare Worker logs/deployments (`strategic-souls`), and if a recent release caused a regression, roll back traffic in `< 1 minute` following [`operations/deployment/DEPLOYMENT_RUNBOOK.md`](../deployment/DEPLOYMENT_RUNBOOK.md#6-instant-rollback--cloudflare-d1-recovery).
- **Disable Safely During Planned Maintenance:** Pause the workflow in GitHub Actions UI (**Actions -> Production website monitor -> ... -> Disable workflow**) rather than deleting workflow permissions or disabling repo Issues.
