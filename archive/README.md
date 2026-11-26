# Historical Archive (`archive/`)

This directory holds **non-runtime historical reference material** for Strategic Souls that is valuable for institutional context and auditability, but is **not required** by the runtime application, build, CI/CD, database migrations, or active operations.

---

## Archive Policy (Strictly Enforced by CI)

1. **Allowed file types:** Markdown (`.md`), plain text (`.txt`), static non-manifest JSON (`.json`), static diagrams/screenshots without secrets or PII (`.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.pdf`).
2. **Strictly forbidden in `archive/`:**
   - Executable source code or scripts (`.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.jsx`, `.py`, `.sh`, `.ps1`, `.bat`, `.cmd`).
   - SQL migrations or database dumps (`.sql`, `.db`, `.sqlite*`, `.bundle`).
   - Dependency or build/runtime manifests (`package.json`, `pnpm-lock.yaml`, `package-lock.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `wrangler.json*`, `wrangler.toml`, `vite.config.ts`, `next.config.ts`, `eslint.config.mjs`, `drizzle.config.ts`).
   - Environment files, credentials, tokens, raw production logs, or build outputs (`.env*`, `.dev.vars*`, `.secrets/`, `*.pem`, `*.key`, `dist/`).
3. **Retired code belongs in Git history, not `archive/`.** Do not copy dead code into `archive/`.
4. **Zero runtime/CI coupling:** No active file in `.github/`, `application/`, `database/`, or `operations/` may import, execute, or depend on files inside `archive/`.

Enforced automatically by [`operations/scripts/check-repo-layout.mjs`](../operations/scripts/check-repo-layout.mjs) and tested in [`operations/scripts/check-repo-layout.test.mjs`](../operations/scripts/check-repo-layout.test.mjs).

---

## Archive Index

| Archived Path | Original Location | Retired Date | Reason & Context | Current Source of Truth |
| --- | --- | --- | --- | --- |
| [`historical-reports/2026-11-26-five-folder-consolidation-manifest.md`](historical-reports/2026-11-26-five-folder-consolidation-manifest.md) | `operations/reports/CLEANUP_AND_RESTRUCTURE_MANIFEST.md` | 2026-11-26 | Completed point-in-time record of the 11-to-5 folder consolidation (`637 -> 447` files); superseded by the current six-folder layout, monitoring pipeline, and consolidated engineering docs. | [`README.md`](../README.md), [`documentation/ARCHITECTURE.md`](../documentation/ARCHITECTURE.md), [`documentation/CHANGELOG.md`](../documentation/CHANGELOG.md) |
