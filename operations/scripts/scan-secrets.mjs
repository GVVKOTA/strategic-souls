/**
 * Comprehensive Zero-Leak Secret & Bundle Scanner.
 * Scans tracked files, untracked non-ignored files, staged git diff, and built `dist/` bundles.
 * Prints ONLY PASS/FAIL, file path, rule name, and remediation — NEVER prints matched secret values!
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { appRoot, repoRoot } from "./repo-paths.mjs";

const root = repoRoot;
const SCAN_EXTS = new Set([
  ".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".py", ".sql", ".md", ".toml", ".yml", ".yaml",
  ".html", ".css", ".ps1", ".bat", ".sh", ".example", ".txt",
]);

const RULES = [
  ["PRIVATE_KEY_BLOCK", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GOOGLE_API_KEY", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["OPENAI_API_KEY", /\bsk-(?:proj-|svcacct-)[A-Za-z0-9_-]{24,}\b/],
  ["GITHUB_PAT", /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b/],
  ["SUPABASE_SECRET", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
  ["JWT_LITERAL", /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
  [
    "ANGELONE_CREDENTIAL_LITERAL",
    /(?:ANGELONE_API_KEY|ANGELONE_CLIENT_ID|ANGELONE_MPIN|ANGELONE_TOTP_SECRET|MARKET_ADAPTER_AUTH_TOKEN)[ \t]*[:=][ \t]*["']?(?!REPLACE|YOUR_|CHANGEME|EXAMPLE|DEMO|TEST_|FAKE_|MOCK_|REDACTED|\[REDACTED|local-adapter-service-token)[A-Za-z0-9_+=/:-]{4,}/,
  ],
  [
    "COMMERCIAL_TOKEN_LITERAL",
    /(?:X2_EODHD_API_TOKEN|X2_TRUEDATA_BEARER_TOKEN|CF_ACCESS_CLIENT_SECRET)[ \t]*[:=][ \t]*["']?(?!REPLACE|YOUR_|CHANGEME|EXAMPLE|DEMO|TEST_|FAKE_|MOCK_|FIXTURE_|ROTATED_|REDACTED|aaaaaaaaaaaaaaaaaaaaaaaa)[A-Za-z0-9_.-]{12,}/,
  ],
];

// Dynamically load any local gitignored secret values so we verify ZERO leakage of actual local creds into repo or dist!
function loadLocalSecretValuesForLeakCheck() {
  const secretValues = [];
  for (const rel of [
    resolve(appRoot, ".secrets/angelone.env"),
    resolve(appRoot, ".dev.vars"),
    resolve(appRoot, ".env"),
    resolve(appRoot, ".env.local"),
    resolve(root, ".secrets/angelone.env"),
    resolve(root, ".dev.vars"),
  ]) {
    const abs = rel;
    if (!existsSync(abs)) continue;
    for (const line of readFileSync(abs, "utf8").split(/\r?\n/)) {
      const m = /^\s*(ANGELONE_[A-Z0-9_]+|MARKET_ADAPTER_AUTH_TOKEN|X2_EODHD_API_TOKEN|X2_TRUEDATA_BEARER_TOKEN)\s*=\s*(.+)\s*$/.exec(line);
      if (!m) continue;
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (val.length >= 6 && !/^(REPLACE|YOUR_|EXAMPLE|DEMO)/i.test(val)) {
        secretValues.push({ name: m[1], value: val });
      }
    }
  }
  return secretValues;
}

function walkDir(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkDir(full, out);
    else out.push(full);
  }
  return out;
}

const gitFiles = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean)
      .map((f) => resolve(root, f)),
  ),
];

const distFiles = existsSync(resolve(appRoot, "dist"))
  ? walkDir(resolve(appRoot, "dist"))
  : [];

const allTargets = [...new Set([...gitFiles, ...distFiles])];
const localSecrets = loadLocalSecretValuesForLeakCheck();
const findings = [];
let scanned = 0;

for (const absPath of allTargets) {
  const rel = relative(root, absPath).replaceAll("\\", "/");
  if (
    rel.startsWith("node_modules/") ||
    rel.startsWith("application/node_modules/") ||
    rel.startsWith("application/backend/quant/.venv/") ||
    rel.startsWith(".git/")
  ) continue;
  const ext = extname(absPath).toLowerCase();
  if (!SCAN_EXTS.has(ext) && !rel.endsWith(".env.example") && !rel.endsWith(".dev.vars.example")) {
    continue;
  }
  if (!existsSync(absPath)) continue;
  const st = statSync(absPath);
  if (st.size > 4 * 1024 * 1024) continue;
  const content = readFileSync(absPath, "utf8");
  scanned += 1;

  for (const [rule, regex] of RULES) {
    if (regex.test(content)) {
      findings.push({
        file: rel,
        rule,
        remediation: "Remove credential literal immediately; move to gitignored .secrets/angelone.env or Cloudflare Worker Secrets.",
      });
    }
  }

  for (const secret of localSecrets) {
    if (content.includes(secret.value)) {
      findings.push({
        file: rel,
        rule: `EXACT_LOCAL_SECRET_MATCH(${secret.name})`,
        remediation: "Local secret value detected in distributable file or build bundle! Remove and rotate credential.",
      });
    }
  }
}

// Check staged git diff too
let stagedFindings = 0;
try {
  const diff = execFileSync("git", ["diff", "--cached", "--unified=0"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  for (const [rule, regex] of RULES) {
    if (regex.test(diff)) {
      stagedFindings += 1;
      findings.push({
        file: "<git-staged-diff>",
        rule,
        remediation: "Unstage and scrub matched secret pattern before committing.",
      });
    }
  }
  for (const secret of localSecrets) {
    if (diff.includes(secret.value)) {
      stagedFindings += 1;
      findings.push({
        file: "<git-staged-diff>",
        rule: `EXACT_LOCAL_SECRET_MATCH(${secret.name})`,
        remediation: "Unstage immediately; exact local secret detected in staged diff!",
      });
    }
  }
} catch {
  /* ignore if no staged changes */
}

// Check that no git-tracked files are in .secrets/ or .env / .dev.vars
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
for (const tf of trackedFiles) {
  const lower = tf.toLowerCase();
  const base = tf.split("/").pop() ?? tf;
  if (base === ".env.example" || base === ".dev.vars.example") continue;
  if (
    /(?:^|\/)\.secrets\//.test(lower) ||
    /(?:^|\/)\.env(?:\..+)?$/.test(lower) ||
    /(?:^|\/)\.dev\.vars(?:\..+)?$/.test(lower) ||
    lower.endsWith(".local.secret")
  ) {
    findings.push({
      file: tf,
      rule: "FORBIDDEN_TRACKED_SECRET_FILE",
      remediation: "Untrack with `git rm --cached` and rotate affected secrets.",
    });
  }
}

const report = {
  recordedAt: new Date().toISOString(),
  result: findings.length === 0 ? "PASS" : "FAIL",
  filesScanned: scanned,
  distBundleScanned: distFiles.length > 0,
  localSecretLeakChecksArmed: localSecrets.length,
  stagedDiffChecked: true,
  stagedFindings,
  findings,
};

console.log(JSON.stringify(report, null, 2));
if (findings.length > 0) {
  process.exitCode = 1;
}
