/** X6 unit tests: 50-avatar preset integrity & SS Earth conflict normalization/filtering. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

const context = vm.createContext({
  console,
  URL,
  Date,
  Math,
  Number,
  JSON,
  Set,
  Map,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch,
});
const cache = new Map();
let mockEnv = {};

async function load(path) {
  const file = resolve(path);
  if (cache.has(file)) return cache.get(file);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const m = new vm.SourceTextModule(code, { context, identifier: file });
  cache.set(file, m);
  await m.link(async (spec, refer) => {
    if (spec === 'cloudflare:workers') {
      if (!cache.has(spec)) {
        cache.set(
          spec,
          new vm.SyntheticModule(
            ['env'],
            function () {
              this.setExport(
                'env',
                new Proxy(
                  {},
                  {
                    get: (_t, prop) => mockEnv[prop],
                  },
                ),
              );
            },
            { context },
          ),
        );
      }
      return cache.get(spec);
    }
    let target = resolve(dirname(refer.identifier), spec);
    if (!existsSync(target)) target += '.ts';
    return load(target);
  });
  await m.evaluate();
  return m;
}

const avatars = (await load('backend/services/profile/avatars.ts')).namespace;
const conflicts = (await load('backend/services/earth/conflicts.ts')).namespace;
const locations = (await load('backend/services/earth/locations.ts')).namespace;

test('50-avatar catalog has exactly 50 unique presets across 5x10 collections with distinct safe SVGs', () => {
  assert.equal(avatars.AVATAR_CATALOG.length, 50);
  const namedCollections = avatars.AVATAR_COLLECTIONS.filter((c) => c.id !== 'all');
  assert.equal(namedCollections.length, 5);
  assert.equal(avatars.AVATAR_IDS.size, 50);

  const byCollection = new Map();
  const svgHashes = new Set();

  for (const preset of avatars.AVATAR_CATALOG) {
    byCollection.set(preset.collection, (byCollection.get(preset.collection) || 0) + 1);
    assert.ok(avatars.isValidAvatarPresetId(preset.id), `Invalid preset id ${preset.id}`);
    const filePath = resolve('public', preset.assetPath.replace(/^\//, ''));
    assert.ok(existsSync(filePath), `Missing SVG asset: ${filePath}`);
    const svg = readFileSync(filePath, 'utf8');
    assert.ok(svg.includes('<svg') && svg.includes('</svg>'), `Invalid SVG markup: ${preset.id}`);
    assert.ok(!/<script|onload=|onerror=|javascript:/i.test(svg), `Unsafe SVG script in ${preset.id}`);
    svgHashes.add(svg);
  }

  for (const col of namedCollections) {
    assert.equal(byCollection.get(col.id), 10, `Collection ${col.id} must have exactly 10 presets`);
  }
  assert.equal(svgHashes.size, 50, 'All 50 avatar SVG files must be visually distinct');

  // Legacy name mapping and invalid fallback
  assert.equal(avatars.normalizeAvatarId('mint'), 'a01');
  assert.equal(avatars.normalizeAvatarId('e10'), 'e10');
  assert.equal(avatars.normalizeAvatarId('https://evil.invalid/x.png'), 'a01');
  assert.equal(avatars.isValidAvatarPresetId('https://evil.invalid/x.png'), false);
});

test('SS Earth coordinate validation handles dateline wrap and rejects invalid/NaN values', () => {
  assert.equal(conflicts.normalizeLongitude(181), -179);
  assert.equal(conflicts.normalizeLongitude(-181), 179);
  assert.equal(conflicts.normalizeLongitude(180), 180);
  assert.equal(conflicts.normalizeLongitude(-180), -180);
  const validCoord = conflicts.validateCoordinates(28.6139, 77.209);
  assert.equal(validCoord?.lat, 28.6139);
  assert.equal(validCoord?.lon, 77.209);
  assert.equal(conflicts.validateCoordinates(95, 10), null);
  assert.equal(conflicts.validateCoordinates(Number.NaN, 10), null);
  assert.equal(conflicts.validateCoordinates('bad', 10), null);
});

test('UCDP & ACLED normalizers preserve null fatalities, filter non-violent protests, dedupe and aggregate hotspots', () => {
  const nowIso = '2026-11-21T10:00:00.000Z';
  const ucdp1 = conflicts.normalizeUcdpRecord(
    {
      id: '1001',
      latitude: 48.5,
      longitude: 35.1,
      date_start: '2026-11-18',
      type_of_violence: 1,
      where_prec: 2,
      country: 'Ukraine',
      adm_1: 'Dnipropetrovsk',
      where_coordinates: 'Dnipro',
      conflict_name: 'Sample state-based record',
      best: null,
    },
    nowIso,
  );
  assert.ok(ucdp1);
  assert.equal(ucdp1.fatalitiesEstimate, null, 'Unknown fatalities must stay null, never 0');
  assert.equal(ucdp1.normalizedCategory, 'BATTLES');

  const ucdpDuplicate = conflicts.normalizeUcdpRecord(
    {
      id: '1001',
      latitude: 48.5,
      longitude: 35.1,
      date_start: '2026-11-18',
      type_of_violence: 1,
      where_prec: 2,
      country: 'Ukraine',
      adm_1: 'Dnipropetrovsk',
      best: 3,
    },
    nowIso,
  );

  // Peaceful protest must be excluded from conflict red markers
  const acledProtest = conflicts.normalizeAcledRecord(
    {
      event_id_cnty: 'IND100',
      event_type: 'Protests',
      latitude: 28.6,
      longitude: 77.2,
      event_date: '2026-11-19',
      country: 'India',
    },
    nowIso,
  );
  assert.equal(acledProtest, null);

  const acledValid = conflicts.normalizeAcledRecord(
    {
      event_id_cnty: 'SDN200',
      event_type: 'Explosions/Remote violence',
      latitude: 15.5,
      longitude: 32.5,
      event_date: '2026-11-20',
      country: 'Sudan',
      admin1: 'Khartoum',
      location: 'Khartoum',
      fatalities: 4,
    },
    nowIso,
  );
  assert.ok(acledValid);
  assert.equal(acledValid.normalizedCategory, 'EXPLOSIONS_REMOTE_VIOLENCE');
  assert.equal(acledValid.fatalitiesEstimate, 4);

  const filtered = conflicts.dedupeAndFilterConflicts(
    [ucdp1, ucdpDuplicate, acledValid],
    { period: '30d', nowMs: Date.parse(nowIso) },
  );
  assert.equal(filtered.events.length, 2, 'Duplicate eventId must be deduplicated');
  assert.equal(filtered.hotspots.length, 2);
  for (const h of filtered.hotspots) {
    assert.ok(Number.isFinite(h.latitude) && Number.isFinite(h.longitude));
  }

  const byCountry = conflicts.dedupeAndFilterConflicts(
    [ucdp1, acledValid],
    { period: '30d', country: 'Sudan', nowMs: Date.parse(nowIso) },
  );
  assert.equal(byCountry.events.length, 1);
  assert.equal(byCountry.events[0].countryName, 'Sudan');
});

test('getConflictIntelligence fails closed honestly with NOT_CONFIGURED when no token secrets are set', async () => {
  mockEnv = {};
  conflicts.clearConflictCacheForTests();
  const res = await conflicts.getConflictIntelligence({ period: '30d' });
  assert.equal(res.status, 'NOT_CONFIGURED');
  assert.equal(res.events.length, 0);
  assert.equal(res.hotspots.length, 0);
  assert.equal(res.summary.totalEvents, null, 'Must not fabricate 0 conflicts when unconfigured');
  assert.equal(res.summary.isLive, false);
  assert.ok(res.setupHint && res.setupHint.includes('UCDP_ACCESS_TOKEN'));
});

test('EARTH_REGIONS search resolves curated countries cleanly', () => {
  assert.ok(locations.EARTH_REGIONS.length >= 20);
  const hits = locations.searchEarthRegions('india');
  assert.ok(hits.some((r) => r.id === 'IN'));
});
