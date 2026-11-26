/** Embedded PostgreSQL policy tests. This is NOT the containerized Supabase/Auth journey. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { resolve } from "node:path";
import { supabaseMigrationsDir } from "../helpers/paths.mjs";
const db = await PGlite.create();
await db.exec(
  "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;",
);
try {
  for (const file of readdirSync(supabaseMigrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(resolve(supabaseMigrationsDir, file), "utf8"));
} catch (e) {
  throw new Error("V3 migration failed: " + e.message + " at " + e.position);
}
const ids = Object.fromEntries(
  ["owner", "editor", "reviewer", "viewer", "outsider", "other"].map((n) => [
    n,
    randomUUID(),
  ]),
);
for (const id of Object.values(ids))
  await db.query("insert into auth.users values($1,now(),false)", [id]);
async function as(who, fn) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      ids[who] ?? who ?? "",
    ]);
    return fn(tx);
  });
}
async function rpc(who, name, p) {
  return as(
    who,
    async (tx) =>
      (
        await tx.query(
          "select to_jsonb(public.v3_" + name + "($1::jsonb)) as result",
          [p],
        )
      ).rows[0].result,
  );
}
async function select(who, table, where = "", values = []) {
  return as(
    who,
    async (tx) =>
      (await tx.query("select * from public.v3_" + table + where, values)).rows,
  );
}
const profile = (name) => ({
  handle: name + "_test",
  display_name: name,
  bio: "",
  is_public: false,
  adult: true,
  privacy: true,
  terms: true,
  preferences: {},
});
const payload = {
  title: "Fixture research",
  topic: "Test-only topic",
  hypothesis: "A test hypothesis for immutable history.",
  horizon: "One month",
  reasoning: "A test reason.",
  opposingCase: "A competing test explanation.",
  invalidation: "A contrary test observation.",
  reviewAt: "2030-01-01T00:00:00Z",
  tags: [],
  evidence: [],
  commitment: "COMMITTED",
  dataRequired: false,
};
const soulRequest = (extra = {}) => ({
  payload,
  teamId: null,
  soulId: null,
  expectedHead: null,
  requestId: randomUUID(),
  ...extra,
});
let team, shared, invite;
test("database requires explicit consent, verified identities, reserved and unique handles", async () => {
  await assert.rejects(() =>
    rpc("owner", "save_profile", { ...profile("owner"), adult: false }),
  );
  await rpc("owner", "save_profile", profile("owner"));
  for (const n of ["editor", "reviewer", "viewer", "outsider", "other"])
    await rpc(n, "save_profile", profile(n));
  await assert.rejects(() =>
    rpc("other", "save_profile", { ...profile("other"), handle: "admin" }),
  );
  await assert.rejects(
    () =>
      rpc("other", "save_profile", {
        ...profile("other"),
        handle: "owner_test",
      }),
    (e) => e.code === "23505",
  );
  await assert.rejects(() =>
    rpc("other", "save_profile", { ...profile("other"), handle: "UpperCase" }),
  );
  assert.equal((await select("outsider", "bodies")).length, 1);
});
test("team roles, secure one-use handle-bound invitations, expiration and revocation", async () => {
  team = await rpc("owner", "create_team", {
    name: "Isolated research test",
    slug: "fixture-room",
  });
  for (const who of ["editor", "reviewer", "viewer"]) {
    const inv = await rpc("owner", "invite", {
      teamId: team.id,
      role: who.toUpperCase(),
      handle: who + "_test",
    });
    await rpc(who, "accept_invite", { token: inv.token });
    await assert.rejects(() => rpc(who, "accept_invite", { token: inv.token }));
  }
  invite = await rpc("owner", "invite", {
    teamId: team.id,
    role: "VIEWER",
    handle: "other_test",
  });
  await assert.rejects(() =>
    rpc("outsider", "accept_invite", { token: invite.token }),
  );
  await rpc("owner", "revoke_invite", { id: invite.id });
  await assert.rejects(() =>
    rpc("other", "accept_invite", { token: invite.token }),
  );
  const expired = await rpc("owner", "invite", {
    teamId: team.id,
    role: "VIEWER",
    handle: null,
  });
  await db.query(
    "update private.v3_invites set expires_at=now()-interval '1 second' where id=$1",
    [expired.id],
  );
  await assert.rejects(() =>
    rpc("other", "accept_invite", { token: expired.token }),
  );
  await assert.rejects(() =>
    rpc("editor", "invite", { teamId: team.id, role: "ADMIN" }),
  );
  await assert.rejects(() =>
    rpc("outsider", "invite", { teamId: team.id, role: "VIEWER" }),
  );
});
test("private and shared RLS, NULL role fail-closed, no direct writes", async () => {
  await rpc("owner", "save_soul", soulRequest());
  shared = await rpc(
    "editor",
    "save_soul",
    soulRequest({
      teamId: team.id,
      payload: { ...payload, title: "Shared fixture" },
    }),
  );
  assert.equal((await select("outsider", "souls")).length, 0);
  assert.equal((await select("viewer", "souls")).length, 1);
  assert.equal((await select("owner", "souls")).length, 2);
  await assert.rejects(
    () => rpc("outsider", "save_soul", soulRequest({ teamId: team.id })),
    (e) => e.code === "42501",
  );
  for (const who of ["viewer", "reviewer"])
    await assert.rejects(
      () => rpc(who, "save_soul", soulRequest({ teamId: team.id })),
      (e) => e.code === "42501",
    );
  await assert.rejects(
    () =>
      as("editor", (tx) =>
        tx.query("update public.v3_memberships set role=$1 where body_id=$2", [
          "OWNER",
          ids.editor,
        ]),
      ),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () =>
      as("outsider", (tx) =>
        tx.query("insert into public.v3_souls(owner_id,title) values($1,$2)", [
          ids.outsider,
          "Direct write",
        ]),
      ),
    (e) => e.code === "42501",
  );
});
test("request envelopes, immutable originals, CAS conflict and no orphan revision", async () => {
  const p = soulRequest({
    payload: { ...payload, title: "Idempotency fixture" },
  });
  const first = await rpc("owner", "save_soul", p);
  assert.equal((await rpc("owner", "save_soul", p)).id, first.id);
  await assert.rejects(
    () => rpc("owner", "save_soul", { ...p, teamId: team.id }),
    (e) => e.code === "23505",
  );
  const other = await rpc("other", "save_soul", p);
  assert.notEqual(other.id, first.id);
  const revision = soulRequest({
    soulId: first.soul_id,
    expectedHead: first.id,
    payload: { ...payload, title: "Revised fixture" },
  });
  const second = await rpc("owner", "save_soul", revision);
  assert.equal(second.parent_id, first.id);
  await assert.rejects(
    () => rpc("owner", "save_soul", { ...revision, requestId: randomUUID() }),
    (e) => e.code === "40001",
  );
  const versions = await select("owner", "soul_versions", " where soul_id=$1", [
    first.soul_id,
  ]);
  assert.equal(versions.length, 2);
  assert.deepEqual(versions.find((v) => v.id === first.id).payload, p.payload);
  await assert.rejects(
    () =>
      db.query("update public.v3_soul_versions set payload='{}' where id=$1", [
        first.id,
      ]),
    /Immutable/,
  );
});
test("reviewer can append valid reviews, viewer cannot; malformed direct RPC is rejected", async () => {
  const review = {
    soulId: shared.soul_id,
    type: "REVIEW",
    payload: {
      versionId: shared.id,
      outcome: "INCONCLUSIVE",
      note: "Test evidence does not resolve the mechanism.",
      observedAt: new Date().toISOString(),
      sourceUrl: "https://example.com/test",
    },
    requestId: randomUUID(),
  };
  await rpc("reviewer", "append_event", review);
  await assert.rejects(
    () => rpc("viewer", "append_event", { ...review, requestId: randomUUID() }),
    (e) => e.code === "42501",
  );
  await assert.rejects(() =>
    rpc("editor", "append_event", {
      ...review,
      payload: { ...review.payload, observedAt: null },
      requestId: randomUUID(),
    }),
  );
  await assert.rejects(() =>
    rpc("outsider", "append_event", { ...review, requestId: randomUUID() }),
  );
  await assert.rejects(() =>
    rpc(
      "editor",
      "save_soul",
      soulRequest({
        teamId: team.id,
        payload: { ...payload, commitment: null },
      }),
    ),
  );
  await assert.rejects(() =>
    rpc(
      "editor",
      "save_soul",
      soulRequest({
        teamId: team.id,
        payload: {
          ...payload,
          hypothesis: "Guaranteed profits if you buy now",
        },
      }),
    ),
  );
});
test("comments, tasks, tenant exports and immediate membership revocation", async () => {
  await rpc("reviewer", "comment", {
    soulId: shared.soul_id,
    content: "A test opposing source is needed.",
    requestId: randomUUID(),
  });
  const task = await rpc("editor", "task", {
    soulId: shared.soul_id,
    title: "Verify fixture source",
    assigneeId: ids.reviewer,
    dueAt: null,
  });
  await assert.rejects(() =>
    rpc("viewer", "task", {
      soulId: shared.soul_id,
      title: "Unauthorized task",
    }),
  );
  await assert.rejects(() =>
    rpc("editor", "task", {
      soulId: shared.soul_id,
      title: "Outside assignee",
      assigneeId: ids.outsider,
    }),
  );
  await rpc("editor", "task", {
    id: task.id,
    soulId: shared.soul_id,
    state: "DONE",
    expectedRevision: 1,
  });
  await assert.rejects(
    () =>
      rpc("editor", "task", {
        id: task.id,
        soulId: shared.soul_id,
        state: "OPEN",
        expectedRevision: 1,
      }),
    (e) => e.code === "40001",
  );
  const ex = await rpc("viewer", "export_team", { teamId: team.id });
  assert.equal(ex.souls.length, 1);
  assert.equal(ex.versions[0].id, shared.id);
  await assert.rejects(
    () => rpc("outsider", "export_team", { teamId: team.id }),
    (e) => e.code === "42501",
  );
  const replaySoulInput = soulRequest({ teamId: team.id });
  const replayScanInput = {
    ast: {
      schema: "scan-v3.1",
      timeframe: "EOD",
      universe: "NSE",
      conditions: [{ field: "rsi", op: "lt", value: 35, period: 14, unit: "percent" }],
      costs: { feeBps: 5, slippageBps: 5, taxBps: 10 },
      exit: { holdingBars: 5 },
      dataSource: null,
    },
    name: "Team replay fixture",
    branch: "main",
    summary: "Authorization regression fixture only",
    requestId: randomUUID(),
    teamId: team.id,
    parentId: null,
  };
  await rpc("editor", "save_soul", replaySoulInput);
  await rpc("editor", "save_scan", replayScanInput);
  await rpc("owner", "manage_member", {
    teamId: team.id,
    bodyId: ids.editor,
    action: "remove",
  });
  const replays = await Promise.allSettled([
    rpc("editor", "save_soul", replaySoulInput),
    rpc("editor", "save_scan", replayScanInput),
  ]);
  assert.deepEqual(
    replays.map((r) => r.status === "rejected" && r.reason.code === "42501"),
    [true, true],
    "Removed members cannot replay saved Soul or scan responses",
  );
  assert.equal((await select("editor", "souls")).length, 0);
  assert.equal((await select("editor", "soul_versions")).length, 0);
  await assert.rejects(
    () =>
      rpc("editor", "comment", {
        soulId: shared.soul_id,
        content: "Removed editor",
        requestId: randomUUID(),
      }),
    (e) => e.code === "42501",
  );
  assert.equal((await select("editor", "comments")).length, 0);
});
test("scan JSON validation, private forks, and graph authorization", async () => {
  const ast = {
    schema: "scan-v3.1",
    universe: "Fixture PIT",
    timeframe: "EOD",
    conditions: [
      { field: "rsi", period: 14, op: "lt", value: 35, unit: "percent" },
    ],
    costs: { feeBps: 5, slippageBps: 5, taxBps: 10 },
    exit: { holdingBars: 5 },
    dataSource: null,
  };
  const p = {
    ast,
    name: "Fixture scan",
    branch: "main",
    summary: "Explicit fixture conditions",
    requestId: randomUUID(),
    teamId: null,
    parentId: null,
  };
  const v = await rpc("owner", "save_scan", p);
  assert.equal((await rpc("owner", "save_scan", p)).id, v.id);
  await assert.rejects(() =>
    rpc("owner", "save_scan", {
      ...p,
      requestId: randomUUID(),
      ast: {
        ...ast,
        conditions: [{ ...ast.conditions[0], field: "execute_sql" }],
      },
    }),
  );
  await assert.rejects(() =>
    rpc("owner", "save_scan", {
      ...p,
      requestId: randomUUID(),
      ast: { ...ast, conditions: [{ ...ast.conditions[0], unit: "INR" }] },
    }),
  );
  await assert.rejects(() =>
    rpc("outsider", "save_scan", {
      ...p,
      requestId: randomUUID(),
      parentId: v.id,
    }),
  );
  const fork = await rpc("owner", "save_scan", {
    ...p,
    parentId: v.id,
    branch: "research-fork",
    requestId: randomUUID(),
  });
  assert.equal(fork.parent_id, v.id);
  await assert.rejects(
    () =>
      db.query(
        "update public.v3_scan_versions set summary='rewrite' where id=$1",
        [v.id],
      ),
    /Immutable/,
  );
});
test("private Storage isolation and one-use verified legacy handoff", async () => {
  await as("owner", (tx) =>
    tx.query(
      "insert into storage.objects(bucket_id,name) values('v3-private',$1)",
      [ids.owner + "/test.json"],
    ),
  );
  assert.equal(
    (await as("outsider", (tx) => tx.query("select * from storage.objects")))
      .rows.length,
    0,
  );
  await assert.rejects(() =>
    as("outsider", (tx) =>
      tx.query(
        "insert into storage.objects(bucket_id,name) values('v3-private',$1)",
        [ids.owner + "/overwrite.json"],
      ),
    ),
  );
  const token = "a".repeat(64),
    sha = await import("node:crypto").then((c) =>
      c.createHash("sha256").update(token).digest("hex"),
    );
  await db.query("select public.v3_register_handoff($1)", [
    { tokenHash: sha, legacySubjectHash: "fixture-legacy-subject-hash" },
  ]);
  await assert.rejects(
    () =>
      rpc("owner", "register_handoff", {
        tokenHash: sha,
        legacySubjectHash: "spoof",
      }),
    (e) => e.code === "42501",
  );
  await rpc("owner", "consume_handoff", { token });
  await assert.rejects(() => rpc("other", "consume_handoff", { token }));
});
test("private withdrawal is explicit, atomic, scoped, and never deletes a team owner implicitly", async () => {
  await assert.rejects(() =>
    rpc("owner", "erase_account", { confirmation: "DELETE MY V3 DATA" }),
  );
  await assert.rejects(() =>
    rpc("other", "erase_account", { confirmation: "wrong" }),
  );
  await rpc("other", "erase_account", { confirmation: "DELETE MY V3 DATA" });
  assert.equal((await select("other", "souls")).length, 0);
  assert.ok((await select("owner", "soul_versions")).length > 0);
  const body = (await select("other", "bodies")).find(
    (b) => b.id === ids.other,
  );
  assert.equal(body.display_name, "Deleted researcher");
  assert.equal(body.bio, "");
});

test("restricted worker queue binds manifests, rejects ordinary users and rechecks rights", async () => {
  const ast = {
    schema: "scan-v3.1",
    universe: "ISOLATED QUEUE FIXTURE",
    timeframe: "EOD",
    conditions: [
      { field: "rsi", period: 14, op: "lt", value: 35, unit: "percent" },
    ],
    costs: { feeBps: 5, slippageBps: 5, taxBps: 10 },
    exit: { holdingBars: 5 },
    dataSource: null,
  };
  const scan = await rpc("owner", "save_scan", {
    ast,
    name: "Queue test",
    branch: "main",
    summary: "Isolated queue test only",
    requestId: randomUUID(),
    teamId: null,
    parentId: null,
  });
  const entitlement = (
    await db.query(
      "insert into public.v3_source_entitlements(provider,rights_reference,analysis_allowed,team_allowed,expires_at,reviewed_by,audience,derived_allowed) values('ISOLATED TEST','NOT REAL RIGHTS',true,true,'2035-01-01','TEST ONLY','APP_INTERNAL',true) returning id",
    )
  ).rows[0].id;
  const dataset = (
    await db.query(
      'insert into public.v3_dataset_versions(entitlement_id,manifest,checksum,available_at) values($1,\'{"label":"ISOLATED TEST ONLY","rows":1,"asOf":"2024-01-01T00:00:00Z"}\',\'TEST_DATA_HASH\',\'2020-01-01\') returning id',
      [entitlement],
    )
  ).rows[0].id;
  const request = {
    scanVersionId: scan.id,
    datasetVersionId: dataset,
    approved: true,
    asOf: "2024-01-01T00:00:00Z",
    requestId: randomUUID(),
  };
  await assert.rejects(() => rpc("owner", "queue_run", request));
  await db.query("insert into private.v3_worker_accounts values($1,true)", [
    ids.viewer,
  ]);
  await assert.rejects(() =>
    rpc("owner", "queue_run", { ...request, approved: false }),
  );
  const job = await rpc("owner", "queue_run", request);
  assert.equal(job.state, "QUEUED");
  assert.equal((await rpc("owner", "queue_run", request)).id, job.id);
  await assert.rejects(
    () => as("owner", (tx) => tx.query("select public.v3_worker_claim()")),
    (e) => e.code === "42501",
  );
  const claimed = await as(
    "viewer",
    async (tx) =>
      (await tx.query("select public.v3_worker_claim() as r")).rows[0].r,
  );
  assert.equal(claimed.id, job.id);
  await assert.rejects(() =>
    rpc("viewer", "worker_complete", {
      id: job.id,
      datasetHash: "WRONG",
      evaluatorVersion: "quant-3.0.0",
      result: { status: "SCREENED" },
    }),
  );
  await rpc("viewer", "worker_complete", {
    id: job.id,
    datasetHash: "TEST_DATA_HASH",
    evaluatorVersion: "quant-3.0.0",
    result: { status: "SCREENED", matches: [], TEST_ONLY: true },
  });
  await assert.rejects(
    () =>
      rpc("viewer", "worker_complete", {
        id: job.id,
        datasetHash: "TEST_DATA_HASH",
        evaluatorVersion: "quant-3.0.0",
        result: { status: "SCREENED", matches: ["changed"] },
      }),
    (e) => e.code === "23505",
  );
  const next = await rpc("owner", "queue_run", {
    ...request,
    requestId: randomUUID(),
  });
  await db.query(
    "update public.v3_source_entitlements set expires_at=now()-interval '1 second' where id=$1",
    [entitlement],
  );
  assert.equal(
    await as(
      "viewer",
      async (tx) =>
        (await tx.query("select public.v3_worker_claim() as r")).rows[0].r,
    ),
    null,
  );
  assert.equal(
    (
      await db.query("select state from public.v3_scan_runs where id=$1", [
        next.id,
      ])
    ).rows[0].state,
    "FAILED",
  );
  await assert.rejects(
    () => rpc("owner", "queue_run", request),
    (e) => e.code === "42501",
    "Expired rights must block an idempotent result replay",
  );
  assert.equal(
    (await select("owner", "scan_runs")).some((r) => r.id === job.id),
    false,
    "Stored results are hidden after the dataset entitlement expires",
  );
});

test("manual holdings import is atomic, private, deduplicated and history-preserving", async () => {
  const h = {
    symbol: "TEST_ONLY",
    assetClass: "Indian equity",
    quantity: 2,
    cost: 100,
    currency: "INR",
    account: "Isolated fixture",
  };
  assert.equal((await rpc("owner", "import_holdings", { rows: [h] })).saved, 1);
  assert.equal((await rpc("owner", "import_holdings", { rows: [h] })).saved, 0);
  const holdings = await select("owner", "holdings");
  assert.equal(holdings.length, 1);
  assert.deepEqual(holdings[0].payload, h);
  assert.equal((await select("outsider", "holdings")).length, 0);
  await assert.rejects(
    () =>
      rpc("outsider", "archive_holding", {
        id: holdings[0].id,
        restore: false,
      }),
    (e) => e.code === "42501",
  );
  await assert.rejects(() =>
    rpc("owner", "import_holdings", {
      rows: [
        { ...h, symbol: "SECOND_TEST" },
        { ...h, symbol: "=HYPERLINK", quantity: -1 },
      ],
    }),
  );
  assert.equal((await select("owner", "holdings")).length, 1);
  await rpc("owner", "archive_holding", { id: holdings[0].id, restore: false });
  assert.ok((await select("owner", "holdings"))[0].archived_at);
  assert.deepEqual((await select("owner", "holdings"))[0].payload, h);
  await rpc("owner", "archive_holding", { id: holdings[0].id, restore: true });
  const exported = await as(
    "owner",
    async (tx) =>
      (await tx.query("select public.v3_export_account() as r")).rows[0].r,
  );
  assert.equal(exported.holdings.length, 1);
});
test.after(async () => db.close());

test("dataset catalog and execution rights are audience-scoped and deny by omission", async () => {
  const id = (
    await db.query(
      "insert into public.v3_source_entitlements(provider,rights_reference,analysis_allowed,team_allowed,derived_allowed,expires_at,reviewed_by,audience,owner_id) values('PERSONAL TEST','NOT REAL RIGHTS',true,true,true,'2035-01-01','TEST ONLY','PERSONAL',$1) returning id",
      [ids.owner],
    )
  ).rows[0].id;
  const dataset = (
    await db.query(
      "insert into public.v3_dataset_versions(entitlement_id,manifest,checksum,available_at) values($1,'{\"rows\":1,\"asOf\":\"2024-01-01T00:00:00Z\"}','PERSONAL_TEST_HASH','2020-01-01') returning id",
      [id],
    )
  ).rows[0].id;
  const own = await rpc("owner", "dataset_catalog", {});
  assert.ok(own.some((d) => d.id === dataset));
  assert.equal(own.find((d) => d.id === dataset).rights_reference, undefined);
  assert.equal(
    (await rpc("outsider", "dataset_catalog", {})).some(
      (d) => d.id === dataset,
    ),
    false,
  );
  assert.equal(
    (await rpc("owner", "dataset_catalog", { teamId: team.id })).some(
      (d) => d.id === dataset,
    ),
    false,
  );
  await db.query(
    "update public.v3_source_entitlements set audience='OPERATOR_ONLY' where id=$1",
    [id],
  );
  assert.equal(
    (await rpc("owner", "dataset_catalog", {})).some((d) => d.id === dataset),
    false,
  );
  await db.query(
    "update public.v3_source_entitlements set audience='PERSONAL',derived_allowed=false where id=$1",
    [id],
  );
  assert.equal(
    (await rpc("owner", "dataset_catalog", {})).some((d) => d.id === dataset),
    false,
  );
});
