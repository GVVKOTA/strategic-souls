/**
 * Redaction utilities and strict fail-closed environment schema validation.
 * Never logs, returns, or serializes secrets, tokens, MPINs, TOTP codes, or Client IDs.
 */

import type { MarketDataMode, MarketDataRuntimeFlags } from "./types";

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi;
const KV_SECRET_PATTERN =
  /\b(api[_-]?key|private[_-]?key|client[_-]?id|clientcode|mpin|password|totp(?:_secret)?|refresh[_-]?token|feed[_-]?token|jwt[_-]?token|auth[_-]?token|cf[_-]?access[_-]?client[_-]?secret)\b\s*[:=]\s*["']?[^\s"',}]+["']?/gi;

export function redactText(
  input: unknown,
  knownSecrets: readonly (string | null | undefined)[] = [],
): string {
  let out =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : String(input ?? "");

  for (const secret of knownSecrets) {
    if (typeof secret === "string" && secret.trim().length >= 3) {
      out = out.replaceAll(secret.trim(), "[REDACTED]");
    }
  }
  out = out.replace(JWT_PATTERN, "[REDACTED_JWT]");
  out = out.replace(BEARER_PATTERN, "Bearer [REDACTED]");
  out = out.replace(KV_SECRET_PATTERN, "$1=[REDACTED]");
  return out;
}

export function sanitizeDiagnosticObject<T>(
  value: T,
  knownSecrets: readonly (string | null | undefined)[] = [],
): T {
  const serialized = JSON.stringify(value);
  return JSON.parse(redactText(serialized, knownSecrets)) as T;
}

export function maskIdentifier(value: string | null | undefined): string {
  if (!value || value.length < 4) return "[REDACTED]";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export type AdapterEnvConfig = {
  apiKey: string;
  clientId: string;
  mpin: string;
  /** Optional opt-in Base32 TOTP seed. When omitted, manual 6-digit TOTP is required per session. */
  totpSecret: string | null;
  localIp: string;
  publicIp: string | null;
  macAddress: string;
  bindHost: "127.0.0.1";
  port: number;
  authToken: string;
  scripMasterCachePath: string;
};

function cleanEnvValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validates private broker adapter environment variables.
 * Fails closed if required credentials or service auth token are absent or placeholder values.
 */
export function parseAdapterConfig(
  env: Record<string, unknown>,
): { ok: true; config: AdapterEnvConfig } | { ok: false; missing: string[]; reason: string } {
  const apiKey = cleanEnvValue(env.ANGELONE_API_KEY);
  const clientId = cleanEnvValue(env.ANGELONE_CLIENT_ID);
  const mpin = cleanEnvValue(env.ANGELONE_MPIN);
  const totpSecretRaw = cleanEnvValue(env.ANGELONE_TOTP_SECRET);
  const authToken = cleanEnvValue(env.MARKET_ADAPTER_AUTH_TOKEN);

  const missing: string[] = [];
  const isPlaceholder = (v: string) =>
    !v || /^(replace|your_|changeme|example|demo|todo|xxx)/i.test(v);

  if (isPlaceholder(apiKey) || apiKey.length < 4) missing.push("ANGELONE_API_KEY");
  if (isPlaceholder(clientId) || !/^[A-Za-z0-9]{4,20}$/.test(clientId)) {
    missing.push("ANGELONE_CLIENT_ID");
  }
  if (isPlaceholder(mpin) || !/^\d{4,12}$/.test(mpin)) {
    missing.push("ANGELONE_MPIN");
  }
  if (isPlaceholder(authToken) || authToken.length < 24) {
    missing.push("MARKET_ADAPTER_AUTH_TOKEN");
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      reason: `Private broker adapter configuration incomplete (${missing.join(", ")}). Run local secret setup.`,
    };
  }

  const totpSecret =
    totpSecretRaw && !isPlaceholder(totpSecretRaw) && /^[A-Z2-7=\s]{16,128}$/i.test(totpSecretRaw)
      ? totpSecretRaw.replace(/\s+/g, "").toUpperCase()
      : null;

  const portRaw = Number(cleanEnvValue(env.MARKET_ADAPTER_PORT) || "8791");
  const port = Number.isInteger(portRaw) && portRaw >= 1024 && portRaw <= 65535 ? portRaw : 8791;

  const localIpRaw = cleanEnvValue(env.ANGELONE_CLIENT_LOCAL_IP);
  const localIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(localIpRaw) ? localIpRaw : "127.0.0.1";

  const publicIpRaw = cleanEnvValue(env.ANGELONE_CLIENT_PUBLIC_IP);
  const publicIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(publicIpRaw) ? publicIpRaw : null;

  const macRaw = cleanEnvValue(env.ANGELONE_MAC_ADDRESS);
  const macAddress = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(macRaw)
    ? macRaw.toUpperCase()
    : "00:00:00:00:00:00";

  const scripMasterCachePath =
    cleanEnvValue(env.ANGELONE_SCRIP_MASTER_CACHE) ||
    ".sites-runtime/OpenAPIScripMaster.json";

  return {
    ok: true,
    config: {
      apiKey,
      clientId,
      mpin,
      totpSecret,
      localIp,
      publicIp,
      macAddress,
      bindHost: "127.0.0.1",
      port,
      authToken,
      scripMasterCachePath,
    },
  };
}

export type WorkerGatewayConfig = {
  flags: MarketDataRuntimeFlags;
  adapterUrl: string | null;
  adapterAuthToken: string | null;
  cfAccessClientId: string | null;
  cfAccessClientSecret: string | null;
};

function parseBoolFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return fallback;
}

/**
 * Parses Cloudflare Worker runtime flags and adapter gateway settings.
 * Fails closed: public exchange quotes default to false; demo mode defaults to false.
 */
export function parseGatewayConfig(
  env: Record<string, unknown>,
  allowLoopbackHttp = false,
): WorkerGatewayConfig {
  const providerRaw = cleanEnvValue(env.MARKET_DATA_PROVIDER).toLowerCase();
  const provider = providerRaw === "none" ? "none" : "angelone";

  const modeRaw = cleanEnvValue(env.MARKET_DATA_MODE).toLowerCase();
  const mode: MarketDataMode =
    modeRaw === "disabled"
      ? "disabled"
      : modeRaw === "public_licensed"
        ? "public_licensed"
        : "private";

  const enablePrivateBrokerData = parseBoolFlag(env.ENABLE_PRIVATE_BROKER_DATA, false);
  // Public exchange quotes remain locked off unless BOTH flag is true AND mode is public_licensed.
  const enablePublicExchangeQuotes =
    mode === "public_licensed" && parseBoolFlag(env.ENABLE_PUBLIC_EXCHANGE_QUOTES, false);
  const demoMode = parseBoolFlag(env.MARKET_DATA_DEMO_MODE, false);

  const allowLoopback =
    allowLoopbackHttp || parseBoolFlag(env.MARKET_DATA_ALLOW_LOOPBACK, false);

  const rawUrl = cleanEnvValue(env.MARKET_DATA_ADAPTER_URL);
  let adapterUrl: string | null = null;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const isLoopback =
        parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
      if (
        !parsed.username &&
        !parsed.password &&
        (parsed.protocol === "https:" ||
          (parsed.protocol === "http:" && isLoopback && allowLoopback))
      ) {
        adapterUrl = parsed.origin + parsed.pathname.replace(/\/+$/, "");
      }
    } catch {
      adapterUrl = null;
    }
  }

  const tokenRaw = cleanEnvValue(env.MARKET_ADAPTER_AUTH_TOKEN);
  const adapterAuthToken =
    tokenRaw.length >= 16 && !/^(replace|your_|changeme|example|demo)/i.test(tokenRaw)
      ? tokenRaw
      : null;

  const cfAccessClientId = cleanEnvValue(env.CF_ACCESS_CLIENT_ID) || null;
  const cfAccessClientSecret = cleanEnvValue(env.CF_ACCESS_CLIENT_SECRET) || null;

  return {
    flags: {
      provider,
      mode,
      enablePrivateBrokerData,
      enablePublicExchangeQuotes,
      demoMode,
    },
    adapterUrl,
    adapterAuthToken,
    cfAccessClientId,
    cfAccessClientSecret,
  };
}
