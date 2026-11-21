/**
 * Local Private Broker Adapter HTTP Server (Node.js only, bound strictly to 127.0.0.1).
 * - Holds Angel One credentials strictly locally (never uploaded to Cloudflare Workers or browser).
 * - Requires constant-time verified X-SS-Adapter-Token on EVERY endpoint (default deny).
 * - Zero order/trading routes; strictly read-only market-data & manual TOTP session unlock.
 */

import { timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { BrokerAuthError, BrokerAuthSession } from "./auth-session";
import { formatIstTimestamp, getAllIndianExchangeSessions } from "./calendar";
import { InstrumentMaster, SCRIP_MASTER_URL, type RawScripMasterRow } from "./instrument-master";
import { AngelOneReadOnlyProvider, ProviderRequestError } from "./provider";
import { parseAdapterConfig, redactText } from "./redact";
import type { CandleInterval, ExchangeCode, SegmentType } from "./types";

const MAX_BODY_BYTES = 2048;
const SCRIP_CACHE_MAX_AGE_MS = 12 * 3600 * 1000;

function constantTimeMatch(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (/^[A-Z0-9_]+$/.test(key)) out[key] = val;
  }
  return out;
}

function detectLocalNet(): { localIp: string; macAddress: string } {
  const ifaces = networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return {
          localIp: entry.address,
          macAddress:
            entry.mac && entry.mac !== "00:00:00:00:00:00"
              ? entry.mac.toUpperCase()
              : "00:00:00:00:00:00",
        };
      }
    }
  }
  return { localIp: "127.0.0.1", macAddress: "00:00:00:00:00:00" };
}

async function detectPublicIpv4(fallbackIp: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch("https://api4.ipify.org?format=json", {
      signal: controller.signal,
    });
    if (!res.ok) return fallbackIp;
    const json = (await res.json()) as { ip?: string };
    return typeof json.ip === "string" && /^\d{1,3}(\.\d{1,3}){3}$/.test(json.ip)
      ? json.ip
      : fallbackIp;
  } catch {
    return fallbackIp;
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new ProviderRequestError("UPSTREAM_ERROR", "Request payload too large.", 413);
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Object required");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ProviderRequestError("UPSTREAM_ERROR", "Invalid JSON body.", 400);
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

async function loadOrFetchScripMaster(
  provider: AngelOneReadOnlyProvider,
  cachePath: string,
): Promise<void> {
  const absPath = resolve(cachePath);
  if (existsSync(absPath)) {
    const ageMs = Date.now() - statSync(absPath).mtimeMs;
    if (ageMs < SCRIP_CACHE_MAX_AGE_MS) {
      try {
        const rows = JSON.parse(readFileSync(absPath, "utf8")) as RawScripMasterRow[];
        if (Array.isArray(rows) && rows.length > 0) {
          provider.ingestScripMasterRows(rows);
          return;
        }
      } catch {
        // Fall through to remote fetch if local cache corrupted
      }
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(SCRIP_MASTER_URL, { redirect: "manual", signal: controller.signal });
      if (!res.ok) return;
      const text = await res.text();
      const rows = JSON.parse(text) as RawScripMasterRow[];
      if (Array.isArray(rows) && rows.length > 0) {
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, text, "utf8");
        provider.ingestScripMasterRows(rows);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Seed instruments remain available if ScripMaster host is temporarily unreachable
  }
}

export type AdapterServerHandle = {
  port: number;
  host: "127.0.0.1";
  close: () => Promise<void>;
  provider: AngelOneReadOnlyProvider;
};

export async function startMarketAdapterServer(options: {
  env?: Record<string, string | undefined>;
  secretsFilePath?: string;
  fetcher?: typeof fetch;
  skipRemoteScripMaster?: boolean;
} = {}): Promise<AdapterServerHandle> {
  const fileEnv = options.secretsFilePath ? loadEnvFile(options.secretsFilePath) : {};
  const mergedEnv: Record<string, unknown> = {
    ...fileEnv,
    ...(options.env ?? process.env),
  };

  const parsed = parseAdapterConfig(mergedEnv);
  if (!parsed.ok) {
    throw new Error(parsed.reason);
  }
  const config = parsed.config;
  const detected = detectLocalNet();
  const localIp = config.localIp !== "127.0.0.1" ? config.localIp : detected.localIp;
  const macAddress =
    config.macAddress !== "00:00:00:00:00:00" ? config.macAddress : detected.macAddress;
  const publicIp = config.publicIp ?? (await detectPublicIpv4(localIp));

  const knownSecrets = [
    config.apiKey,
    config.clientId,
    config.mpin,
    config.totpSecret ?? "",
    config.authToken,
  ].filter(Boolean);

  const auth = new BrokerAuthSession(
    {
      apiKey: config.apiKey,
      clientId: config.clientId,
      mpin: config.mpin,
      totpSecret: config.totpSecret,
      localIp,
      publicIp,
      macAddress,
    },
    options.fetcher ?? fetch,
  );
  const master = new InstrumentMaster();
  const provider = new AngelOneReadOnlyProvider(
    auth,
    master,
    options.fetcher ?? fetch,
    knownSecrets,
  );

  if (!options.skipRemoteScripMaster) {
    void loadOrFetchScripMaster(provider, config.scripMasterCachePath);
  }

  const server = createServer(async (req, res) => {
    try {
      const providedToken = String(req.headers["x-ss-adapter-token"] ?? "");
      if (!providedToken || !constantTimeMatch(providedToken, config.authToken)) {
        sendJson(res, 401, {
          error: "Adapter service authentication failed.",
          errorCode: "ADAPTER_AUTH_FAILED",
          actionHint: "Ensure Worker MARKET_ADAPTER_AUTH_TOKEN matches local adapter token.",
          serverTimestampUTC: new Date().toISOString(),
        });
        return;
      }

      const url = new URL(req.url ?? "/", `http://127.0.0.1:${config.port}`);
      const method = req.method ?? "GET";

      if (method === "GET" && url.pathname === "/internal/health") {
        sendJson(res, 200, provider.getHealth());
        return;
      }

      if (method === "GET" && url.pathname === "/internal/session") {
        const nowMs = Date.now();
        const utc = new Date(nowMs).toISOString();
        sendJson(res, 200, {
          serverTimestampUTC: utc,
          serverTimestampIST: formatIstTimestamp(nowMs) ?? utc,
          timezone: "Asia/Kolkata",
          sessions: getAllIndianExchangeSessions(nowMs),
        });
        return;
      }

      if (method === "GET" && url.pathname === "/internal/instruments") {
        const q = (url.searchParams.get("q") ?? "").slice(0, 60);
        const exchRaw = (url.searchParams.get("exchange") ?? "ALL").toUpperCase();
        const segRaw = (url.searchParams.get("segment") ?? "ALL").toUpperCase();
        const limitRaw = Number(url.searchParams.get("limit") ?? "15");
        const exchange = (
          ["NSE", "BSE", "MCX", "ALL"].includes(exchRaw) ? exchRaw : "ALL"
        ) as ExchangeCode | "ALL";
        const segment = (
          ["EQUITY", "INDEX", "FUTURE", "ALL"].includes(segRaw) ? segRaw : "ALL"
        ) as SegmentType | "ALL";
        const instruments = provider.searchInstruments({
          q,
          exchange,
          segment,
          limit: Number.isFinite(limitRaw) ? limitRaw : 15,
        });
        sendJson(res, 200, {
          provider: "Angel One SmartAPI",
          count: instruments.length,
          instruments,
        });
        return;
      }

      if (method === "GET" && url.pathname === "/internal/quote") {
        const idsParam = url.searchParams.get("ids") ?? "";
        const ids = idsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20);
        const result = await provider.getQuotes(ids.length > 0 ? ids : undefined);
        sendJson(res, 200, result);
        return;
      }

      if (method === "GET" && url.pathname === "/internal/candles") {
        const id = (url.searchParams.get("id") ?? "").trim();
        const intervalRaw = (url.searchParams.get("interval") ?? "1d").trim();
        const daysRaw = Number(url.searchParams.get("days") ?? "90");
        if (!id || id.length > 80) {
          sendJson(res, 400, {
            error: "Valid instrument id is required.",
            errorCode: "INVALID_SYMBOL",
            actionHint: "Pass canonical id such as NSE:SBIN, BSE:SBIN, or MCX:GOLD04DEC26FUT.",
            serverTimestampUTC: new Date().toISOString(),
          });
          return;
        }
        const interval = (
          ["1d", "1h", "15m", "5m"].includes(intervalRaw) ? intervalRaw : "1d"
        ) as CandleInterval;
        const result = await provider.getCandles(
          id,
          interval,
          Number.isFinite(daysRaw) ? daysRaw : 90,
        );
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && url.pathname === "/internal/auth/totp") {
        const payload = await readJsonBody(req);
        const totp = typeof payload.totp === "string" ? payload.totp.trim() : "";
        const sessionInfo = await provider.authenticateWithManualTotp(totp);
        sendJson(res, 200, {
          ok: true,
          ...sessionInfo,
          message: "Angel One read-only session authenticated in memory.",
        });
        return;
      }

      sendJson(res, 404, {
        error: "Read-only adapter endpoint not found.",
        errorCode: "UPSTREAM_ERROR",
        actionHint: "Use /internal/health, /internal/session, /internal/instruments, /internal/quote, /internal/candles, or /internal/auth/totp.",
        serverTimestampUTC: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        sendJson(res, error.httpStatus, {
          error: redactText(error.message, knownSecrets),
          errorCode: error.code,
          retryAfterMs: error.retryAfterMs,
          actionHint:
            error.code === "BROKER_TOTP_REQUIRED" || error.code === "BROKER_SESSION_EXPIRED"
              ? "Submit a fresh 6-digit TOTP code in Data Control Center or re-authenticate."
              : error.code === "BROKER_STATIC_IP_BLOCKED"
                ? "Verify registered primary static IPv4 in Angel One SmartAPI portal."
                : "Retry after checking adapter health.",
          serverTimestampUTC: new Date().toISOString(),
        });
        return;
      }
      if (error instanceof BrokerAuthError) {
        sendJson(res, error.httpStatus, {
          error: redactText(error.message, knownSecrets),
          errorCode: error.code,
          actionHint: "Check Angel One credentials and 6-digit TOTP clock synchronization.",
          serverTimestampUTC: new Date().toISOString(),
        });
        return;
      }
      sendJson(res, 502, {
        error: redactText(
          error instanceof Error ? error.message : "Adapter request failed.",
          knownSecrets,
        ),
        errorCode: "UPSTREAM_ERROR",
        actionHint: "Inspect sanitized adapter health.",
        serverTimestampUTC: new Date().toISOString(),
      });
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(config.port, "127.0.0.1", () => {
      server.removeListener("error", rejectListen);
      resolveListen();
    });
  });

  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : config.port;

  return {
    port: actualPort,
    host: "127.0.0.1",
    provider,
    close: async () => {
      auth.invalidate("Server shutting down.");
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}
