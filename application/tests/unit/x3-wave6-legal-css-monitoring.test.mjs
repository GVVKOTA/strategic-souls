/**
 * Strategic Souls X 3.0 — Wave 6 Legal/Help/Contact, Feature CSS Scoping, Dead Code & Heartbeat Contracts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("X3-089–091 & X3-132: Truthful X 3.0 Privacy/Terms/Contact/Help copy with zero Supabase/beta/BTCUSDT relics", () => {
  const v3Legal = readFileSync(resolve("backend/services/v3/legal.ts"), "utf8");
  const legacyContent = readFileSync(resolve("backend/services/legacy/content.ts"), "utf8");
  const slugPage = readFileSync(resolve("app/[slug]/page.tsx"), "utf8");
  const legalPage = readFileSync(resolve("app/legal/[slug]/page.tsx"), "utf8");
  const assetPage = readFileSync(resolve("app/asset/[label]/page.tsx"), "utf8");

  assert.doesNotMatch(v3Legal, /Supabase|V3 local research terms|public publishing.*disabled/i);
  assert.match(v3Legal, /SOUL MEMORY/);
  assert.match(v3Legal, /00:00 IST/);
  assert.match(v3Legal, /strategicsoulsgvv@gmail\.com/);

  assert.doesNotMatch(legacyContent, /Private beta terms|₹49|Proposed Free: 5|No email or notification is sent/i);
  assert.match(legacyContent, /SOUL MEMORY/);
  assert.match(legacyContent, /strategicsoulsgvv@gmail\.com/);

  // /contact maps cleanly and /signin omits raw Cloudflare D1 implementation jargon
  assert.match(slugPage, /contact:\s*"contact"/);
  assert.doesNotMatch(slugPage, /Cloudflare D1|Cloudflare Workers/);

  assert.doesNotMatch(legalPage, /PRIVATE BETA|Public launch is blocked/);
  assert.doesNotMatch(assetPage, /BTCUSDT|Binance spot/);
});

test("X3-094 & X3-097: Feature-local CSS removed from global layout.tsx and dead private-ticker deleted", () => {
  const layout = readFileSync(resolve("app/layout.tsx"), "utf8");
  for (const movedCss of [
    "globe-visual.css",
    "social.css",
    "data.css",
    "research.css",
    "scanner-x54.css",
    "profile.css",
    "messenger.css",
  ]) {
    assert.ok(!layout.includes(movedCss), `${movedCss} should be feature-local, not imported in app/layout.tsx`);
  }
  assert.equal(existsSync(resolve("frontend/components/workspace/private-ticker.tsx")), false);
});

test("X3-133: Legal footer includes Contact link and refined 12.5px accessible footer typography", () => {
  const ws = readFileSync(resolve("frontend/components/workspace/workspace.tsx"), "utf8");
  const css = readFileSync(resolve("frontend/styles/ss-v3.css"), "utf8");
  assert.match(ws, /href="\/contact"/);
  assert.match(css, /\.legal-page \.legal-note[\s\S]*?font-size:\s*12\.5px/);
});
