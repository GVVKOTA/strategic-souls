# Strategic Souls architecture

## Request flow

1. Vinext discovers Next-style pages and HTTP endpoints in [app](../../app). The root layout loads the styles in their existing order.
2. The [Cloudflare Worker](../../backend/middleware/index.ts) delegates rendering and routing to Vinext.
3. Private handlers read [native ChatGPT identity](../../backend/auth). Services enforce consent, ownership, group roles and market-data permissions on the server.
4. Services access D1 through [queries](../../database/queries) and use the typed [schema](../../database/schemas/schema.ts).
5. The browser renders the result. Source metadata and permission checks determine which observations may be displayed.

| Feature | Frontend | API and logic |
| --- | --- | --- |
| Navigation, onboarding and universal search | [Shared shell](../../frontend/components/workspace) | Session and consent in the [catch-all API](../../app/api/%5B...path%5D/route.ts) |
| Markets, charts, globe, watchlists and portfolios | [Global](../../frontend/features/global) | [X2 data API](../../app/api/x2), [market-data services](../../backend/services/market-data), [portfolio engine](../../backend/engines/portfolio.ts) |
| Soul Scan, drafts, History, Graveyard, Radar and Formula Lab | [Strategy](../../frontend/features/strategy) | [Workspace API](../../app/api/x1/workspace/route.ts), [research services](../../backend/services/research), [canonical scan engine](../../backend/engines/scan.ts) |
| Bodies, direct messages, group Souls and comments | [Community](../../frontend/features/community) | [Community and social services](../../backend/services/community) |
| Older notebook and reference tools | [Legacy](../../frontend/features/legacy) under /legacy | [Legacy services](../../backend/services/legacy) and [notebook persistence](../../database/queries/notebook-repository.ts) |
| Optional V3 Auth, profiles, portfolios and worker | [V3 UI source](../../frontend/features/v3) | [V3 endpoints](../../app/api/v3), [V3 services](../../backend/services/v3), [Supabase](../../supabase) and [Python worker](../../backend/quant) |

The scan UI and API reuse the same parser and evaluator. Provider adapters and entitlement checks live under the market-data service. Keep provider credentials on the server. The legacy synthetic engine is retained for its existing reference and testing contexts. Read [provider setup](setup/X2_DATA_SETUP.md) for activation requirements.

## Database and deployment

- [database/schemas](../../database/schemas) defines the D1 model. [drizzle](../../drizzle) contains the ordered D1 migration history and metadata. The Sites package builder discovers that directory at the root. The file moves require no database migration.
- [supabase](../../supabase) is a separate optional Postgres and Auth project. Keep its migration chronology separate from D1.
- [verify.yml](../../.github/workflows/verify.yml) checks GitHub pushes and pull requests. [verify-v3.yml](../../.github/workflows/verify-v3.yml) is manual. Build and preview tools live under [operations/scripts](../scripts).
- After source review and release approval, reconcile the approved GitHub revision into the original Sites source, verify the current access and hosted recovery plan, and build, package and deploy the Worker through Sites. Record both commits and the published version. Preserve the project and database binding from [.openai/hosting.json](../../.openai/hosting.json).
