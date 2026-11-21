/**
 * Idempotent loopback-only launcher for the Strategic Souls Private Angel One Read-Only Adapter.
 * Binds strictly to 127.0.0.1:8791. Never prints credentials or tokens.
 */

import "./ts-node-hooks.mjs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { startMarketAdapterServer } = await import(
  "../../backend/services/market-data/angelone/adapter-server.ts"
);

const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);

const secretsPath = resolve(root, ".secrets/angelone.env");
if (!existsSync(secretsPath) && !process.env.ANGELONE_API_KEY) {
  console.error(
    "Missing local broker credentials (.secrets/angelone.env). Run `npm run broker:setup` first.",
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
