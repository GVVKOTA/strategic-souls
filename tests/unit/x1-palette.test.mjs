/** Actual first-party CSS declarations, alias resolution and WCAG contrast maths.
 * This audit does not substitute for browser, screenshot or full accessibility QA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.resolve('@tailwindcss/postcss'));
const postcss = require('postcss');
const files = ['frontend/styles/globals.css', 'frontend/styles/v3.css', 'frontend/styles/x1.css', 'frontend/components/workspace/globe-visual.css', 'frontend/components/workspace/motion.css', 'frontend/styles/x2.css', 'frontend/features/global/data.css', 'frontend/features/strategy/research.css', 'frontend/features/community/social.css'].filter(existsSync);
const roots = files.map(file => ({ file, root: postcss.parse(readFileSync(file, 'utf8'), { from: file }) }));
const expected = {
  '--x1-bg': '#070809', '--x1-surface-1': '#101215', '--x1-surface-2': '#191C20', '--x1-surface-3': '#23272D',
  '--x1-divider': '#3B424C', '--x1-divider-strong': '#677382',
  '--x1-text-primary': '#E8EDF2', '--x1-text-secondary': '#CAD3DC', '--x1-text-tertiary': '#B9C3CE', '--x1-text-muted': '#A7B1BC',
  '--x1-title-blue': '#76C0FF', '--x1-title-blue-alt': '#94D0FF',
};
const variables = new Map();
const declarations = [];
for (const { file, root } of roots) root.walkDecls(decl => {
  declarations.push({ file, decl });
  if (decl.prop.startsWith('--')) variables.set(decl.prop, decl.value);
});
const location = (file, d) => `${file}:${d.source.start.line} ${d.parent.selector || d.parent.name} { ${d.prop}: ${d.value} }`;
function inMedia(decl, expression) {
  for (let parent = decl.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && parent.name === 'media' && expression.test(parent.params)) return true;
  return false;
}
function resolveVars(value, seen = []) {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name, fallback) => {
    assert.ok(!seen.includes(name), 'Colour alias cycle: ' + [...seen, name].join(' -> '));
    if (!variables.has(name)) { assert.ok(fallback, 'Unresolved CSS colour alias: ' + name); return fallback; }
    return resolveVars(variables.get(name), [...seen, name]);
  });
}
function rgb(hex) {
  let value = hex.replace('#', '');
  if (value.length === 3 || value.length === 4) value = value.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
}
const equalRgb = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < .01);
const neutralTokens = Object.entries(expected).filter(([name]) => !name.includes('blue')).map(([, value]) => rgb(value));
const blueTokens = [rgb(expected['--x1-title-blue']), rgb(expected['--x1-title-blue-alt'])];
function neutral(colour) { return Math.max(...colour) - Math.min(...colour) <= .01 || neutralTokens.some(v => equalRgb(v, colour)); }
function titleOnly(selector = '') {
  // Blue rules in these files use comma-separated ordinary heading selectors.
  return selector.split(',').every(s => /(?:^|[\s>+~])h[123](?:$|[\s>+~:.#\[])/.test(s.trim()) && !/(?:\bbutton\b|\bsvg\b|\bnav\b|badge|status)/.test(s));
}
function concreteColours(value) {
  const result = [...value.matchAll(/#[0-9a-f]{3,8}\b/ig)].map(m => rgb(m[0]));
  for (const m of value.matchAll(/\b(rgba?|hsla?|oklch|oklab|lch|lab)\(([^()]*)\)/ig)) {
    const name = m[1].toLowerCase(), parts = m[2].split(/[\s,/]+/).filter(Boolean);
    if (name.startsWith('rgb')) result.push(parts.slice(0, 3).map(v => v.endsWith('%') ? parseFloat(v) * 2.55 : Number(v)));
    else if (name.startsWith('hsl')) { assert.equal(parseFloat(parts[1]), 0, 'Saturated HSL outside the canonical palette: ' + m[0]); result.push([0, 0, 0]); }
    else if (name === 'oklch' || name === 'lch') { assert.equal(parseFloat(parts[1]), 0, 'Chromatic LCH outside the canonical palette: ' + m[0]); result.push([0, 0, 0]); }
    else { assert.equal(parseFloat(parts[1]), 0, 'Chromatic Lab outside the canonical palette: ' + m[0]); assert.equal(parseFloat(parts[2]), 0, 'Chromatic Lab outside the canonical palette: ' + m[0]); result.push([0, 0, 0]); }
  }
  assert.ok(!/\b(?:red|green|blue|gold|orange|purple|violet|cyan|magenta|yellow|lime|teal|navy|pink|salmon|olive|aqua|fuchsia)\b/i.test(value), 'Named chromatic CSS colour: ' + value);
  assert.ok(!/\b(?:color-mix|color)\(/i.test(value), 'New colour function requires an explicit palette audit: ' + value);
  return result;
}
function luminance(hex) {
  const channels = rgb(hex).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

test('One canonical X1 map has the exact founder colours and all aliases resolve', () => {
  for (const [name, value] of Object.entries(expected)) {
    const defs = declarations.filter(({ decl }) => decl.prop === name);
    assert.equal(defs.length, 1, name + ' must be defined exactly once');
    assert.equal(defs[0].file, 'frontend/styles/globals.css'); assert.equal(defs[0].decl.parent.selector, ':root');
    assert.equal(defs[0].decl.value.toUpperCase(), value);
    assert.equal(resolveVars('var(' + name + ')').toUpperCase(), value);
  }
  for (const alias of ['--mint', '--silver', '--muted', '--ink', '--negative', '--x-bg', '--x-surface', '--x-elevated', '--x-border', '--x-text', '--x-muted', '--x-accent', '--x-hover', '--x-positive', '--x-negative']) {
    assert.ok(variables.has(alias), alias + ' compatibility alias missing');
    const colours = concreteColours(resolveVars('var(' + alias + ')'));
    assert.ok(colours.length && colours.every(neutral), alias + ' must resolve to a neutral canonical token');
  }
});

test('CSS declarations contain neutral colours; blue is restricted to real h1/h2/h3 title colour', t => {
  let checked = 0, blueRules = 0;
  for (const { file, decl } of declarations) {
    if (!/(?:color|background|border|outline|shadow|fill|stroke|accent|caret|decoration)/i.test(decl.prop) && !decl.prop.startsWith('--')) continue;
    const resolved = resolveVars(decl.value), colours = concreteColours(resolved);
    for (const colour of colours) {
      checked++;
      if (neutral(colour)) continue;
      const isBlue = blueTokens.some(v => equalRgb(v, colour));
      assert.ok(isBlue, 'Noncanonical chromatic colour: ' + location(file, decl));
      const canonicalDefinition = ['--x1-title-blue', '--x1-title-blue-alt'].includes(decl.prop) && decl.parent.selector === ':root';
      assert.ok(canonicalDefinition || decl.prop === 'color' && titleOnly(decl.parent.selector), 'Blue escaped the heading-only rule: ' + location(file, decl));
      if (!canonicalDefinition) blueRules++;
    }
  }
  for (const file of ['frontend/features/legacy/workspace.tsx', 'frontend/features/v3/workspace.tsx', 'frontend/features/global/dashboard.tsx', 'frontend/components/workspace/strategy.tsx', 'frontend/components/workspace/shared.tsx']) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:fill|stroke|stopColor)="([^"]+)"/g)) {
      const value = resolveVars(match[1]);
      for (const colour of concreteColours(value)) assert.ok(neutral(colour), 'Chromatic SVG attribute in ' + file + ': ' + match[0]);
    }
  }
  assert.ok(checked > 400, 'Audit should inspect the real stylesheet declarations'); assert.ok(blueRules > 5);
  t.diagnostic(`Resolved ${checked} concrete colour uses across ${files.length} actual CSS files; ${blueRules} heading-only blue uses.`);
});

test('All four normal text tones exceed 4.5:1 on every matte surface', t => {
  const surfaces = ['--x1-bg', '--x1-surface-1', '--x1-surface-2', '--x1-surface-3'];
  const text = ['--x1-text-primary', '--x1-text-secondary', '--x1-text-tertiary', '--x1-text-muted'];
  let minimum = Infinity;
  for (const tone of text) for (const surface of surfaces) {
    const ratio = contrast(expected[tone], expected[surface]); minimum = Math.min(minimum, ratio);
    assert.ok(ratio >= 4.5, `${tone} on ${surface} has insufficient normal-text contrast: ${ratio}`);
  }
  for (const tone of ['--x1-title-blue', '--x1-title-blue-alt']) for (const surface of surfaces) assert.ok(contrast(expected[tone], expected[surface]) >= 4.5);
  t.diagnostic(`Lowest normal text contrast: ${minimum.toFixed(3)}:1. Static token math; browser opacity/third-party frames require separate QA.`);
});

test('No first-party glass blur or app-wide grayscale can defeat the title palette', () => {
  for (const { file, decl } of declarations) {
    if (/backdrop-filter/.test(decl.prop)) assert.equal(decl.value, 'none', location(file, decl));
    if (decl.prop === 'filter' && /grayscale/.test(decl.value)) assert.ok(!/(?:^|,)\s*(?:\.x1-app|body|\.v3-app|\.landing)\s*(?:,|$)/.test(decl.parent.selector || ''), 'Never grayscale an entire app: ' + location(file, decl));
  }
});

test('Ordinary metadata has a 12px declaration floor with explicit locked-logo and hidden-label exceptions', t => {
  const logo = [], small = [];
  for (const { file, decl } of declarations) {
    if (!['font', 'font-size'].includes(decl.prop)) continue;
    const selector = decl.parent.selector || '';
    for (const match of decl.value.matchAll(/\b(\d+(?:\.\d+)?)px\b/g)) {
      if (+match[1] >= 12 || +match[1] === 0) continue;
      if (/(?:brand|wordmark|v3-mark|eclipse-mark)/.test(selector)) logo.push(location(file, decl));
      else small.push(location(file, decl));
    }
  }
  assert.deepEqual(small, []);
  assert.ok(logo.some(line => /x1-brand small/.test(line) && /7px/.test(line)), 'Preserve the approved logo caption proportions.');
  const x1 = roots.find(r => r.file === 'frontend/styles/x1.css').root;
  const body = []; x1.walkRules('.x1-app', rule => rule.walkDecls('font', d => body.push(d.value)));
  assert.ok(body.some(value => /15px/.test(value)), 'Normal X1 body text remains 15px or more.');
  t.diagnostic(`Locked logo-only small-type exceptions recorded: ${logo.length}; normal metadata violations: 0.`);
});

test('Checkpoint brief and fixed market-card geometry remain in the real CSS', () => {
  const css = readFileSync('frontend/styles/x1.css', 'utf8');
  const root = postcss.parse(css), brief = [], cards = [];
  root.walkRules('.x1-private-brief', rule => rule.walkDecls(d => brief.push([d.prop, d.value])));
  assert.ok(brief.some(([p, v]) => p === 'grid-template-columns' && v === 'repeat(2, minmax(0, 1fr))'));
  assert.ok(brief.some(([p, v]) => p === 'min-height' && v === '44px'));
  root.walkRules('.x1-app .x1-metrics:not(.x1-ledger-metrics) > .x1-data-card', rule => rule.walkDecls('height', d => cards.push(d.value)));
  assert.ok(cards.includes('190px')); assert.ok(cards.includes('210px'));
  assert.ok(/prefers-reduced-motion:\s*reduce/.test(css)); assert.ok(/forced-colors:\s*active/.test(css));
});
