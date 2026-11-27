import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionUrl } from "./config.mjs";
import { reconcileIncidents } from "./github-incidents.mjs";
import { runProductionMonitor } from "./monitor.mjs";

const SAMPLE_COMMIT = "4c04f31de9fddace1fb316ae09b930e7d81eeefe";
const SAMPLE_HTML = `<!doctype html><html><head><link rel="stylesheet" href="/_next/static/css/app.css" /></head><body><h1>Strategic Souls</h1><img src="/gvv-approved.jpg" /><script src="/_next/static/chunks/main.js"></script></body></html>`;

function jsonResponse(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      ...headers,
    },
  });
}

function createHealthyFetch(nowIso = "2026-11-26T17:45:00.000Z") {
  const overviewCards = Array.from({ length: 8 }, (_, idx) => ({
    canonicalId: idx === 7 ? "ECB:USDINR" : `NSE:SYM${idx}`,
    value: idx === 7 ? 84.12 : null,
    redistributable: idx === 7,
  }));

  return async (url) => {
    const u = new URL(url);
    const p = `${u.pathname}${u.search}`;
    if (p === "/") {
      return new Response(SAMPLE_HTML, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'self'",
          "Strict-Transport-Security": "max-age=31536000",
        },
      });
    }
    if (p === "/gvv-approved.jpg") {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/jpeg" } });
    }
    if (p === "/_next/static/css/app.css") {
      return new Response("body{}", { status: 200, headers: { "Content-Type": "text/css" } });
    }
    if (p === "/_next/static/chunks/main.js") {
      return new Response("console.log(1)", { status: 200, headers: { "Content-Type": "application/javascript" } });
    }
    if (p === "/api/release") {
      return jsonResponse({
        product: "Strategic Souls",
        release: "V3.1",
        releaseName: "Strategic Souls X 1.1 Workspace",
        revisionMarker: "x11-workspace-2026-11-25",
        provenance: "IDENTIFIED",
        buildCommit: SAMPLE_COMMIT,
        workerVersionId: "8ad07157-7969-478a-b9a7-66c4fb1c3393",
      });
    }
    if (p === "/api/health") {
      return jsonResponse({
        status: "ok",
        service: "strategic-souls",
        mode: "ready",
        checks: { worker: { ok: true }, database: { checked: true, ok: true, latencyMs: 4 } },
      });
    }
    if (p === "/api/markets/public") {
      return jsonResponse(
        { asOf: nowIso, providers: [{ id: "ECB", state: "CONNECTED" }] },
        { headers: { "Cache-Control": "public, max-age=60" } },
      );
    }
    if (p === "/api/markets/overview?source=public-cache") {
      return jsonResponse({ asOf: nowIso, cards: overviewCards });
    }
    if (p === "/api/auth/session") {
      return jsonResponse({ authenticated: false, isOwner: false });
    }
    if (p === "/api/x1/workspace" || p === "/api/x2/providers") {
      return jsonResponse({ error: "Authentication required." }, { status: 401 });
    }
    return new Response("Not Found", { status: 404 });
  };
}

function createFakeGitHub(initialIssues = []) {
  const issues = structuredClone(initialIssues);
  let nextNum = issues.reduce((m, i) => Math.max(m, i.number), 0) + 1;
  const calls = { create: 0, update: 0, comment: 0, ensureLabels: 0 };
  const client = {
    async listOpenAutomatedIssues() {
      return issues.filter(
        (i) => i.state === "open" && i.labels.some((l) => (typeof l === "string" ? l : l.name) === "automated"),
      );
    },
    async ensureLabels() {
      calls.ensureLabels += 1;
    },
    async createIssue(payload) {
      calls.create += 1;
      const created = {
        number: nextNum++,
        state: "open",
        title: payload.title,
        body: payload.body,
        labels: payload.labels.map((name) => ({ name })),
        assignees: payload.assignees ?? [],
      };
      issues.push(created);
      return created;
    },
    async updateIssue(issueNumber, payload) {
      calls.update += 1;
      const issue = issues.find((i) => i.number === issueNumber);
      if (!issue) throw new Error(`Missing issue ${issueNumber}`);
      if (payload.title) issue.title = payload.title;
      if (payload.body) issue.body = payload.body;
      if (payload.labels) issue.labels = payload.labels.map((name) => ({ name }));
      if (payload.state) issue.state = payload.state;
      return issue;
    },
    async addComment(issueNumber, body) {
      calls.comment += 1;
      const issue = issues.find((i) => i.number === issueNumber);
      if (!issue) throw new Error(`Missing issue ${issueNumber}`);
      issue.comments = [...(issue.comments ?? []), body];
      return { id: issue.comments.length };
    },
  };
  return { client, issues, calls };
}

test("validateProductionUrl accepts public HTTPS and rejects empty, http, localhost, and private hosts", () => {
  assert.equal(validateProductionUrl("https://strategic-souls.vishnukota20071005.workers.dev/").ok, true);
  assert.equal(validateProductionUrl("").ok, false);
  assert.equal(validateProductionUrl("http://strategic-souls.vishnukota20071005.workers.dev").ok, false);
  assert.equal(validateProductionUrl("https://localhost:5173").ok, false);
  assert.equal(validateProductionUrl("https://127.0.0.1").ok, false);
  assert.equal(validateProductionUrl("https://192.168.1.10").ok, false);
  assert.equal(validateProductionUrl("https://user:pass@example.com").ok, false);
});

test("healthy production probes pass including expected 401s, entitlement-blocked null cards, and weekend reference age", async () => {
  const weekendNow = new Date("2026-11-29T12:00:00.000Z"); // Sunday
  const fridayAsOf = "2026-11-27T16:00:00.000Z";
  const res = await runProductionMonitor({
    targetUrl: "https://strategic-souls.vishnukota20071005.workers.dev",
    fetchImpl: createHealthyFetch(fridayAsOf),
    now: weekendNow,
    delayFn: async () => {},
  });
  assert.equal(res.ok, true);
  assert.equal(res.summary.passed, 6);
  assert.equal(res.summary.failed, 0);
  assert.equal(res.releaseMetadata.buildCommit, SAMPLE_COMMIT);
});

test("transient network blip recovers within bounded retries without failing check", async () => {
  const baseFetch = createHealthyFetch();
  let healthAttempts = 0;
  const flakyFetch = async (url, init) => {
    if (new URL(url).pathname === "/api/health") {
      healthAttempts++;
      if (healthAttempts === 1) throw new Error("network timeout");
    }
    return baseFetch(url, init);
  };
  const res = await runProductionMonitor({
    targetUrl: "https://strategic-souls.vishnukota20071005.workers.dev",
    fetchImpl: flakyFetch,
    now: new Date("2026-11-26T17:45:00.000Z"),
    delayFn: async () => {},
  });
  assert.equal(res.ok, true);
  assert.equal(healthAttempts, 2);
});

test("malformed JSON, auth fail-open (200 on private route), and non-redistributable guest price trigger critical/high failures", async () => {
  const baseFetch = createHealthyFetch();
  const brokenFetch = async (url, init) => {
    const p = new URL(url).pathname;
    if (p === "/api/release") return new Response("not-json", { status: 200, headers: { "Cache-Control": "no-store" } });
    if (p === "/api/x1/workspace") return jsonResponse({ secretRows: [] }, { status: 200 });
    if (p === "/api/markets/overview") {
      return jsonResponse({
        cards: Array.from({ length: 8 }, (_, i) => ({
          canonicalId: `NSE:S${i}`,
          value: 100,
          redistributable: false,
        })),
      });
    }
    return baseFetch(url, init);
  };
  const res = await runProductionMonitor({
    targetUrl: "https://strategic-souls.vishnukota20071005.workers.dev",
    fetchImpl: brokenFetch,
    now: new Date("2026-11-26T17:45:00.000Z"),
    delayFn: async () => {},
  });
  assert.equal(res.ok, false);
  const byId = Object.fromEntries(res.checks.map((c) => [c.id, c]));
  assert.equal(byId["release-identity"].category, "INVALID_CONTRACT");
  assert.equal(byId["auth-session-and-isolation"].category, "SECURITY_INVARIANT_VIOLATION");
  assert.equal(byId["auth-session-and-isolation"].severity, "critical");
  assert.equal(byId["public-market-overview"].category, "SECURITY_INVARIANT_VIOLATION");
  assert.equal(byId["public-market-overview"].severity, "critical");
});

test("non-critical failures require 2 confirmed runs, deduplicate updates without comment spam, and auto-close only automation-owned issues after 2 recoveries", async () => {
  const baseFetch = createHealthyFetch();
  let releaseBroken = true;
  const toggleFetch = async (url, init) => {
    if (new URL(url).pathname === "/api/release" && releaseBroken) {
      return new Response("bad-gateway", { status: 502 });
    }
    return baseFetch(url, init);
  };

  // Pre-existing human issue that automation must NEVER touch or close
  const humanIssue = {
    number: 99,
    state: "open",
    title: "Human bug report",
    body: "User noticed a layout question.",
    labels: [{ name: "bug" }],
  };
  const gh = createFakeGitHub([humanIssue]);
  const url = "https://strategic-souls.vishnukota20071005.workers.dev";

  // Run 1: high severity failure -> PENDING_CONFIRMATION (no issue created yet)
  const m1 = await runProductionMonitor({ targetUrl: url, fetchImpl: toggleFetch, now: new Date("2026-11-26T18:00:00Z"), delayFn: async () => {} });
  const r1 = await reconcileIncidents({ monitorResult: m1, previousState: null, github: gh.client });
  assert.equal(r1.actions[0].type, "PENDING_CONFIRMATION");
  assert.equal(gh.calls.create, 0);

  // Run 2: confirmed high severity failure -> OPENED 1 issue
  const m2 = await runProductionMonitor({ targetUrl: url, fetchImpl: toggleFetch, now: new Date("2026-11-26T18:15:00Z"), delayFn: async () => {} });
  const r2 = await reconcileIncidents({ monitorResult: m2, previousState: r1.state, github: gh.client });
  assert.equal(r2.actions[0].type, "OPENED");
  assert.equal(gh.calls.create, 1);

  // Run 3: still failing -> UPDATED in place, zero comment spam
  const m3 = await runProductionMonitor({ targetUrl: url, fetchImpl: toggleFetch, now: new Date("2026-11-26T18:30:00Z"), delayFn: async () => {} });
  const r3 = await reconcileIncidents({ monitorResult: m3, previousState: r2.state, github: gh.client });
  assert.equal(r3.actions[0].type, "UPDATED");
  assert.equal(gh.calls.create, 1);
  assert.equal(gh.calls.update, 1);
  assert.equal(gh.calls.comment, 0);

  // Run 4: 1st recovery -> RECOVERY_PENDING (not closed yet)
  releaseBroken = false;
  const m4 = await runProductionMonitor({ targetUrl: url, fetchImpl: toggleFetch, now: new Date("2026-11-26T18:45:00Z"), delayFn: async () => {} });
  const r4 = await reconcileIncidents({ monitorResult: m4, previousState: r3.state, github: gh.client });
  assert.equal(r4.actions[0].type, "RECOVERY_PENDING");

  // Run 5: 2nd verified recovery -> CLOSED with 1 recovery comment; human issue untouched
  const m5 = await runProductionMonitor({ targetUrl: url, fetchImpl: toggleFetch, now: new Date("2026-11-26T19:00:00Z"), delayFn: async () => {} });
  const r5 = await reconcileIncidents({ monitorResult: m5, previousState: r4.state, github: gh.client });
  assert.equal(r5.actions[0].type, "CLOSED");
  assert.equal(gh.calls.comment, 1);
  const autoIssue = gh.issues.find((i) => i.number !== 99);
  assert.equal(autoIssue.state, "closed");
  assert.equal(humanIssue.state, "open");
});

test("dry-run computes actions without issuing any GitHub writes, and GitHub API failure propagates cleanly", async () => {
  const baseFetch = createHealthyFetch();
  const downFetch = async (url, init) => {
    if (new URL(url).pathname === "/api/health") return new Response("err", { status: 503 });
    return baseFetch(url, init);
  };
  const gh = createFakeGitHub();
  const m = await runProductionMonitor({
    targetUrl: "https://strategic-souls.vishnukota20071005.workers.dev",
    fetchImpl: downFetch,
    now: new Date("2026-11-26T18:00:00Z"),
    delayFn: async () => {},
  });

  // Dry run: zero mutating calls
  const dry = await reconcileIncidents({ monitorResult: m, previousState: null, github: gh.client, dryRun: true });
  assert.equal(dry.actions[0].type, "WOULD_OPEN");
  assert.equal(gh.calls.create, 0);
  assert.equal(gh.calls.ensureLabels, 0);

  // GitHub API write failure surfaces explicitly
  const failingClient = {
    ...gh.client,
    async createIssue() {
      throw new Error("GitHub API POST /issues failed with HTTP 403");
    },
  };
  await assert.rejects(
    () => reconcileIncidents({ monitorResult: m, previousState: null, github: failingClient, dryRun: false }),
    /HTTP 403/,
  );
});

test("X3-102: monitor detects stale/missed Worker cron heartbeats and recovers when fresh", async () => {
  const baseFetch = createHealthyFetch();
  let stale = true;
  const hbFetch = async (url, init) => {
    if (new URL(url).pathname === "/api/health") {
      return jsonResponse({
        status: "ok",
        service: "strategic-souls",
        mode: "ready",
        checks: {
          worker: { ok: true },
          database: { checked: true, ok: true, latencyMs: 3 },
          heartbeats: {
            checked: true,
            ok: !stale,
            staleCount: stale ? 1 : 0,
            tasks: [
              {
                taskName: "soul_memory_ist_midnight_reset",
                lastStatus: stale ? "ERROR" : "OK",
                lastRunAt: "2026-11-26T18:30:05.000Z",
                lastOkAt: stale ? "2026-11-24T18:30:05.000Z" : "2026-11-26T18:30:05.000Z",
                ageMinutes: stale ? 2880 : 15,
                maxAgeMinutes: 1560,
                stale,
              },
            ],
          },
        },
      });
    }
    return baseFetch(url, init);
  };

  const bad = await runProductionMonitor({
    targetUrl: "https://strategic-souls.vishnukota20071005.workers.dev",
    fetchImpl: hbFetch,
    now: new Date("2026-11-26T18:45:00.000Z"),
    delayFn: async () => {},
  });
  assert.equal(bad.ok, false);
  const hbCheck = bad.checks.find((c) => c.id === "cron-heartbeats");
  assert.ok(hbCheck);
  assert.equal(hbCheck.category, "HEARTBEAT_STALE");
  assert.equal(hbCheck.severity, "high");

  stale = false;
  const good = await runProductionMonitor({
    targetUrl: "https://strategic-souls.vishnukota20071005.workers.dev",
    fetchImpl: hbFetch,
    now: new Date("2026-11-26T18:45:00.000Z"),
    delayFn: async () => {},
  });
  assert.equal(good.ok, true);
  assert.equal(good.summary.passed, 7);
});
