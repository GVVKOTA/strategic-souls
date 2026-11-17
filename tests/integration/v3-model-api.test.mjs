/** V3 validation + actual HTTP handler with an explicitly mocked Auth transport.
 * No real Supabase/Google authentication is claimed by these tests. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { webcrypto, randomUUID } from "node:crypto";
const settings = {};
let transportCalls = [],
  verified = true,
  redirectOtp = false;
const userId = "7a045420-37ca-4c26-9051-5e86a457162e";
const transport = async (url, init = {}) => {
  transportCalls.push({ url, init });
  if (url.endsWith("/auth/v1/user"))
    return Response.json(
      verified
        ? { id: userId, email_confirmed_at: "2026-01-01", is_anonymous: false }
        : { id: userId, email_confirmed_at: null },
    );
  if (url.includes("/auth/v1/token") || url.endsWith("/auth/v1/verify"))
    return Response.json({
      access_token: "TEST_ACCESS_NOT_REAL",
      refresh_token: "TEST_REFRESH_NOT_REAL",
      expires_in: 3600,
    });
  if (redirectOtp && url.endsWith("/auth/v1/otp"))
    return Response.redirect("https://redirect.example.invalid/", 307);
  if (url.endsWith("/auth/v1/otp") || url.includes("/auth/v1/logout"))
    return Response.json({});
  if (
    url.includes("/rest/v1/v3_bodies") ||
    url.includes("/rest/v1/v3_notification_preferences")
  )
    return Response.json([]);
  if (url.endsWith("/rest/v1/rpc/v3_save_profile"))
    return Response.json([{ id: userId, TEST_ONLY: true }]);
  if (url.includes("/rest/v1/rpc/")) return Response.json({ TEST_ONLY: true });
  return Response.json({ code: "42501" }, { status: 403 });
};
const context = vm.createContext({
  console,
  Request,
  Response,
  Headers,
  TextEncoder,
  TextDecoder,
  crypto: webcrypto,
  URL,
  URLSearchParams,
  Intl,
  Date,
  Uint8Array,
  Number,
  Math,
  JSON,
  structuredClone,
  AbortSignal,
  btoa,
  atob,
  fetch: transport,
});
const cache = new Map();
async function load(path) {
  const file = resolve(path);
  if (cache.has(file)) return cache.get(file);
  if (file.replaceAll("\\", "/").endsWith("/backend/auth/chatgpt-auth.ts")) {
    const m = new vm.SyntheticModule(
      ["getChatGPTUser"],
      function () {
        this.setExport("getChatGPTUser", async () => null);
      },
      { context },
    );
    cache.set(file, m);
    return m;
  }
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const m = new vm.SourceTextModule(code, { context, identifier: file });
  cache.set(file, m);
  await m.link(async (spec, ref) => {
    if (spec === "cloudflare:workers") {
      if (!cache.has(spec)) {
        const m = new vm.SyntheticModule(
          ["env"],
          function () {
            this.setExport("env", settings);
          },
          { context },
        );
        cache.set(spec, m);
      }
      return cache.get(spec);
    }
    let target = resolve(dirname(ref.identifier), spec);
    if (!existsSync(target)) target += ".ts";
    return load(target);
  });
  return m;
}
const module = await load("app/api/v3/[...segments]/route.ts");
await module.evaluate();
const model = cache.get(resolve("backend/services/v3/model.ts")).namespace;
async function call(path, input, headers = {}) {
  const request = new Request("https://local.example/api/v3/" + path, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      origin: "https://local.example",
      "content-type": "application/json",
      ...headers,
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const r =
    await module.namespace[input === undefined ? "GET" : "POST"](request);
  return {
    status: r.status,
    data: r.headers.get("content-type")?.includes("json")
      ? await r.json()
      : null,
    headers: r.headers,
  };
}
const soul = {
  title: "TEST draft",
  topic: "",
  hypothesis: "",
  horizon: "One month",
  reasoning: "",
  opposingCase: "",
  invalidation: "",
  reviewAt: null,
  tags: [],
  evidence: [],
  commitment: "DRAFT",
  dataRequired: false,
};
test("NFKC handles, reserved names, bounded profiles and no unsafe characters", () => {
  assert.equal(model.handle("@Researcher_1"), "researcher_1");
  assert.equal(model.handle("Ａｌｐｈａ"), "alpha");
  for (const h of [
    "admin",
    "sebi",
    "ab",
    "1alpha",
    "bad/name",
    "a".repeat(25),
    "a b c",
    "ɑlpha",
  ])
    assert.throws(() => model.handle(h));
  assert.throws(() =>
    model.validateProfile({ handle: "valid_user", displayName: "", bio: "" }),
  );
});
test("incomplete drafts accepted; commitments, future sources and SSRF links validated", () => {
  assert.equal(model.validateSoul(soul).commitment, "DRAFT");
  assert.throws(() => model.validateSoul({ ...soul, commitment: "COMMITTED" }));
  const source = {
    title: "TEST",
    url: "https://example.com/test",
    claim: "TEST interpretation",
    stance: "CONTEXT",
    publishedAt: "2020-01-01T00:00:00Z",
    knownAt: "2020-01-02T00:00:00Z",
  };
  assert.equal(
    model.validateSoul({ ...soul, evidence: [source] }).evidence.length,
    1,
  );
  for (const url of [
    "http://example.com",
    "https://127.0.0.1/a",
    "https://[::1]",
    "https://a:b@example.com",
    "javascript:alert(1)",
  ])
    assert.throws(() =>
      model.validateSoul({ ...soul, evidence: [{ ...source, url }] }),
    );
  assert.throws(() =>
    model.validateSoul({
      ...soul,
      evidence: [{ ...source, knownAt: "2099-01-01T00:00:00Z" }],
    }),
  );
});
test("state transitions preserve research meaning and version-specific review attribution", () => {
  const version = {
    id: "v2",
    soul_id: "s",
    created_at: "2020-01-01",
    payload: {
      ...soul,
      commitment: "COMMITTED",
      reviewAt: "2021-01-01T00:00:00Z",
    },
  };
  assert.equal(model.soulState(version, [], "2022-01-01"), "READY_TO_REVIEW");
  const e = {
    id: "e",
    soul_id: "s",
    created_at: "2022-01-01",
    event_type: "REVIEW",
    payload: { versionId: "v1", outcome: "RESOLVED_INVALIDATED" },
  };
  assert.equal(model.soulState(version, [e], "2022-01-01"), "READY_TO_REVIEW");
  assert.equal(
    model.soulState(version, [
      { ...e, payload: { ...e.payload, versionId: "v2" } },
    ]),
    "RESOLVED_INVALIDATED",
  );
  assert.equal(
    model.soulState(version, [{ ...e, event_type: "ARCHIVE" }]),
    "ARCHIVED",
  );
});
test("natural language is bounded, ambiguous language is visible, and condition diffs are precise", () => {
  const p = model.parseCommand(
    "Find liquid NSE stocks above 50-day SMA and RSI < 35",
  );
  assert.equal(p.scan.conditions.length, 2);
  assert.ok(p.ambiguities.some((s) => s.includes("liquid")));
  assert.ok(
    model.parseCommand("NSE stocks __import__(os)").unrecognized.length,
  );
  const before = { conditions: [{ field: "rsi", value: 35 }] },
    after = { conditions: [{ field: "rsi", value: 40 }] };
  assert.equal(model.diff(before, after)[0].path, "conditions[0].value");
  assert.equal(model.comparable({}, {}).comparable, false);
});
test("moderation permits private academic notes but public publishing always remains closed", () => {
  assert.equal(
    model.moderate("Guaranteed 100% returns", "PRIVATE").decision,
    "ALLOW_PRIVATE",
  );
  assert.equal(
    model.moderate("Guaranteed 100% returns", "TEAM").decision,
    "REVIEW_REQUIRED",
  );
  assert.equal(
    model.moderate(
      "Academic discussion of a historical market mechanism",
      "TEAM",
    ).decision,
    "ALLOW_TEAM",
  );
  assert.equal(
    model.moderate("A benign note", "PUBLIC").decision,
    "BLOCK_PUBLIC",
  );
});
test("missing backend and forged platform headers never create consumer identity", async () => {
  assert.equal((await call("health")).data.backend, "NOT_CONFIGURED");
  assert.equal((await call("session")).data.authenticated, false);
  assert.equal((await call("soul", { payload: soul })).status, 503);
  settings.SUPABASE_URL = "http://127.0.0.1:54321";
  settings.SUPABASE_PUBLISHABLE_KEY = "TEST_KEY_NOT_REAL";
  settings.V3_LOCAL_DEV = "1";
  assert.equal(
    (await call("souls", undefined, { "oai-authenticated-user-id": "forged" }))
      .status,
    401,
  );
  assert.equal(
    (
      await call(
        "auth/email-code",
        { email: "fixture@example.com" },
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
});
test("mock Auth OTP protocol, browser-bound pending email and cookie security flags", async () => {
  const sent = await call("auth/email-code", { email: "fixture@example.com" });
  assert.equal(sent.status, 200);
  assert.ok(sent.headers.get("set-cookie").includes("HttpOnly"));
  assert.ok(sent.headers.get("set-cookie").includes("Secure"));
  assert.equal(
    (
      await call(
        "auth/verify",
        { email: "other@example.com", code: "123456" },
        { cookie: "ss_pending_email=fixture%40example.com" },
      )
    ).status,
    400,
  );
  const verified = await call(
    "auth/verify",
    { email: "fixture@example.com", code: "123456" },
    { cookie: "ss_pending_email=fixture%40example.com" },
  );
  assert.equal(verified.status, 200);
  assert.ok(verified.headers.get("set-cookie").includes("SameSite=Lax"));
  assert.equal(verified.data.access_token, undefined);
});
test("Supabase upstream redirects fail closed without forwarding the request", async () => {
  const before = transportCalls.length;
  redirectOtp = true;
  try {
    const result = await call("auth/email-code", { email: "fixture@example.com" });
    assert.equal(result.status, 503);
    assert.equal(result.headers.get("set-cookie"), null);
    assert.equal(transportCalls.length, before + 1);
    assert.equal(transportCalls.at(-1).init.redirect, "manual");
  } finally {
    redirectOtp = false;
  }
});
test("Google is gated, callback state required and PKCE includes a server-only verifier", async () => {
  assert.equal((await call("auth/google")).status, 503);
  settings.V3_GOOGLE_ENABLED = "1";
  const start = await call("auth/google");
  assert.equal(start.status, 303);
  const target = new URL(start.headers.get("location"));
  assert.equal(target.searchParams.get("code_challenge_method"), "s256");
  assert.ok(target.searchParams.get("code_challenge"));
  assert.equal(target.searchParams.get("code_verifier"), null);
  assert.equal(
    (
      await call("auth/callback?state=evil&code=TEST_CODE", undefined, {
        cookie: "ss_oauth_state=actual; ss_pkce=TEST_VERIFIER",
      })
    ).status,
    400,
  );
});
test("verified backend user required; invalid URLs, byte limits, and publish/run gates fail closed", async () => {
  verified = false;
  assert.equal(
    (
      await call("souls", undefined, {
        cookie: "ss_access=TEST_ACCESS_NOT_REAL",
      })
    ).status,
    401,
  );
  verified = true,
  redirectOtp = false;
  assert.equal(
    (await call("publish", {}, { cookie: "ss_access=TEST_ACCESS_NOT_REAL" }))
      .status,
    403,
  );
  assert.equal(
    (await call("run", {}, { cookie: "ss_access=TEST_ACCESS_NOT_REAL" }))
      .status,
    503,
  );
  assert.equal(
    (
      await call(
        "avatar",
        { base64: btoa("<svg>NOT_AN_IMAGE</svg>"), mime: "image/svg+xml" },
        { cookie: "ss_access=TEST_ACCESS_NOT_REAL" },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "profile",
        { bio: "x".repeat(40000) },
        { cookie: "ss_access=TEST_ACCESS_NOT_REAL" },
      )
    ).status,
    413,
  );
  settings.SUPABASE_URL = "http://external.example";
  assert.equal((await call("session")).status, 503);
});

test("PostgREST named-row arrays normalize to exactly one saved object", async () => {
  settings.SUPABASE_URL = "http://127.0.0.1:54321";
  const r = await call(
    "profile",
    {
      handle: "fixture_user",
      displayName: "Fixture",
      bio: "",
      adult: true,
      privacy: true,
      terms: true,
    },
    { cookie: "ss_access=TEST_ACCESS_NOT_REAL" },
  );
  assert.equal(r.status, 201);
  assert.equal(r.data.id, userId);
  assert.equal(Array.isArray(r.data), false);
});
