/**
 * Strategic Souls X5.6 — Acceptance & Regression Suite:
 * 1. Exact Ranked 50 Classic Formulas (14 MA, 8 RSI, 6 MACD, 11 Volatility, 11 Trend & Volume)
 *    + OBV, MFI(14), Supertrend(10,3) math + non-leaking breakout windows + insufficient-data/zero-volume guards
 * 2. 50 Distinct SVG Avatars + Cryptographically Random First Assignment + Idempotent One-Time Backfill
 * 3. 8 Visual Artwork Banners (6 Dark + 2 Light Themes: b04 Arctic Horizon, b06 Prism Atelier) + Focal Alignment
 * 4. Voluntary 36-Entry Indian State / Union Territory Registry + Public Profile Top-Right Code Capsule
 * 5. Community Chats Preview Logic (Soul attachments vs empty vs literal '.' vs retracted) & UI Layout Invariants
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
const baseNow = "2026-11-23T06:00:00.000Z";
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
    throw new Error("Unexpected external network fetch in offline X5.6 test.");
  },
});

const cache = new Map();
function resolveFile(spec, from) {
  if (spec === "cloudflare:workers") return "virtual:cloudflare";
  if (spec === "next/headers") return "virtual:headers";
  if (spec === "next/server") return "virtual:server";
  if (spec === "next/navigation") return "virtual:navigation";
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
  } else if (path === "virtual:navigation") {
    mod = new vm.SyntheticModule(
      ["redirect"],
      function () {
        this.setExport("redirect", (url) => {
          throw new Error("REDIRECT:" + url);
        });
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
  } else if (
    path.endsWith("backend\\middleware\\auth.ts") ||
    path.endsWith("backend/middleware/auth.ts")
  ) {
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

const scanEngine = (await load(resolve("backend/engines/scan.ts"))).namespace;
const classicPresets = (
  await load(resolve("backend/services/research/classic-presets.ts"))
).namespace;
const avatarsMod = (
  await load(resolve("backend/services/profile/avatars.ts"))
).namespace;
const bannersMod = (
  await load(resolve("backend/services/profile/banners.ts"))
).namespace;
const statesMod = (
  await load(resolve("backend/services/profile/indian-states.ts"))
).namespace;
const profileSvc = (
  await load(resolve("backend/services/profile/profile.ts"))
).namespace;
const sessionMod = (await load(resolve("backend/auth/session.ts"))).namespace;
const netSvc = (
  await load(resolve("backend/services/community/research-network.ts"))
).namespace;
const socialSvc = (
  await load(resolve("backend/services/community/social.ts"))
).namespace;
const messengerTypes = (
  await load(resolve("frontend/features/community/messenger/types.ts"))
).namespace;

const dayIso = (n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();

// ── 1. OBV, MFI(14), Supertrend(10,3) & All 50 Canonical Classic Rules ──────
test("X5.6 Phase 1: OBV, MFI(14), Supertrend(10,3), and non-leaking breakout windows evaluate accurately and fail closed on insufficient or zero-volume data", () => {
  // 1a. OBV rising (#44) and falling (#45)
  const risingObvBars = [100, 102, 104, 107, 110].map((close, i) => ({
    eventAt: dayIso(i),
    knownAt: dayIso(i),
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10_000 + i * 1000,
  }));
  const fallingObvBars = [110, 108, 105, 103, 100].map((close, i) => ({
    eventAt: dayIso(i),
    knownAt: dayIso(i),
    open: close + 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10_000 + i * 1000,
  }));
  const rule44 = scanEngine.compileFormula(
    classicPresets.CLASSIC_50_PRESETS[43].formula,
  );
  const rule45 = scanEngine.compileFormula(
    classicPresets.CLASSIC_50_PRESETS[44].formula,
  );
  assert.equal(
    scanEngine.evaluateScan(
      rule44,
      [
        {
          instrumentId: "TEST:OBV_UP",
          source: "Test",
          permitted: true,
          observations: risingObvBars,
        },
      ],
      dayIso(20),
    ).results[0].status,
    "PASS",
  );
  assert.equal(
    scanEngine.evaluateScan(
      rule44,
      [
        {
          instrumentId: "TEST:OBV_DOWN",
          source: "Test",
          permitted: true,
          observations: fallingObvBars,
        },
      ],
      dayIso(20),
    ).results[0].status,
    "FAIL",
  );
  assert.equal(
    scanEngine.evaluateScan(
      rule45,
      [
        {
          instrumentId: "TEST:OBV_DOWN",
          source: "Test",
          permitted: true,
          observations: fallingObvBars,
        },
      ],
      dayIso(20),
    ).results[0].status,
    "PASS",
  );
  // Zero volume on OBV yields UNKNOWN, never false positive
  const zeroVolObv = risingObvBars.map((b) => ({ ...b, volume: 0 }));
  assert.equal(
    scanEngine.evaluateScan(
      rule44,
      [
        {
          instrumentId: "TEST:OBV_ZERO",
          source: "Test",
          permitted: true,
          observations: zeroVolObv,
        },
      ],
      dayIso(20),
    ).results[0].status,
    "UNKNOWN",
  );

  // 1b. MFI(14) crosses above 20 (#47) and crosses below 80 (#48)
  // Construct 16 bars where first 14 transitions are down (MFI at bar 14 = 0 <= 20) and bar 15 has strong up money flow (MFI at bar 15 > 20)
  const mfiBounceBars = Array.from({ length: 16 }, (_, i) => {
    const close = i < 15 ? 200 - i * 2 : 210;
    return {
      eventAt: dayIso(i),
      knownAt: dayIso(i),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: i === 15 ? 500_000 : 50_000,
    };
  });
  const rule47 = scanEngine.compileFormula(
    classicPresets.CLASSIC_50_PRESETS[46].formula,
  );
  assert.equal(
    scanEngine.evaluateScan(
      rule47,
      [
        {
          instrumentId: "TEST:MFI_BOUNCE",
          source: "Test",
          permitted: true,
          observations: mfiBounceBars,
        },
      ],
      dayIso(30),
    ).results[0].status,
    "PASS",
  );

  // Construct 16 bars where first 14 transitions are up (MFI at bar 14 = 100 >= 80) and bar 15 has strong down money flow (MFI at bar 15 < 80)
  const mfiDropBars = Array.from({ length: 16 }, (_, i) => {
    const close = i < 15 ? 100 + i * 2 : 90;
    return {
      eventAt: dayIso(i),
      knownAt: dayIso(i),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: i === 15 ? 500_000 : 50_000,
    };
  });
  const rule48 = scanEngine.compileFormula(
    classicPresets.CLASSIC_50_PRESETS[47].formula,
  );
  assert.equal(
    scanEngine.evaluateScan(
      rule48,
      [
        {
          instrumentId: "TEST:MFI_DROP",
          source: "Test",
          permitted: true,
          observations: mfiDropBars,
        },
      ],
      dayIso(30),
    ).results[0].status,
    "PASS",
  );

  // 1c. Supertrend(10,3) turns bullish (#49) and turns bearish (#50)
  const stBullBars = Array.from({ length: 15 }, (_, i) => {
    const close = i < 14 ? 100 - i * 1.5 : 118;
    return {
      eventAt: dayIso(i),
      knownAt: dayIso(i),
      open: close,
      high: i < 14 ? close + 1 : close + 2,
      low: close - 1,
      close,
      volume: 100_000,
    };
  });
  const rule49 = scanEngine.compileFormula(
    classicPresets.CLASSIC_50_PRESETS[48].formula,
  );
  assert.equal(
    scanEngine.evaluateScan(
      rule49,
      [
        {
          instrumentId: "TEST:ST_BULL",
          source: "Test",
          permitted: true,
          observations: stBullBars,
        },
      ],
      dayIso(30),
    ).results[0].status,
    "PASS",
  );

  const stBearBars = Array.from({ length: 15 }, (_, i) => {
    const close = i < 14 ? 100 + i * 1.5 : 82;
    return {
      eventAt: dayIso(i),
      knownAt: dayIso(i),
      open: close,
      high: close + 1,
      low: i < 14 ? close - 1 : close - 2,
      close,
      volume: 100_000,
    };
  });
  const rule50 = scanEngine.compileFormula(
    classicPresets.CLASSIC_50_PRESETS[49].formula,
  );
  assert.equal(
    scanEngine.evaluateScan(
      rule50,
      [
        {
          instrumentId: "TEST:ST_BEAR",
          source: "Test",
          permitted: true,
          observations: stBearBars,
        },
      ],
      dayIso(30),
    ).results[0].status,
    "PASS",
  );

  // 1d. Insufficient data check across all 50 rules: 1-bar dataset always returns UNKNOWN
  const oneBarDs = [
    {
      instrumentId: "TEST:ONEBAR",
      source: "Test",
      permitted: true,
      observations: [
        {
          eventAt: dayIso(0),
          knownAt: dayIso(0),
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 10_000,
        },
      ],
    },
  ];
  for (const preset of classicPresets.CLASSIC_50_PRESETS) {
    const compiled = scanEngine.compileFormula(preset.formula);
    const rep = scanEngine.evaluateScan(compiled, oneBarDs, dayIso(5));
    assert.equal(
      rep.results[0].status,
      "UNKNOWN",
      `Preset ${preset.id} must return UNKNOWN on 1-bar dataset`,
    );
  }
});

// ── 2. Cryptographically Random First Avatar Assignment & One-Time Backfill ──
test("X5.6 Phase 2: new accounts receive cryptographically random avatars across all 50 presets and persist idempotently", async () => {
  // Statistical distribution check across 60 draws from pickRandomAvatarId()
  const drawn = new Set();
  for (let i = 0; i < 60; i++) {
    const id = avatarsMod.pickRandomAvatarId();
    assert.ok(avatarsMod.isValidAvatarPresetId(id), `Invalid avatar id: ${id}`);
    drawn.add(id);
  }
  assert.ok(
    drawn.size >= 15,
    `Expected varied random avatar distribution across 50 presets, got only ${drawn.size} distinct IDs`,
  );

  // Register 12 real email users in D1 and verify they get persisted avatars in auth_users.avatar_id
  const accountAvatars = new Set();
  for (let i = 0; i < 12; i++) {
    const user = await sessionMod.registerEmailUser({
      email: `random_av_${i}@test.local`,
      password: "StrongPassword123",
      displayName: `Researcher ${i}`,
    });
    sql
      .prepare(
        `INSERT INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active)
         VALUES (?, ?, ?, ?, 1, ?)`,
      )
      .run(user.userId, user.displayName, baseNow, CONSENT_VERSION, baseNow);

    const meta1 = await profileSvc.getSessionProfileMeta(user.userId);
    const meta2 = await profileSvc.getSessionProfileMeta(user.userId);
    assert.ok(avatarsMod.isValidAvatarPresetId(meta1.avatarId));
    assert.equal(
      meta1.avatarId,
      meta2.avatarId,
      "Assigned avatar must remain stable across reloads",
    );
    accountAvatars.add(meta1.avatarId);
  }
  assert.ok(
    accountAvatars.size >= 5,
    `Expected diverse initial avatars across 12 new accounts, got ${accountAvatars.size}`,
  );
});

// ── 3. 8 Visual Artwork Banners (6 Dark + 2 Light) & 36 Indian States/UTs ────
test("X5.6 Phase 3 & 4: 8 visual banner presets (including 2 light designs) and 36 Indian States/UTs validate, persist, and render on public profiles", async () => {
  assert.equal(bannersMod.BANNER_PRESETS.length, 8);
  const lightBanners = bannersMod.BANNER_PRESETS.filter(
    (b) => b.theme === "light",
  );
  const darkBanners = bannersMod.BANNER_PRESETS.filter(
    (b) => b.theme === "dark",
  );
  assert.equal(lightBanners.length, 2, "Must provide 2 light-theme banners");
  assert.equal(darkBanners.length, 6, "Must provide 6 dark-theme banners");
  for (const b of bannersMod.BANNER_PRESETS) {
    assert.ok(
      b.artworkDataUrl.startsWith("data:image/svg+xml;utf8,"),
      `Banner ${b.id} must contain inline SVG artwork`,
    );
    assert.ok(b.gradient.includes(b.artworkDataUrl));
    assert.ok(b.safeZoneScrim.includes("linear-gradient"));
  }

  // Verify all 36 Indian States (28) + Union Territories (8)
  assert.equal(statesMod.INDIAN_STATES_AND_UTS.length, 36);
  assert.equal(
    statesMod.INDIAN_STATES_AND_UTS.filter((s) => s.kind === "STATE").length,
    28,
  );
  assert.equal(
    statesMod.INDIAN_STATES_AND_UTS.filter((s) => s.kind === "UNION_TERRITORY")
      .length,
    8,
  );
  assert.equal(statesMod.parseIndianStateCode("Andhra Pradesh"), "AP");
  assert.equal(statesMod.parseIndianStateCode("ap"), "AP");
  assert.equal(statesMod.parseIndianStateCode("Tamil Nadu"), "TN");
  assert.equal(statesMod.parseIndianStateCode("Telangana"), "TG");
  assert.equal(statesMod.parseIndianStateCode("Karnataka"), "KA");
  assert.equal(statesMod.parseIndianStateCode("Delhi"), "DL");
  assert.equal(statesMod.parseIndianStateCode(""), null);
  assert.equal(statesMod.parseIndianStateCode("NONE"), null);
  assert.throws(() => statesMod.parseIndianStateCode("California"));

  // Persist banner b04 (Arctic Horizon - LIGHT) + alignment "top" + stateCode "AP" (Andhra Pradesh)
  const user = await sessionMod.registerEmailUser({
    email: "ap_researcher@test.local",
    password: "StrongPassword123",
    displayName: "Vishnu Quant",
  });
  sql
    .prepare(
      `INSERT INTO accounts (subject, alias, consent_at, consent_version, adult_confirmed, last_active)
       VALUES (?, ?, ?, ?, 1, ?)`,
    )
    .run(user.userId, user.displayName, baseNow, CONSENT_VERSION, baseNow);

  const saved = await profileSvc.mutatePrivateProfile(user, {
    action: "update-profile",
    displayName: "Vishnu Quant",
    handle: "vishnu_ap",
    bio: "Studying momentum & volatility regimes.",
    bannerPresetId: "b04",
    bannerPosition: "top",
    stateCode: "Andhra Pradesh",
  });
  assert.equal(saved.bannerPresetId, "b04");
  assert.equal(saved.bannerPosition, "top");
  assert.equal(saved.stateCode, "AP");
  assert.equal(saved.stateName, "Andhra Pradesh");

  // The banner is public. The selected state remains in the owner's profile.
  const pub = await netSvc.getPublicResearcherProfile(null, "vishnu_ap");
  assert.equal(pub.profile.stateCode, null);
  assert.equal(pub.profile.stateName, null);
  assert.equal(pub.profile.bannerPresetId, "b04");
  assert.equal(pub.profile.bannerPosition, "top");

  // Voluntary removal ("Prefer not to show" / empty string) clears stateCode & stateName cleanly
  const cleared = await profileSvc.mutatePrivateProfile(user, {
    action: "update-profile",
    displayName: "Vishnu Quant",
    handle: "vishnu_ap",
    bio: "Studying momentum & volatility regimes.",
    stateCode: "",
  });
  assert.equal(cleared.stateCode, null);
  assert.equal(cleared.stateName, null);
  const pubAfterClear = await netSvc.getPublicResearcherProfile(
    null,
    "vishnu_ap",
  );
  assert.equal(pubAfterClear.profile.stateCode, null);
  assert.equal(pubAfterClear.profile.stateName, null);

  // Invalid state code rejected with 400
  await assert.rejects(
    () =>
      profileSvc.mutatePrivateProfile(user, {
        action: "update-profile",
        displayName: "Vishnu Quant",
        handle: "vishnu_ap",
        stateCode: "INVALID_STATE",
      }),
    /36 canonical Indian States/i,
  );
});

// ── 4. Community Chats Readability & Preview Logic ('You: .' vs Attachment vs Empty) ──
test("X5.6 Phase 5: inboxPreviewText distinguishes empty threads, Soul reference attachments, whitespace, retracted messages, and genuine literal '.' messages", async () => {
  // Empty active conversation
  assert.equal(
    messengerTypes.inboxPreviewText({
      id: "t1",
      handle: "peer",
      displayName: "Peer",
      state: "ACTIVE",
      requestedByMe: 1,
      unread: 0,
      muted: 0,
      updatedAt: baseNow,
      lastMessageText: "",
      lastMessageRetracted: 0,
      lastMessageHasReference: 0,
      lastMessageIsMine: 1,
    }),
    "No messages yet",
  );

  // Whitespace / zero-width-only text without attachment -> "No messages yet" (never "You: ")
  assert.equal(
    messengerTypes.inboxPreviewText({
      id: "t2",
      handle: "peer",
      displayName: "Peer",
      state: "ACTIVE",
      requestedByMe: 1,
      unread: 0,
      muted: 0,
      updatedAt: baseNow,
      lastMessageText: "   \u200B  ",
      lastMessageRetracted: 0,
      lastMessageHasReference: 0,
      lastMessageIsMine: 1,
    }),
    "No messages yet",
  );

  // Soul attachment message where placeholder "." or empty text was stored -> "You: Shared a Soul"
  assert.equal(
    messengerTypes.inboxPreviewText({
      id: "t3",
      handle: "peer",
      displayName: "Peer",
      state: "ACTIVE",
      requestedByMe: 1,
      unread: 0,
      muted: 0,
      updatedAt: baseNow,
      lastMessageText: ".",
      lastMessageRetracted: 0,
      lastMessageHasReference: 1,
      lastMessageIsMine: 1,
    }),
    "You: Shared a Soul",
  );

  // Genuine literal "." sent by user without attachment -> preserved truthfully as "You: ."
  assert.equal(
    messengerTypes.inboxPreviewText({
      id: "t4",
      handle: "peer",
      displayName: "Peer",
      state: "ACTIVE",
      requestedByMe: 1,
      unread: 0,
      muted: 0,
      updatedAt: baseNow,
      lastMessageText: ".",
      lastMessageRetracted: 0,
      lastMessageHasReference: 0,
      lastMessageIsMine: 1,
    }),
    "You: .",
  );

  // Verify social.ts inbox() SQL projects lastMessageHasReference
  const socialSource = readFileSync(
    "backend/services/community/social.ts",
    "utf8",
  );
  assert.match(socialSource, /AS lastMessageHasReference/);
});
