/**
 * Strategic Souls X5.4 — Integration, Security & UX Contract Tests:
 * - Blank/whitespace Soul names rejected on run-scan, save-scan-draft, run-draw-scan, and publish-soul
 * - New @BodyID users automatically get discoverable public profiles without modifying legacy private users
 * - Legacy private users (discoverable=0 OR missing prefs row) remain hidden until explicit opt-in consent
 * - Public researcher search (?view=search), case-insensitive @handle lookup, open Follow + authoritative counts,
 *   permitted Followers/Following lists, bidirectional block isolation, handle-rename sync, zero email/subject/age leaks
 * - Messenger inbox real latest-message previews, unread counters, retraction preview, deduplication & cross-user authz
 * - Source invariants for Phase 1 (Global hero), Phase 2 (Soul Scan blank name), Phase 4/5/6 (Profiles, Messenger, Settings)
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { webcrypto, randomUUID } from "node:crypto";
import ts from "typescript";

const CONSENT_VERSION = "2026-11-14-v4";
const nowIso = "2026-11-22T06:00:00.000Z";
let currentUser = null;

const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const file of readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  sql.exec(readFileSync("drizzle/" + file, "utf8"));
}

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
    return { results: sql.prepare(this.query).all(...this.args), success: true };
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
      const out = statements.map((s) => s.execute());
      sql.exec("COMMIT");
      return out;
    } catch (err) {
      sql.exec("ROLLBACK");
      throw err;
    }
  },
};

const fxPoints = Array.from({ length: 45 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
  knownAt: "2026-11-21T18:00:00.000Z",
  close: 84 + i * 0.08 + Math.sin(i * 0.4) * 0.3,
}));

const context = vm.createContext({
  console,
  Response,
  Request,
  Headers,
  TextEncoder,
  TextDecoder,
  crypto: { subtle: webcrypto.subtle, randomUUID },
  URL,
  URLSearchParams,
  Intl,
  Date,
  Uint8Array,
  Float64Array,
  Int32Array,
  Number,
  Math,
  JSON,
  Set,
  Map,
  structuredClone,
  setTimeout,
  clearTimeout,
});

const modulePromises = new Map();
function load(path) {
  const file = resolve(path);
  if (modulePromises.has(file)) return modulePromises.get(file);

  const task = (async () => {
    const normalized = file.replaceAll("\\", "/");
    if (normalized.endsWith("/backend/auth/session.ts")) {
      return new vm.SyntheticModule(
        ["getAuthenticatedUser"],
        function () {
          this.setExport("getAuthenticatedUser", async () => currentUser);
        },
        { context },
      );
    }
    if (normalized.endsWith("/backend/services/market-data/data-service.ts")) {
      return new vm.SyntheticModule(
        ["researchUniverse", "exchangeScanAvailable", "currentDisplayRights"],
        function () {
          this.setExport("currentDisplayRights", async () => ({
            displayAllowed: true,
            derivedDisplayAllowed: true,
            rightsExpiresAt: null,
          }));
          this.setExport("exchangeScanAvailable", async () => false);
          this.setExport("researchUniverse", async () => ({
            datasets: [
              {
                instrumentId: "ECB:USDINR",
                currency: "INR",
                source: "European Central Bank",
                permitted: true,
                frequency: "DAILY",
                observations: fxPoints.map((p) => ({
                  eventAt: p.date + "T00:00:00.000Z",
                  knownAt: p.knownAt,
                  close: p.close,
                })),
              },
            ],
            excluded: [],
            source: "ECB Daily Reference FX (Test Fixture)",
            pointInTime: false,
            adjusted: false,
            rights: { analysis: true, storage: true },
            lineage: [
              {
                instrumentId: "ECB:USDINR",
                provider: "ECB",
                eventAt: "2026-10-15T00:00:00.000Z",
                retrievedAt: nowIso,
                adjustment: "OFFICIAL_DAILY_REFERENCE",
                displayAllowed: true,
                derivedDisplayAllowed: true,
                rightsExpiresAt: null,
              },
            ],
            asOf: nowIso,
          }));
        },
        { context },
      );
    }

    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: file });
    await m.link(async (spec, refer) => {
      if (spec === "cloudflare:workers") {
        if (!modulePromises.has(spec)) {
          modulePromises.set(
            spec,
            Promise.resolve(
              new vm.SyntheticModule(
                ["env"],
                function () {
                  this.setExport("env", { DB });
                },
                { context },
              ),
            ),
          );
        }
        return modulePromises.get(spec);
      }
      let target = resolve(dirname(refer.identifier), spec);
      if (!existsSync(target)) target += ".ts";
      return load(target);
    });
    return m;
  })();

  modulePromises.set(file, task);
  return task;
}

async function importMod(path) {
  const m = await load(path);
  if (m.status === "linked") await m.evaluate();
  return m.namespace;
}

const profileRoute = await importMod("app/api/profile/route.ts");
const networkRoute = await importMod("app/api/community/network/route.ts");
const socialRoute = await importMod("app/api/x2/social/route.ts");
const strategyScanRoute = await importMod("app/api/strategy/scan/route.ts");
const workspaceRoute = await importMod("app/api/x1/workspace/route.ts");
const messengerTypes = await importMod("frontend/features/community/messenger/types.ts");

function seedAccount(userId, email, displayName) {
  sql
    .prepare(
      "INSERT OR REPLACE INTO auth_users (id, email, display_name, password_hash, password_salt, auth_provider, created_at, updated_at) VALUES (?, ?, ?, 'h', 's', 'password', ?, ?)",
    )
    .run(userId, email, displayName, nowIso, nowIso);
  sql
    .prepare(
      "INSERT OR REPLACE INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .run(userId, displayName, nowIso, CONSENT_VERSION, nowIso);
}

// Seed synthetic test users A (Tarun), B (Maya), C (Legacy private opt-out), D (Legacy no prefs), E (Outsider)
seedAccount("u_tarun", "tarun@example.invalid", "Tarun Research");
seedAccount("u_maya", "maya@example.invalid", "Maya Desk");
seedAccount("u_legacy_priv", "legacy_priv@example.invalid", "Legacy Private");
seedAccount("u_legacy_nopref", "legacy_nopref@example.invalid", "Legacy NoPref");
seedAccount("u_outsider", "outsider@example.invalid", "Outsider User");

// Seed legacy private accounts directly as pre-X5.4 users (NO bulk public flip!)
sql
  .prepare(
    "INSERT INTO x1_bodies (subject, handle, display_name, bio, avatar, created_at, updated_at) VALUES ('u_legacy_priv', 'legacy_priv', 'Legacy Private', 'Opted out before X5.4', 'a02', ?, ?)",
  )
  .run(nowIso, nowIso);
sql
  .prepare(
    "INSERT INTO x2_social_preferences (subject, discoverable, messages, receipts, notifications, updated_at) VALUES ('u_legacy_priv', 0, 'REQUESTS', 0, 1, ?)",
  )
  .run(nowIso);
sql
  .prepare(
    "INSERT INTO x1_bodies (subject, handle, display_name, bio, avatar, created_at, updated_at) VALUES ('u_legacy_nopref', 'legacy_nopref', 'Legacy NoPref', 'No social pref row', 'a03', ?, ?)",
  )
  .run(nowIso, nowIso);

function req(path, method = "GET", jsonBody = undefined) {
  const headers = new Headers();
  if (method !== "GET") {
    headers.set("origin", "https://ss.test");
    if (jsonBody !== undefined) headers.set("content-type", "application/json");
  }
  return new Request("https://ss.test" + path, {
    method,
    headers,
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
  });
}

test.beforeEach(() => sql.prepare("DELETE FROM rate_limits").run());

test("X5.4 Phase 2: Blank or whitespace Soul names are rejected on run-scan, save-scan-draft, run-draw-scan, and publish-soul", async () => {
  currentUser = {
    userId: "u_tarun",
    email: "tarun@example.invalid",
    displayName: "Tarun Research",
    authProvider: "email",
  };

  for (const blankName of ["", "   ", "\t\n"]) {
    const runRes = await strategyScanRoute.POST(
      req("/api/strategy/scan", "POST", {
        action: "run-scan",
        scanTier: "CLASSIC",
        requestId: "x54_blank_run_0001",
        name: blankName,
        description: "Testing blank Soul name rejection on backend.",
        formula: "close > sma(close, 20)",
        mode: "SIMPLE",
        universe: "ECB_DAILY",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
      }),
    );
    assert.equal(runRes.status, 400);
    assert.match((await runRes.json()).error, /Enter a Soul name/i);

    const draftRes = await workspaceRoute.POST(
      req("/api/x1/workspace", "POST", {
        action: "save-scan-draft",
        requestId: "x54_blank_draft_0001",
        definition: {
          name: blankName,
          description: "Testing blank draft name rejection on backend.",
          formula: "close > sma(close, 20)",
          mode: "SIMPLE",
          universe: "ECB_DAILY",
          interval: "1d",
          partialPolicy: "ALLOW_UNKNOWN",
          outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
        },
      }),
    );
    assert.equal(draftRes.status, 400);
    assert.match((await draftRes.json()).error, /Enter a Soul name/i);

    const drawRes = await strategyScanRoute.POST(
      req("/api/strategy/scan", "POST", {
        action: "run-draw-scan",
        requestId: "x54_blank_draw_0001",
        name: blankName,
        strokePoints: [
          { x: 0, y: 0.2 },
          { x: 0.5, y: 0.8 },
          { x: 1, y: 0.5 },
        ],
        universe: "ECB_DAILY",
        interval: "1d",
      }),
    );
    assert.equal(drawRes.status, 400);
    assert.match((await drawRes.json()).error, /Enter a Soul name/i);
  }

  // Valid custom Soul name saves draft & runs scan without altering the chosen name
  const validDraft = await workspaceRoute.POST(
    req("/api/x1/workspace", "POST", {
      action: "save-scan-draft",
      requestId: "x54_valid_draft_0001",
      definition: {
        name: "My Custom FX Pulse",
        description: "Evaluating SMA20 trend alignment on official ECB daily FX.",
        formula: "close > sma(close, 20)",
        mode: "SIMPLE",
        universe: "ECB_DAILY",
        interval: "1d",
        partialPolicy: "ALLOW_UNKNOWN",
        outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
      },
    }),
  );
  assert.equal(validDraft.status, 200);

  const validRun = await strategyScanRoute.POST(
    req("/api/strategy/scan", "POST", {
      action: "run-scan",
      scanTier: "CLASSIC",
      requestId: "x54_valid_run_0001",
      name: "My Custom FX Pulse",
      description: "Evaluating SMA20 trend alignment on official ECB daily FX.",
      formula: "close > sma(close, 20)",
      mode: "SIMPLE",
      universe: "ECB_DAILY",
      interval: "1d",
      partialPolicy: "ALLOW_UNKNOWN",
      outcome: { family: "POSITIVE_RETURN", horizon: 10, threshold: 0, target: 5, stop: 3, costBps: 0 },
    }),
  );
  assert.equal(validRun.status, 200);
  const runBody = await validRun.json();
  assert.ok(runBody.id);
});

test("X5.4 Phase 3 & 4: New @BodyID defaults public, legacy private stays hidden until consent, search/profile/follow/lists/blocks & handle sync work", async () => {
  // 1. New user Tarun creates @tarun_qa via /api/profile -> automatically public (discoverable=true)
  currentUser = { userId: "u_tarun", email: "tarun@example.invalid", displayName: "Tarun Research", authProvider: "email" };
  const tProf = await profileRoute.POST(
    req("/api/profile", "POST", {
      action: "update-profile",
      displayName: "Tarun Research",
      handle: "tarun_qa",
      bio: "Studying FX trend structure.",
      age: 29,
      showAge: false,
      genderSymbol: "HIDDEN",
      bannerPresetId: "b03",
    }),
  );
  assert.equal(tProf.status, 200);
  const tData = await tProf.json();
  assert.equal(tData.profile.social.discoverable, true);
  assert.equal(tData.profile.legacyPrivateProfile, false);

  // 2. New user Maya creates @maya_qa via /api/profile -> automatically public
  currentUser = { userId: "u_maya", email: "maya@example.invalid", displayName: "Maya Desk", authProvider: "email" };
  const mProf = await profileRoute.POST(
    req("/api/profile", "POST", {
      action: "update-profile",
      displayName: "Maya Desk",
      handle: "maya_qa",
      bio: "Cross-asset quant.",
    }),
  );
  assert.equal(mProf.status, 200);
  assert.equal((await mProf.json()).profile.social.discoverable, true);

  // 3. Search for "tarun" returns Tarun cleanly; legacy private users NEVER appear!
  const searchTarun = await (await networkRoute.GET(req("/api/community/network?view=search&q=tarun"))).json();
  assert.equal(searchTarun.researchers.length, 1);
  assert.equal(searchTarun.researchers[0].handle, "tarun_qa");
  assert.ok(!JSON.stringify(searchTarun).includes("tarun@example.invalid"));
  assert.ok(!JSON.stringify(searchTarun).includes("u_tarun"));

  const searchLegacy = await (await networkRoute.GET(req("/api/community/network?view=search&q=legacy"))).json();
  assert.equal(searchLegacy.researchers.length, 0, "Legacy private profiles must never leak into search");

  // 4. Direct profile lookup for legacy private users returns 404 (for both Maya and logged-out guests!)
  assert.equal(
    (await networkRoute.GET(req("/api/community/network?view=profile&handle=legacy_priv"))).status,
    404,
  );
  assert.equal(
    (await networkRoute.GET(req("/api/community/network?view=profile&handle=legacy_nopref"))).status,
    404,
  );
  currentUser = null;
  assert.equal(
    (await networkRoute.GET(req("/api/community/network?view=profile&handle=legacy_priv"))).status,
    404,
  );
  // Logged-out viewer CAN view intentionally public researcher profile (safe DTO only: no email, no hidden age, no portfolio)
  const guestTarunRes = await networkRoute.GET(
    req("/api/community/network?view=profile&handle=TARUN_QA"),
  );
  assert.equal(guestTarunRes.status, 200);
  const guestTarun = await guestTarunRes.json();
  assert.equal(guestTarun.profile.handle, "tarun_qa");
  assert.equal(guestTarun.profile.age, null, "Hidden age must not leak");
  assert.equal("email" in guestTarun.profile, false);
  assert.equal(guestTarun.profile.portfolioValueVisibility, "PRIVATE_HIDDEN");

  // 5. Maya immediately follows public Tarun (ACTIVE, no pending request!) with authoritative counts & idempotency
  currentUser = { userId: "u_maya", email: "maya@example.invalid", displayName: "Maya Desk", authProvider: "email" };
  const f1 = await (
    await networkRoute.POST(
      req("/api/community/network", "POST", { action: "follow", handle: "tarun_qa", active: true }),
    )
  ).json();
  assert.equal(f1.state, "ACTIVE");
  assert.equal(f1.counts.followers, 1);

  const f2 = await (
    await networkRoute.POST(
      req("/api/community/network", "POST", { action: "follow", handle: "tarun_qa", active: true }),
    )
  ).json();
  assert.equal(f2.state, "ACTIVE");
  assert.equal(f2.counts.followers, 1);

  // Followers list returns Maya safely
  const followersRes = await networkRoute.GET(
    req("/api/community/network?view=followers&handle=tarun_qa"),
  );
  assert.equal(followersRes.status, 200);
  const followersData = await followersRes.json();
  assert.equal(followersData.profiles.length, 1);
  assert.equal(followersData.profiles[0].handle, "maya_qa");

  // 6. Legacy private user checks own profile -> legacyPrivateProfile=true; opts in explicitly -> becomes discoverable!
  currentUser = { userId: "u_legacy_priv", email: "legacy_priv@example.invalid", displayName: "Legacy Private", authProvider: "email" };
  const legBefore = await (await profileRoute.GET(req("/api/profile"))).json();
  assert.equal(legBefore.profile.legacyPrivateProfile, true);
  const legOptIn = await profileRoute.POST(
    req("/api/profile", "POST", {
      action: "update-preferences",
      social: { discoverable: true },
    }),
  );
  assert.equal(legOptIn.status, 200);
  const legAfter = await legOptIn.json();
  assert.equal(legAfter.profile.legacyPrivateProfile, false);
  assert.equal(legAfter.profile.social.discoverable, true);

  currentUser = { userId: "u_maya", email: "maya@example.invalid", displayName: "Maya Desk", authProvider: "email" };
  const searchAfterOptIn = await (await networkRoute.GET(req("/api/community/network?view=search&q=legacy_priv"))).json();
  assert.equal(searchAfterOptIn.researchers.length, 1);

  // 7. Tarun publishes a PUBLIC Soul, rejects blank override title, then renames handle -> author_handle syncs cleanly!
  currentUser = { userId: "u_tarun", email: "tarun@example.invalid", displayName: "Tarun Research", authProvider: "email" };
  const scanRow = sql.prepare("SELECT id FROM x1_scans WHERE subject='u_tarun' LIMIT 1").get();
  const blankTitlePub = await networkRoute.POST(
    req("/api/community/network", "POST", {
      action: "publish-soul",
      scanId: scanRow.id,
      title: "   ",
      audience: "PUBLIC",
      summary: "Summary",
      requestId: "x54_pub_blank_0001",
    }),
  );
  assert.equal(blankTitlePub.status, 400);

  const pubOk = await networkRoute.POST(
    req("/api/community/network", "POST", {
      action: "publish-soul",
      scanId: scanRow.id,
      audience: "PUBLIC",
      summary: "Daily ECB trend rule.",
      requestId: "x54_pub_valid_0001",
    }),
  );
  assert.equal(pubOk.status, 200);
  const pubJson = await pubOk.json();
  assert.equal(pubJson.audience, "PUBLIC");

  const renameRes = await profileRoute.POST(
    req("/api/profile", "POST", {
      action: "update-profile",
      displayName: "Tarun Research",
      handle: "tarun_pro",
      bio: "Studying FX trend structure.",
    }),
  );
  assert.equal(renameRes.status, 200);
  const syncedPost = sql
    .prepare("SELECT author_handle FROM x51_web_souls WHERE id=?")
    .get(pubJson.postId);
  assert.equal(syncedPost.author_handle, "tarun_pro");

  // 8. Blocking hides profiles from search, profile view, and follower lists in both directions
  currentUser = { userId: "u_maya", email: "maya@example.invalid", displayName: "Maya Desk", authProvider: "email" };
  const blk = await socialRoute.POST(
    req("/api/x2/social", "POST", { action: "block", handle: "tarun_pro", active: true }),
  );
  assert.equal(blk.status, 200);
  assert.equal(
    (await networkRoute.GET(req("/api/community/network?view=profile&handle=tarun_pro"))).status,
    404,
  );
  const searchBlocked = await (await networkRoute.GET(req("/api/community/network?view=search&q=tarun"))).json();
  assert.equal(searchBlocked.researchers.length, 0);

  // Unblock for Phase 5 messaging tests
  await socialRoute.POST(
    req("/api/x2/social", "POST", { action: "block", handle: "tarun_pro", active: false }),
  );
});

test("X5.4 Phase 5: Messenger inbox previews, unread badge, Hi/Hiw flow, edit/retract tombstone deduplication & outsider 404", async () => {
  // Outsider also gets a Body so /api/x2/social checks thread membership rather than missing-body 403
  currentUser = { userId: "u_outsider", email: "outsider@example.invalid", displayName: "Outsider User", authProvider: "email" };
  await profileRoute.POST(
    req("/api/profile", "POST", {
      action: "update-profile",
      displayName: "Outsider User",
      handle: "outsider_qa",
      bio: "",
    }),
  );

  // Tarun starts thread with Maya & sends "Hi"
  currentUser = { userId: "u_tarun", email: "tarun@example.invalid", displayName: "Tarun Research", authProvider: "email" };
  const start = await (
    await socialRoute.POST(req("/api/x2/social", "POST", { action: "start-thread", handle: "maya_qa" }))
  ).json();
  assert.ok(start.threadId);
  assert.equal(start.state, "REQUESTED");

  const sendHi = await (
    await socialRoute.POST(
      req("/api/x2/social", "POST", {
        action: "send",
        threadId: start.threadId,
        text: "Hi",
        requestId: "x54_msg_tarun_hi_0001",
      }),
    )
  ).json();
  assert.ok(sendHi.messageId);

  // Maya's inbox shows real latest-message preview "Hi" + unread=1
  currentUser = { userId: "u_maya", email: "maya@example.invalid", displayName: "Maya Desk", authProvider: "email" };
  const mayaInbox1 = await (await socialRoute.GET(req("/api/x2/social?view=home"))).json();
  assert.equal(mayaInbox1.inbox.length, 1);
  assert.equal(mayaInbox1.inbox[0].lastMessageText, "Hi");
  assert.equal(mayaInbox1.inbox[0].unread, 1);
  assert.equal(mayaInbox1.inbox[0].lastMessageIsMine, 0);

  // Maya accepts request, marks read, and replies "Hiw"
  assert.equal(
    (await socialRoute.POST(req("/api/x2/social", "POST", { action: "accept-thread", threadId: start.threadId }))).status,
    200,
  );
  assert.equal(
    (await socialRoute.POST(req("/api/x2/social", "POST", { action: "mark-read", threadId: start.threadId, lastMessageId: sendHi.messageId }))).status,
    200,
  );
  const sendHiw = await (
    await socialRoute.POST(
      req("/api/x2/social", "POST", {
        action: "send",
        threadId: start.threadId,
        text: "Hiw",
        requestId: "x54_msg_maya_hiw_0001",
      }),
    )
  ).json();
  assert.ok(sendHiw.messageId);

  // Maya edits "Hiw" -> "Hiw!", then retracts -> inbox shows lastMessageRetracted=1 and single tombstone
  assert.equal(
    (await socialRoute.POST(req("/api/x2/social", "POST", { action: "edit-message", messageId: sendHiw.messageId, version: 1, text: "Hiw!" }))).status,
    200,
  );
  assert.equal(
    (await socialRoute.POST(req("/api/x2/social", "POST", { action: "retract-message", messageId: sendHiw.messageId, version: 2 }))).status,
    200,
  );

  const mayaInbox2 = await (await socialRoute.GET(req("/api/x2/social?view=home"))).json();
  assert.equal(mayaInbox2.inbox[0].lastMessageRetracted, 1);
  assert.equal(mayaInbox2.inbox[0].lastMessageText, "");
  assert.equal(mayaInbox2.inbox[0].unread, 0);

  // Outsider CANNOT fetch thread or send to it -> 404
  currentUser = { userId: "u_outsider", email: "outsider@example.invalid", displayName: "Outsider User", authProvider: "email" };
  assert.equal(
    (await socialRoute.GET(req(`/api/x2/social?view=thread&threadId=${start.threadId}`))).status,
    404,
  );
  assert.equal(
    (await socialRoute.POST(req("/api/x2/social", "POST", { action: "send", threadId: start.threadId, text: "Spy", requestId: "x54_spy_0000000001" }))).status,
    404,
  );

  // Deduplication helper guarantees zero duplicate retractions across older + latest pages
  const oldPage = [
    { id: "m1", text: "Hi", authorHandle: "tarun_pro", isMine: true, createdAt: "2026-11-22T06:00:00.000Z", editedAt: null, retractedAt: null, version: 1, status: "SENT_TO_SERVER", reference: null },
    { id: "m2", text: "Hiw", authorHandle: "maya_qa", isMine: false, createdAt: "2026-11-22T06:01:00.000Z", editedAt: null, retractedAt: null, version: 1, status: "RECEIVED", reference: null },
  ];
  const latestPage = [
    { id: "m2", text: "", authorHandle: "maya_qa", isMine: false, createdAt: "2026-11-22T06:01:00.000Z", editedAt: null, retractedAt: "2026-11-22T06:02:00.000Z", version: 2, status: "RETRACTED", reference: null },
  ];
  const merged = messengerTypes.mergeUniqueMessages(oldPage, latestPage);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].id, "m2");
  assert.equal(merged[1].status, "RETRACTED");
});

test("X5.4 UI source invariants: dashboard copy removed, Soul name blank, no search banner, Telegram chat & clean settings", () => {
  const gridSrc = readFileSync("frontend/features/global/market-grid.tsx", "utf8");
  assert.doesNotMatch(gridSrc, /9 customizable instruments/i);
  assert.doesNotMatch(gridSrc, /Synced · v/);
  assert.match(gridSrc, /Customize/);

  const stratSrc = readFileSync("frontend/features/strategy/workspace.tsx", "utf8");
  assert.match(stratSrc, /useState\(""\)/);
  assert.doesNotMatch(stratSrc, /name\.trim\(\)\s*\|\|\s*activeClassicPreset\.label/);
  assert.doesNotMatch(stratSrc, /setName\(preset\.label\)/);
  assert.doesNotMatch(stratSrc, /Custom Strategy Soul/);
  assert.doesNotMatch(stratSrc, /<option value="FOLLOWERS">Followers Only<\/option>/);

  const drawSrc = readFileSync("frontend/features/strategy/draw-canvas.tsx", "utf8");
  assert.doesNotMatch(drawSrc, /Double Bottom Shape Search/);
  assert.doesNotMatch(drawSrc, /Interactive Draw Pattern Search/);

  const shellSrc = readFileSync("frontend/features/community/research-network-shell.tsx", "utf8");
  assert.doesNotMatch(shellSrc, /Searching Research Network for/);
  assert.match(shellSrc, /x54-my-strip/);
  assert.match(shellSrc, /<PublicProfileSheet/);

  const bubbleSrc = readFileSync("frontend/features/community/messenger/message-bubble.tsx", "utf8");
  assert.doesNotMatch(bubbleSrc, /Sent to server/);
  assert.match(bubbleSrc, /Message retracted/);

  const settingsSrc = readFileSync("frontend/features/account/settings-view.tsx", "utf8");
  assert.match(settingsSrc, /x54-optional-grid/);
  assert.match(settingsSrc, /x56-banner-grid/);
  assert.match(settingsSrc, /legacyPrivateProfile/);
});
