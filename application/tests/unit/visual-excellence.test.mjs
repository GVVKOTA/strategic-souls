/**
 * Strategic Souls — Project Visual Excellence Contract Tests
 * Verifies unified design tokens, signature visual experiences, motion discipline,
 * mobile-first constraints, and preservation of all canonical X1/X3 invariants.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("Visual Excellence CSS is imported last in layout.tsx and defines tonal & 3-tier motion tokens", () => {
  const layout = readFileSync(resolve("app/layout.tsx"), "utf8");
  const ssIdx = layout.indexOf('ss-v3.css"');
  const veIdx = layout.indexOf('visual-excellence.css"');
  assert.ok(ssIdx > 0 && veIdx > ssIdx, "visual-excellence.css must load after ss-v3.css");

  const css = readFileSync(resolve("frontend/styles/visual-excellence.css"), "utf8");
  assert.match(css, /--ve-surface-0:/);
  assert.match(css, /--ve-dur-micro:/);
  assert.match(css, /--ve-dur-ui:/);
  assert.match(css, /--ve-dur-signature:/);
  assert.match(css, /will-change:\s*auto/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /html\[data-motion="minimal"\]/);
});

test("Signature Experiences (Globe shader, Soul Scan progress, SOUL MEMORY constellation) preserve honesty & accessibility", () => {
  const grid = readFileSync(resolve("frontend/features/global/market-grid.tsx"), "utf8");
  assert.match(grid, /has-live-value/);
  assert.match(grid, /is-unavailable/);
  assert.match(grid, /if \(\s*!hasValue \|\|/, "Unavailable market tiles must not receive 3D tilt animation");

  const globe = readFileSync(resolve("frontend/features/global/globe-canvas.tsx"), "utf8");
  assert.match(globe, /fresnelOuter/);
  assert.match(globe, /uSunDir/);
  assert.doesNotMatch(globe, /float\s+luminance\s*\(/);

  const memory = readFileSync(resolve("frontend/features/strategy/soul-memory-strip.tsx"), "utf8");
  assert.match(memory, /SoulMemoryConstellation/);
  assert.match(memory, /ve-memory-constellation/);
  assert.match(memory, /DEFAULT_RESET_LABEL/);

  const strat = readFileSync(resolve("frontend/features/strategy/workspace.tsx"), "utf8");
  assert.match(strat, /ve-strategy-workstation/);
  assert.match(strat, /ve-scan-progress-surface/);
  assert.match(strat, /role="progressbar"/);
});
