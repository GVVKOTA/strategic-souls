import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateHealthReadiness } from "../../backend/services/health.ts";

test("health live mode skips D1 probe and returns 200 ok", async () => {
  let dbCalled = false;
  const result = await evaluateHealthReadiness({
    mode: "live",
    db: {
      prepare() {
        dbCalled = true;
        return { first: async () => ({ ok: 1 }) };
      },
    },
    buildCommit: "4c04f31de9fddace1fb316ae09b930e7d81eeefe",
    workerVersionId: "8ad07157-7969-478a-b9a7-66c4fb1c3393",
  });
  assert.equal(dbCalled, false);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, "ok");
  assert.equal(result.body.provenance, "IDENTIFIED");
  assert.equal(result.body.checks.database.checked, false);
});

test("health ready mode verifies D1 SELECT 1 and returns 200 ok", async () => {
  const result = await evaluateHealthReadiness({
    mode: "ready",
    db: {
      prepare(sql) {
        assert.equal(sql, "SELECT 1 AS ok");
        return { first: async () => ({ ok: 1 }) };
      },
    },
    buildCommit: null,
    workerVersionId: null,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, "ok");
  assert.equal(result.body.provenance, "UNAVAILABLE");
  assert.equal(result.body.checks.database.checked, true);
  assert.equal(result.body.checks.database.ok, true);
  assert.equal(typeof result.body.checks.database.latencyMs, "number");
});

test("health ready mode fails closed with sanitized 503 degraded output when D1 errors", async () => {
  const result = await evaluateHealthReadiness({
    mode: "ready",
    db: {
      prepare() {
        return {
          first: async () => {
            throw new Error("SECRET_INTERNAL_STACK_DETAIL_DO_NOT_EXPOSE");
          },
        };
      },
    },
    buildCommit: "4c04f31de9fddace1fb316ae09b930e7d81eeefe",
    workerVersionId: "8ad07157-7969-478a-b9a7-66c4fb1c3393",
  });
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.status, "degraded");
  assert.equal(result.body.checks.database.ok, false);
  assert.equal(JSON.stringify(result.body).includes("SECRET_INTERNAL_STACK_DETAIL"), false);
});

test("/api/health route enforces private no-store and nosniff headers", () => {
  const routeSource = readFileSync("app/api/health/route.ts", "utf8");
  assert.match(routeSource, /"Cache-Control":\s*"private, no-store"/);
  assert.match(routeSource, /"X-Content-Type-Options":\s*"nosniff"/);
});
