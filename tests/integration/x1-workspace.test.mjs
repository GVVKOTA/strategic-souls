/** Real X1 workspace route/repository + SQLite migrations, isolated test identities/data.
 * No production identity, network feed, browser session, or remote database is used.
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { webcrypto, randomUUID, createHash } from "node:crypto";
import ts from "typescript";

const FIXED = "2026-11-17T12:00:00.000Z";
let milliseconds = Date.parse(FIXED),
  uuidCounter = 100000,
  descendingIds = false,
  currentUser = null;
class Clock extends Date {
  constructor(...args) {
    super(...(args.length ? args : [milliseconds]));
  }
  static now() {
    return milliseconds;
  }
}
function nextId() {
  return descendingIds
    ? `00000000-0000-4000-8000-${String(--uuidCounter).padStart(12, "0")}`
    : randomUUID();
}
const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const file of readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  sql.exec(readFileSync("drizzle/" + file, "utf8"));
assert.ok(
  sql.prepare("SELECT name FROM sqlite_master WHERE name='x1_scans'").get(),
  "Apply the generated X1 migration before workspace integration tests.",
);
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
  execute() {
    const r = sql.prepare(this.query).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  async run() {
    return this.execute();
  }
}
const DB = {
  prepare: (q) => new Statement(q),
  async batch(statements) {
    sql.exec("BEGIN");
    try {
      const result = statements.map((s) => s.execute());
      sql.exec("COMMIT");
      return result;
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  },
};
const env = { DB };
const points = Array.from({ length: 35 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
  knownAt: "2026-11-16T18:00:00.000Z",
  close: 1 + i * 0.01,
}));
let marketCalls = 0;
let fixtureDisplayAllowed = true,
  fixtureDerivedAllowed = true;
const currentDisplayOverrides = new Map();
let marketFixture = {
  asOf: FIXED,
  providers: [],
  quotes: [],
  yields: [],
  fxHistory: [
    {
      id: "TEST:ECB:EURUSD",
      label: "Authorized isolated FX fixture",
      currency: "USD",
      unit: "USD per EUR",
      provider: "ECB",
      sourceUrl: "https://example.invalid/authorized-test-source",
      asOfDate: "2026-11-04",
      retrievedAt: "2026-11-16T18:00:00.000Z",
      canAnalyze: true,
      derivation: null,
      points,
    },
  ],
  disclosure: "Test fixtures are not production market data.",
  nextRefreshAfter: FIXED,
};
const context = vm.createContext({
  console,
  Request,
  Response,
  Headers,
  TextEncoder,
  TextDecoder,
  crypto: { subtle: webcrypto.subtle, randomUUID: nextId },
  URL,
  URLSearchParams,
  Intl,
  Date: Clock,
  Uint8Array,
  Number,
  Math,
  JSON,
  Set,
  Map,
  structuredClone,
  AbortSignal,
  fetch: () => {
    throw new Error("Unexpected network access in workspace tests.");
  },
});
const cache = new Map();
async function load(path) {
  const file = resolve(path);
  if (cache.has(file)) return cache.get(file);
  const normalized = file.replaceAll("\\", "/");
  if (normalized.endsWith("/backend/auth/session.ts")) {
    const m = new vm.SyntheticModule(
      ["getAuthenticatedUser"],
      function () {
        this.setExport("getAuthenticatedUser", async () => currentUser);
      },
      { context },
    );
    cache.set(file, m);
    return m;
  }
  if (normalized.endsWith("/backend/services/market-data/data-service.ts")) {
    const m = new vm.SyntheticModule(
      ["researchUniverse", "currentDisplayRights"],
      function () {
        this.setExport("currentDisplayRights", async (id, provider) =>
          provider === "UNVERIFIED"
            ? {
                displayAllowed: false,
                derivedDisplayAllowed: false,
                rightsExpiresAt: null,
              }
            : (currentDisplayOverrides.get(id) ?? {
                displayAllowed: true,
                derivedDisplayAllowed: true,
                rightsExpiresAt: null,
              }),
        );
        this.setExport("researchUniverse", async (subject, options = {}) => {
          marketCalls++;
          const datasets =
            (options.provider === "CONNECTED_MARKETS" &&
              !marketFixture.fixtureConnected) ||
            (options.interval && options.interval !== "1d")
              ? []
              : marketFixture.fxHistory
                  .filter(
                    (h) =>
                      h.canAnalyze &&
                      (!options.instrumentIds?.length ||
                        options.instrumentIds.includes(h.id)),
                  )
                  .map((h) => ({
                    instrumentId: h.id,
                    currency: h.currency,
                    source: h.provider + " · " + h.sourceUrl,
                    permitted: true,
                    frequency: "DAILY",
                    observations: h.points.map((p) => ({
                      eventAt: p.date + "T00:00:00.000Z",
                      knownAt: p.knownAt,
                      close: p.close,
                      volume: p.volume,
                    })),
                  }));
          return {
            datasets,
            excluded: [],
            source: "Explicit isolated TEST DATA",
            pointInTime: false,
            adjusted: false,
            rights: { analysis: true, storage: true },
            lineage: datasets.map((d) => ({
              instrumentId: d.instrumentId,
              provider: "TEST",
              eventAt: d.observations.at(-1)?.eventAt,
              retrievedAt: FIXED,
              adjustment: "TEST",
              displayAllowed: fixtureDisplayAllowed,
              derivedDisplayAllowed: fixtureDerivedAllowed,
              rightsExpiresAt: null,
            })),
            asOf: FIXED,
          };
        });
      },
      { context },
    );
    cache.set(file, m);
    return m;
  }
  if (normalized.endsWith("/backend/services/market-data/market-data.ts")) {
    const m = new vm.SyntheticModule(
      ["loadMarketData"],
      function () {
        this.setExport("loadMarketData", async () => {
          marketCalls++;
          return structuredClone(marketFixture);
        });
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
  await m.link(async (spec, refer) => {
    if (spec === "cloudflare:workers") {
      if (!cache.has(spec))
        cache.set(
          spec,
          new vm.SyntheticModule(
            ["env"],
            function () {
              this.setExport("env", env);
            },
            { context },
          ),
        );
      return cache.get(spec);
    }
    let target = resolve(dirname(refer.identifier), spec);
    if (!existsSync(target)) target += ".ts";
    return load(target);
  });
  return m;
}
const route = await load("app/api/x1/workspace/route.ts");
await route.evaluate();
const accounting = cache.get(resolve("backend/engines/portfolio.ts")).namespace;
const workspaceRepository = cache.get(resolve("backend/services/research/workspace.ts")).namespace;
const plain = (x) => JSON.parse(JSON.stringify(x));
function seed(subject, { consent = "2026-11-14-v4", adult = 1 } = {}) {
  sql
    .prepare(
      "INSERT OR REPLACE INTO accounts(subject,alias,consent_at,consent_version,adult_confirmed,last_active) VALUES (?,?,?,?,?,?)",
    )
    .run(subject, "Isolated " + subject, FIXED, consent, adult, FIXED);
}
async function call(input, subject = "owner", headers = {}, query = {}) {
  if (input?.action === "run-scan")
    input = {
      description: "Explicit isolated research test hypothesis.",
      ...input,
    };
  currentUser = subject
    ? {
        userId: subject,
        email: subject + "@example.invalid",
        displayName: subject,
        fullName: null,
      }
    : null;
  const url = new URL("https://test.invalid/api/x1/workspace");
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, String(value));
  const request = new Request(url, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      origin: "https://test.invalid",
      "content-type": "application/json",
      ...headers,
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const response =
    await route.namespace[input === undefined ? "GET" : "POST"](request);
  return {
    status: response.status,
    data: await response.json(),
    headers: response.headers,
  };
}
const key = (prefix) => prefix.padEnd(20, "_");
async function createPortfolio(
  subject,
  id = key(subject + "-portfolio"),
  currency = "INR",
) {
  const response = await call(
    {
      action: "create-portfolio",
      requestId: id,
      name: "Test private portfolio",
      currency,
    },
    subject,
  );
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data.id;
}
const transaction = (
  kind,
  quantity,
  price,
  date = "2026-11-10",
  more = {},
) => ({
  kind,
  symbol: ["BUY", "SELL", "DIVIDEND"].includes(kind) ? "TEST:NSE:OWNED" : "",
  quantity,
  price,
  fees: 0,
  currency: "INR",
  date,
  ...more,
});
test.beforeEach(() => {
  sql.prepare("DELETE FROM rate_limits").run();
  descendingIds = false;
  fixtureDisplayAllowed = true;
  fixtureDerivedAllowed = true;
  currentDisplayOverrides.clear();
  milliseconds = Date.parse(FIXED);
});

test("workspace requires native identity/current adult consent, JSON origin and bounded request bodies", async () => {
  assert.equal((await call(undefined, null)).status, 401);
  assert.equal((await call(undefined, "missing")).status, 403);
  seed("old", { consent: "prior-version" });
  seed("minor", { adult: 0 });
  seed("owner");
  seed("outsider");
  assert.equal((await call(undefined, "old")).status, 403);
  assert.equal((await call(undefined, "minor")).status, 403);
  const input = {
    action: "create-list",
    requestId: key("origin-list"),
    name: "Test",
  };
  assert.equal(
    (await call(input, "owner", { origin: "https://evil.invalid" })).status,
    403,
  );
  assert.equal(
    (await call(input, "owner", { "content-type": "text/plain" })).status,
    415,
  );
  assert.equal((await call({ ...input, name: "x".repeat(18000) })).status, 413);
  assert.equal(sql.prepare("SELECT count(*) n FROM x1_records").get().n, 0);
});

test("private watchlists persist, rename/reorder by version, and deny another account/direct IDs", async () => {
  const request = {
    action: "create-list",
    requestId: key("list-primary"),
    name: "My research",
  };
  const first = await call(request);
  assert.equal(first.status, 200);
  const id = first.data.id;
  assert.equal((await call(request)).data.id, id);
  assert.equal((await call({ ...request, name: "Different" })).status, 409);
  assert.equal(
    (
      await call({
        action: "list-items",
        id,
        version: 1,
        items: ["ECB:EURUSD", "NSE:SBIN"],
      })
    ).status,
    200,
  );
  assert.equal(
    (await call({ action: "rename", id, version: 1, name: "Stale overwrite" }))
      .status,
    409,
  );
  assert.equal(
    (await call({ action: "rename", id, version: 2, name: "Daily review" }))
      .status,
    200,
  );
  assert.equal(
    (
      await call({
        action: "list-items",
        id,
        version: 3,
        items: ["NSE:SBIN", "ECB:EURUSD"],
      })
    ).status,
    200,
  );
  const state = (await call()).data,
    record = state.records.find((r) => r.id === id);
  assert.equal(record.name, "Daily review");
  assert.equal(record.version, 4);
  assert.deepEqual(record.payload.items, ["NSE:SBIN", "ECB:EURUSD"]);
  assert.equal("subject" in record, false);
  assert.equal((await call(undefined, "outsider")).data.records.length, 0);
  for (const action of ["rename", "list-items", "archive-record"])
    assert.equal(
      (
        await call(
          { action, id, version: 4, name: "Steal", items: [] },
          "outsider",
        )
      ).status,
      404,
    );
  assert.equal(
    (await call({ action: "list-items", id, version: 4, items: ["x", "x"] }))
      .status,
    400,
  );
  assert.equal(
    (await call({ action: "list-items", id, version: 4, items: ["<script>"] }))
      .status,
    400,
  );
  assert.equal(
    (await call({ action: "archive-record", id, version: 4 })).status,
    200,
  );
  assert.ok(!(await call()).data.records.some((r) => r.id === id));
  assert.equal(
    sql.prepare("SELECT archived FROM x1_records WHERE id=?").get(id).archived,
    1,
  );
  const archived = (await call()).data.archivedRecords.find((r) => r.id === id);
  assert.equal(archived.version, 5);
  assert.deepEqual(archived.payload.items, ["NSE:SBIN", "ECB:EURUSD"]);
  assert.equal(
    (await call(undefined, "outsider")).data.archivedRecords.length,
    0,
  );
  assert.equal(
    (await call({ action: "restore-record", id, version: 5 }, "outsider"))
      .status,
    404,
  );
  assert.equal(
    (await call({ action: "restore-record", id, version: 4 })).status,
    409,
  );
  assert.equal(
    (await call({ action: "restore-record", id, version: 5 })).status,
    200,
  );
  const restored = (await call()).data;
  assert.ok(!restored.archivedRecords.some((r) => r.id === id));
  assert.equal(restored.records.find((r) => r.id === id).version, 6);
  assert.deepEqual(restored.records.find((r) => r.id === id).payload.items, [
    "NSE:SBIN",
    "ECB:EURUSD",
  ]);
});

test("watchlist IDs allow existing continuous-futures identifiers without allowing markup", async () => {
  seed("futures-list");
  const made = await call(
    {
      action: "create-list",
      requestId: key("futures-list-create"),
      name: "Contracts",
    },
    "futures-list",
  );
  const items = [
    "gvv:CRUDEOIL1!",
    "gvv:NG1!",
    "gvv:NIFTY1!",
    "provider:BRK.B",
    "FX:USD/INR",
  ];
  assert.equal(
    (
      await call(
        { action: "list-items", id: made.data.id, version: 1, items },
        "futures-list",
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (await call(undefined, "futures-list")).data.records[0].payload.items,
    items,
  );
});

test("concurrent watchlist CAS rejects one writer and keeps the successful payload/version", async () => {
  seed("cas-list");
  const made = await call(
    { action: "create-list", requestId: key("cas-list-create"), name: "CAS" },
    "cas-list",
  );
  const id = made.data.id;
  const writes = await Promise.all(
    ["One", "Two"].map((name) =>
      call({ action: "rename", id, version: 1, name }, "cas-list"),
    ),
  );
  assert.equal(writes.filter((r) => r.status === 200).length, 1);
  assert.equal(writes.filter((r) => r.status === 409).length, 1);
  const record = (await call(undefined, "cas-list")).data.records[0];
  assert.equal(record.version, 2);
  assert.ok(["One", "Two"].includes(record.name));
});

test("creation retries remain idempotent at the active-record cap", async () => {
  seed("at-cap");
  const insert = sql.prepare(
    "INSERT INTO x1_records(id,subject,kind,name,payload,version,archived,last_write,created_at,updated_at) VALUES (?,?,?,?,?,1,0,?,?,?)",
  );
  for (let i = 0; i < 99; i++)
    insert.run(
      "cap-fixture-" + i,
      "at-cap",
      "watchlist",
      "Fixture " + i,
      '{"items":[]}',
      "test",
      FIXED,
      FIXED,
    );
  const input = {
    action: "create-list",
    requestId: key("cap-final-record"),
    name: "Final allowed",
  };
  assert.equal((await call(input, "at-cap")).status, 200);
  assert.equal((await call(input, "at-cap")).status, 200);
  assert.equal(
    (await call({ ...input, requestId: key("cap-one-too-many") }, "at-cap"))
      .status,
    429,
  );
  assert.equal(
    sql
      .prepare(
        "SELECT count(*) n FROM x1_records WHERE subject=? AND archived=0",
      )
      .get("at-cap").n,
    100,
  );
});

test("concurrent creates and restores cannot exceed the active cap or acknowledge a retry collision", async () => {
  seed("create-race");
  const request = {
    action: "create-list",
    requestId: key("race-identical"),
    name: "Same request",
  };
  const identical = await Promise.all([
    call(request, "create-race"),
    call(request, "create-race"),
  ]);
  assert.ok(identical.every((r) => r.status === 200));
  assert.equal(identical[0].data.id, identical[1].data.id);
  const collision = await Promise.all(
    ["One", "Two"].map((name) =>
      call({ ...request, requestId: key("race-content"), name }, "create-race"),
    ),
  );
  assert.equal(collision.filter((r) => r.status === 200).length, 1);
  assert.equal(collision.filter((r) => r.status === 409).length, 1);
  const insert = sql.prepare(
    "INSERT INTO x1_records(id,subject,kind,name,payload,version,archived,last_write,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?,?,?)",
  );
  for (let i = 0; i < 97; i++)
    insert.run(
      "race-cap-" + i,
      "create-race",
      "watchlist",
      "Fixture",
      '{"items":[]}',
      0,
      "test",
      FIXED,
      FIXED,
    );
  insert.run(
    "race-archived",
    "create-race",
    "watchlist",
    "Recoverable",
    '{"items":["NSE:SBIN"]}',
    1,
    "test",
    FIXED,
    FIXED,
  );
  const writes = await Promise.all([
    call(
      {
        action: "create-list",
        requestId: key("race-final-create"),
        name: "Final active",
      },
      "create-race",
    ),
    call(
      { action: "restore-record", id: "race-archived", version: 1 },
      "create-race",
    ),
  ]);
  assert.equal(writes.filter((r) => r.status === 200).length, 1);
  assert.equal(writes.filter((r) => r.status === 429).length, 1);
  assert.equal(
    sql
      .prepare(
        "SELECT count(*) n FROM x1_records WHERE subject=? AND archived=0",
      )
      .get("create-race").n,
    100,
  );
});

test("archived lists remain bounded on refresh and full exports refuse silent truncation", async () => {
  seed("archived-limit");
  const insert = sql.prepare(
    "INSERT INTO x1_records(id,subject,kind,name,payload,version,archived,last_write,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?,?)",
  );
  for (let i = 0; i < 101; i++)
    insert.run(
      "archived-fixture-" + i,
      "archived-limit",
      "watchlist",
      "Fixture",
      '{"items":[]}',
      "test",
      FIXED,
      FIXED,
    );
  const response = await call(undefined, "archived-limit");
  assert.equal(response.status, 200);
  assert.equal(response.data.archivedRecords.length, 100);
  assert.equal(response.data.archivedRecordsHasMore, true);
  const exported = await workspaceRepository.workspaceState("archived-limit", {
    includeSnapshots: true,
  });
  assert.equal(exported.archivedRecords.length, 101);
  assert.equal(exported.archivedRecordsHasMore, false);
  for (let i = 101; i < 1001; i++)
    insert.run(
      "archived-fixture-" + i,
      "archived-limit",
      "watchlist",
      "Fixture",
      '{"items":[]}',
      "test",
      FIXED,
      FIXED,
    );
  await assert.rejects(
    () =>
      workspaceRepository.workspaceState("archived-limit", {
        includeSnapshots: true,
      }),
    (error) => error.status === 413,
  );
  assert.equal(
    (await call(undefined, "archived-limit")).data.archivedRecordsHasMore,
    true,
  );
});

test("portfolio accounting uses actual moving-average basis, fees, cash and separate dividends", () => {
  const ledger = [
    transaction("DEPOSIT", 0, 1000),
    transaction("BUY", 10, 20, "2026-11-11", { fees: 2 }),
    transaction("BUY", 5, 30, "2026-11-12", { fees: 1 }),
    transaction("SELL", 6, 40, "2026-11-13", { fees: 2 }),
    transaction("DIVIDEND", 0, 15, "2026-11-14", { fees: 1 }),
    transaction("WITHDRAWAL", 0, 200, "2026-11-15", { fees: 1 }),
  ];
  const result = plain(accounting.summarizePortfolio(ledger, "INR"));
  const position = result.holdings[0];
  assert.equal(position.quantity, 9);
  assert.ok(Math.abs(position.basis - 211.8) < 1e-10);
  assert.ok(Math.abs(position.averageCost - 23.5333333333333) < 1e-10);
  assert.ok(Math.abs(result.realized - 96.8) < 1e-10);
  assert.equal(result.dividends, 14);
  assert.equal(result.cash, 698);
  assert.equal(result.contributions, 800);
  assert.equal(result.marketValue, null);
  assert.equal(result.unrealized, null);
});

test("fractional oversells never create negative holdings or excess cash proceeds", () => {
  assert.throws(
    () =>
      accounting.summarizePortfolio(
        [transaction("BUY", 1, 10), transaction("SELL", 1.0000000005, 10)],
        "INR",
      ),
    /exceeds recorded holdings/,
  );
  const complete = accounting.summarizePortfolio(
    [
      transaction("BUY", 0.1, 10),
      transaction("BUY", 0.2, 10),
      transaction("SELL", 0.3, 20),
    ],
    "INR",
  );
  assert.ok(complete.holdings[0].quantity >= 0);
  assert.ok(Math.abs(complete.holdings[0].quantity) < 1e-12);
  assert.ok(Math.abs(complete.realized - 3) < 1e-12);
});

test("manual transactions survive reload, are retry-safe, and cannot be appended to another account", async () => {
  seed("ledger-owner");
  const id = await createPortfolio("ledger-owner");
  const input = {
    action: "transaction",
    portfolioId: id,
    requestId: key("ledger-deposit"),
    version: 1,
    transaction: transaction("DEPOSIT", 0, 1000),
  };
  const saved = await call(input, "ledger-owner");
  assert.equal(saved.status, 200);
  const replay = await call(input, "ledger-owner");
  assert.equal(replay.status, 200);
  assert.equal(replay.data.id, saved.data.id);
  assert.equal(replay.data.replayed, true);
  assert.equal(
    (
      await call(
        { ...input, transaction: transaction("DEPOSIT", 0, 999) },
        "ledger-owner",
      )
    ).status,
    409,
  );
  milliseconds++;
  assert.equal(
    (
      await call(
        {
          ...input,
          requestId: key("ledger-buy"),
          version: 2,
          transaction: transaction("BUY", 5, 10, "2026-11-11", { fees: 1 }),
        },
        "ledger-owner",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        { ...input, requestId: key("ledger-steal"), version: 3 },
        "outsider",
      )
    ).status,
    404,
  );
  const state = (await call(undefined, "ledger-owner")).data;
  assert.equal(state.transactions.length, 2);
  assert.equal(state.portfolios[0].summary.holdings[0].basis, 51);
  assert.equal(state.portfolios[0].summary.cash, 949);
  assert.equal((await call(undefined, "outsider")).data.transactions.length, 0);
  assert.throws(
    () =>
      sql
        .prepare("UPDATE x1_ledger SET payload='{}' WHERE portfolio_id=?")
        .run(id),
    /immutable|append.only/i,
  );
});

test("portfolio API rejects oversells, malformed/future dates, mixed FX, non-portfolio and stale writes", async () => {
  seed("ledger-invalid");
  const id = await createPortfolio("ledger-invalid");
  const input = {
    action: "transaction",
    portfolioId: id,
    requestId: key("invalid-ledger-one"),
    version: 1,
  };
  for (const t of [
    transaction("SELL", 1, 10),
    transaction("BUY", -1, 10),
    transaction("BUY", 1, 10, "2026-02-30"),
    transaction("BUY", 1, 10, "2099-01-01"),
    transaction("BUY", 1, 10, "2026-11-10", { currency: "USD" }),
    transaction("DIVIDEND", 0, 10, "2026-11-10", { fees: 11 }),
  ])
    assert.equal(
      (await call({ ...input, transaction: t }, "ledger-invalid")).status,
      400,
      JSON.stringify(t),
    );
  const list = (
    await call(
      {
        action: "create-list",
        requestId: key("wrong-portfolio"),
        name: "List",
      },
      "ledger-invalid",
    )
  ).data.id;
  assert.equal(
    (
      await call(
        { ...input, portfolioId: list, transaction: transaction("BUY", 1, 10) },
        "ledger-invalid",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        { ...input, version: 0, transaction: transaction("BUY", 1, 10) },
        "ledger-invalid",
      )
    ).status,
    409,
  );
  assert.equal(
    (await call(undefined, "ledger-invalid")).data.transactions.length,
    0,
  );
});

test("concurrent portfolio writes have one winner with no partial ledger or lost version", async () => {
  seed("ledger-cas");
  const id = await createPortfolio("ledger-cas");
  const before = sql
    .prepare("SELECT version FROM x1_records WHERE id=?")
    .get(id).version;
  const results = await Promise.all(
    [1, 2].map((n) =>
      call(
        {
          action: "transaction",
          portfolioId: id,
          version: before,
          requestId: key("ledger-cas-" + n),
          transaction: transaction("BUY", n, 10),
        },
        "ledger-cas",
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  assert.equal(
    sql.prepare("SELECT count(*) n FROM x1_ledger WHERE portfolio_id=?").get(id)
      .n,
    1,
  );
  assert.equal(
    sql.prepare("SELECT version FROM x1_records WHERE id=?").get(id).version,
    before + 1,
  );
  const state = (await call(undefined, "ledger-cas")).data;
  assert.equal(state.transactions.length, 1);
  assert.ok([1, 2].includes(state.portfolios[0].summary.holdings[0].quantity));
});

test("same-millisecond transaction order follows authoritative sequence, not random UUID order", async () => {
  seed("ledger-ties");
  descendingIds = true;
  const id = await createPortfolio("ledger-ties");
  const first = await call(
    {
      action: "transaction",
      portfolioId: id,
      version: 1,
      requestId: key("ledger-tie-buy"),
      transaction: transaction("BUY", 10, 10),
    },
    "ledger-ties",
  );
  assert.equal(first.status, 200);
  const second = await call(
    {
      action: "transaction",
      portfolioId: id,
      version: 2,
      requestId: key("ledger-tie-sell"),
      transaction: transaction("SELL", 5, 20),
    },
    "ledger-ties",
  );
  assert.equal(second.status, 200);
  const state = await call(undefined, "ledger-ties");
  assert.equal(state.status, 200, JSON.stringify(state.data));
  assert.equal(state.data.portfolios[0].summary.holdings[0].quantity, 5);
  assert.equal(state.data.portfolios[0].summary.realized, 50);
  assert.equal(state.data.transactions[0].payload.kind, "BUY");
});

test("scan saves canonical method, exact eligible data, digest/results and retries without rerunning source", async () => {
  seed("scanner");
  const input = {
    action: "run-scan",
    requestId: key("scan-first"),
    mode: "SIMPLE",
    name: "Source-filter research",
    formula: "close > sma(close, 2)",
  };
  const calls = marketCalls;
  const first = await call(input, "scanner");
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.results.matches, 1);
  assert.equal(marketCalls, calls + 1);
  const replay = await call(input, "scanner");
  assert.equal(replay.status, 200);
  assert.equal(replay.data.id, first.data.id);
  assert.equal(replay.data.replayed, true);
  assert.equal(marketCalls, calls + 1);
  assert.equal(
    (await call({ ...input, formula: "close < 0" }, "scanner")).status,
    409,
  );
  const state = (await call(undefined, "scanner")).data;
  assert.equal(state.scans.length, 1);
  assert.equal(state.scanEvents.length, 0);
  const saved = state.scans[0],
    payload = saved.payload;
  assert.equal(payload.rule.version, "x1-rule-1");
  assert.equal(payload.results.matches, 1);
  assert.equal("datasets" in payload, false);
  assert.equal(saved.snapshotIncluded, false);
  assert.equal(saved.digestScope, "FULL_STORED_SNAPSHOT");
  assert.equal(saved.digestVerifiableFromResponse, false);
  const detail = await call(
    undefined,
    "scanner",
    {},
    { scanId: first.data.id },
  );
  assert.equal(detail.status, 200);
  assert.equal(detail.data.snapshotIncluded, true);
  assert.equal(detail.data.digest, saved.digest);
  assert.equal(detail.data.payload.datasets[0].observations.length, 35);
  assert.equal(detail.data.payload.datasets[0].permitted, true);
  assert.equal(payload.billing.charged, 0);
  assert.ok(
    payload.knownAtPolicy.includes("not a point-in-time historical backtest"),
  );
  assert.equal(
    saved.digest,
    createHash("sha256")
      .update(JSON.stringify(detail.data.payload))
      .digest("hex"),
  );
  assert.equal((await call(undefined, "outsider")).data.scans.length, 0);
  assert.equal(
    (await call(undefined, "outsider", {}, { scanId: first.data.id })).status,
    404,
  );
  assert.equal(
    (await call(undefined, "scanner", {}, { scanId: "missing-scan" })).status,
    404,
  );
  const fullExport = plain(
    await workspaceRepository.workspaceState("scanner", {
      includeSnapshots: true,
    }),
  );
  assert.deepEqual(fullExport.scans[0].payload, detail.data.payload);
  assert.equal(fullExport.scans[0].snapshotIncluded, true);
  const stored = sql
    .prepare("SELECT payload FROM x1_scans WHERE id=?")
    .get(first.data.id).payload;
  assert.throws(
    () =>
      sql
        .prepare("UPDATE x1_scans SET payload='{}' WHERE id=?")
        .run(first.data.id),
    /immutable|append.only/i,
  );
  assert.equal(
    sql.prepare("SELECT payload FROM x1_scans WHERE id=?").get(first.data.id)
      .payload,
    stored,
  );
});

test("refresh omits large scan datasets in SQL while authorized detail and export retain the full immutable hash", async () => {
  seed("snapshot-size");
  const insert = sql.prepare(
    "INSERT INTO x1_scans(id,subject,request_key,mode,name,payload,digest,created_at) VALUES (?,?,?,?,?,?,?,?)",
  );
  const observations = Array.from({ length: 1500 }, (_, i) => ({
    eventAt: FIXED,
    knownAt: FIXED,
    close: i + 1,
    sourceNote: "Large test-only snapshot data",
  }));
  const payload = {
    rule: { version: "x1-rule-1", formula: "close > 0" },
    results: { matches: 1, unknown: 0 },
    datasets: [{ instrumentId: "TEST:LARGE", observations }],
    sourceLineage: [
      {
        instrumentId: "TEST:LARGE",
        provider: "TEST",
        displayAllowed: true,
        derivedDisplayAllowed: true,
        rightsExpiresAt: null,
      },
    ],
    billing: { charged: 0 },
  };
  const serialized = JSON.stringify(payload),
    hash = createHash("sha256").update(serialized).digest("hex");
  for (let i = 0; i < 30; i++)
    insert.run(
      "large-scan-" + i,
      "snapshot-size",
      "large-key-" + i,
      "SIMPLE",
      "Large fixture",
      serialized,
      hash,
      FIXED,
    );
  const normal = await call(undefined, "snapshot-size");
  assert.equal(normal.status, 200);
  assert.equal(normal.data.scans.length, 30);
  assert.ok(
    normal.data.scans.every(
      (s) => s.snapshotIncluded === false && !("datasets" in s.payload),
    ),
  );
  assert.ok(Buffer.byteLength(JSON.stringify(normal.data)) < 30_000);
  const detail = await call(
    undefined,
    "snapshot-size",
    {},
    { scanId: "large-scan-3" },
  );
  assert.equal(detail.status, 200);
  assert.equal(detail.data.payload.datasets[0].observations.length, 1500);
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(detail.data.payload))
      .digest("hex"),
    hash,
  );
  assert.equal(
    sql.prepare("SELECT payload FROM x1_scans WHERE id=?").get("large-scan-3")
      .payload,
    serialized,
  );
  assert.equal(
    (await call(undefined, "outsider", {}, { scanId: "large-scan-3" })).status,
    404,
  );
});

test("scan history beyond 100 is owner-paginated without blocking watchlists or portfolios", async () => {
  seed("history-pages");
  await call(
    {
      action: "create-list",
      requestId: key("history-watchlist"),
      name: "Still usable",
    },
    "history-pages",
  );
  await createPortfolio("history-pages");
  const insert = sql.prepare(
    "INSERT INTO x1_scans(id,subject,request_key,mode,name,payload,digest,created_at) VALUES (?,?,?,?,?,?,?,?)",
  );
  const payload = JSON.stringify({
    rule: { version: "x1-rule-1", formula: "close > 0" },
    results: { matches: 1, unknown: 0 },
    datasets: [],
    billing: { charged: 0 },
  });
  const hash = createHash("sha256").update(payload).digest("hex");
  for (let i = 0; i < 101; i++)
    insert.run(
      "history-" + String(i).padStart(3, "0"),
      "history-pages",
      "history-key-" + i,
      "SIMPLE",
      "History fixture",
      payload,
      hash,
      FIXED,
    );
  const first = await call(undefined, "history-pages");
  assert.equal(first.status, 200);
  assert.equal(first.data.records.length, 2);
  assert.equal(first.data.portfolios.length, 1);
  assert.equal(first.data.scans.length, 100);
  assert.equal(first.data.scanHistoryHasMore, true);
  assert.equal(first.data.scans[0].id, "history-100");
  assert.equal(first.data.scans.at(-1).id, "history-001");
  assert.equal(first.data.scanHistoryNextBefore, FIXED + "|history-001");
  assert.ok(first.data.scans.every((s) => !("datasets" in s.payload)));
  // A new run between page requests must not duplicate or displace the older cursor page.
  insert.run(
    "history-101",
    "history-pages",
    "history-key-101",
    "SIMPLE",
    "New fixture",
    payload,
    hash,
    FIXED,
  );
  const older = await call(
    undefined,
    "history-pages",
    {},
    { scanBefore: first.data.scanHistoryNextBefore },
  );
  assert.equal(older.status, 200);
  assert.deepEqual(
    older.data.scans.map((s) => s.id),
    ["history-000"],
  );
  assert.equal(older.data.scanHistoryHasMore, false);
  assert.equal(older.data.scanHistoryNextBefore, null);
  assert.equal(
    (
      await call(
        undefined,
        "outsider",
        {},
        { scanBefore: first.data.scanHistoryNextBefore },
      )
    ).data.scans.length,
    0,
  );
  assert.equal(
    (await call(undefined, "history-pages", {}, { scanId: "history-000" })).data
      .digest,
    hash,
  );
  assert.equal(
    sql
      .prepare("SELECT count(*) n FROM x1_scans WHERE subject=?")
      .get("history-pages").n,
    102,
  );
  await assert.rejects(
    () =>
      workspaceRepository.workspaceState("history-pages", {
        includeSnapshots: true,
      }),
    (error) => error.status === 413,
  );
  await assert.rejects(
    () =>
      workspaceRepository.workspaceState("history-pages", {
        includeSnapshots: true,
        scanBefore: first.data.scanHistoryNextBefore,
      }),
    (error) => error.status === 400,
  );
  for (const cursor of [
    "bad",
    FIXED + "|",
    "2026-02-30T12:00:00.000Z|history-001",
    FIXED + "|x' OR 1=1",
    "x".repeat(121),
  ])
    assert.equal(
      (await call(undefined, "history-pages", {}, { scanBefore: cursor }))
        .status,
      400,
      cursor,
    );
  assert.equal(
    (
      await call(
        undefined,
        "history-pages",
        {},
        { scanBefore: first.data.scanHistoryNextBefore, scanId: "history-000" },
      )
    ).status,
    400,
  );
});

test("more than 500 immutable reviews return recent chronological history without blocking the workspace", async () => {
  seed("review-pages");
  await createPortfolio("review-pages");
  const scanPayload = JSON.stringify({
    rule: { version: "x1-rule-1", formula: "close > 0" },
    results: { matches: 1 },
    datasets: [],
  });
  sql
    .prepare(
      "INSERT INTO x1_scans(id,subject,request_key,mode,name,payload,digest,created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(
      "review-many-scan",
      "review-pages",
      "review-many-key",
      "SIMPLE",
      "Review fixture",
      scanPayload,
      createHash("sha256").update(scanPayload).digest("hex"),
      FIXED,
    );
  sql
    .prepare(
      "INSERT INTO x1_scans(id,subject,request_key,mode,name,payload,digest,created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(
      "old-retired-scan",
      "review-pages",
      "old-retired-key",
      "SIMPLE",
      "Older retired fixture",
      scanPayload,
      createHash("sha256").update(scanPayload).digest("hex"),
      FIXED,
    );
  const insert = sql.prepare(
    "INSERT INTO x1_scan_events(id,subject,scan_id,kind,note,created_at) VALUES (?,?,?,?,?,?)",
  );
  insert.run(
    "old-retired-event",
    "review-pages",
    "old-retired-scan",
    "RETIRED",
    "Older retirement retained beyond recent review window",
    FIXED,
  );
  for (let i = 0; i < 501; i++)
    insert.run(
      "review-many-" + String(501 - i).padStart(3, "0"),
      "review-pages",
      "review-many-scan",
      i % 2 ? "RESTORED" : "RETIRED",
      "Review " + i,
      FIXED,
    );
  const response = await call(undefined, "review-pages");
  assert.equal(response.status, 200);
  assert.equal(response.data.portfolios.length, 1);
  assert.equal(response.data.scanEvents.length, 500);
  assert.equal(response.data.scanEventsHasMore, true);
  assert.equal(response.data.scanEvents[0].note, "Review 1");
  assert.equal(response.data.scanEvents.at(-1).note, "Review 500");
  assert.ok(
    !response.data.scanEvents.some(
      (event) => event.scan_id === "old-retired-scan",
    ),
  );
  assert.equal(
    response.data.scans.find((scan) => scan.id === "old-retired-scan")
      .reviewState,
    "RETIRED",
  );
  assert.equal(
    (await call(undefined, "review-pages", {}, { scanId: "old-retired-scan" }))
      .data.reviewState,
    "RETIRED",
  );
  assert.equal((await call(undefined, "outsider")).data.scanEvents.length, 0);
  assert.equal(
    sql
      .prepare("SELECT count(*) n FROM x1_scan_events WHERE subject=?")
      .get("review-pages").n,
    502,
  );
  await assert.rejects(
    () =>
      workspaceRepository.workspaceState("review-pages", {
        includeSnapshots: true,
      }),
    (error) => error.status === 413,
  );
});

test("source-missing UNKNOWN scan remains distinct from failure; explicit reviews create Graveyard history", async () => {
  seed("scan-reviewer");
  const oldMarket = marketFixture;
  marketFixture = {
    ...oldMarket,
    fxHistory: [
      ...oldMarket.fxHistory,
      {
        ...oldMarket.fxHistory[0],
        id: "TEST:WITH_VOLUME",
        points: oldMarket.fxHistory[0].points.map((p) => ({
          ...p,
          volume: 100,
        })),
      },
    ],
  };
  const scanned = await call(
    {
      partialPolicy: "ALLOW_UNKNOWN",
      action: "run-scan",
      requestId: key("scan-unknown"),
      mode: "ADVANCED",
      name: "Missing volume",
      formula: "volume > 1",
    },
    "scan-reviewer",
  );
  marketFixture = oldMarket;
  assert.equal(scanned.status, 200, JSON.stringify(scanned.data));
  assert.equal(scanned.data.results.unknown, 1);
  assert.equal(scanned.data.results.failed, 0);
  const id = scanned.data.id;
  assert.equal(
    (await call(undefined, "scan-reviewer")).data.scanEvents.length,
    0,
  );
  assert.equal(
    (
      await call(
        {
          action: "scan-review",
          scanId: id,
          kind: "RETIRED",
          note: "Unavailable volume prevents this current method.",
        },
        "outsider",
      )
    ).status,
    404,
  );
  descendingIds = true; // Both reviews share one timestamp; UUID order is deliberately reversed.
  for (const kind of ["RETIRED", "RESTORED"])
    assert.equal(
      (
        await call(
          {
            action: "scan-review",
            scanId: id,
            kind,
            note: "Explicit test review " + kind,
          },
          "scan-reviewer",
        )
      ).status,
      200,
    );
  const state = (await call(undefined, "scan-reviewer")).data;
  assert.equal(state.scans.length, 1);
  assert.deepEqual(state.scanEvents.map((e) => e.kind).sort(), [
    "RESTORED",
    "RETIRED",
  ]);
  assert.equal(state.scanEvents.at(-1).kind, "RESTORED");
  assert.equal(state.scans[0].payload.results.unknown, 1);
  assert.throws(
    () =>
      sql
        .prepare("UPDATE x1_scan_events SET note='rewritten' WHERE scan_id=?")
        .run(id),
    /immutable|append.only/i,
  );
  assert.equal(
    (
      await call(
        {
          action: "scan-review",
          scanId: id,
          kind: "EVERY_SCAN_FAILED",
          note: "Invalid",
        },
        "scan-reviewer",
      )
    ).status,
    400,
  );
});

test("concurrent scan retries with different content cannot report success for the losing payload", async () => {
  seed("scan-race");
  const input = {
    action: "run-scan",
    requestId: key("scan-race-key"),
    mode: "ADVANCED",
    name: "Race test",
  };
  const results = await Promise.all([
    call({ ...input, formula: "close > 0" }, "scan-race"),
    call({ ...input, formula: "close < 0" }, "scan-race"),
  ]);
  assert.equal(
    results.filter((r) => r.status === 200).length,
    1,
    JSON.stringify(results),
  );
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  assert.equal(
    sql
      .prepare("SELECT count(*) n FROM x1_scans WHERE subject=?")
      .get("scan-race").n,
    1,
  );
});

test("no eligible data or invalid DSL creates no run, no paid charge, and no synthetic substitution", async () => {
  seed("scan-denied");
  const input = {
    action: "run-scan",
    requestId: key("scan-no-source"),
    mode: "SIMPLE",
    name: "Unavailable source",
    formula: "close > 0",
  };
  const original = marketFixture;
  marketFixture = {
    ...original,
    fxHistory: original.fxHistory.map((h) => ({ ...h, canAnalyze: false })),
  };
  try {
    const response = await call(input, "scan-denied");
    assert.equal(response.status, 503);
    assert.ok(response.data.error.includes("No run or credit charge"));
  } finally {
    marketFixture = original;
  }
  assert.equal(
    (await call({ ...input, formula: "process.exit()" }, "scan-denied")).status,
    400,
  );
  assert.equal(
    sql
      .prepare("SELECT count(*) n FROM x1_scans WHERE subject=?")
      .get("scan-denied").n,
    0,
  );
  assert.equal(
    (await call(undefined, "scan-denied")).data.advanced.billingEnabled,
    false,
  );
  assert.equal(
    sql
      .prepare(
        "SELECT count(*) n FROM rate_limits WHERE key LIKE 'scan-denied:x1scans%'",
      )
      .get().n,
    0,
  );
  env.DB = null;
  try {
    assert.equal((await call(undefined, "scanner")).status, 503);
  } finally {
    env.DB = DB;
  }
});

test("X2 new execution requires authored name/description; legacy immutable rows stay unchanged", async () => {
  seed("x2-metadata");
  const base = {
    action: "run-scan",
    requestId: key("x2-metadata"),
    mode: "ADVANCED",
    name: "Test authored research",
    description: "Explicit test hypothesis for a genuine source filter.",
    formula: "close > 0",
  };
  for (const patch of [
    { name: "" },
    { name: "xx" },
    { name: "x".repeat(101) },
    { description: undefined },
    { description: "    " },
    { description: "too short" },
    { description: "x".repeat(2001) },
  ])
    assert.equal(
      (await call({ ...base, ...patch }, "x2-metadata")).status,
      400,
      JSON.stringify(patch),
    );
  assert.equal((await call(undefined, "x2-metadata")).data.scans.length, 0);
  const saved = await call(base, "x2-metadata");
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const detail = await call(
    undefined,
    "x2-metadata",
    {},
    { scanId: saved.data.id },
  );
  assert.equal(detail.data.payload.description, base.description);
  assert.equal(detail.data.payload.research.name, base.name);
  assert.equal(detail.data.payload.replay.status, "DATA UNAVAILABLE");
  assert.equal(detail.data.payload.replay.cases.length, 0);
  const signature = detail.data.digest;
  assert.equal(
    (
      await call(
        {
          ...base,
          description: "A changed hypothesis with the same request ID.",
        },
        "x2-metadata",
      )
    ).status,
    409,
  );
  assert.equal(
    (await call(undefined, "x2-metadata", {}, { scanId: saved.data.id })).data
      .digest,
    signature,
  );
});

test("X2 preflight blocks all missing sources and never manufactures a zero-match scan", async () => {
  seed("x2-preflight");
  const definition = {
    mode: "ADVANCED",
    name: "Missing volume research",
    description: "Explicit missing-source test hypothesis.",
    formula: "volume > 1",
    partialPolicy: "ALLOW_UNKNOWN",
  };
  const check = await call(
    { action: "preflight-scan", ...definition },
    "x2-preflight",
  );
  assert.equal(check.status, 200);
  assert.equal(check.data.preflight.blocked, true);
  assert.equal(check.data.preflight.eligible, 0);
  assert.equal(check.data.preflight.unknown, 1);
  assert.equal(
    (
      await call(
        {
          action: "run-scan",
          requestId: key("preflight-denied"),
          ...definition,
        },
        "x2-preflight",
      )
    ).status,
    422,
  );
  assert.equal((await call(undefined, "x2-preflight")).data.scans.length, 0);
  const connected = await call(
    {
      action: "preflight-scan",
      ...definition,
      universe: "CONNECTED_MARKETS",
      formula: "close > 0",
    },
    "x2-preflight",
  );
  assert.equal(connected.status, 200);
  assert.equal(connected.data.preflight.total, 0);
  assert.equal(connected.data.preflight.blocked, true);
});

test("scan persistence rolls back if completing the reservation fails", async () => {
  const subject = "x7-atomic-scan";
  seed(subject);
  const input = {
    action: "run-scan",
    requestId: key("x7-atomic-request"),
    mode: "SIMPLE",
    name: "Atomic scan test",
    description: "Synthetic fixture used for a database rollback assertion.",
    formula: "close > 0",
    universe: "ECB_DAILY",
    universePreset: "ECB_DAILY",
    scanRequestVersion: 2,
  };
  sql.exec(`
    CREATE TEMP TRIGGER x7_reject_scan_completion BEFORE UPDATE ON x51_scan_reservations
    WHEN new.subject='x7-atomic-scan' AND new.state='COMPLETED'
    BEGIN SELECT RAISE(ABORT, 'test completion failure'); END;
  `);
  try {
    assert.equal((await call(input, subject)).status, 503);
    assert.equal(sql.prepare("SELECT count(*) n FROM x1_scans WHERE subject=?").get(subject).n, 0);
    assert.equal(sql.prepare("SELECT state FROM x51_scan_reservations WHERE subject=?").get(subject).state, "FAILED");
  } finally {
    sql.exec("DROP TRIGGER x7_reject_scan_completion");
  }
  const saved = await call(input, subject);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.scanQuota.classic.used, 1);
  const replay = await call(input, subject);
  assert.equal(replay.data.id, saved.data.id);
  assert.equal(replay.data.replayed, true);
  assert.equal((await call({ ...input, formula: "close < 1" }, subject)).status, 409);
});

test("X2 ten rapid draft retries save one exact version and private drafts survive reload", async () => {
  seed("x2-draft");
  const definition = {
      name: "Named test draft",
      description: "Explicit fixture hypothesis only.",
      formula: "close > 0",
      mode: "ADVANCED",
    },
    input = {
      action: "save-scan-draft",
      requestId: key("x2-draft-key"),
      definition,
    };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => call(input, "x2-draft")),
  );
  assert.ok(
    results.every((r) => r.status === 200),
    JSON.stringify(results),
  );
  const state = (await call(undefined, "x2-draft")).data;
  assert.equal(state.researchDrafts.length, 1);
  assert.equal(state.researchDrafts[0].payload.versions.length, 1);
  assert.equal(state.researchDrafts[0].version, 1);
  assert.equal(
    (
      await call(
        {
          ...input,
          definition: { ...definition, name: "Different retry content" },
        },
        "x2-draft",
      )
    ).status,
    409,
  );
  assert.equal(
    (await call(undefined, "outsider")).data.researchDrafts.length,
    0,
  );
  assert.equal(
    (
      await call(
        {
          ...input,
          draftId: state.researchDrafts[0].id,
          version: 1,
          requestId: key("steal-draft"),
        },
        "outsider",
      )
    ).status,
    404,
  );
});

test("X2 draft CAS rejects one concurrent edit and preserves both committed version definitions", async () => {
  seed("x2-draft-cas");
  const definition = {
    name: "Versioned test draft",
    description: "Original authored hypothesis in the test fixture.",
    formula: "close > 0",
    mode: "ADVANCED",
  };
  const first = await call(
    {
      action: "save-scan-draft",
      requestId: key("draft-cas-create"),
      definition,
    },
    "x2-draft-cas",
  );
  assert.equal(first.status, 200);
  const edits = await Promise.all(
    [1, 2].map((n) =>
      call(
        {
          action: "save-scan-draft",
          requestId: key("draft-cas-" + n),
          draftId: first.data.id,
          version: 1,
          definition: {
            ...definition,
            description: "Committed concurrent hypothesis version " + n,
          },
        },
        "x2-draft-cas",
      ),
    ),
  );
  assert.equal(edits.filter((r) => r.status === 200).length, 1);
  assert.equal(edits.filter((r) => r.status === 409).length, 1);
  const draft = (await call(undefined, "x2-draft-cas")).data.researchDrafts[0];
  assert.equal(draft.version, 2);
  assert.equal(draft.payload.versions.length, 2);
  assert.equal(
    draft.payload.versions[0].definition.description,
    definition.description,
  );
  assert.ok(
    draft.payload.versions[1].definition.description.includes("Concurrent") ||
      draft.payload.versions[1].definition.description.includes("concurrent"),
  );
});

test("X2 evidence endpoint is owner-scoped, suppresses unsupported probability and persists personal opt-out", async () => {
  seed("x2-evidence");
  const scanned = await call(
    {
      action: "run-scan",
      requestId: key("evidence-scan"),
      name: "Evidence query test",
      description: "Explicit fixture evidence query hypothesis.",
      formula: "close > 0",
      mode: "ADVANCED",
    },
    "x2-evidence",
  );
  assert.equal(scanned.status, 200);
  const evidence = await call(
    undefined,
    "x2-evidence",
    {},
    { researchEvidence: scanned.data.id },
  );
  assert.equal(evidence.status, 200, JSON.stringify(evidence.data));
  assert.equal(evidence.data.score.status, "INSUFFICIENT EVIDENCE");
  assert.equal(evidence.data.score.probability, null);
  assert.equal(evidence.data.aggregateEnabled, false);
  assert.equal(
    (
      await call(
        undefined,
        "outsider",
        {},
        { researchEvidence: scanned.data.id },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        { action: "research-preferences", reusePersonal: false },
        "x2-evidence",
      )
    ).status,
    200,
  );
  assert.equal(
    (await call(undefined, "x2-evidence")).data.researchPreferences
      .reusePersonal,
    false,
  );
  const optedOut = await call(
    undefined,
    "x2-evidence",
    {},
    { researchEvidence: scanned.data.id },
  );
  assert.equal(optedOut.data.reusePersonal, false);
  assert.deepEqual(optedOut.data.similar, []);
  assert.equal(optedOut.data.score.descriptive.n, 0);
});

test("X2 retry-safe review records one event after ten rapid requests", async () => {
  seed("x2-review");
  const scan = await call(
    {
      action: "run-scan",
      requestId: key("review-base-scan"),
      name: "Reviewed source filter",
      formula: "close > 0",
      mode: "SIMPLE",
    },
    "x2-review",
  );
  assert.equal(scan.status, 200);
  const input = {
    action: "scan-review",
    requestId: key("review-stable-key"),
    scanId: scan.data.id,
    kind: "RETIRED",
    note: "Explicit reason recorded once in a test fixture.",
  };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => call(input, "x2-review")),
  );
  assert.ok(results.every((r) => r.status === 200));
  assert.equal((await call(undefined, "x2-review")).data.scanEvents.length, 1);
  assert.equal(
    (
      await call(
        { ...input, note: "A different reason with the reused ID" },
        "x2-review",
      )
    ).status,
    409,
  );
});

test("X2 drafts and preferences respect the active-record cap without breaking workspace reads", async () => {
  seed("x2-record-cap");
  const insert = sql.prepare(
    "INSERT INTO x1_records(id,subject,kind,name,payload,version,archived,last_write,created_at,updated_at) VALUES (?,?,'watchlist','Test list','{\"items\":[]}',1,0,?,?,?)",
  );
  for (let i = 0; i < 100; i++)
    insert.run("x2-cap-" + i, "x2-record-cap", "write-" + i, FIXED, FIXED);
  assert.equal(
    (
      await call(
        { action: "research-preferences", reusePersonal: false },
        "x2-record-cap",
      )
    ).status,
    429,
  );
  assert.equal(
    (
      await call(
        {
          action: "save-scan-draft",
          requestId: key("cap-draft"),
          definition: {
            name: "Cap-safe draft",
            description: "Explicit test limit hypothesis.",
            mode: "SIMPLE",
            formula: "close > 0",
          },
        },
        "x2-record-cap",
      )
    ).status,
    429,
  );
  assert.equal((await call(undefined, "x2-record-cap")).status, 200);
  assert.equal(
    (await call(undefined, "x2-record-cap")).data.records.length,
    100,
  );
});

test("non-display-only source inputs never leave scan preflight, immediate result, history, detail or full export", async () => {
  seed("licence-hidden");
  const old = marketFixture,
    raw = 12345.678901;
  fixtureDisplayAllowed = false;
  fixtureDerivedAllowed = false;
  marketFixture = {
    ...old,
    fixtureConnected: true,
    fxHistory: [
      {
        ...old.fxHistory[0],
        id: "NSE:TEST-LICENCE",
        provider: "TEST",
        points: old.fxHistory[0].points.map((p) => ({ ...p, close: raw })),
      },
    ],
  };
  const input = {
    mode: "ADVANCED",
    name: "Licence-scope fixture",
    description: "Explicit test hypothesis with private non-display input.",
    universe: "CONNECTED_MARKETS",
    formula: "close > 0",
  };
  try {
    const preflight = await call(
      { action: "preflight-scan", ...input },
      "licence-hidden",
    );
    assert.equal(preflight.status, 200);
    assert.equal(preflight.data.redaction.applied, true);
    assert.ok(!JSON.stringify(preflight.data).includes(String(raw)));
    const saved = await call(
      { action: "run-scan", requestId: key("hidden-license"), ...input },
      "licence-hidden",
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.results.matches, null);
    assert.equal(saved.data.results.results[0].status, "WITHHELD");
    assert.ok(!JSON.stringify(saved.data).includes(String(raw)));
    const stored = sql
      .prepare("SELECT payload,digest FROM x1_scans WHERE id=?")
      .get(saved.data.id);
    assert.ok(
      stored.payload.includes(String(raw)),
      "permitted internal analysis/storage snapshot is preserved",
    );
    assert.equal(
      createHash("sha256").update(stored.payload).digest("hex"),
      stored.digest,
    );
    const history = (await call(undefined, "licence-hidden")).data.scans[0],
      detail = (
        await call(undefined, "licence-hidden", {}, { scanId: saved.data.id })
      ).data,
      full = plain(
        await workspaceRepository.workspaceState("licence-hidden", {
          includeSnapshots: true,
        }),
      );
    for (const result of [history, detail, full.scans[0]]) {
      assert.ok(!JSON.stringify(result).includes(String(raw)));
      assert.equal(result.redaction.applied, true);
      assert.equal(result.digestScope, "FULL_STORED_SNAPSHOT");
      assert.equal(result.digestVerifiableFromResponse, false);
      assert.equal(result.snapshotIncluded, false);
      assert.equal(result.digest, stored.digest);
    }
    assert.deepEqual(detail.payload.datasets, []);
    assert.deepEqual(full.scans[0].payload.datasets, []);
    const evidence = await call(
      undefined,
      "licence-hidden",
      {},
      { researchEvidence: saved.data.id },
    );
    assert.equal(evidence.status, 200);
    assert.equal(evidence.data.redaction.applied, true);
    assert.equal(evidence.data.score.probability, null);
    assert.ok(!JSON.stringify(evidence.data).includes(String(raw)));
    assert.equal(
      sql.prepare("SELECT payload FROM x1_scans WHERE id=?").get(saved.data.id)
        .payload,
      stored.payload,
    );
  } finally {
    marketFixture = old;
  }
});

test("explicit derived-only licence allows derived summaries without raw prices; read-time revocation suppresses them", async () => {
  seed("licence-derived");
  const raw = 98765.432109;
  const payload = {
      research: { formula: "(close > 0)" },
      rule: { version: "x1-rule-1", formula: "(close > 0)" },
      datasets: [
        {
          instrumentId: "NSE:TEST-DERIVED",
          source: "TEST",
          observations: [{ close: raw }],
        },
      ],
      sourceLineage: [
        {
          instrumentId: "NSE:TEST-DERIVED",
          provider: "TEST",
          displayAllowed: false,
          derivedDisplayAllowed: true,
          rightsExpiresAt: null,
        },
      ],
      results: {
        version: "x1-rule-1",
        asOf: FIXED,
        total: 1,
        eligible: 1,
        matches: 1,
        failed: 0,
        unknown: 0,
        results: [
          {
            instrumentId: "NSE:TEST-DERIVED",
            status: "PASS",
            reasons: ["close = " + raw],
            source: "TEST",
            latestEventAt: FIXED,
          },
        ],
      },
      replay: {
        status: "RESEARCH REPLAY",
        reasons: [],
        summary: { n: 1, median: 2.5, minimum: 2.5, maximum: 2.5, bins: [] },
        cases: [
          {
            id: "TEST:case",
            instrumentId: "NSE:TEST-DERIVED",
            signalAt: FIXED,
            endAt: FIXED,
            label: "SUCCESS",
            returnPct: 2.5,
            entry: raw,
          },
        ],
      },
      backtest: {
        status: "RESEARCH BACKTEST",
        reasons: [],
        summary: { trades: 1, totalReturnPct: 2.5, lastClose: raw },
        curve: [{ at: FIXED, equity: 1.025, drawdown: 0, close: raw }],
        trades: [
          {
            signalAt: FIXED,
            entryAt: FIXED,
            exitAt: FIXED,
            entry: raw,
            returnPct: 2.5,
            label: "SUCCESS",
          },
        ],
      },
    },
    serialized = JSON.stringify(payload),
    hash = createHash("sha256").update(serialized).digest("hex");
  sql
    .prepare(
      "INSERT INTO x1_scans(id,subject,request_key,mode,name,payload,digest,created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(
      "derived-fixture",
      "licence-derived",
      "derived-key",
      "ADVANCED",
      "Derived rights fixture",
      serialized,
      hash,
      FIXED,
    );
  const result = (
    await call(undefined, "licence-derived", {}, { scanId: "derived-fixture" })
  ).data;
  assert.equal(result.payload.results.results[0].status, "PASS");
  assert.equal(result.payload.backtest.summary.totalReturnPct, 2.5);
  assert.equal(result.payload.backtest.trades[0].entry, undefined);
  assert.equal(result.payload.replay.cases[0].entry, undefined);
  assert.ok(!JSON.stringify(result).includes(String(raw)));
  assert.equal(result.digestVerifiableFromResponse, false);
  currentDisplayOverrides.set("NSE:TEST-DERIVED", {
    displayAllowed: false,
    derivedDisplayAllowed: false,
    rightsExpiresAt: null,
  });
  const revoked = (
    await call(undefined, "licence-derived", {}, { scanId: "derived-fixture" })
  ).data;
  assert.equal(revoked.payload.results.matches, null);
  assert.equal(revoked.payload.results.results[0].status, "WITHHELD");
  assert.equal(revoked.payload.backtest.summary, null);
  assert.equal(revoked.payload.replay.summary, null);
  assert.equal(revoked.digest, hash);
  assert.equal(
    sql.prepare("SELECT payload FROM x1_scans WHERE id='derived-fixture'").get()
      .payload,
    serialized,
  );
});

test("actual legacy ECB provenance remains readable without mutation; unknown legacy provenance fails closed", async () => {
  seed("legacy-licence");
  const insert = sql.prepare(
    "INSERT INTO x1_scans(id,subject,request_key,mode,name,payload,digest,created_at) VALUES (?,?,?,?,?,?,?,?)",
  );
  for (const [id, source] of [
    ["ECB:EURUSD", "ECB · https://www.ecb.europa.eu/"],
    ["UNKNOWN:RAW", "Unknown licence"],
  ]) {
    const raw = 4444.55555,
      payload = {
        rule: { formula: "(close > 0)" },
        datasets: [
          { instrumentId: id, source, observations: [{ close: raw }] },
        ],
        results: {
          total: 1,
          eligible: 1,
          matches: 1,
          failed: 0,
          unknown: 0,
          results: [
            {
              instrumentId: id,
              status: "PASS",
              source,
              reasons: ["value " + raw],
            },
          ],
        },
      },
      serialized = JSON.stringify(payload),
      hash = createHash("sha256").update(serialized).digest("hex");
    insert.run(
      id,
      "legacy-licence",
      "key-" + id,
      "SIMPLE",
      "Old source fixture",
      serialized,
      hash,
      FIXED,
    );
    const result = (await call(undefined, "legacy-licence", {}, { scanId: id }))
      .data;
    if (id.startsWith("ECB:")) {
      assert.equal(result.redaction.applied, false);
      assert.equal(result.digestVerifiableFromResponse, true);
      assert.equal(result.payload.datasets[0].observations[0].close, raw);
      assert.equal(
        createHash("sha256")
          .update(JSON.stringify(result.payload))
          .digest("hex"),
        hash,
      );
    } else {
      assert.equal(result.redaction.applied, true);
      assert.ok(!JSON.stringify(result).includes(String(raw)));
    }
    assert.equal(
      sql.prepare("SELECT payload FROM x1_scans WHERE id=?").get(id).payload,
      serialized,
    );
  }
});
