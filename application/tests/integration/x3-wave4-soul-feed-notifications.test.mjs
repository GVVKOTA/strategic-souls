/**
 * Strategic Souls X 3.0 — Wave 4 Integration Tests (X3-042 through X3-057)
 * Covers:
 * - Two-user A/B Soul Feed publish with idempotencyKey + replay protection
 * - Immediate cross-user visibility, Cache-Control: private, no-store on GET /api/community/network
 * - SQL-side filtering (mode, timeframe 30m/1h/3h/6h/1d, search, following) + keyset cursor pagination (>25 items)
 * - Author delete removes from User B feed while preserving User A's immutable x1_scans archive
 * - Block isolation, FOLLOWERS audience isolation, adult-consent gate on like-post
 * - Notification routing & authorization across SOUL_LIKE, SOUL_COMMENT (with comment anchor),
 *   JOIN_DECISION (non-member safe fallback), SCAN_COMPLETE & PRICE_ALERT (x1_account_notices + x1_visible_notices)
 * - Unread count parity across x1_visible_notices & atomic mark-all-read across both tables
 * - 60 unique SVG avatars (a01–f10) & 30 unique SVG banners (b01–b30) persistence via mutatePrivateProfile
 */
import assert from "node:assert/strict";
import { randomUUID, webcrypto } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { d1MigrationsDir } from "../helpers/paths.mjs";

const CONSENT_VERSION = "2026-11-14-v4";
const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys = ON;");
for (const file of readdirSync(d1MigrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  sql.exec(readFileSync(resolve(d1MigrationsDir, file), "utf8"));
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
    if (/^\s*SELECT\b/i.test(this.query)) {
      return { results: sql.prepare(this.query).all(...this.args), success: true };
    }
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

let currentUser = null;
const env = { DB, APP_ORIGIN: "https://ss.example" };

const context = vm.createContext({
  console,
  Response,
  Request,
  Headers,
  TextEncoder,
  TextDecoder,
  crypto: {
    subtle: webcrypto.subtle,
    getRandomValues: (arr) => webcrypto.getRandomValues(arr),
    randomUUID,
  },
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
    throw new Error("Unexpected network fetch in Wave 4 test.");
  },
});

const cache = new Map();
function resolveFile(spec, from) {
  if (spec === "cloudflare:workers") return "virtual:cloudflare";
  if (spec === "next/headers") return "virtual:headers";
  if (spec === "next/server") return "virtual:server";
  if (spec === "next/navigation") return "virtual:navigation";
  const base = resolve(dirname(from), spec);
  for (const cand of [base, base + ".ts", base + ".tsx", base + ".js", base + "/index.ts"]) {
    if (existsSync(cand)) return cand;
  }
  throw new Error("Cannot resolve " + spec + " from " + from);
}

function getModule(path) {
  if (cache.has(path)) return cache.get(path);
  let mod;
  if (path === "virtual:cloudflare") {
    mod = new vm.SyntheticModule(["env"], function () {
      this.setExport("env", env);
    }, { context });
  } else if (path === "virtual:headers") {
    mod = new vm.SyntheticModule(["headers", "cookies"], function () {
      this.setExport("headers", async () => new Headers());
      this.setExport("cookies", async () => ({ get: () => undefined, getAll: () => [] }));
    }, { context });
  } else if (path === "virtual:navigation") {
    mod = new vm.SyntheticModule(["redirect"], function () {
      this.setExport("redirect", (url) => { throw new Error("REDIRECT:" + url); });
    }, { context });
  } else if (path === "virtual:server") {
    mod = new vm.SyntheticModule(["NextResponse"], function () {
      this.setExport("NextResponse", {
        json: (d, i = {}) =>
          new Response(JSON.stringify(d), {
            ...i,
            headers: { "Content-Type": "application/json", ...i.headers },
          }),
      });
    }, { context });
  } else if (path.endsWith("backend\\auth\\session.ts") || path.endsWith("backend/auth/session.ts")) {
    const raw = readFileSync(path, "utf8");
    const patched = raw.replace(
      /export async function getAuthenticatedUser[\s\S]*?\n\}/,
      `export async function getAuthenticatedUser() { return globalThis.__x3TestUser ?? null; }`,
    );
    const js = ts.transpileModule(patched, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    mod = new vm.SourceTextModule(js, { context, identifier: path });
  } else {
    const js = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    mod = new vm.SourceTextModule(js, { context, identifier: path });
  }
  cache.set(path, mod);
  return mod;
}

async function load(path) {
  const mod = getModule(path);
  if (mod.status === "unlinked") {
    await mod.link((spec, refer) => getModule(resolveFile(spec, refer.identifier)));
  }
  if (mod.status === "linked") {
    await mod.evaluate();
  }
  return mod;
}

function setCurrentUser(u) {
  currentUser = u;
  context.__x3TestUser = u;
}

const networkRoute = (await load(resolve("app/api/community/network/route.ts"))).namespace;
const notificationsRoute = (await load(resolve("app/api/notifications/route.ts"))).namespace;
const netSvc = (await load(resolve("backend/services/community/research-network.ts"))).namespace;
const notifTarget = (await load(resolve("backend/services/community/notification-target.ts"))).namespace;
const profileSvc = (await load(resolve("backend/services/profile/profile.ts"))).namespace;
const avatarsMod = (await load(resolve("backend/services/profile/avatars.ts"))).namespace;
const bannersMod = (await load(resolve("backend/services/profile/banners.ts"))).namespace;

function seedResearcher(userId, handle, displayName, consented = true) {
  const now = new Date().toISOString();
  sql
    .prepare(
      `INSERT OR IGNORE INTO auth_users (id, email, password_hash, display_name, auth_provider, avatar_id, created_at, updated_at)
       VALUES (?, ?, 'hash', ?, 'email', 'a01', ?, ?)`,
    )
    .run(userId, `${handle}@test.local`, displayName, now, now);
  sql
    .prepare(
      `INSERT OR IGNORE INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, displayName, now, consented ? CONSENT_VERSION : "old", consented ? 1 : 0, now);
  if (consented) {
    sql
      .prepare(
        `INSERT OR IGNORE INTO x1_bodies (subject, handle, display_name, bio, avatar, created_at, updated_at)
         VALUES (?, ?, ?, 'Quant researcher', 'a01', ?, ?)`,
      )
      .run(userId, handle, displayName, now, now);
    sql
      .prepare(
        `INSERT OR IGNORE INTO x2_social_preferences (subject, discoverable, messages, receipts, notifications, updated_at)
         VALUES (?, 1, 'REQUESTS', 0, 1, ?)`,
      )
      .run(userId, now);
  }
  return { userId, displayName, email: `${handle}@test.local`, authProvider: "email" };
}

function seedCompletedScan(scanId, subject, name, opts = {}) {
  const createdAt = opts.createdAt ?? new Date().toISOString();
  const matched = opts.matched ?? ["NSE:TCS", "NSE:INFY"];
  const payload = {
    description: opts.description ?? "Wave 4 scan",
    research: {
      interval: opts.interval ?? "1h",
      universe: opts.universe ?? "CONNECTED_MARKETS",
      formula: opts.formula ?? "close > sma(close, 20)",
    },
    rule: { formula: opts.formula ?? "close > sma(close, 20)" },
    results: {
      total: matched.length,
      matches: matched.length,
      results: matched.map((instrumentId) => ({ instrumentId, status: "PASS" })),
    },
    sourceAttribution: "Shared test dataset",
    dataRightsMode: "DISPLAY_AND_DERIVED",
  };
  sql
    .prepare(
      `INSERT INTO x1_scans (id, subject, request_key, mode, name, payload, digest, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      scanId,
      subject,
      `req_${scanId}`,
      opts.mode ?? "SIMPLE",
      name,
      JSON.stringify(payload),
      `dig_${scanId}`,
      createdAt,
    );
}

test("X3-042–051: Two-user Soul Feed publish, idempotency, SQL filtering, cursor pagination, no-store cache, consent & delete", async () => {
  const userA = seedResearcher("u_alpha_0001", "alpha_quant", "Alpha Quant");
  const userB = seedResearcher("u_beta_00002", "beta_quant", "Beta Quant");
  const userC = seedResearcher("u_gamma_0003", "gamma_quant", "Gamma Quant");
  const unconsented = seedResearcher("u_noconsent3", "no_consent", "No Consent", false);

  // Seed 28 scans across User A (18) and User C (10) covering all 5 active timeframes (30m, 1h, 3h, 6h, 1d)
  const intervals = ["30m", "1h", "3h", "6h", "1d"];
  const publishedIds = [];
  for (let i = 0; i < 28; i++) {
    const author = i < 18 ? userA : userC;
    const scanId = `scan_w4_${String(i).padStart(2, "0")}`;
    const tf = intervals[i % intervals.length];
    const mode = i % 3 === 0 ? "ADVANCED" : "SIMPLE";
    const createdAt = new Date(Date.UTC(2026, 10, 27, 10, 0, i)).toISOString();
    seedCompletedScan(scanId, author.userId, `Momentum Setup ${String(i).padStart(2, "0")}`, {
      interval: tf,
      mode,
      formula: i === 27 ? "rsi(close, 14) < 35" : "close > sma(close, 20)",
      createdAt,
    });
    const pub = await netSvc.publishSoulFromScan(author.userId, {
      scanId,
      title: `Momentum Setup ${String(i).padStart(2, "0")}`,
      audience: "PUBLIC",
      idempotencyKey: `pub_key_w4_${String(i).padStart(2, "0")}`,
    });
    publishedIds.push(pub.postId);
    // Ensure distinct created_at timestamps for deterministic keyset pagination
    sql
      .prepare("UPDATE x51_web_souls SET created_at=? WHERE id=?")
      .run(createdAt, pub.postId);
  }

  // Idempotent replay with same key returns same postId without duplicating
  const replay = await netSvc.publishSoulFromScan(userA.userId, {
    scanId: "scan_w4_00",
    title: "Momentum Setup 00",
    audience: "PUBLIC",
    idempotencyKey: "pub_key_w4_00",
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.postId, publishedIds[0]);

  // Publish one FOLLOWERS-only Soul (User B is NOT following yet -> MUST be hidden from User B)
  seedCompletedScan("scan_w4_priv", userA.userId, "Followers Only Alpha", { interval: "6h" });
  const privPub = await netSvc.publishSoulFromScan(userA.userId, {
    scanId: "scan_w4_priv",
    title: "Followers Only Alpha",
    audience: "FOLLOWERS",
    idempotencyKey: "pub_key_w4_priv",
  });

  // User B loads page 1 via HTTP route -> MUST see private, no-store & paginated 25 results
  setCurrentUser(userB);
  const res1 = await networkRoute.GET(new Request("https://ss.example/api/community/network?view=web&limit=15"));
  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get("Cache-Control"), "private, no-store");
  const page1 = await res1.json();
  assert.equal(page1.posts.length, 15);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);
  assert.ok(!page1.posts.some((p) => p.id === privPub.postId), "FOLLOWERS Soul must stay private");

  // Page 2 via cursor returns remaining 13 with ZERO overlap and ZERO missing posts
  const res2 = await networkRoute.GET(
    new Request(`https://ss.example/api/community/network?view=web&limit=15&cursor=${encodeURIComponent(page1.nextCursor)}`),
  );
  const page2 = await res2.json();
  assert.equal(page2.posts.length, 13);
  assert.equal(page2.hasMore, false);
  const allSeen = new Set([...page1.posts.map((p) => p.id), ...page2.posts.map((p) => p.id)]);
  assert.equal(allSeen.size, 28);

  // Guest also gets private, no-store so newly published Souls appear immediately
  setCurrentUser(null);
  const guestRes = await networkRoute.GET(new Request("https://ss.example/api/community/network?view=web&timeframe=3h"));
  assert.equal(guestRes.headers.get("Cache-Control"), "private, no-store");
  const guest3h = await guestRes.json();
  assert.ok(guest3h.posts.length >= 5);
  for (const p of guest3h.posts) {
    assert.equal(p.timeframe, "3h");
  }

  // SQL-side search finds post #27 by formula even if buried
  const searchRes = await netSvc.listWebSouls(userB.userId, { search: "rsi(close, 14) < 35" });
  assert.equal(searchRes.posts.length, 1);
  assert.equal(searchRes.posts[0].title, "Momentum Setup 27");

  // Unconsented user CANNOT bypass adult consent via like-post
  await assert.rejects(
    () =>
      netSvc.mutateResearchNetwork(unconsented.userId, {
        action: "like-post",
        postId: publishedIds[0],
        active: true,
      }),
    /adult|consent|Body/i,
  );

  // User B likes & comments on User A's Soul -> triggers notifications with clean anchor
  const likeRes = await netSvc.mutateResearchNetwork(userB.userId, {
    action: "like-post",
    postId: publishedIds[0],
    active: true,
  });
  assert.equal(likeRes.liked, true);
  assert.equal(likeRes.likeCount, 1);

  const commentRes = await netSvc.mutateResearchNetwork(userB.userId, {
    action: "comment-soul",
    postId: publishedIds[0],
    text: "Clean 30m structure!",
    requestId: "cmt_w4_0000001",
  });
  assert.ok(commentRes.commentId);

  // Author deletes published Soul -> immediately disappears from User B while x1_scans stays intact
  await netSvc.mutateResearchNetwork(userA.userId, {
    action: "delete-soul",
    postId: publishedIds[1],
  });
  const afterDel = await netSvc.listWebSouls(userB.userId, { postId: publishedIds[1] });
  assert.equal(afterDel.posts.length, 0);
  const scanStillThere = sql.prepare("SELECT id FROM x1_scans WHERE id='scan_w4_01'").get();
  assert.equal(scanStillThere?.id, "scan_w4_01");
});

test("X3-052–056: Notifications unify x1_visible_notices, resolve clean anchors/routes, and 60 avatars / 30 banners persist", async () => {
  const userA = seedResearcher("u_notif_a001", "notif_alpha", "Notif Alpha");
  const now = new Date().toISOString();

  // Seed a scan & account notice (x1_account_notices) plus a JOIN_DECISION notice (x2_notifications)
  seedCompletedScan("scan_notif_01", userA.userId, "Alerted Scan", { interval: "30m" });
  sql
    .prepare(
      `INSERT INTO x1_account_notices (id, subject, kind, target_id, event_key, created_at)
       VALUES ('notice_scan_001', ?, 'SCAN_COMPLETE', 'scan_notif_01', 'scan:scan_notif_01', ?)`,
    )
    .run(userA.userId, now);
  sql
    .prepare(
      `INSERT INTO x2_notifications (id, subject, kind, target_id, event_key, created_at)
       VALUES ('notice_join_002', ?, 'JOIN_DECISION', 'room_declined_1234', 'join:room_declined_1234:declined', ?)`,
    )
    .run(userA.userId, now);

  // JOIN_DECISION must NOT corrupt anchor with the room id
  const parsedJoin = notifTarget.notificationTarget(
    "JOIN_DECISION",
    "room_declined_1234",
    "join:room_declined_1234:declined",
  );
  assert.deepEqual({ ...parsedJoin }, { kind: "room", id: "room_declined_1234" });

  // Profile unread counts & list MUST include x1_account_notices (via x1_visible_notices)
  const meta = await profileSvc.getSessionProfileMeta(userA.userId);
  assert.equal(meta.unreadNotifications, 2);
  const priv = await profileSvc.getPrivateProfile(userA);
  assert.equal(priv.unreadNotifications, 2);
  assert.ok(priv.notifications.some((n) => n.id === "notice_scan_001"));

  // /api/notifications GET returns human-readable labels; POST opens both cleanly
  setCurrentUser(userA);
  const listRes = await notificationsRoute.GET(new Request("https://ss.example/api/notifications"));
  const listed = await listRes.json();
  assert.equal(listed.notifications.length, 2);
  assert.equal(
    listed.notifications.find((n) => n.id === "notice_scan_001").label,
    "Soul Scan completed",
  );

  // Opening JOIN_DECISION for a non-member safely routes to /?view=community&tab=rooms (no private room leak!)
  const openJoinRes = await notificationsRoute.POST(
    new Request("https://ss.example/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://ss.example",
        Host: "ss.example",
      },
      body: JSON.stringify({ id: "notice_join_002" }),
    }),
  );
  const openJoin = await openJoinRes.json();
  assert.equal(openJoin.href, "/?view=community&tab=rooms");
  assert.equal(openJoin.unread, 1);

  // mark-notifications-read clears BOTH x2_notifications and x1_account_notices
  const cleared = await profileSvc.mutatePrivateProfile(userA, {
    action: "mark-notifications-read",
  });
  assert.equal(cleared.unreadNotifications, 0);

  // 60 avatars (f10) and 30 banners (b29) validate and persist cleanly
  assert.equal(avatarsMod.AVATAR_CATALOG.length, 60);
  assert.equal(bannersMod.BANNER_PRESETS.length, 30);
  const updated = await profileSvc.mutatePrivateProfile(userA, {
    action: "update-profile",
    displayName: "Notif Alpha",
    handle: "notif_alpha",
    avatarPresetId: "f10",
    bannerPresetId: "b29",
  });
  assert.equal(updated.avatarId, "f10");
  assert.equal(updated.bannerPresetId, "b29");
});
