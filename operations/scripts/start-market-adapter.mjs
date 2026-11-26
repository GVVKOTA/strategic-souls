/**
 * Idempotent loopback-only launcher for the Strategic Souls Private Angel One Read-Only Adapter.
 * Binds strictly to 127.0.0.1:8791. Never prints credentials or tokens.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot } from "./repo-paths.mjs";

await import(pathToFileURL(resolve(appRoot, "tooling/ts-node-hooks.mjs")).href);

const { startMarketAdapterServer } = await import(
  pathToFileURL(
    resolve(appRoot, "backend/services/market-data/angelone/adapter-server.ts"),
  ).href
);

process.chdir(appRoot);

const secretsPath = resolve(appRoot, ".secrets/angelone.env");
if (!existsSync(secretsPath) && !process.env.ANGELONE_API_KEY) {
  console.error(
    "Missing local broker credentials (application/.secrets/angelone.env). Run `pnpm run broker:setup` inside application/ first.",
  );
  process.exit(1);
}

const handle = await startMarketAdapterServer({
  secretsFilePath: secretsPath,
});

console.log(
  JSON.stringify({
    status: "LISTENING",
    service: "strategic-souls-private-angelone-adapter",
    bind: `http://${handle.host}:${handle.port}`,
    readOnly: true,
    mode: "PRIVATE_OWNER_ONLY",
    startedAt: new Date().toISOString(),
  }),
);

const shutdown = async () => {
  await handle.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
