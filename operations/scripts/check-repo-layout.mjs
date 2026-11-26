import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "./repo-paths.mjs";

export const EXPECTED_DIRS = [
  ".github",
  "application",
  "archive",
  "database",
  "documentation",
  "operations",
];
export const EXPECTED_ROOT_FILES = ["README.md"];

const ARCHIVE_ALLOWED_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".pdf",
]);

const ARCHIVE_FORBIDDEN_BASENAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  "wrangler.json",
  "wrangler.jsonc",
  "wrangler.toml",
  "eslint.config.mjs",
  "vite.config.ts",
  "next.config.ts",
  "drizzle.config.ts",
]);

const ACTIVE_CODE_OR_WORKFLOW_EXTS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".py",
  ".yml",
  ".yaml",
  ".sh",
  ".ps1",
  ".bat",
  ".json",
]);

const ARCHIVE_DEPENDENCY_PATTERN =
  /(?:^|['"`\s=:(])(?:\.\.?\/)+archive\/|(?<![a-z0-9_-])archive\/(?:[a-z0-9_.-]+\.[a-z0-9]+|(?:historical-reports|release-history|design-history)\b)/i;

/**
 * Validate tracked Git index entries and active code/workflow contents against the
 * six-folder repository contract, secret hygiene, single lockfile, and non-runtime archive rules.
 */
export function validateRepoLayout(entries, activeFileContents = new Map()) {
  const rootDirs = new Set();
  const rootFiles = [];
  const lockfiles = [];
  const archiveFiles = [];
  const violations = [];

  for (const entry of entries) {
    const mode = entry.mode;
    const relPath = entry.path;

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
    const base = posix.basename(relPath);
    const baseLower = base.toLowerCase();
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

    if (relPath.startsWith("archive/")) {
      archiveFiles.push(relPath);
      const ext = extname(baseLower);
      if (ARCHIVE_FORBIDDEN_BASENAMES.has(baseLower)) {
        violations.push({ path: relPath, reason: "FORBIDDEN_ARCHIVE_MANIFEST_OR_CONFIG" });
      } else if (!ARCHIVE_ALLOWED_EXTENSIONS.has(ext)) {
        violations.push({
          path: relPath,
          reason: `FORBIDDEN_ARCHIVE_FILE_TYPE (${ext || "no-extension"})`,
        });
      }
    }

    if (
      (relPath.startsWith(".github/") ||
        relPath.startsWith("application/") ||
        relPath.startsWith("database/") ||
        relPath.startsWith("operations/")) &&
      relPath !== "operations/scripts/check-repo-layout.mjs" &&
      relPath !== "operations/scripts/check-repo-layout.test.mjs"
    ) {
      const ext = extname(baseLower);
      if (ACTIVE_CODE_OR_WORKFLOW_EXTS.has(ext) && activeFileContents.has(relPath)) {
        const text = activeFileContents.get(relPath) ?? "";
        if (ARCHIVE_DEPENDENCY_PATTERN.test(text)) {
          violations.push({
            path: relPath,
            reason: "ACTIVE_CODE_OR_WORKFLOW_REFERENCES_ARCHIVE",
          });
        }
      }
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

  return {
    result: violations.length === 0 ? "PASS" : "FAIL",
    trackedFiles: entries.length,
    archiveFiles: archiveFiles.length,
    rootDirs: actualDirs,
    rootFiles: actualRootFiles,
    lockfiles,
    violations,
  };
}

function runCli() {
  const indexLines = execFileSync("git", ["ls-files", "--stage", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

  const entries = [];
  const activeFileContents = new Map();

  for (const entry of indexLines) {
    const tab = entry.indexOf("\t");
    if (tab === -1) continue;
    const meta = entry.slice(0, tab);
    const mode = meta.split(/\s+/)[0];
    const relPath = entry.slice(tab + 1);
    entries.push({ mode, path: relPath });

    if (
      (relPath.startsWith(".github/") ||
        relPath.startsWith("application/") ||
        relPath.startsWith("database/") ||
        relPath.startsWith("operations/")) &&
      relPath !== "operations/scripts/check-repo-layout.mjs" &&
      relPath !== "operations/scripts/check-repo-layout.test.mjs"
    ) {
      const ext = extname(relPath).toLowerCase();
      if (ACTIVE_CODE_OR_WORKFLOW_EXTS.has(ext)) {
        const abs = resolve(repoRoot, relPath);
        if (existsSync(abs)) {
          activeFileContents.set(relPath, readFileSync(abs, "utf8"));
        }
      }
    }
  }

  const summary = validateRepoLayout(entries, activeFileContents);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.violations.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
