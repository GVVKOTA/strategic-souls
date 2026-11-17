/** Reproducible release checks; writes bounded tool logs, never runtime secrets. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const output = resolve(process.argv[2] || '.sites-runtime/x2-checks');
mkdirSync(output, { recursive: true });
const checks = [
  ['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['lint', ['node_modules/eslint/bin/eslint.js', 'app', 'frontend', 'backend', 'database']],
  ['tests', ['--experimental-strip-types', '--experimental-vm-modules', '--test', 'tests/**/*.test.mjs']],
];
const report = { recordedAt: new Date().toISOString(), node: process.version, checks: [] };
for (const [name, args] of checks) {
  const start = performance.now();
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const log = `${result.stdout || ''}${result.stderr || ''}${result.error ? String(result.error) : ''}`;
  writeFileSync(join(output, `release-${name}.log`), log);
  const row = { name, exitCode: result.status, signal: result.signal, durationMs: Math.round(performance.now() - start) };
  report.checks.push(row);
  writeFileSync(join(output, 'BUILD_CHECKS.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(row));
  if (result.status !== 0) process.exit(result.status || 1);
}
