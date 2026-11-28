/**
 * Strategic Souls X 3.0 — Wave 5 UI, PWA, Globe, Strategy & Settings Contracts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("X3-128: Exact GVV logo preserved, PWA icons/manifest generated, and service worker never caches /api/*", () => {
  const logoBytes = readFileSync(resolve("public/gvv-approved.jpg"));
  const sha = createHash("sha256").update(logoBytes).digest("hex").toUpperCase();
  assert.equal(sha, "FB5D42B4377077568F3B1977EC21C11018845124C44DBCAD6AE21D5AF4BDF61A");

  for (const asset of [
    "public/icon-192.png",
    "public/icon-512.png",
    "public/icon-maskable-512.png",
    "public/apple-touch-icon.png",
    "public/favicon-32x32.png",
    "public/favicon-48x48.png",
    "public/favicon.ico",
    "public/manifest.webmanifest",
    "public/sw.js",
  ]) {
    assert.ok(existsSync(resolve(asset)), `Missing required PWA asset: ${asset}`);
  }

  const manifest = JSON.parse(readFileSync(resolve("public/manifest.webmanifest"), "utf8"));
  assert.equal(manifest.name, "Strategic Souls");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#070809");
  assert.ok(manifest.icons.some((i) => i.sizes === "192x192" && i.src === "/icon-192.png"));
  assert.ok(manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));

  const sw = readFileSync(resolve("public/sw.js"), "utf8");
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)\)\s*return false/);
  assert.match(sw, /CLEAR_USER_CACHES/);
});

test("X3-058–080: Settings redesigned into exact 3 groups & 8 ordered rows with Preferences, Account & Data, Private Ticker & /legacy removed", () => {
  const settingsSrc = readFileSync(resolve("frontend/features/account/settings-view.tsx"), "utf8");
  const privacySrc = readFileSync(resolve("frontend/features/account/settings/settings-privacy-section.tsx"), "utf8");
  const securitySrc = readFileSync(resolve("frontend/features/account/settings/settings-security-section.tsx"), "utf8");
  const workspaceSrc = readFileSync(resolve("frontend/components/workspace/workspace.tsx"), "utf8");

  // Exact 3 groups & 8 ordered rows
  const labels = [
    "Personal",
    "Edit Profile",
    "Notifications",
    "Security & Privacy",
    "Password & Security",
    "Privacy",
    "Active Sessions",
    "Information & Support",
    "Help & Support",
    "About Strategic Souls",
    "Log Out",
  ];
  let cursor = -1;
  for (const label of labels) {
    const idx = settingsSrc.indexOf(`"${label}"`, cursor + 1);
    assert.ok(idx > cursor, `Expected Settings item "${label}" in exact order`);
    cursor = idx;
  }

  // Removed items MUST NOT appear as UI rows or labels in ordinary Settings or workspace chrome
  assert.doesNotMatch(settingsSrc, /"Preferences"|>Preferences<|Account & Data|Private Holdings Ticker|Research Beta|\/legacy|Data Connections/i);
  assert.doesNotMatch(workspaceSrc, /<PrivateHoldingsTicker|x1-archive-link|Existing saved research/);

  // Relocated Export JSON & Permanent Deletion live in Privacy; Password minLength is 10
  assert.match(privacySrc, /\/api\/export/);
  assert.match(privacySrc, /DELETE MY DATA/);
  assert.match(securitySrc, /minLength=\{10\}/);
  assert.doesNotMatch(securitySrc, /minLength=\{15\}/);
});

test("X3-027–041 & X3-131: Strategy exposes exactly 2 sources (Markets/Watchlist), 5 timeframes (30m/1H/3H/6H/24H), SOUL MEMORY, draft & guest CTA", () => {
  const scopeSrc = readFileSync(resolve("frontend/features/strategy/strategy-scope-bar.tsx"), "utf8");
  const stratSrc = readFileSync(resolve("frontend/features/strategy/workspace.tsx"), "utf8");

  assert.match(scopeSrc, />\s*Markets\s*</);
  assert.match(scopeSrc, />\s*Watchlist\s*</);
  assert.doesNotMatch(scopeSrc, /ECB FX|Indian markets|More scopes|Scoped to|Scan all|Weekly|Monthly/);
  assert.match(scopeSrc, /"30m".*"1h".*"3h".*"6h".*"1d"/s);
  assert.match(stratSrc, /Sign in to run this scan/);
  assert.match(stratSrc, /STRATEGY_DRAFT_STORAGE_KEY/);
  assert.match(stratSrc, /<SoulMemoryStrip/);

  const scanRouteSrc = readFileSync(resolve("app/api/strategy/scan/route.ts"), "utf8");
  assert.match(scanRouteSrc, /resetLabel:\s*"Resets 00:00 IST"/);
  const smStripSrc = readFileSync(resolve("frontend/features/strategy/soul-memory-strip.tsx"), "utf8");
  assert.match(smStripSrc, /DEFAULT_RESET_LABEL/);
});

test("X3-001–017: Section accents (Global Green, Strategy Blue, Community Lavender) & Globe freeze fixes wired", () => {
  const css = readFileSync(resolve("frontend/styles/ss-v3.css"), "utf8");
  assert.match(css, /\[data-section="global"\]\s*\{\s*--ss-section-accent:\s*var\(--x51-green\)/);
  assert.match(css, /\[data-section="strategy"\]\s*\{\s*--ss-section-accent:\s*var\(--x1-title-blue\)/);
  assert.match(css, /\[data-section="community"\][\s\S]*?#c4b5fd/i);
  assert.match(css, /\.x1-app\[data-section="community"\] main :is\(h1, h2, h3\)/);

  const globeSrc = readFileSync(resolve("frontend/features/global/globe-canvas.tsx"), "utf8");
  assert.match(globeSrc, /cachedCssW/);
  assert.match(globeSrc, /adaptiveDprScale/);
  assert.match(globeSrc, /webglcontextrestored/);
  assert.match(globeSrc, /style=\{showFallback \? \{ display: "none" \} : undefined\}/);

  const x51Css = readFileSync(resolve("frontend/styles/x51.css"), "utf8");
  assert.match(x51Css, /\.x53-globe-stage canvas\s*\{\s*touch-action:\s*pan-y;/);
});
