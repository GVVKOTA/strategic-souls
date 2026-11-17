# Dependency security remediation

Baseline audit: `pnpm audit --json` reports 3 critical, 35 high, 36 moderate and 11 low findings across dependency/dev/optional paths. This is an advisory inventory, not proof that every vulnerable feature is reachable in this Vinext Worker application. The release remains blocked until remaining production risks are resolved.

| Package | Original | Candidate |
|---|---:|---:|
| next | 16.3.4 | 16.4.1 |
| eslint-config-next | 16.3.4 | 16.4.1 |
| react | 19.2.6 | 19.2.8 |
| react-dom | 19.2.6 | 19.2.8 |
| react-server-dom-webpack | 19.2.6 | 19.2.8 |
| vite | 8.0.13 | 8.1.6 |

Scoped transitive patches target undici 7, ws 8, js-yaml 4, browserslist 4, source-map-js 1 and brace-expansion 1. The inherited miniflare-to-sharp pin is moved from 0.35.4 to 0.35.5. No security policy, signature check or minimum-release-age rule is disabled. Registry findings showed image-size 2.0.2 and brace-expansion 5.0.6, so same-major patches to 2.0.3 and 5.0.11 were added. The application imports zod/v4 and its form-resolver peer supports v4; direct zod was updated to 4.6.6. No blanket incompatible major-version override was applied.

Vendor-origin references:
- https://github.com/advisories/GHSA-2464-fhr4-w9xw — Next.js image optimization critical advisory; patched 16.4.1 and fixed sharp requirement.
- https://github.com/advisories/GHSA-673q-mjm6-r5xr — Next.js use-cache critical advisory; patched 16.4.1.
- Full baseline high/critical advisory list: `evidence/dependency-audit-baseline.json`.

Actual final audit and build status are recorded in the release evidence, not inferred from version numbers. Patches are only applied to the undeployed candidate. The live version 2 dependency graph is unchanged.

## Final audit

After these changes, `pnpm audit --json` reports **0 critical, 0 high, 10 moderate and 4 low** findings. See `evidence/dependency-audit-final.json`. This meets the critical/high dependency-audit threshold but is not a complete security certification. Remaining moderate/low findings and runtime reachability require review. The existing live version has not received these candidate patches.
