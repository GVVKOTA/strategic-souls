# Developer guide

Open the project folder in VS Code with File → Open Folder, then choose Terminal → New Terminal. Run these commands from the folder that contains package.json.

~~~powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
npm run dev
~~~

The tested Windows versions are Node 22.16.0 and pnpm 11.25.0. If pnpm is missing and Corepack is available, run the install with corepack pnpm@11.25.0 install --frozen-lockfile.

Open http://127.0.0.1:5173 when Wrangler says it is ready. The local app has its own database and a fictional account. Complete the local onboarding checkboxes before trying saved drafts or watchlists. Use test labels and imaginary inputs for local records. Press Ctrl+C to stop, and restart the same command after edits.

The default command builds, runs local-only migrations and starts the preview. Use npm run dev:hmr for the original hot-reload runner on environments that support it. On Windows it previously hit a Vinext startup error. Ports 5173 and 8787 must be free. If you already have a fresh build and a prepared database, npm run local:serve starts the preview alone.

The core preview needs no .env file. See [.env.example](../../.env.example) for optional settings. Authorized local Worker credentials belong in ignored .sites-runtime/.dev.vars. Keep production records and credentials out of local testing and Git.

## Where to work

| If you want to change | Start here |
| --- | --- |
| A dashboard or form | frontend/features |
| A shared component | frontend/components |
| A page URL or HTTP endpoint | app |
| Scan math, provider access or business rules | backend |
| A query or table definition | database |
| How the repository runs and deploys | operations |
| Behavior checks | tests/unit or tests/integration |

For example, a new Strategy field starts in the Strategy UI. If it changes what a saved scan means, update shared research validation and add a test through the existing route. Check how the change handles old saved scans. Keep deployed migrations intact.

## Check your changes

Run npm run verify:x2 for types, lint and Node tests, then npm run build to confirm the Worker builds. Open the affected screen locally and try the action you changed. The separate Python suite runs with npm run test:quant and requires uv. Full V3 authentication requires local Supabase and a container engine. See the [V3 runbook](v3/RUNBOOK.md).

## Contribute on GitHub

A branch is an independent line of work. A pull request asks a reviewer to compare that branch with main. First update the reviewed base, then create a branch for your task.

~~~powershell
git switch main
git pull --ff-only
git switch -c feature/your-task
git status
git diff
~~~

After verification, stage the paths you changed, commit with a descriptive message and run git push -u origin feature/your-task. Open a pull request on GitHub and say what changed and how you tested it. If a pull reports a conflict, keep both versions available and resolve the overlapping edits before committing. Follow the [architecture guide](ARCHITECTURE.md#database-and-deployment) for release steps.
