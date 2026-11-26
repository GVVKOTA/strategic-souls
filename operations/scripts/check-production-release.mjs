import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const worker = "strategic-souls";
const origin = `https://${worker}.vishnukota20071005.workers.dev`;
const configFile = "dist/server/wrangler.json";
const databaseId = "1cda2b05-6b99-4d04-896f-b3542ad2ce7f";
const adapterId = "01a2095b-f466-7c90-a813-4fad03735504";
const indiaApiHost = "stock.indianapi.in";
const shaPattern = /^[\da-f]{40}$/;
const versionPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/;

function verify(condition, reason) {
  if (!condition) throw new Error(reason);
}

function run(command, args, timeout = 60_000) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout, maxBuffer: 4_000_000 }).trim();
  } catch {
    throw new Error(`${command === process.execPath ? "Wrangler" : command} ${args[0] === "node_modules/wrangler/bin/wrangler.js" ? args.slice(1, 3).join(" ") : args[0]} failed. Check the authorized release run.`);
  }
}

function wrangler(args, timeout) {
  return run(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...args, "--config", configFile], timeout);
}

function checkArtifact(expectedSha) {
  verify(shaPattern.test(expectedSha), "A full tested Git commit SHA is required.");
  verify(run("git", ["rev-parse", "HEAD"]) === expectedSha, "Checkout differs from the intended Git commit.");
  verify(!run("git", ["status", "--porcelain"]), "Use a clean checkout for a release build.");
  verify(existsSync(configFile), "Build the Worker before checking the deployment artifact.");
  const config = JSON.parse(readFileSync(configFile, "utf8"));
  verify(config.name === worker, "Unexpected Worker target.");
  const db = config.d1_databases?.find((entry) => entry.binding === "DB");
  verify(db?.database_name === "ss" && db.database_id === databaseId, "Production D1 binding is missing or mismatched.");
  verify(config.vpc_services?.some((entry) => entry.binding === "MARKET_DATA_ADAPTER" && entry.service_id === adapterId),
    "Production private adapter binding is missing or mismatched.");
  verify(config.version_metadata?.binding === "CF_VERSION_METADATA", "Worker version metadata is missing.");
  verify(config.vars?.INDIA_API_HOST === indiaApiHost && config.vars.ENABLE_PRIVATE_BROKER_DATA === "true",
    "Required production configuration is missing.");
  const server = dirname(configFile);
  verify(config.main && existsSync(resolve(server, config.main)), "Worker bundle is missing.");
  verify(config.assets?.directory && existsSync(resolve(server, config.assets.directory, "_next", "static")), "The generated static assets are missing.");
  const scripts = readdirSync(server, { recursive: true }).filter((file) => file.endsWith(".js"));
  verify(scripts.some((file) => readFileSync(resolve(server, file), "utf8").includes(expectedSha)), "Worker bundle lacks the exact Git SHA.");
}

function checkVersion(version) {
  verify(versionPattern.test(version), "Supply a Worker version UUID.");
  const row = JSON.parse(wrangler(["versions", "view", version, "--json"]));
  verify(row.id === version, "Unexpected Worker version returned by Cloudflare.");
  const bindings = row.resources?.bindings ?? [];
  const binding = (name, type) => bindings.find((item) => item.name === name && item.type === type);
  verify(binding("DB", "d1")?.database_id === databaseId, "Uploaded Worker has a mismatched production D1 binding.");
  verify(binding("MARKET_DATA_ADAPTER", "vpc_service")?.service_id === adapterId, "Uploaded Worker has a mismatched private adapter binding.");
  verify(binding("INDIA_API_HOST", "plain_text")?.text === indiaApiHost, "Uploaded Worker is missing the Indian API host.");
  verify(binding("ENABLE_PRIVATE_BROKER_DATA", "plain_text")?.text === "true", "Uploaded Worker is missing private market data configuration.");
  verify(binding("CF_VERSION_METADATA", "version_metadata"), "Uploaded Worker is missing version metadata.");
  for (const name of ["X2_OWNER_SUBJECT", "MARKET_ADAPTER_AUTH_TOKEN", "BHARATSTOCK_API_KEY", "INDIA_API_KEY"]) {
    verify(binding(name, "secret_text"), `Uploaded Worker is missing the ${name} binding.`);
  }
  return { number: row.number, uploadedAtUtc: row.metadata?.created_on, tag: row.annotations?.["workers/tag"],
    bindings: bindings.map(({ name, type }) => ({ name, type })) };
}

function remoteMain() {
  const line = run("git", ["ls-remote", "origin", "refs/heads/main"]);
  return line.split(/\s+/)[0];
}

async function smoke(version, sha, override) {
  const headers = override ? { "Cloudflare-Workers-Version-Overrides": `${worker}="${version}"` } : {};
  const get = (path) => fetch(origin + path, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
  let identity;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const release = await get("/api/release");
    verify(release.ok && /no-store/i.test(release.headers.get("Cache-Control") ?? ""), "Live build identity endpoint is unavailable or cacheable.");
    identity = await release.json();
    if (identity.buildCommit === sha && identity.workerVersionId === version && identity.provenance === "IDENTIFIED") break;
    verify(attempt < 4, "The public hostname returned a different commit or Worker version after propagation checks.");
    await new Promise((done) => setTimeout(done, 2_000));
  }

  const [overview, home] = await Promise.all([get("/api/markets/overview?source=public-cache"), get("/")]);
  verify(overview.ok && home.ok, "Overview or homepage smoke test failed.");
  const { cards } = await overview.json();
  verify(Array.isArray(cards) && cards.length === 8 && new Set(cards.map((card) => card.canonicalId)).size === 8,
    "Overview did not return eight distinct market cards.");
  verify(cards.every((card) => card.value === null || card.redistributable === true), "Guest saw a private market price.");
  const html = await home.text();
  const htmlAssets = [...html.matchAll(/(?:href|src|srcSet)="(\/[^"\s]+\.(?:js|css|woff2|png|jpe?g|webp|svg))"/gi)].map(match => match[1]);
  verify(htmlAssets.some(path => path.startsWith("/_next/static/")), "Homepage did not reference generated static assets.");
  const assets = [...new Set([...htmlAssets, "/eclipse-horizon.webp", "/eclipse-horizon-mobile.webp"])];
  for (let start = 0; start < assets.length; start += 8) {
    await Promise.all(assets.slice(start, start + 8).map(async (path) => {
      const response = await get(path);
      const expected = path.endsWith(".js") ? /javascript/ : path.endsWith(".css") ? /text\/css/
        : path.endsWith(".woff2") ? /font\/woff2|application\/font-woff/ : /image\//;
      verify(response.ok && expected.test(response.headers.get("Content-Type") ?? ""), "A homepage asset is unavailable or returned an unexpected type.");
      await response.body?.cancel();
    }));
  }
  return { release: identity.release, marker: identity.revisionMarker, guestCards: cards.length,
    publicDataCards: cards.filter((card) => card.value !== null).length, assets: assets.length };
}

try {
  const [mode = "artifact", version] = process.argv.slice(2);
  const commit = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? run("git", ["rev-parse", "HEAD"]);
  const buildId = process.env.WORKERS_CI_BUILD_UUID ?? null;
  if (mode === "artifact") {
    checkArtifact(commit);
    console.log(JSON.stringify({ phase: "artifact-verified", commit }));
  } else if (mode === "stage") {
    checkArtifact(commit);
    verify(process.env.WORKERS_CI_BRANCH ? process.env.WORKERS_CI_BRANCH === "main" : remoteMain() === commit,
      "Only the tested main commit may be staged by this command.");
    const upload = wrangler(["versions", "upload", "--keep-vars", "--tag", `main-${commit}`, "--message", "Production candidate pending traffic verification"], 240_000);
    const uploadedVersion = upload.match(/Worker Version ID:\s*([\da-f-]{36})/i)?.[1];
    verify(uploadedVersion, "Wrangler did not return an uploaded version UUID.");
    const inventory = checkVersion(uploadedVersion);
    console.log(JSON.stringify({ phase: "uploaded", commit, buildId, version: uploadedVersion, trafficPercent: 0, ...inventory }));
  } else if (mode === "candidate" || mode === "live") {
    verify(shaPattern.test(commit) && remoteMain() === commit, "The intended commit does not match the current remote main.");
    const inventory = checkVersion(version ?? "");
    verify(inventory.tag === `main-${commit}`, "This version was not staged as a production candidate for main.");
    const deployments = JSON.parse(wrangler(["deployments", "list", "--json"]));
    const latest = deployments.sort((a, b) => b.created_on.localeCompare(a.created_on))[0];
    const trafficPercent = latest?.versions?.find((row) => row.version_id === version)?.percentage;
    verify(trafficPercent === (mode === "live" ? 100 : 0), "The version is not assigned the expected traffic percentage.");
    const checks = await smoke(version, commit, mode === "candidate");
    console.log(JSON.stringify({ phase: mode === "live" ? "live-verified" : "candidate-verified", commit, buildId, version,
      deployment: latest.id, deployedAtUtc: latest.created_on, trafficPercent, ...inventory, ...checks }));
  } else {
    throw new Error("Use artifact, stage, candidate <version>, or live <version>.");
  }
} catch (error) {
  console.error(`Production release check failed. ${error.message}`);
  process.exitCode = 1;
}
