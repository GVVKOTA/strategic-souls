/** Presentation policy and real React server markup. Browser/render performance is separate QA. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const source = readFileSync("frontend/components/workspace/eclipse-intro.tsx", "utf8");
const css = readFileSync("frontend/components/workspace/motion.css", "utf8");
const context = vm.createContext({ console });
const introModule = new vm.SourceTextModule(
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
  { context },
);
await introModule.link(async (name) => {
  const values =
    name === "react" ? React : name === "react/jsx-runtime" ? jsxRuntime : null;
  assert.ok(values, "The introduction must use only existing React imports.");
  return new vm.SyntheticModule(
    Object.keys(values),
    function () {
      for (const [key, value] of Object.entries(values))
        this.setExport(key, value);
    },
    { context },
  );
});
await introModule.evaluate();
const {
  default: EclipseIntro,
  shouldShowIntro,
  INTRO_SESSION_KEY,
  INTRO_MAX_MS,
  INTRO_EXIT_MS,
} = introModule.namespace;
const render = (props) =>
  renderToStaticMarkup(React.createElement(EclipseIntro, props));

test("one-shot intro policy prioritizes ready content and reduced motion over normal and preview display", () => {
  for (const ready of [false, true])
    for (const seen of [false, true])
      for (const reducedMotion of [false, true])
        for (const preview of [false, true]) {
          const actual = shouldShowIntro({
            ready,
            seen,
            reducedMotion,
            preview,
          });
          assert.equal(actual, !ready && !reducedMotion && (!seen || preview));
        }
  assert.equal(
    shouldShowIntro({ ready: false, seen: true, reducedMotion: false }),
    false,
  );
  assert.equal(
    shouldShowIntro({ ready: false, seen: false, reducedMotion: false }),
    true,
  );
  assert.equal(INTRO_SESSION_KEY, "ss-x1-intro-seen");
  assert.ok(INTRO_MAX_MS <= 1050);
  assert.ok(INTRO_EXIT_MS <= 100);
});

test("already-ready server rendering has no optional overlay or delayed dashboard", () => {
  assert.equal(render({ ready: true }), "");
  assert.equal(render({ ready: true, preview: true }), "");
});

test("cold-entry SSR has immediate skip, inert SVG decoration and explicit nonblocking attributes", () => {
  const html = render({ ready: false });
  assert.match(html, /data-x1-intro=""/);
  assert.match(html, /data-phase="enter"/);
  assert.match(html, /data-preview="false"/);
  assert.match(html, /style="pointer-events:none"/);
  assert.match(html, /<button[^>]*type="button"[^>]*tabindex="0"/);
  assert.match(html, /Skip introduction/);
  assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
  assert.match(html, /aria-live="off"/);
  assert.doesNotMatch(
    html,
    /autofocus|aria-busy|progressbar|<audio|<video|<canvas|<iframe|\d+%/i,
  );
});

test("founder-approved GVV image and Strategic Souls X2 identity use the supplied asset", () => {
  const html = render({ ready: false });
  assert.match(html, /class="x2-eclipse-approved-logo" src="\/gvv-approved.jpg"/);
  assert.match(
    html,
    /<h1 class="x1-eclipse-title">STRATEGIC SOULS <span>X2<\/span><\/h1>/,
  );
  assert.match(
    css,
    /\.x1-eclipse-existing-mark\s*\{[^}]*width:\s*41px;[^}]*font:\s*44px\/1[^}]*letter-spacing:\s*-6px;/s,
  );
  assert.match(
    css,
    /\.x1-eclipse-brand-stack b\s*\{[^}]*font-size:\s*21px;[^}]*line-height:\s*1\.08;/s,
  );
});

test("repeat-session pre-paint guard and CSS-only failure deadline remove the overlay", () => {
  assert.match(
    css,
    /html\[data-x1-intro-seen\][^{]*\.x1-eclipse-intro:not\(\[data-preview="true"\]\)\s*\{\s*display:\s*none;/s,
  );
  assert.match(css, /@supports\s*\(animation-name:\s*x1-intro-lifetime\)/);
  assert.match(css, /animation:\s*x1-intro-lifetime\s+1100ms\s+linear\s+both/);
  assert.match(
    css,
    /@keyframes x1-intro-lifetime\s*\{[\s\S]*?100%\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;/,
  );
  assert.match(render({ ready: false, preview: true }), /data-preview="true"/);
  assert.doesNotMatch(
    source,
    /preventDefault|stopPropagation|\.focus\(|overflow\s*=\s*["']hidden|aria-modal|inert=/,
  );
});

test("pointer, keyboard, scroll, hidden-tab and motion preference changes dismiss and have cleanup", () => {
  for (const event of ["pointerdown", "keydown", "wheel", "scroll"]) {
    assert.ok(
      source.includes(`addEventListener("${event}"`),
      event + " listens",
    );
    assert.ok(
      source.includes(`removeEventListener("${event}"`),
      event + " cleans up",
    );
  }
  assert.ok(source.includes('document.addEventListener("visibilitychange"'));
  assert.ok(source.includes('document.removeEventListener("visibilitychange"'));
  assert.ok(source.includes('media?.addEventListener?.("change"'));
  assert.ok(source.includes('media?.removeEventListener?.("change"'));
  assert.match(source, /window\.clearTimeout\(timer\)/);
  assert.match(source, /window\.clearTimeout\(exitTimer\.current\)/);
  assert.doesNotMatch(
    source,
    /setInterval|requestAnimationFrame|fetch\(|localStorage|navigator\.(?:vibrate|sendBeacon)/,
  );
});

test("motion styles keep colors in canonical theme tokens, reserving blue for actual intro heading", () => {
  const colorValues = [
    ...css.matchAll(
      /(?:color|background|stroke|fill|border|outline)(?:-color)?:\s*([^;{}]+);/g,
    ),
  ]
    .map((match) => match[1])
    .join(" ");
  assert.doesNotMatch(
    colorValues,
    /#(?:[\da-f]{3,8})\b|rgba?\(|hsla?\(|\b(?:red|green|gold|purple|orange|emerald|mint|white)\b/i,
  );
  assert.match(
    css,
    /\.x1-eclipse-title\s*\{[^}]*color:\s*var\(--x1-title-blue\)/s,
  );
  assert.equal((css.match(/var\(--x1-title-blue\)/g) || []).length, 1);
  assert.match(css, /var\(--x1-text-primary\)/);
  assert.match(css, /var\(--x1-text-secondary\)/);
});

test("timing contracts remain bounded and reduced motion bypasses all optional first-party motion", () => {
  assert.match(
    css,
    /\.x1-dashboard\s*\{\s*animation:\s*x1-dashboard-enter\s+220ms/,
  );
  assert.match(css, /\.x1-tab-panel\s*\{\s*animation:\s*x1-tab-enter\s+150ms/);
  assert.match(
    css,
    /animation-delay:\s*clamp\(0ms,\s*var\(--x1-stagger\),\s*100ms\)/,
  );
  assert.match(css, /animation:\s*x1-modal-enter\s+180ms/);
  assert.match(css, /animation:\s*x1-save-check\s+460ms/);
  assert.match(css, /animation:\s*x1-super-pop\s+300ms/);
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.x1-eclipse-intro\s*\{\s*display:\s*none\s*!important;/s,
  );
  assert.match(
    css,
    /\.x1-app \*[^}]*animation:\s*none\s*!important;[^}]*transition:\s*none\s*!important;/s,
  );
  assert.doesNotMatch(css, /\binfinite\b/);
});
