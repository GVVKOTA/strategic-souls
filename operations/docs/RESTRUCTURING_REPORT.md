# Strategic Souls restructuring report

## Source selection

On 18 November 2026, local X2 export and GitHub main both pointed to ec4b45a3ee1cf000519fa0596139952ba1d30f16. The export checkout had no tracked or nonignored work in progress. Sites version 12 reported source 5b02f5b63cd469f80ba05bc62f4217bd5ddcd697, matching the separate, clean Sites checkout and the recorded export provenance. The GitHub export is the reviewed base for repository work. Its import history and the original Sites history were retained separately.

A verified Git bundle of repository refs and a source ZIP were saved privately before editing. No folder named ss was identified in the Windows project locations searched. Branch work took place in the existing X2 export checkout while the location of the requested primary checkout remains pending.

## File moves

The original snapshot had 366 tracked files, 65 directly in the root. Of those, 49 root files were Markdown. The new structure relocates 282 existing paths and adds documentation. The full rename list is visible by comparing the branch with the export checkpoint.

| Previous location | New home |
| --- | --- |
| global, strategy and community | frontend/features |
| components, hooks and app styles | frontend/components, frontend/hooks, frontend/styles, and feature-specific directories |
| app/workspace.tsx and notebook UI | frontend/features/legacy |
| lib/x1 and lib/x2 | backend/engines, backend/services/market-data, backend/services/research and backend/services/community |
| app/chatgpt-auth.ts, worker and connector code | backend/auth, backend/middleware and backend/integrations |
| quant | backend/quant |
| db and repository helpers | database/schemas and database/queries |
| tests/*.test.mjs | tests/unit and tests/integration |
| scripts, docs, examples, historic root reports | operations/scripts, operations/docs and operations/examples |

The framework still discovers pages and API handlers in app and served assets in public. The required roots for D1 migration history, Supabase, CI, Sites identity and the Sites installer were preserved. No SQL migration was added or reordered. Source provenance remains the immutable record of the earlier export. Historical guides retain their original context and link to the new starting guide.

The moves update relative imports, component aliases, stylesheet imports, test fixture paths, lint and test discovery, Vite’s Worker entry, Drizzle’s schema path, ignore patterns and the optional V3 workflow. The Windows default launch now builds and starts the compiled Worker after applying local D1 migrations. The original hot-reload route remains available as npm run dev:hmr. Managed shell entry points retain LF line endings and Linux executable permissions.

## Verification

- Windows Node 22.16.0 and pnpm 11.25.0 accepted the frozen lockfile. Type checking, application lint and all 244 Node tests passed. Lint reported four existing image optimization warnings.
- The production Worker built. The official packaging helper included the Worker, the original hosting manifest and all seven D1 SQL migrations.
- The optional Python frozen environment and all 29 tests passed. Its test scratch path was adjusted after moving the project.
- In the loopback browser, the fictional account completed onboarding, saved a named Soul Scan draft, reloaded, and reopened it. ECB coverage returned eligible observations, and running the scan saved a source snapshot. Graveyard and Community opened. Session, workspace, data, social and V3 health endpoints responded after onboarding. Legacy loaded.
- Global, Strategy and Community each rendered inside a 390 px browser frame (375 px usable width) without document-level horizontal overflow.
- The owner-private live homepage loaded from Sites version 12. The refactor was validated in local development and packaging. Hosted login, hosted writes, commercial providers and a real V3 Supabase/container journey were outside the verified scope.
- The change preserves existing lazy loads. Bundle and runtime performance were not measured against a matched pre-change build, so no speedup is claimed.

## Branch and release

Base: ec4b45a3ee1cf000519fa0596139952ba1d30f16. Review branch: codex/strategic-souls-restructure. Implementation commit: 112a4518ce990cc4a299b3b81e17840b8a35b041. See [pull request #1](https://github.com/GVVKOTA/strategic-souls/pull/1) for the full set of commits and current GitHub checks. Review before merging. Any production release is a separate step through the original Site after GitHub approval and a fresh source, access and recovery check.
