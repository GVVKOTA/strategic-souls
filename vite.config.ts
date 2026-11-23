import vinext from "vinext";
import { defineConfig } from "vite";
import { readExecutionProfile } from "./operations/scripts/execution-profile.mjs";
import { configureToolEnvironment } from "./operations/scripts/tool-environment.mjs";

const CLOUDFLARE_WORKER_NAME = "strategic-souls";
const CLOUDFLARE_D1_BINDING = "DB";
const CLOUDFLARE_D1_DATABASE_NAME = "ss";
const CLOUDFLARE_D1_DATABASE_ID = "1cda2b05-6b99-4d04-896f-b3542ad2ce7f";

// macOS Seatbelt blocks FSEvents, so sandboxed previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const cloudflareWorkerConfig = {
  name: CLOUDFLARE_WORKER_NAME,
  main: "./backend/middleware/index.ts",
  compatibility_date: "2026-05-15",
  compatibility_flags: ["nodejs_compat"],
  observability: { enabled: true },
  vars: { ENABLE_PRIVATE_BROKER_DATA: "true" },
  vpc_services: [
    {
      binding: "MARKET_DATA_ADAPTER",
      service_id: "01a2095b-f466-7c90-a813-4fad03735504",
    },
  ],
  d1_databases: [
    {
      binding: CLOUDFLARE_D1_BINDING,
      database_name: CLOUDFLARE_D1_DATABASE_NAME,
      database_id: CLOUDFLARE_D1_DATABASE_ID,
    },
  ],
};

export default defineConfig(async () => {
  configureToolEnvironment(process.cwd());

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux
        ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
        : {}),
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: cloudflareWorkerConfig,
      }),
    ],
  };
});
