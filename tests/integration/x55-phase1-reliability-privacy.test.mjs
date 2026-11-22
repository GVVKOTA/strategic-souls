/**
 * Strategic Souls X5.5 — Phase 1 Reliability, Concurrency & Privacy Regression Suite:
 * - Out-of-order / stale message merge protection & calendar-day inbox timestamp boundary
 * - Messaging mutations return authoritative message snapshots; mark-read returns exact unread counts
 *   and never silences newer notifications; read-notifications bulk action works; profile report accepts both shapes
 * - Single-row authorized Soul lookup works beyond 80 global posts; profile hides non-public counts from non-owners;
 *   copy-soul enforces 100-record workspace limit truthfully
 * - All 50 Classic presets compile through canonical AST and evaluate deterministically without throwing
 * - Source invariants for abort/sequence guards, focus trapping, truthful clipboard, and clean sign-out state reset
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
const baseNow = "2026-11-22T06:00:00.000Z";
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
  Array,
  Object,
  String,
  Boolean,
  Error,
  TypeError,
  RegExp,
  Promise,
  Symbol,
  process,
  fetch: async () => {
    throw new Error("Unexpected external network fetch in offline Phase 1 test.");
  },
});

const cache = new Map();
function resolveFile(spec, from) {
  if (spec === "cloudflare:workers") return "virtual:cloudflare";
  if (spec === "next/headers") return "virtual:headers";
  if (spec === "next/server") return "virtual:server";
  const base = resolve(dirname(from), spec);
  for (const cand of [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".js",
    base + "/index.ts",
  ]) {
    if (existsSync(cand)) return cand;
  }
  throw new Error("Cannot resolve " + spec + " from " + from);
}

async function load(path) {
  if (cache.has(path)) return cache.get(path);
  let mod;
  if (path === "virtual:cloudflare") {
    mod = new vm.SyntheticModule(
      ["env"],
      function () {
        this.setExport("env", { DB, APP_ORIGIN: "https://ss.example" });
      },
      { context },
    );
  } else if (path === "virtual:headers") {
    mod = new vm.SyntheticModule(
      ["headers", "cookies"],
      function () {
        this.setExport("headers", async () => new Headers());
        this.setExport("cookies", async () => ({
          get: () => undefined,
          getAll: () => [],
        }));
      },
      { context },
    );
  } else if (path === "virtual:server") {
    mod = new vm.SyntheticModule(
      ["NextResponse"],
      function () {
        this.setExport("NextResponse", {
          json: (d, i = {}) =>
            new Response(JSON.stringify(d), {
              ...i,
              headers: { "Content-Type": "application/json", ...i.headers },
            }),
        });
      },
      { context },
    );
  } else if (path.endsWith("backend\\middleware\\auth.ts") || path.endsWith("backend/middleware/auth.ts")) {
    mod = new vm.SyntheticModule(
      ["requireUser", "optionalUser"],
      function () {
        this.setExport("requireUser", async () => {
          if (!currentUser) throw new Error("Unauthenticated");
          return currentUser;
        });
        this.setExport("optionalUser", async () => currentUser);
      },
      { context },
    );
  } else {
    const raw = readFileSync(path, "utf8");
    const js = ts.transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    mod = new vm.SourceTextModule(js, { context, identifier: path });
  }
  cache.set(path, mod);
  await mod.link((spec) => load(resolveFile(spec, path)));
  await mod.evaluate();
  return mod;
}

function seedAccount(subject, email, handle, displayName, discoverable = 1) {
  sql
    .prepare(
      `INSERT OR REPLACE INTO auth_users (id, email, display_name, password_hash, password_salt, auth_provider, created_at, updated_at)
       VALUES (?, ?, ?, 'h', 's', 'password', ?, ?)`,
    )
    .run(subject, email, displayName, baseNow, baseNow);
  sql
    .prepare(
      `INSERT OR REPLACE INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active)
       VALUES (?, ?, ?, ?, 1, ?)`,
    )
    .run(subject, displayName, baseNow, CONSENT_VERSION, baseNow);
  sql
    .prepare(
      `INSERT INTO x1_bodies (subject, handle, display_name, bio, avatar, created_at, updated_at)
       VALUES (?, ?, ?, 'Research analyst', 'a02', ?, ?)`,
    )
    .run(subject, handle, displayName, baseNow, baseNow);
  sql
    .prepare(
      `INSERT INTO x2_social_preferences (subject, discoverable, messages, receipts, notifications, updated_at)
       VALUES (?, ?, 'REQUESTS', 1, 1, ?)`,
    )
    .run(subject, discoverable, baseNow);
}

const messengerTypes = (
  await load(resolve("frontend/features/community/messenger/types.ts"))
).namespace;
const socialSvc = (
  await load(resolve("backend/services/community/social.ts"))
).namespace;
const netSvc = (
  await load(resolve("backend/services/community/research-network.ts"))
).namespace;
const scanEngine = (await load(resolve("backend/engines/scan.ts"))).namespace;
const classicPresets = (
  await load(resolve("backend/services/research/classic-presets.ts"))
).namespace;

// ── 1. Monotonic message merging & inbox calendar-day boundary ──────────────
test("X5.5 P1: mergeUniqueMessages never downgrades newer edits, retractions, or read receipts", () => {
  const newer = {
    id: "m1",
    text: "Edited confirmed text",
    authorHandle: "alice",
    isMine: true,
    createdAt: "2026-11-22T10:00:00.000Z",
    editedAt: "2026-11-22T10:01:00.000Z",
    retractedAt: null,
    version: 2,
    status: "READ",
    reference: null,
  };
  const stalePoll = {
    ...newer,
    text: "Old pre-edit text",
    editedAt: null,
    version: 1,
    status: "SENT",
  };

  const merged = messengerTypes.mergeUniqueMessages([newer], [stalePoll]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "Edited confirmed text");
  assert.equal(merged[0].version, 2);
  assert.equal(merged[0].status, "READ");

  // Once retracted, stale snapshot must never revive old text
  const retracted = {
    ...newer,
    text: "",
    retractedAt: "2026-11-22T10:02:00.000Z",
    version: 3,
    status: "DELIVERED",
  };
  const mergedRetracted = messengerTypes.mergeUniqueMessages(
    [retracted],
    [newer],
  );
  assert.equal(mergedRetracted[0].retractedAt, "2026-11-22T10:02:00.000Z");
  assert.equal(mergedRetracted[0].text, "");
  assert.equal(mergedRetracted[0].status, "READ");
});

test("X5.5 P1: inboxTimeLabel handles midnight yesterday boundary cleanly", () => {
  const now = new Date(2026, 10, 22, 0, 5, 0); // 00:05 local today
  const lateYesterday = new Date(2026, 10, 21, 23, 55, 0).toISOString(); // 10 minutes earlier, yesterday!
  assert.equal(messengerTypes.inboxTimeLabel(lateYesterday, now), "Yesterday");

  const twoDaysAgo = new Date(2026, 10, 20, 14, 0, 0).toISOString();
  const label = messengerTypes.inboxTimeLabel(twoDaysAgo, now);
  assert.notEqual(label, "Yesterday");
  assert.ok(label.length > 0);
});

// ── 2. Messaging mutations, mark-read accuracy, read-notifications, report ──
test("X5.5 P1: messaging mutations return snapshots, mark-read reconciles unread accurately, read-notifications & report work", async () => {
  seedAccount("u-alpha", "alpha@test.local", "alpha_p1", "Alpha One", 1);
  seedAccount("u-beta", "beta@test.local", "beta_p1", "Beta Two", 1);

  // Start thread & accept
  const { threadId } = await socialSvc.mutateSocial("u-alpha", {
    action: "start-thread",
    handle: "beta_p1",
  });
  const send1 = await socialSvc.mutateSocial("u-alpha", {
    action: "send",
    threadId,
    text: "Hello Beta",
    requestId: "req_send_alpha_0001",
  });
  assert.ok(send1.message);
  assert.equal(send1.message.text, "Hello Beta");
  assert.equal(send1.message.version, 1);

  await socialSvc.mutateSocial("u-beta", {
    action: "accept-thread",
    threadId,
  });

  // Alpha edits message -> response returns authoritative message snapshot v2
  const edit1 = await socialSvc.mutateSocial("u-alpha", {
    action: "edit-message",
    messageId: send1.messageId,
    version: 1,
    text: "Hello Beta edited",
  });
  assert.equal(edit1.saved, true);
  assert.equal(edit1.message.version, 2);
  assert.equal(edit1.message.text, "Hello Beta edited");

  // Alpha sends a second message 2 seconds later via real service so Beta has 2 unread messages
  const send2 = await socialSvc.mutateSocial("u-alpha", {
    action: "send",
    threadId,
    text: "Second message",
    requestId: "req_send_alpha_0002",
  });
  const m2Id = send2.messageId;
  const laterIso = new Date(Date.now() + 2000).toISOString();
  sql
    .prepare("UPDATE x2_messages SET created_at=? WHERE id=?")
    .run(laterIso, m2Id);
  sql
    .prepare(
      "UPDATE x2_notifications SET created_at=? WHERE subject='u-beta' AND event_key=?",
    )
    .run(laterIso, "msg:" + m2Id);

  // Beta marks ONLY first message read -> unread must be 1 (not blindly 0!), and newer notification stays unread
  const mark1 = await socialSvc.mutateSocial("u-beta", {
    action: "mark-read",
    threadId,
    lastMessageId: send1.messageId,
  });
  assert.equal(mark1.saved, true);
  assert.equal(mark1.unread, 1);
  assert.ok(mark1.unreadNotifications >= 1);

  // Beta marks second message read -> unread drops to 0
  const mark2 = await socialSvc.mutateSocial("u-beta", {
    action: "mark-read",
    threadId,
    lastMessageId: m2Id,
  });
  assert.equal(mark2.unread, 0);

  // Add an extra unread notification and verify bulk read-notifications works
  sql
    .prepare(
      `INSERT INTO x2_notifications (id, subject, kind, target_id, event_key, created_at)
       VALUES (?, 'u-beta', 'NEW_FOLLOWER', 'alpha_p1', 'evt-follow-beta', ?)`,
    )
    .run(randomUUID(), laterIso);
  const bulkRead = await socialSvc.mutateSocial("u-beta", {
    action: "read-notifications",
  });
  assert.equal(bulkRead.saved, true);
  assert.equal(bulkRead.unreadNotifications, 0);

  // Retract message returns retracted snapshot
  const retract1 = await socialSvc.mutateSocial("u-alpha", {
    action: "retract-message",
    messageId: send1.messageId,
    version: 2,
  });
  assert.equal(retract1.saved, true);
  assert.ok(retract1.message.retractedAt);
  assert.equal(retract1.message.text, "");

  // Profile report works with both canonical kind and defensive targetKind+note
  const rep1 = await socialSvc.mutateSocial("u-beta", {
    action: "report",
    kind: "BODY",
    targetId: "alpha_p1",
    reason: "MISLEADING_CLAIM: unsupported claim in note",
  });
  assert.equal(rep1.saved, true);

  const rep2 = await socialSvc.mutateSocial("u-beta", {
    action: "report",
    targetKind: "BODY",
    targetId: "alpha_p1",
    reason: "SPAM_SOLICITATION",
    note: "Repeated unsolicited link",
  });
  assert.equal(rep2.saved, true);

  // Block returns avatar & bio in getSocial blocked list
  await socialSvc.mutateSocial("u-beta", {
    action: "block",
    handle: "alpha_p1",
    active: true,
  });
  const betaHome = await socialSvc.getSocial(
    "u-beta",
    new URLSearchParams({ view: "home" }),
  );
  assert.equal(betaHome.blocked.length, 1);
  assert.equal(betaHome.blocked[0].handle, "alpha_p1");
  assert.equal(betaHome.blocked[0].avatar, "a02");
  assert.equal(betaHome.blocked[0].bio, "Research analyst");
});

// ── 3. Research network: >80 posts single-row lookup, hidden count isolation, 100-record cap ──
test("X5.5 P1: single-row post authorization works beyond 80 posts, profile hides non-public counts, copy-soul enforces limit", async () => {
  seedAccount("u-author", "author@test.local", "author_p1", "Author P1", 1);
  seedAccount("u-visitor", "visitor@test.local", "visitor_p1", "Visitor P1", 1);
  seedAccount("u-flood", "flood@test.local", "flood_p1", "Flood P1", 1);

  const insertScanAndSoul = (subject, handle, title, audience, createdAt) => {
    const scanId = randomUUID();
    const postId = randomUUID();
    sql
      .prepare(
        `INSERT INTO x1_scans (id, subject, request_key, mode, name, payload, digest, created_at)
         VALUES (?, ?, ?, 'SIMPLE', ?, '{}', 'digest', ?)`,
      )
      .run(scanId, subject, "req_" + scanId, title, createdAt);
    sql
      .prepare(
        `INSERT INTO x51_web_souls (
           id, author_subject, author_handle, scan_id, soul_version, mode, title, summary,
           formula, blueprint_json, timeframe, universe_label, matched_symbols_json,
           evidence_status, source_attribution, risk_note, audience, group_id,
           idempotency_key, pinned, source_digest, created_at, deleted_at
         ) VALUES (?, ?, ?, ?, 1, 'CLASSIC', ?, 'Summary', 'close > sma(close, 20)', '{}',
           '1d', 'Official ECB Daily FX', '["ECB:USDINR"]', 'Current Filter · Uncalibrated',
           'ECB', 'Educational only', ?, NULL, ?, 0, 'digest', ?, NULL)`,
      )
      .run(postId, subject, handle, scanId, title, audience, "key_" + postId, createdAt);
    return postId;
  };

  // Author's oldest public post + 1 followers-only post
  const oldestPostId = insertScanAndSoul(
    "u-author",
    "author_p1",
    "Early Public Soul",
    "PUBLIC",
    "2026-10-01T00:00:00.000Z",
  );
  insertScanAndSoul(
    "u-author",
    "author_p1",
    "Followers Only Soul",
    "FOLLOWERS",
    "2026-10-02T00:00:00.000Z",
  );

  // Seed 85 newer posts from another author so oldestPostId falls outside global LIMIT 80
  for (let i = 0; i < 85; i++) {
    const tsIso = new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString();
    insertScanAndSoul(
      "u-flood",
      "flood_p1",
      `Flood Soul ${i}`,
      "PUBLIC",
      tsIso,
    );
  }

  // Non-follower visitor views author's profile -> MUST see oldest public Soul AND publishedSouls === 1 (NOT 2!)
  const visitorView = await netSvc.getPublicResearcherProfile(
    "u-visitor",
    "author_p1",
  );
  assert.equal(visitorView.profile.posts.length, 1);
  assert.equal(visitorView.profile.posts[0].id, oldestPostId);
  assert.equal(visitorView.profile.counts.publishedSouls, 1);

  // Author views own profile -> sees both (count 2)
  const selfView = await netSvc.getPublicResearcherProfile(
    "u-author",
    "author_p1",
  );
  assert.equal(selfView.profile.posts.length, 2);
  assert.equal(selfView.profile.counts.publishedSouls, 2);

  // Visitor can save, comment, read comments, and copy oldestPostId even though >85 newer posts exist!
  const saved = await netSvc.mutateResearchNetwork("u-visitor", {
    action: "save-soul",
    postId: oldestPostId,
    active: true,
  });
  assert.equal(saved.saved, true);

  const comment = await netSvc.mutateResearchNetwork("u-visitor", {
    action: "comment-soul",
    postId: oldestPostId,
    text: "Great historical setup",
    requestId: "req_comment_oldest_01",
  });
  assert.ok(comment.commentId);

  const commentsRes = await netSvc.getPostComments("u-visitor", oldestPostId);
  assert.equal(commentsRes.comments.length, 1);
  assert.equal(commentsRes.comments[0].text, "Great historical setup");

  const copyOk = await netSvc.mutateResearchNetwork("u-visitor", {
    action: "copy-soul",
    postId: oldestPostId,
  });
  assert.ok(copyOk.draftId);

  // Fill visitor up to 100 active workspace records and verify copy-soul throws cleanly instead of silently failing
  for (let i = 0; i < 99; i++) {
    sql
      .prepare(
        `INSERT INTO x1_records (id, subject, kind, name, payload, version, archived, last_write, created_at, updated_at)
         VALUES (?, 'u-visitor', 'scan-draft', ?, '{}', 1, 0, ?, ?, ?)`,
      )
      .run(randomUUID(), `Draft ${i}`, randomUUID(), baseNow, baseNow);
  }
  await assert.rejects(
    () =>
      netSvc.mutateResearchNetwork("u-visitor", {
        action: "copy-soul",
        postId: oldestPostId,
      }),
    /100 active workspace record limit/i,
  );
});

// ── 4. All 50 Classic Presets compile & evaluate deterministically ──────────
test("X5.5 P1: all 50 Classic Soul presets compile cleanly and evaluate deterministically", () => {
  assert.equal(classicPresets.CLASSIC_50_PRESETS.length, 50);

  // Deterministic 260-bar synthetic OHLCV series covering uptrend, pullback, and breakout regimes
  const observations = Array.from({ length: 260 }, (_, i) => {
    const base = 100 + i * 0.25 + Math.sin(i * 0.18) * 6 + Math.cos(i * 0.05) * 3;
    const open = Number((base - 0.4).toFixed(4));
    const close = Number((base + 0.5 * Math.sin(i * 0.3)).toFixed(4));
    const high = Number((Math.max(open, close) + 1.2 + (i % 4) * 0.2).toFixed(4));
    const low = Number((Math.min(open, close) - 1.1 - (i % 3) * 0.15).toFixed(4));
    const volume = 1_000_000 + (i % 15) * 120_000 + (i === 259 ? 2_500_000 : 0);
    const d = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    return {
      date: d,
      knownAt: `${d}T18:00:00.000Z`,
      open,
      high,
      low,
      close,
      volume,
    };
  });

  const dataset = [
    {
      instrumentId: "TEST:SYNTHETIC",
      name: "Synthetic Equity",
      source: "Deterministic Test Fixture",
      sourceUrl: "https://example.invalid/fixture",
      observations,
    },
  ];

  for (const preset of classicPresets.CLASSIC_50_PRESETS) {
    const rule = scanEngine.compileFormula(preset.formula);
    assert.ok(rule && rule.ast, `Preset ${preset.id} failed to compile`);
    const report = scanEngine.evaluateScan(rule, dataset, "2026-11-22T00:00:00.000Z");
    assert.equal(report.total, 1, `Preset ${preset.id} total mismatch`);
    assert.equal(report.results.length, 1);
    const res = report.results[0];
    assert.ok(
      ["PASS", "FAIL", "UNKNOWN"].includes(res.status),
      `Preset ${preset.id} returned invalid status: ${res.status}`,
    );
    // Re-evaluating identical input produces identical deterministic output
    const repeat = scanEngine.evaluateScan(rule, dataset, "2026-11-22T00:00:00.000Z");
    assert.equal(repeat.results[0].status, res.status);
  }
});

// ── 5. Source invariants for Phase 1 concurrency, focus trap, clipboard & signout ──
test("X5.5 P1: frontend source invariants hold for concurrency guards, modal focus trap, clipboard honesty, and signout cleanup", () => {
  const socialWs = readFileSync(
    "frontend/features/community/social-workspace.tsx",
    "utf8",
  );
  assert.match(socialWs, /activeThreadIdRef/);
  assert.match(socialWs, /threadFetchSeqRef/);
  assert.match(socialWs, /olderFetchSeqRef/);
  assert.match(socialWs, /visibilitychange/);
  assert.match(socialWs, /copyTextSafe/);
  assert.match(socialWs, /ss-unread-synced/);

  const convView = readFileSync(
    "frontend/features/community/messenger/conversation-view.tsx",
    "utf8",
  );
  assert.match(convView, /confirmedReadRef\.current = key/);
  assert.match(convView, /prevScrollHeightRef\.current = null/);

  const inbox = readFileSync(
    "frontend/features/community/messenger/chat-inbox.tsx",
    "utf8",
  );
  assert.match(inbox, /if \(result\?\.ok\)/);

  const profileSheet = readFileSync(
    "frontend/features/community/public-profile-sheet.tsx",
    "utf8",
  );
  assert.match(profileSheet, /profileSeqRef/);
  assert.match(profileSheet, /previousFocusRef/);
  assert.match(profileSheet, /e\.key === "Tab"/);
  assert.match(profileSheet, /copyTextSafe/);
  assert.match(profileSheet, /confirmDeleteId/);

  const dashboard = readFileSync(
    "frontend/features/community/dashboard.tsx",
    "utf8",
  );
  assert.match(dashboard, /view="Discover"[\s\S]{0,600}onOpenProfile=/);

  const workspace = readFileSync(
    "frontend/components/workspace/workspace.tsx",
    "utf8",
  );
  assert.match(workspace, /legacyPrivateProfile: profile\.legacyPrivateProfile/);
  assert.match(workspace, /ss-unread-synced/);
  assert.match(workspace, /setFollowRequests\(\[\]\)/);
  assert.match(workspace, /setInitialProfileHandle\(null\)/);
});
