# Strategic Souls Archive (`operations/archive/`)

This directory is the **single explicit archive area** for verified obsolete, superseded, or unreferenced non-sensitive files from earlier Strategic Souls releases (`pre-X1`, `X1`, `X2`, `X4`, `X5.1`, `X5.2`).

Every item below was moved with `git mv` to preserve full Git commit history and verified via `git grep` + full TypeScript, ESLint, Node test, and production build checks to have zero active runtime imports.

## Archive Manifest (X5.3 Consolidation — 2026-11-22 IST)

| Archived Path | Original Path | Reason Archived | Canonical Replacement | Archived Date |
| --- | --- | --- | --- | --- |
| `operations/archive/frontend/features/earth/world-conflict-map.tsx` | `frontend/features/earth/world-conflict-map.tsx` | X5.3 founder reversal removing all 2D geographical maps and MapLibre runtime UI from Global | `frontend/features/global/strategic-globe.tsx` + `frontend/features/global/globe-canvas.tsx` (enlarged 1x–5x zoomable 3D Earth with direct 3D event markers) | 2026-11-22 |
| `operations/archive/frontend/features/earth/earth-map.css` | `frontend/features/earth/earth-map.css` | Stylesheet exclusively used by removed 2D MapLibre world map | `frontend/styles/x51.css` (`.x53-globe-*` rules) | 2026-11-22 |
| `operations/archive/docs/pre-x1/*` | `operations/docs/archive/pre-x1/*` | Historical pre-X1 architecture, audit, and legal gate snapshots consolidated into single archive area | `operations/docs/ARCHITECTURE.md`, `operations/docs/PROVIDER_INTEGRATION_READINESS.md`, `README.md` | 2026-11-22 |
| `operations/archive/docs/x1/*` | `operations/docs/archive/x1/*` | Historical X1 specs, audits, and release reports consolidated into single archive area | `operations/docs/X5_3_RELEASE_NOTES.md`, `operations/docs/ARCHITECTURE.md` | 2026-11-22 |
| `operations/archive/docs/reports/x2/*` | `operations/docs/reports/x2/*` | Historical X2 QA, baseline, and verification snapshots superseded by X5.3 | `operations/docs/X5_3_EXECUTION_REPORT.md` | 2026-11-22 |
| `operations/archive/docs/status/X4_PROGRESS.md` | `operations/docs/X4_PROGRESS.md` | Superseded X4 working progress log | `operations/docs/X5_3_RELEASE_NOTES.md` | 2026-11-22 |
| `operations/archive/docs/status/X5_1_EXECUTION_STATUS.md` | `operations/docs/X5_1_EXECUTION_STATUS.md` | Superseded X5.1 execution status tracker | `operations/docs/X5_3_EXECUTION_REPORT.md` | 2026-11-22 |

## Safety & Restoration Instructions

- **No secrets or private data** are stored in `operations/archive/`.
- **Zero applied database migrations** (`drizzle/0000`–`0009`) or active runtime routes were moved here.
- To restore any archived file with full history:
  ```powershell
  git mv operations/archive/<archived-subpath> <original-path>
  ```
- `operations/archive/` is excluded from TypeScript compilation (`tsconfig.json`) and ESLint (`eslint.config.mjs`) so archived reference code cannot break active builds.
