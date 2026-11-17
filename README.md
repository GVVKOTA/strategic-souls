# Strategic Souls

<img src="public/gvv-approved.jpg" width="104" alt="Global Vertex Vectors GVV eclipse logo" />

Strategic Souls is Global Vertex Vectors’ private financial research workspace. Use **Global** to explore sourced market data, charts, watchlists and manual portfolios. Use **Strategy** to define a Soul Scan, save drafts, inspect execution history and review research in the Graveyard. Use **Community** to collaborate through research profiles, messages and groups.

The X2 app uses React and TypeScript, with Next.js routing through Vinext and Vite. A Cloudflare Worker serves the app and stores research in D1. The optional V3 integration uses Supabase and a Python research worker.

| Folder | What belongs here |
| --- | --- |
| [frontend/](frontend/) | Screens, components, hooks and styles |
| [backend/](backend/) | Identity, research engines, application services, provider adapters and request middleware |
| [database/](database/) | D1 table definitions and access helpers |
| [tests/](tests/) | Unit tests and integration tests |
| [operations/](operations/) | Developer guides, build and maintenance scripts, examples and historical reports |

Framework entry points stay in app/. Served assets stay in public/. The deployment tooling reads drizzle/ for D1 migrations, supabase/ for the optional Supabase project, .openai/ for Site identity and .github/workflows/ for GitHub checks. The managed Sites installer enters through scripts/install-pnpm.sh.

## Run locally

Use Git, Node.js **22.16.0** and pnpm **11.25.0**, the versions verified for the Windows workflow. From the project folder in a VS Code terminal:

~~~powershell
pnpm install --frozen-lockfile
npm run dev
~~~

Open [the local workspace](http://127.0.0.1:5173) when Wrangler reports it is ready. Press Ctrl+C to stop. The command builds the Worker, applies D1 migrations to the local database and supplies a fictional developer identity on loopback. Complete local onboarding before saving. Restart the command after code changes.

~~~powershell
npm run verify:x2    # Type check, application lint and Node tests
npm test             # Unit and integration tests only
npm run build        # Production Worker
npm run test:quant   # Optional Python tests, requires uv
~~~

The core preview needs no credentials. See [.env.example](.env.example) for settings, [provider setup](operations/docs/setup/X2_DATA_SETUP.md) for data access, and the [architecture](operations/docs/ARCHITECTURE.md) for how the parts fit together. Use eligible, licensed inputs for financial research. Unsupported computations show unavailable or insufficient evidence.

## Contribute

Branch from the current reviewed base. Change the smallest relevant feature, run verification and the build, then open a pull request against main. Retain license notices. Keep real credentials, user records and backups outside Git. See [engineering rules](AGENTS.md) and the [developer guide](operations/docs/DEVELOPER_GUIDE.md).

The owner-private ChatGPT Site has a separate publishing workflow. See [export provenance](SOURCE_PROVENANCE.json), the [documentation index](operations/docs/README.md) and the [restructuring report](operations/docs/RESTRUCTURING_REPORT.md).
