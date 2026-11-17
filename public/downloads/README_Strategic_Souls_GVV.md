# Strategic Souls by Global Vertex Vectors

Existing owner-private Site: https://strategic-souls-gvv.vishnukota20071005.chatgpt.site
Project: `appgprj_6ae0ae7364a481919dfb1af2f4fe17f0`.

This update adds official, on-request TradingView display widgets and a guided private research notebook to the existing three-dashboard application. Every custom numeric quote remains unavailable. No public access, payments, trading or paid feed is enabled.

## Run and validate

Windows/Node 22.16 or later:

```powershell
pnpm install --frozen-lockfile
npm run verify
npm run build
npm start
```

The Sites build helper is the publication build entry point. `npm start` runs the production Worker locally on port 8787. Local D1 is separate from the hosted DB. The pinned Vinext/Cloudflare development runner failed on this Windows path under Node 22 and 24; use the built Worker preview. See [test evidence](docs/TEST_EVIDENCE.md).

## What works and what remains gated

Private manual notebook creation, source-reference validation, immutable originals, idempotent saving, append-only reviews, revisions, search, export and explicit account deletion use authenticated D1 records. The browser builder has three steps. Raw market analysis, automatic outcomes, a news feed, structured calendar events, public community writes, marketplace, billing, broker sync and execution remain gated. Options Lab is a hypothetical user-input calculator.

Widgets contact TradingView only after the visitor chooses to load a view. Attribution stays visible. Widget prices/events never enter GVV calculations. The 28 original instrument identities remain ordered; only independently documented identities have an allowlisted chart candidate. Availability and timing still depend on the actual widget.

The pending migration 0003 originated in saved version 3 and adds notebook tables and immutable triggers. A full logical application snapshot was reconstructed from authenticated account export plus bounded table reads, its legacy payload matched the stored SHA-256, and an isolated restore plus migration preserved the rows. Private backup files stay outside this repository and deployment archive. This is not a provider-managed D1 Time Travel backup.

## Handoff

- [Audit](docs/AUDIT.md), [data rights](docs/FREE_DATA_LICENSE_MATRIX.md), [28 instruments](docs/INSTRUMENT_COVERAGE.md), [source health](docs/SOURCE_HEALTH.md).
- [Design system](docs/DESIGN_SYSTEM.md), [security and release gates](docs/SECURITY_AND_RELEASE_GATES.md), [deployment and rollback](docs/DEPLOYMENT_AND_ROLLBACK.md), [actual tests](docs/TEST_EVIDENCE.md).

Reports dated 1 or 7 November are historical. The files above govern this update. The retained standalone HTML download is a legacy browser-local reference, not this authenticated server application. No secrets are required for notebooks or widgets. Existing users may need to review and accept the updated private-workspace terms themselves.

Security maintenance: React, React DOM and react-server-dom-webpack are pinned to patched 19.2.9. Run npm run audit:security. Current audit has no critical/high findings but retains 10 moderate and 4 low advisories; broader security and release gates remain.
