/** Independent pure geometry checks. These do not claim WebGL, pointer or device performance QA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function importTs(file) {
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const { xyz, project, clusterVenues, greatCircle } = await importTs('lib/x1/globe.ts');
const { EXCHANGES } = await importTs('lib/x1/exchanges.ts');
const almost = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} near ${expected} within ${tolerance}`);
const radius = (vertices, index) => Math.hypot(...vertices.slice(index * 3, index * 3 + 3));

test('Globe cardinal coordinates preserve radius and east/north/front orientation', () => {
  const cases = [[{ lat: 0, lon: 0 }, [0, 0, 1]], [{ lat: 0, lon: 90 }, [1, 0, 0]], [{ lat: 0, lon: -90 }, [-1, 0, 0]], [{ lat: 90, lon: 0 }, [0, 1, 0]], [{ lat: -90, lon: 0 }, [0, -1, 0]]];
  for (const [point, expected] of cases) xyz(point).forEach((v, i) => almost(v, expected[i]));
  for (let lat = -90; lat <= 90; lat += 15) for (let lon = -180; lon <= 180; lon += 15) {
    almost(Math.hypot(...xyz({ lat, lon })), 1);
    almost(Math.hypot(...xyz({ lat, lon }, 2.4)), 2.4);
    xyz({ lat, lon }).forEach((v, i) => almost(v, xyz({ lat, lon: lon + 360 })[i]));
  }
});

test('CPU hit projection matches the vertex shader in CSS pixels across aspect ratios', () => {
  for (const [width, height] of [[320, 300], [390, 320], [760, 360]]) for (const yaw of [-2.7, -.65, 0, 1.8]) for (const pitch of [-1.1, .2, 1]) for (const zoom of [.8, 1, 1.35]) for (const venue of EXCHANGES) {
    const [x, y, z] = xyz(venue), a = Math.cos(yaw) * x + Math.sin(yaw) * z, b = -Math.sin(yaw) * x + Math.cos(yaw) * z;
    const c = Math.cos(pitch) * y - Math.sin(pitch) * b, d = Math.sin(pitch) * y + Math.cos(pitch) * b;
    const scale = Math.min(.84, .84 * width / height) * zoom;
    const projected = project(venue, yaw, pitch, width, height, zoom);
    almost(projected.x, (a * scale / (width / height) + 1) * width / 2);
    almost(projected.y, (1 - c * scale) * height / 2);
    almost(projected.z, d); assert.equal(projected.visible, d > 0);
  }
});

test('Selecting every registered venue can center it without mirroring hemispheres', () => {
  for (const venue of EXCHANGES) {
    const p = project(venue, -venue.lon * Math.PI / 180, venue.lat * Math.PI / 180, 390, 320);
    almost(p.x, 195); almost(p.y, 160); almost(p.z, 1); assert.equal(p.visible, true);
  }
  assert.equal(project({ lat: 0, lon: 0 }, 0, 0, 390, 320).visible, true);
  assert.equal(project({ lat: 0, lon: 180 }, 0, 0, 390, 320).visible, false);
});

test('Projection zoom clamps to the supported bounds', () => {
  const point = { lat: 24, lon: 40 };
  const low = project(point, 0, 0, 390, 320, -50), expectedLow = project(point, 0, 0, 390, 320, .8);
  const high = project(point, 0, 0, 390, 320, 50), expectedHigh = project(point, 0, 0, 390, 320, 1.35);
  almost(low.x, expectedLow.x); almost(low.y, expectedLow.y); almost(high.x, expectedHigh.x); almost(high.y, expectedHigh.y);
});

test('Co-located venues cluster without dropping identifiers or mutating the registry', () => {
  const snapshot = JSON.stringify(EXCHANGES), clusters = clusterVenues(EXCHANGES);
  assert.equal(clusters.length, EXCHANGES.length - 3);
  const identifiers = clusters.flatMap(c => c.venues.map(v => v.id));
  assert.equal(identifiers.length, EXCHANGES.length); assert.equal(new Set(identifiers).size, EXCHANGES.length);
  for (const ids of [['XNYS', 'XNAS'], ['XCME', 'XCBT'], ['XNSE', 'XBOM']]) assert.ok(clusters.some(c => ids.every(id => c.venues.some(v => v.id === id))));
  assert.equal(JSON.stringify(EXCHANGES), snapshot);
  const signature = list => clusterVenues(list).map(c => c.venues.map(v => v.id).sort().join('|')).sort();
  assert.deepEqual(signature(EXCHANGES), signature([...EXCHANGES].reverse()));
});

test('Ordinary great-circle paths have exact endpoints, bounded elevation and reversal symmetry', () => {
  const pairs = [[EXCHANGES[0], EXCHANGES[15]], [EXCHANGES[6], EXCHANGES[23]], [{ lat: 0, lon: 179 }, { lat: 20, lon: -179 }]];
  for (const [a, b] of pairs) {
    const curve = greatCircle(a, b, 48), reversed = greatCircle(b, a, 48);
    assert.equal(curve.length, 49 * 3); assert.ok(curve.every(Number.isFinite));
    xyz(a, 1.014).forEach((value, i) => almost(curve[i], value));
    xyz(b, 1.014).forEach((value, i) => almost(curve[curve.length - 3 + i], value));
    for (let k = 0; k <= 48; k++) {
      almost(radius(curve, k), 1.014 + Math.sin(Math.PI * k / 48) * .11, 1e-8);
      for (let j = 0; j < 3; j++) almost(curve[k * 3 + j], reversed[(48 - k) * 3 + j], 1e-8);
    }
  }
});

test('Coincident and nearly coincident great-circle paths stay finite and above the sphere', () => {
  for (const b of [{ lat: 40, lon: 20 }, { lat: 40 + 1e-10, lon: 20 + 1e-10 }]) {
    const curve = greatCircle({ lat: 40, lon: 20 }, b, 48);
    assert.ok(curve.every(Number.isFinite));
    for (let k = 0; k <= 48; k++) almost(radius(curve, k), 1.014 + Math.sin(Math.PI * k / 48) * .11, 1e-8);
  }
});

test('Antipodal and nearly antipodal great-circle paths use a stable normalized plane', () => {
  for (const [a, b] of [[{ lat: 40, lon: 20 }, { lat: -40, lon: -160 }], [{ lat: 40, lon: 20 }, { lat: -40 + 1e-7, lon: -160 }], [{ lat: 90, lon: 0 }, { lat: -90, lon: 0 }]]) {
    const curve = greatCircle(a, b, 48);
    assert.equal(curve.length, 49 * 3); assert.ok(curve.every(Number.isFinite));
    for (let k = 0; k <= 48; k++) almost(radius(curve, k), 1.014 + Math.sin(Math.PI * k / 48) * .11, 1e-7);
    xyz(a, 1.014).forEach((value, i) => almost(curve[i], value, 1e-7));
    xyz(b, 1.014).forEach((value, i) => almost(curve[curve.length - 3 + i], value, 1e-7));
  }
});
