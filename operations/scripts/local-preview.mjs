/** Local development only. Never used by the production Cloudflare Worker. */
import { createServer, request as proxyRequest } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { configureToolEnvironment } from './tool-environment.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
configureToolEnvironment(root);
const mode = process.argv[2];
if (!['setup', 'serve', 'launch'].includes(mode) || process.argv.length !== 3)
  throw new Error('Use npm run dev, local:setup, or local:serve. No remote mode is supported.');
const publicPort = 5173;
const workerPort = 8787;
const upstream = `http://127.0.0.1:${workerPort}`;
const configPath = resolve('.sites-runtime/local-preview.json');
const statePath = resolve('.wrangler/local-preview');
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const environmentModule = pathToFileURL(resolve('operations/scripts/sites-env.mjs')).href;

function configuration() {
  if (!existsSync('dist/server/wrangler.json'))
    throw new Error('Build output is missing. Run npm run build before local:setup.');
  const built = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
  return {
    name: 'strategic-souls-local',
    main: resolve('dist/server', built.main),
    compatibility_date: built.compatibility_date,
    compatibility_flags: built.compatibility_flags,
    no_bundle: built.no_bundle,
    rules: built.rules,
    assets: { ...built.assets, directory: resolve('dist/server', built.assets.directory) },
    d1_databases: [{ binding: 'DB', database_name: 'strategic-souls-local',
      database_id: '00000000-0000-4000-8000-000000000000', migrations_dir: resolve('drizzle') }],
  };
}
function runNode(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (mode === 'launch') runNode(['operations/scripts/run-framework.mjs', 'build']);

mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(configPath, JSON.stringify(configuration(), null, 2));
const args = ['--import', environmentModule, wrangler];
if (mode !== 'serve') {
  runNode([...args, 'd1', 'migrations', 'apply', 'DB',
    '--config', configPath, '--local', '--persist-to', statePath]);
  console.log('Local migrations complete. No accounts, messages or market fixtures were seeded.');
  if (mode === 'setup') process.exit(0);
}

const worker = spawn(process.execPath, [...args, 'dev', '--config', configPath, '--local',
  '--persist-to', statePath, '--ip', '127.0.0.1', '--port', String(workerPort),
  '--inspector-port', '0'], { stdio: 'inherit' });
let stopping = false;
const server = createServer((req, res) => {
  const host = req.headers.host;
  const remote = req.socket.remoteAddress;
  if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(remote) ||
      ![`127.0.0.1:${publicPort}`, `localhost:${publicPort}`].includes(host)) {
    res.writeHead(403).end('Loopback development only.'); return;
  }
  if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== `http://${host}`) {
    res.writeHead(403).end('Local write requires the same origin.'); return;
  }
  const headers = { ...req.headers, host: `127.0.0.1:${workerPort}` };
  if (headers.origin) headers.origin = upstream;
  const outgoing = proxyRequest(upstream + req.url, { method: req.method, headers }, incoming => {
    res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res);
  });
  outgoing.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Local Worker unavailable.'); });
  req.pipe(outgoing);
});
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server.close(); worker.kill();
  process.exitCode = code;
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
worker.once('error', error => { console.error(error.message); stop(1); });
worker.once('exit', code => { if (!stopping) stop(code || 1); });
server.on('error', error => { console.error(error.message); stop(1); });
server.listen(publicPort, '127.0.0.1', () => {
  console.log(`LOCAL DEVELOPMENT ONLY: http://127.0.0.1:${publicPort}`);
  console.log('Isolated local Cloudflare Worker + local D1. Sign up or sign in directly in the app.');
  console.log('Stop both owned processes with Ctrl+C.');
});
