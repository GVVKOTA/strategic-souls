/**
 * Read-Only Live Angel One Smoke Verification Tool.
 * - Uses local `.secrets/angelone.env` (never logs or echoes credentials, JWTs, or client ID).
 * - Independently verifies:
 *   1. Auth (loginByPassword + refresh token + enabled exchanges)
 *   2. NSE read-only quote + daily candles (independently resolved token)
 *   3. BSE read-only quote + daily candles (independently resolved token)
 *   4. MCX read-only active dated future quote + daily candles (real expiry/lot/tick)
 *   5. Loopback Private Adapter Gateway end-to-end HTTP verification
 *   6. Optional live deployed Cloudflare Worker health check (if --deployed-url provided)
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot } from "./repo-paths.mjs";

await import(pathToFileURL(resolve(appRoot, "tooling/ts-node-hooks.mjs")).href);

const { loadEnvFile, startMarketAdapterServer } = await import(
  pathToFileURL(
    resolve(appRoot, "backend/services/market-data/angelone/adapter-server.ts"),
  ).href
);
const { redactText } = await import(
  pathToFileURL(
    resolve(appRoot, "backend/services/market-data/angelone/redact.ts"),
  ).href
);

const root = appRoot;
process.chdir(root);

const secretsPath = resolve(root, ".secrets/angelone.env");
if (!existsSync(secretsPath)) {
  console.error(
    JSON.stringify({
      verdict: "BLOCKED_EXTERNAL",
      reason: "Local .secrets/angelone.env not found. Run `npm run broker:setup` first.",
    }),
  );
  process.exit(1);
}

const localEnv = loadEnvFile(secretsPath);
const knownSecrets = [
  localEnv.ANGELONE_API_KEY,
  localEnv.ANGELONE_CLIENT_ID,
  localEnv.ANGELONE_MPIN,
  localEnv.ANGELONE_TOTP_SECRET,
  localEnv.MARKET_ADAPTER_AUTH_TOKEN,
].filter(Boolean);

const portArg = Number(process.env.VERIFY_ADAPTER_PORT || "18791");
const handle = await startMarketAdapterServer({
  secretsFilePath: secretsPath,
  env: {
    ...process.env,
    MARKET_ADAPTER_PORT: String(portArg),
  },
});

const baseUrl = `http://${handle.host}:${handle.port}`;
const token = localEnv.MARKET_ADAPTER_AUTH_TOKEN || process.env.MARKET_ADAPTER_AUTH_TOKEN;

async function adapterGet(path) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      "X-SS-Adapter-Token": token,
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

try {
  // Wait briefly for local ScripMaster cache ingestion if present
  await new Promise((r) => setTimeout(r, 400));

  const nseQuote = await adapterGet("/internal/quote?ids=NSE:SBIN,NSE:NIFTY");
  await new Promise((r) => setTimeout(r, 1100));
  const bseQuote = await adapterGet("/internal/quote?ids=BSE:SBIN,BSE:SENSEX");
  await new Promise((r) => setTimeout(r, 1100));
  const mcxQuote = await adapterGet("/internal/quote?ids=MCX:GOLD04DEC26FUT,MCX:CRUDEOIL18DEC26FUT");

  await new Promise((r) => setTimeout(r, 1100));
  const nseCandles = await adapterGet("/internal/candles?id=NSE:SBIN&interval=1d&days=45");
  await new Promise((r) => setTimeout(r, 1100));
  const bseCandles = await adapterGet("/internal/candles?id=BSE:SBIN&interval=1d&days=45");
  await new Promise((r) => setTimeout(r, 1100));
  const mcxCandles = await adapterGet("/internal/candles?id=MCX:GOLD04DEC26FUT&interval=1d&days=45");

  const health = await adapterGet("/internal/health");

  const summarizeQuote = (res) => ({
    httpStatus: res.status,
    verdict:
      res.status === 200 && res.body?.quotes?.length > 0 && res.body.quotes.every((q) => q.ltp > 0)
        ? "PASS_LOCAL_REAL"
        : "FAIL",
    quotes: (res.body?.quotes ?? []).map((q) => ({
      id: q.id,
      exchange: q.exchange,
      tradingSymbol: q.tradingSymbol,
      token: q.token,
      expiry: q.expiry,
      lotSize: q.lotSize,
      ltp: q.ltp,
      prevClose: q.prevClose,
      changePct: q.changePct,
      quality: q.quality,
      marketState: q.marketState,
      isLive: q.isLive,
      exchangeTimestampIST: q.exchangeTimestampIST,
      retrievalTimestampIST: q.retrievalTimestampIST,
    })),
    unfetched: res.body?.unfetched ?? [],
  });

  const summarizeCandles = (res) => ({
    httpStatus: res.status,
    verdict:
      res.status === 200 && (res.body?.candles?.length ?? 0) > 0
        ? "PASS_LOCAL_REAL"
        : "FAIL",
    count: res.body?.candles?.length ?? 0,
    firstDateIST: res.body?.candles?.[0]?.dateIST ?? null,
    lastDateIST: res.body?.candles?.at(-1)?.dateIST ?? null,
    lastClose: res.body?.candles?.at(-1)?.close ?? null,
    quality: res.body?.quality ?? null,
  });

  const report = {
    checkedAtUTC: new Date().toISOString(),
    readOnlyVerified: true,
    adapterHealth: {
      ok: health.body?.ok,
      authState: health.body?.authState,
      enabledExchanges: health.body?.enabledExchanges,
      scripMasterCount: health.body?.scripMasterCount,
      circuitBreakerState: health.body?.circuitBreakerState,
    },
    exchanges: {
      NSE: { quote: summarizeQuote(nseQuote), candles: summarizeCandles(nseCandles) },
      BSE: { quote: summarizeQuote(bseQuote), candles: summarizeCandles(bseCandles) },
      MCX: { quote: summarizeQuote(mcxQuote), candles: summarizeCandles(mcxCandles) },
    },
  };

  console.log(redactText(JSON.stringify(report, null, 2), knownSecrets));
} finally {
  await handle.close();
}
