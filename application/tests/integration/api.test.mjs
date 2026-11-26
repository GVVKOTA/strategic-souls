/** Actual route handler tested in an isolated VM with real SQLite and test identities.
 * No live Site, user identity, network listener or authentication bypass is used.
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import { webcrypto, randomUUID } from "node:crypto";
import { d1MigrationsDir } from "../helpers/paths.mjs";
const sql = new DatabaseSync(":memory:");
for (const file of readdirSync(d1MigrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort())
  sql.exec(readFileSync(resolve(d1MigrationsDir, file), "utf8"));
class Statement {
  constructor(query, args = []) {
    this.query = query;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.query, args);
  }
  async first() {
    return sql.prepare(this.query).get(...this.args) ?? null;
  }
  async all() {
    return {
      results: sql.prepare(this.query).all(...this.args),
      success: true,
    };
  }
  async run() {
    const result = sql.prepare(this.query).run(...this.args);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}
const DB = {
  prepare: (q) => new Statement(q),
  async batch(statements) {
    sql.exec("BEGIN");
    try {
      const result = [];
      for (const s of statements) result.push(await s.run());
      sql.exec("COMMIT");
      return result;
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  },
};
let currentUser = null;
const context = vm.createContext({
  console,
  Request,
  Response,
  Headers,
  TextEncoder,
  TextDecoder,
  crypto: { subtle: webcrypto.subtle, randomUUID },
  URL,
  Intl,
  Date,
  Uint8Array,
  Number,
  Math,
  JSON,
});
const cache = new Map();
async function load(path) {
  const file = resolve(path);
  if (cache.has(file)) return cache.get(file);
  if (file.replaceAll("\\", "/").endsWith("/backend/auth/session.ts")) {
    const m = new vm.SyntheticModule(
      ["getAuthenticatedUser", "clearSessionCookie"],
      function () {
        this.setExport("getAuthenticatedUser", async () => currentUser);
        this.setExport(
          "clearSessionCookie",
          () => "__ss_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        );
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
  return m;
}
async function link(spec, refer) {
  if (spec === "cloudflare:workers") {
    if (!cache.has(spec)) {
      const env = new vm.SyntheticModule(
        ["env"],
        function () {
          this.setExport("env", { DB });
        },
        { context },
      );
      cache.set(spec, env);
    }
    return cache.get(spec);
  }
  let target = resolve(dirname(refer.identifier), spec);
  if (!existsSync(target)) target += ".ts";
  return load(target);
}
const routeModule = await load("app/api/[...path]/route.ts");
await routeModule.link(link);
await routeModule.evaluate();
async function call(path, input, subject = "alpha", extra = {}) {
  currentUser = subject
    ? {
        userId: subject,
        email: subject + "@example.invalid",
        displayName: subject,
        fullName: null,
      }
    : null;
  const req = new Request("https://test.invalid/api/" + path, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      origin: "https://test.invalid",
      "content-type": "application/json",
      ...extra,
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const res = await routeModule.namespace[input === undefined ? "GET" : "POST"](req);
  return { status: res.status, data: await res.json(), headers: res.headers };
}
const consent = { adult: true, privacy: true, terms: true };

test("authentication, origin, consent and input size gates", async () => {
  assert.equal((await call("session", undefined, null)).status, 401);
  assert.equal((await call("workspace")).status, 403);
  assert.equal(
    (await call("consent", { ...consent, adult: false })).status,
    400,
  );
  assert.equal(
    (
      await call("consent", consent, "alpha", {
        origin: "https://evil.invalid",
      })
    ).status,
    403,
  );
  assert.equal((await call("consent", consent)).status, 200);
  assert.equal((await call("session")).data.accepted, true);
  assert.equal(
    (await call("save", { kind: "note", payload: { text: "x".repeat(5000) } }))
      .status,
    413,
  );
});
let strategyId, holdingId;
test("immutable strategy versions, deterministic hashes, deduplication and safe DSL", async () => {
  const payload = {
    name: "Isolated test",
    formula: "close > sma(close, 20)",
    instrument: "TEST",
    timeframe: "daily",
    thesis: "Test-only hypothesis",
  };
  const first = await call("save", { kind: "strategy", payload });
  assert.equal(first.status, 201);
  const rows = first.data.records;
  strategyId = rows[0].id;
  assert.equal(rows[0].payload.status, "DRAFT_UNVALIDATED");
  assert.equal(rows[0].digest.length, 64);
  await call("save", { kind: "strategy", payload });
  assert.equal((await call("workspace")).data.records.length, 1);
  await call("save", {
    kind: "strategy",
    payload: { ...payload, formula: "close > sma(close, 50)" },
  });
  assert.equal((await call("workspace")).data.records.length, 2);
  assert.equal((await call("remove", { id: strategyId })).status, 404);
  assert.equal(
    (
      await call("save", {
        kind: "strategy",
        payload: { ...payload, formula: "process.exit()" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("save", {
        kind: "strategy",
        payload: { ...payload, formula: "close + volume" },
      })
    ).status,
    400,
  );
});
test("holdings validated server-side; cross-account access and deletion denied", async () => {
  const payload = {
    symbol: "TEST",
    quantity: 2,
    cost: 5,
    currency: "INR",
    account: "Disposable test",
    assetClass: "Indian equity",
  };
  assert.equal(
    (
      await call("save", {
        kind: "holding",
        payload: { ...payload, quantity: -1 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("save", {
        kind: "holding",
        payload: { ...payload, cost: null },
      })
    ).status,
    400,
  );
  const r = await call("save", { kind: "holding", payload });
  assert.equal(r.status, 201);
  holdingId = r.data.records.find((r) => r.kind === "holding").id;
  await call("consent", consent, "beta");
  assert.equal(
    (await call("workspace", undefined, "beta")).data.records.length,
    0,
  );
  assert.equal((await call("remove", { id: holdingId }, "beta")).status, 404);
  assert.equal(
    (await call("export", undefined, "beta")).data.workspace.length,
    0,
  );
  assert.equal((await call("remove", { id: holdingId })).status, 200);
});
test("private notes export as data, not public content", async () => {
  assert.equal(
    (
      await call("save", {
        kind: "note",
        payload: { text: "<script>alert(1)</script>" },
      })
    ).status,
    201,
  );
  assert.equal(
    (await call("export")).data.workspace.find((r) => r.kind === "note").payload
      .text,
    "<script>alert(1)</script>",
  );
  for (const path of [
    "payments",
    "trade",
    "feed",
    "social",
    "advice",
    "publish",
    "subscribe",
  ])
    assert.equal((await call(path, {})).status, 403);
});
test("missing data prevents scans, outcomes, quota charges and synthetic generation", async () => {
  for (const path of ["scan", "outcome"])
    assert.equal((await call(path, { symbol: "TEST" })).status, 503);
  assert.equal(sql.prepare("SELECT count(*) n FROM souls").get().n, 0);
  assert.equal(
    sql
      .prepare("SELECT count(*) n FROM rate_limits WHERE key LIKE '%:scans:%'")
      .get().n,
    0,
  );
  assert.equal((await call("souls")).data.records.length, 0);
});
test("legacy data preserved and isolated; no implicit inactivity erasure", async () => {
  sql
    .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)")
    .run("stale", "Old", "2020-01-01", "v1", 1, "2020-01-01");
  sql
    .prepare("INSERT INTO souls VALUES (?,?,?,?,?,?,?)")
    .run(
      "legacy",
      "2020-01-01",
      "2020-01-01",
      "DEMO",
      "legacy-demo",
      '{"id":"legacy","source":"synthetic"}',
      "digest",
    );
  sql
    .prepare("INSERT INTO ownership VALUES (?,?,?)")
    .run("stale", "legacy", "key");
  await call("session", undefined, "beta");
  assert.equal(
    sql.prepare("SELECT count(*) n FROM accounts WHERE subject=?").get("stale")
      .n,
    1,
  );
  assert.equal(
    sql.prepare("SELECT count(*) n FROM ownership WHERE subject=?").get("stale")
      .n,
    1,
  );
  assert.throws(
    () => sql.prepare("UPDATE souls SET payload='{}' WHERE id='legacy'").run(),
    /immutable/,
  );
});
test("explicit erasure removes only the requesting account data", async () => {
  await call(
    "save",
    { kind: "note", payload: { text: "Beta private" } },
    "beta",
  );
  assert.equal((await call("erase", { confirmation: "wrong" })).status, 400);
  assert.equal(
    (await call("erase", { confirmation: "DELETE MY DATA" })).status,
    200,
  );
  assert.equal(
    sql
      .prepare("SELECT count(*) n FROM workspace_records WHERE subject=?")
      .get("alpha").n,
    0,
  );
  assert.equal(
    (await call("workspace", undefined, "beta")).data.records.length,
    1,
  );
  assert.equal(
    sql.prepare("SELECT count(*) n FROM souls WHERE id='legacy'").get().n,
    1,
  );
});

test("notebook lifecycle: save, idempotency, ownership, review and revision", async () => {
  await call("consent", consent, "notebook-owner");
  await call("consent", consent, "outsider");
  const payload = {
    name: "Research memory test",
    topic: "Test-only topic",
    thesis: "Test hypothesis with no financial claim.",
    counterThesis: "The alternative explanation is recorded.",
    falsification: "A contrary observation invalidates the claim.",
    reviewBy: new Date(Date.now() + 86400000).toISOString(),
    formula: "close / sma(close, 2) - 1",
    evidence: [
      {
        title: "Test reference",
        url: "https://example.com/research",
        claim: "This is a test fixture, not market evidence.",
        stance: "OPPOSES",
        publishedAt: "2020-01-01T00:00:00Z",
        knownAt: "2020-01-02T00:00:00Z",
      },
    ],
  };
  const first = await call("notebook", { payload }, "notebook-owner");
  assert.equal(first.status, 201);
  const soul = first.data.soul;
  assert.equal(soul.payload.mode, "RESEARCH_NOTEBOOK");
  assert.equal(soul.payload.assessment, "ABSTAIN");
  assert.equal(soul.payload.evidence[0].verification, "USER_SUPPLIED");
  const retry = await call("notebook", { payload }, "notebook-owner");
  assert.equal(retry.data.soul.id, soul.id);
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () =>
      call("notebook", { payload }, "notebook-owner"),
    ),
  );
  assert.ok(
    concurrent.every((r) => r.status === 201 && r.data.soul.id === soul.id),
  );
  assert.equal(
    (await call("notebooks", undefined, "notebook-owner")).data.souls.length,
    1,
  );
  assert.equal(
    (await call("notebooks", undefined, "outsider")).data.souls.length,
    0,
  );
  assert.equal(
    (
      await call(
        "notebook",
        { payload: { ...payload, parentId: soul.id } },
        "outsider",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        "notebook-event",
        { soulId: soul.id, type: "ARCHIVE", requestId: "archive-request-001" },
        "outsider",
      )
    ).status,
    404,
  );
  assert.throws(
    () =>
      sql
        .prepare("UPDATE notebook_souls SET payload='{}' WHERE id=?")
        .run(soul.id),
    /immutable/,
  );
  const review = {
    soulId: soul.id,
    type: "REVIEW",
    requestId: "review-request-0001",
    payload: {
      conclusion: "SUPPORTS",
      note: "A test observation supports this user interpretation.",
      observedAt: soul.created_at,
      knownAt: new Date().toISOString(),
      sourceUrl: "https://example.com/later",
    },
  };
  assert.equal(
    (await call("notebook-event", review, "notebook-owner")).status,
    201,
  );
  assert.equal(
    (await call("notebook-event", review, "notebook-owner")).status,
    201,
  );
  let archive = (await call("notebooks", undefined, "notebook-owner")).data;
  assert.equal(archive.events.length, 1);
  assert.equal(archive.events[0].payload.status, "INCONCLUSIVE");
  assert.equal(archive.souls[0].digest, soul.digest);
  assert.deepEqual(archive.souls[0].payload, soul.payload);
  assert.equal(
    (
      await call(
        "notebook-event",
        {
          ...review,
          payload: {
            ...review.payload,
            note: "Changed content must not reuse a request ID.",
          },
        },
        "notebook-owner",
      )
    ).status,
    409,
  );
  assert.throws(
    () => sql.prepare("UPDATE notebook_events SET payload='{}'").run(),
    /append-only/,
  );
  assert.equal(
    (
      await call(
        "notebook-event",
        {
          ...review,
          requestId: "review-before-0001",
          payload: { ...review.payload, observedAt: "2000-01-01T00:00:00Z" },
        },
        "notebook-owner",
      )
    ).status,
    400,
  );
  const revised = await call(
    "notebook",
    {
      payload: {
        ...payload,
        thesis: "A revised hypothesis with a preserved parent.",
        parentId: soul.id,
      },
    },
    "notebook-owner",
  );
  assert.equal(revised.status, 201);
  assert.notEqual(revised.data.soul.id, soul.id);
  assert.equal(
    (await call("export", undefined, "outsider")).data.notebooks.souls.length,
    0,
  );
  assert.equal(
    (await call("export", undefined, "notebook-owner")).data.notebooks.souls
      .length,
    2,
  );
  assert.equal(
    (
      await call(
        "notebook-event",
        { soulId: soul.id, type: "ARCHIVE", requestId: "archive-request-001" },
        "notebook-owner",
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        "notebook-event",
        { soulId: soul.id, type: "RESTORE", requestId: "restore-request-001" },
        "notebook-owner",
      )
    ).status,
    201,
  );
  archive = (await call("notebooks", undefined, "notebook-owner")).data;
  assert.equal(archive.events.length, 3);
  assert.equal(
    (await call("erase", { confirmation: "DELETE MY DATA" }, "notebook-owner"))
      .status,
    200,
  );
  assert.equal(sql.prepare("SELECT count(*) n FROM notebook_souls").get().n, 0);
  assert.equal(
    sql.prepare("SELECT count(*) n FROM notebook_events").get().n,
    0,
  );
});

test("notebook schema rejects future, malformed, SSRF and unsafe formula input", async () => {
  const payload = {
    name: "Validation",
    topic: "Test",
    thesis: "A sufficiently long hypothesis.",
    counterThesis: "An equally detailed countercase.",
    falsification: "A falsifiable observation is required.",
    reviewBy: new Date(Date.now() + 86400000).toISOString(),
    evidence: [],
  };
  for (const delta of [
    { reviewBy: "2000-01-01T00:00:00Z" },
    { reviewBy: "2027-02-30T00:00:00Z" },
    { formula: "eval(1)" },
    { thesis: "" },
    { evidence: new Array(7).fill({}) },
  ])
    assert.equal(
      (await call("notebook", { payload: { ...payload, ...delta } }, "beta"))
        .status,
      400,
    );
  const e = {
    title: "source",
    url: "https://127.0.0.1/admin",
    claim: "A test claim",
    stance: "CONTEXT",
    publishedAt: "2020-01-01T00:00:00Z",
    knownAt: "2020-01-02T00:00:00Z",
  };
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://127.0.0.1/admin",
    "https://a:b@example.com",
    "https://[::1]/",
    "https://metadata.internal/",
  ])
    assert.equal(
      (
        await call(
          "notebook",
          { payload: { ...payload, evidence: [{ ...e, url }] } },
          "beta",
        )
      ).status,
      400,
    );
});

test("rate limiting survives concurrent requests without exceeding the cap", async () => {
  await call("consent", consent, "quota-test");
  const runs = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      call(
        "support",
        { category: "general", message: "Isolated support " + i },
        "quota-test",
      ),
    ),
  );
  assert.equal(runs.filter((r) => r.status === 201).length, 5);
  assert.equal(runs.filter((r) => r.status === 429).length, 3);
});

test("revised terms never gate existing-data export or confirmed privacy withdrawal", async () => {
  const subject = "prior-consent-only";
  sql
    .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)")
    .run(
      subject,
      "Prior test account",
      "2026-11-01",
      "2026-11-01-v2",
      1,
      "2026-11-01",
    );
  assert.equal(
    (await call("session", undefined, subject)).data.accepted,
    false,
  );
  assert.equal(
    (
      await call(
        "save",
        { kind: "note", payload: { text: "Must require current consent" } },
        subject,
      )
    ).status,
    403,
  );
  const exported = await call("export", undefined, subject);
  assert.equal(exported.status, 200);
  assert.equal(exported.data.account.subject, subject);
  assert.equal(exported.data.notebooks.souls.length, 0);
  assert.equal(
    (await call("erase", { confirmation: "wrong" }, subject)).status,
    400,
  );
  assert.equal(
    (await call("erase", { confirmation: "DELETE MY DATA" }, subject)).status,
    200,
  );
  assert.equal(
    sql.prepare("SELECT count(*) n FROM accounts WHERE subject=?").get(subject)
      .n,
    0,
  );
  assert.equal((await call("session", undefined, null)).status, 401);
});

test("shared conversation erasure requires separate acknowledgement and portability remains participant scoped", async () => {
  const stamp = new Date().toISOString();
  for (const user of ["erase-dm-a", "erase-dm-b"]) {
    assert.equal((await call("consent", consent, user)).status, 200);
    sql
      .prepare(
        "INSERT INTO x1_bodies (subject,handle,display_name,bio,avatar,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        user,
        user.replaceAll("-", "_"),
        "TEST ONLY",
        "Fixture",
        "silver",
        stamp,
        stamp,
      );
  }
  sql
    .prepare(
      "INSERT INTO x2_conversations (id,first_subject,second_subject,requested_by,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      "erase-dm-thread",
      "erase-dm-a",
      "erase-dm-b",
      "erase-dm-a",
      "ACTIVE",
      stamp,
      stamp,
    );
  sql
    .prepare(
      "INSERT INTO x2_messages (id,conversation_id,sender,content,request_key,created_at,version) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      "erase-dm-message",
      "erase-dm-thread",
      "erase-dm-a",
      "TEST DATA: private recipient copy.",
      "erase-dm-request",
      stamp,
      1,
    );
  const exported = await call("export", undefined, "erase-dm-a");
  assert.equal(exported.status, 200);
  assert.equal(exported.data.social.x2_messages.length, 1);
  assert.equal(
    (await call("export", undefined, "beta")).data.social.x2_messages.length,
    0,
  );
  const rejected = await call(
    "erase",
    { confirmation: "DELETE MY DATA" },
    "erase-dm-a",
  );
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /participant copies/);
  assert.equal(
    sql
      .prepare("SELECT count(*) n FROM x2_messages WHERE conversation_id=?")
      .get("erase-dm-thread").n,
    1,
  );
  assert.equal(
    (
      await call(
        "erase",
        {
          confirmation: "DELETE MY DATA",
          confirmSharedConversationDeletion: true,
        },
        "erase-dm-a",
      )
    ).status,
    200,
  );
  assert.equal(
    sql
      .prepare("SELECT count(*) n FROM x2_messages WHERE conversation_id=?")
      .get("erase-dm-thread").n,
    0,
  );
  assert.equal(
    sql
      .prepare("SELECT count(*) n FROM accounts WHERE subject=?")
      .get("erase-dm-b").n,
    1,
  );
});
