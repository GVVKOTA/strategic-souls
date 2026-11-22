/**
 * Strategic Souls X5.5 — Phase 2 Brand Language, Standalone GRAVEYARD, UX & Performance Contracts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");
}

test("X5.5 P2: GRAVEYARD heading is strictly standalone with zero subtitle or descriptor", () => {
  const strat = readFileSync("frontend/features/strategy/workspace.tsx", "utf8");
  const wrapMatch = strat.match(
    /<div className="x53-graveyard-title-wrap">([\s\S]*?)<\/div>/,
  );
  assert.ok(wrapMatch, "x53-graveyard-title-wrap must exist");
  const inner = wrapMatch[1];
  assert.match(inner, />\s*GRAVEYARD\s*</);
  assert.doesNotMatch(inner, /<p\b/i, "GRAVEYARD must have NO subtitle paragraph");
  assert.doesNotMatch(inner, /Immutable personal scan archive/i);
  assert.doesNotMatch(inner, /Scan History/i);
  assert.doesNotMatch(strat, /Immutable personal scan archive/i);
});

test("X5.5 P2: canonical brand vocabulary applied and internal jargon removed from visible UI", () => {
  const uiFiles = [
    "frontend/components/workspace/workspace.tsx",
    "frontend/components/workspace/universal-search.tsx",
    "frontend/features/community/research-network-shell.tsx",
    "frontend/features/community/public-profile-sheet.tsx",
    "frontend/features/community/social-workspace.tsx",
    "frontend/features/community/messenger/chat-inbox.tsx",
    "frontend/features/community/messenger/conversation-view.tsx",
    "frontend/features/community/dashboard.tsx",
    "frontend/features/strategy/workspace.tsx",
    "frontend/features/strategy/draw-canvas.tsx",
    "frontend/features/account/settings-view.tsx",
    "frontend/features/account/account-quick-panel.tsx",
    "frontend/features/auth/auth-panel.tsx",
    "frontend/features/global/market-grid.tsx",
    "frontend/features/global/asset-terminal.tsx",
  ];

  for (const file of uiFiles) {
    const clean = stripComments(readFileSync(file, "utf8"));
    assert.doesNotMatch(clean, /@BodyID/, `${file} must not display literal @BodyID`);
    assert.doesNotMatch(clean, /Community Web/, `${file} must use Soul Feed instead of Community Web`);
    assert.doesNotMatch(clean, /Post Soul/, `${file} must use Publish Soul instead of Post Soul`);
    assert.doesNotMatch(clean, /Cloudflare D1/, `${file} must not expose Cloudflare D1 jargon`);
    assert.doesNotMatch(clean, /Checking authorized conversations/, `${file} must use plain loading copy`);
    assert.doesNotMatch(clean, /server-authorized/, `${file} must not expose server-authorized jargon`);
    assert.doesNotMatch(clean, /COVERAGE BLOCKED|COVERAGE VERIFIED/, `${file} must use plain coverage labels`);
    assert.doesNotMatch(clean, /PBKDF2-SHA256/, `${file} must reserve PBKDF2-SHA256 for /trust page`);
  }

  const commShell = readFileSync(
    "frontend/features/community/research-network-shell.tsx",
    "utf8",
  );
  assert.match(commShell, />Soul Feed</);
  assert.match(commShell, />Chats</);
  assert.match(commShell, />Rooms</);
  assert.match(commShell, />Soul Network</);
  assert.match(commShell, />Copy to Drafts</);
  assert.match(commShell, /x55-comm-tabs/);

  const profileSheet = readFileSync(
    "frontend/features/community/public-profile-sheet.tsx",
    "utf8",
  );
  assert.match(profileSheet, />Share profile</);
  assert.match(profileSheet, />Copy to Drafts</);

  const strat = readFileSync("frontend/features/strategy/workspace.tsx", "utf8");
  assert.match(strat, />Publish Soul</);
  assert.match(strat, /title="Publish to Soul Feed"/);
  assert.match(strat, /Soul published!/);
  assert.match(strat, /Review scan/);
  assert.match(strat, /Not enough data to scan/);
  assert.match(strat, /Data coverage ready/);
});

test("X5.5 P2: code-splitting, 3D Globe buffer/motion/timeout optimizations & canonical 6 hex colors preserved", () => {
  const commShell = readFileSync(
    "frontend/features/community/research-network-shell.tsx",
    "utf8",
  );
  assert.match(commShell, /lazy\(\(\) => import\("\.\/dashboard"\)\)/);
  assert.match(commShell, /lazy\(\(\) =>\s*import\("\.\/social-workspace"\)/);

  const strat = readFileSync("frontend/features/strategy/workspace.tsx", "utf8");
  assert.match(strat, /lazy\(\(\) => import\("\.\/formula-lab"\)\)/);
  assert.match(strat, /lazy\(\(\) => import\("\.\/draw-canvas"\)\)/);

  const globe = readFileSync("frontend/features/global/globe-canvas.tsx", "utf8");
  assert.match(globe, /new Set<WebGLBuffer>\(\)/);
  assert.match(globe, /buffers\.delete\(/);
  assert.match(globe, /dataset\.motion === "minimal"/);
  assert.match(globe, /qualityBudget !== "reduced"/);
  assert.match(globe, /15_000/);

  const globalsCss = readFileSync("frontend/styles/globals.css", "utf8");
  assert.match(globalsCss, /--x1-text-primary:\s*#E8EDF2/i);
  assert.match(globalsCss, /--x1-text-secondary:\s*#CAD3DC/i);
  assert.match(globalsCss, /--x1-text-tertiary:\s*#B9C3CE/i);
  assert.match(globalsCss, /--x1-text-muted:\s*#A7B1BC/i);
  assert.match(globalsCss, /--x1-title-blue:\s*#76C0FF/i);
  assert.match(globalsCss, /--x1-title-blue-alt:\s*#94D0FF/i);
});
