import { execFileSync } from "node:child_process";
import { repoRoot } from "./repo-paths.mjs";

const EXPECTED_DIRS = [".github", "application", "database", "documentation", "operations"];
const EXPECTED_ROOT_FILES = ["README.md"];

const indexLines = execFileSync("git", ["ls-files", "--stage", "-z"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const rootDirs = new Set();
const rootFiles = [];
const lockfiles = [];
const violations = [];

for (const entry of indexLines) {
  const tab = entry.indexOf("\t");
  if (tab === -1) continue;
  const meta = entry.slice(0, tab);
  const mode = meta.split(/\s+/)[0];
  const relPath = entry.slice(tab + 1);

  if (mode === "120000") violations.push({ path: relPath, reason: "FORBIDDEN_SYMLINK" });
  if (mode === "160000") violations.push({ path: relPath, reason: "FORBIDDEN_SUBMODULE" });

  const slash = relPath.indexOf("/");
  if (slash === -1) {
    rootFiles.push(relPath);
  } else {
    rootDirs.add(relPath.slice(0, slash));
  }

  if (
    relPath.endsWith("pnpm-lock.yaml") ||
    relPath.endsWith("package-lock.json") ||
    relPath.endsWith("yarn.lock") ||
    relPath.endsWith("bun.lock") ||
    relPath.endsWith("bun.lockb")
  ) {
    lockfiles.push(relPath);
  }

  const lower = relPath.toLowerCase();
  const base = relPath.split("/").pop() ?? relPath;
  const isAllowedTemplate = base === ".env.example" || base === ".dev.vars.example";

  if (!isAllowedTemplate && /(?:^|\/)\.env(?:\..+)?$/.test(lower)) {
    violations.push({ path: relPath, reason: "FORBIDDEN_TRACKED_ENV_FILE" });
  }
  if (!isAllowedTemplate && /(?:^|\/)\.dev\.vars(?:\..+)?$/.test(lower)) {
    violations.push({ path: relPath, reason: "FORBIDDEN_TRACKED_DEV_VARS" });
  }
  if (/(?:^|\/)\.secrets\//.test(lower) || /\.(?:local\.secret|pem|key|p12|pfx)$/.test(lower)) {
    violations.push({ path: relPath, reason: "FORBIDDEN_TRACKED_SECRET" });
  }
  if (/(?:^|\/)(?:node_modules|dist|\.next|\.vinext|\.wrangler|\.sites-runtime|\.venv|__pycache__|\.pytest_cache)\//.test(lower)) {
    violations.push({ path: relPath, reason: "FORBIDDEN_TRACKED_RUNTIME_OR_BUILD_ARTIFACT" });
  }
  if (/\.(?:sqlite|sqlite3|db|db-shm|db-wal|bundle)$/.test(lower)) {
    violations.push({ path: relPath, reason: "FORBIDDEN_TRACKED_DB_OR_BUNDLE" });
  }
}

const actualDirs = [...rootDirs].sort();
const actualRootFiles = [...rootFiles].sort();

if (JSON.stringify(actualDirs) !== JSON.stringify(EXPECTED_DIRS)) {
  violations.push({
    path: "<repo-root>",
    reason: `ROOT_DIR_MISMATCH expected=${JSON.stringify(EXPECTED_DIRS)} actual=${JSON.stringify(actualDirs)}`,
  });
}

if (JSON.stringify(actualRootFiles) !== JSON.stringify(EXPECTED_ROOT_FILES)) {
  violations.push({
    path: "<repo-root>",
    reason: `ROOT_FILE_MISMATCH expected=${JSON.stringify(EXPECTED_ROOT_FILES)} actual=${JSON.stringify(actualRootFiles)}`,
  });
}

if (JSON.stringify(lockfiles) !== JSON.stringify(["application/pnpm-lock.yaml"])) {
  violations.push({
    path: "<repo-root>",
    reason: `LOCKFILE_MISMATCH expected=["application/pnpm-lock.yaml"] actual=${JSON.stringify(lockfiles)}`,
  });
}

const summary = {
  result: violations.length === 0 ? "PASS" : "FAIL",
  trackedFiles: indexLines.length,
  rootDirs: actualDirs,
  rootFiles: actualRootFiles,
  lockfiles,
  violations,
};

console.log(JSON.stringify(summary, null, 2));
if (violations.length > 0) {
  process.exitCode = 1;
}
