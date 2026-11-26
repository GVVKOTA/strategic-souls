import assert from "node:assert/strict";
import test from "node:test";
import { validateRepoLayout } from "./check-repo-layout.mjs";

const BASE_VALID_ENTRIES = [
  { mode: "100644", path: ".github/workflows/verify.yml" },
  { mode: "100644", path: "application/package.json" },
  { mode: "100644", path: "application/pnpm-lock.yaml" },
  { mode: "100644", path: "archive/README.md" },
  { mode: "100644", path: "archive/historical-reports/2026-11-26-five-folder-consolidation-manifest.md" },
  { mode: "100644", path: "database/migrations/0000_bent_reptil.sql" },
  { mode: "100644", path: "documentation/ARCHITECTURE.md" },
  { mode: "100644", path: "operations/scripts/check-repo-layout.mjs" },
  { mode: "100644", path: "README.md" },
];

test("valid six-folder layout with non-runtime archive passes", () => {
  const result = validateRepoLayout(BASE_VALID_ENTRIES);
  assert.equal(result.result, "PASS");
  assert.deepEqual(result.violations, []);
  assert.equal(result.archiveFiles, 2);
});

test("missing archive or extra seventh top-level directory fails", () => {
  const withoutArchive = BASE_VALID_ENTRIES.filter((entry) => !entry.path.startsWith("archive/"));
  const resMissing = validateRepoLayout(withoutArchive);
  assert.equal(resMissing.result, "FAIL");
  assert.ok(resMissing.violations.some((v) => v.reason.startsWith("ROOT_DIR_MISMATCH")));

  const withExtraDir = [...BASE_VALID_ENTRIES, { mode: "100644", path: "scratch/note.md" }];
  const resExtra = validateRepoLayout(withExtraDir);
  assert.equal(resExtra.result, "FAIL");
  assert.ok(resExtra.violations.some((v) => v.reason.startsWith("ROOT_DIR_MISMATCH")));
});

test("extra root-level file fails", () => {
  const res = validateRepoLayout([
    ...BASE_VALID_ENTRIES,
    { mode: "100644", path: ".gitignore" },
  ]);
  assert.equal(res.result, "FAIL");
  assert.ok(res.violations.some((v) => v.reason.startsWith("ROOT_FILE_MISMATCH")));
});

test("archive rejects executable scripts, SQL, lockfiles, and config manifests", () => {
  for (const badPath of [
    "archive/old-script.mjs",
    "archive/old-component.tsx",
    "archive/old-migration.sql",
    "archive/package.json",
    "archive/pnpm-lock.yaml",
    "archive/deploy.sh",
    "archive/.env",
  ]) {
    const res = validateRepoLayout([...BASE_VALID_ENTRIES, { mode: "100644", path: badPath }]);
    assert.equal(res.result, "FAIL", `Expected ${badPath} to fail`);
    assert.ok(res.violations.some((v) => v.path === badPath));
  }
});

test("active code or workflow referencing archive fails while prose mentions of archive/restore pass", () => {
  const activeContents = new Map([
    ["application/backend/services/legacy/content.ts", 'const note = "supports archive/restore and JSON exports";'],
    ["application/app/page.tsx", 'import oldData from "../../archive/historical-reports/old.md";'],
  ]);
  const res = validateRepoLayout(
    [
      ...BASE_VALID_ENTRIES,
      { mode: "100644", path: "application/backend/services/legacy/content.ts" },
      { mode: "100644", path: "application/app/page.tsx" },
    ],
    activeContents,
  );
  assert.equal(res.result, "FAIL");
  assert.deepEqual(
    res.violations.map((v) => [v.path, v.reason]),
    [["application/app/page.tsx", "ACTIVE_CODE_OR_WORKFLOW_REFERENCES_ARCHIVE"]],
  );
});

test("symlinks, submodules, duplicate lockfiles, and tracked secrets fail", () => {
  const res = validateRepoLayout([
    ...BASE_VALID_ENTRIES,
    { mode: "120000", path: "documentation/link.md" },
    { mode: "160000", path: "application/vendor-mod" },
    { mode: "100644", path: "package-lock.json" },
    { mode: "100644", path: "application/.env" },
  ]);
  assert.equal(res.result, "FAIL");
  assert.ok(res.violations.some((v) => v.reason === "FORBIDDEN_SYMLINK"));
  assert.ok(res.violations.some((v) => v.reason === "FORBIDDEN_SUBMODULE"));
  assert.ok(res.violations.some((v) => v.reason.startsWith("LOCKFILE_MISMATCH")));
  assert.ok(res.violations.some((v) => v.reason === "FORBIDDEN_TRACKED_ENV_FILE"));
});
