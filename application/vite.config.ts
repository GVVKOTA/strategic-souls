import vinext from "vinext";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import { readExecutionProfile } from "./tooling/execution-profile.mjs";
import { configureToolEnvironment } from "./tooling/tool-environment.mjs";

const CLOUDFLARE_WORKER_NAME = "strategic-souls";
const CLOUDFLARE_D1_BINDING = "DB";
const CLOUDFLARE_D1_DATABASE_NAME = "ss";
const CLOUDFLARE_D1_DATABASE_ID = "1cda2b05-6b99-4d04-896f-b3542ad2ce7f";

// macOS Seatbelt blocks FSEvents, so sandboxed previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

function cleanBuildCommit(): string | null {
  const git = (...args: string[]) => execFileSync("git", args, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  try {
    if (git("status", "--porcelain")) return null;
    const commit = git("rev-parse", "HEAD");
    return /^[0-9a-f]{40}$/.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

const cloudflareWorkerConfig = {
  name: CLOUDFLARE_WORKER_NAME,
  main: "./backend/middleware/index.ts",
  compatibility_date: "2026-05-15",
  compatibility_flags: ["nodejs_compat"],
  observability: { enabled: true },
  triggers: { crons: ["* * * * *", "*/2 * * * *"] },
  vars: {
    ENABLE_PRIVATE_BROKER_DATA: "true",
    ENABLE_PUBLIC_EXCHANGE_QUOTES: "false",
    MARKET_DATA_MODE: "private",
    INDIA_API_HOST: "stock.indianapi.in",
  },
  version_metadata: { binding: "CF_VERSION_METADATA" },
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
    define: {
      "process.env.STRATEGIC_SOULS_BUILD_SHA": JSON.stringify(cleanBuildCommit()),
    },
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
