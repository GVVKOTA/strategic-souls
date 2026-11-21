/**
 * Angel One SmartAPI Read-Only Auth Session Manager.
 * - Authenticates via official POST /rest/auth/angelbroking/user/v1/loginByPassword.
 * - Supports POST /rest/auth/angelbroking/jwt/v1/generateTokens refresh (distinct from TOTP re-login).
 * - Stores JWT/refresh/feed tokens strictly in memory — never written to disk, D1, or browser.
 * - Never retries invalid TOTP/MPIN/401/403 in a loop.
 * - Strictly read-only: NO order, GTT, position, or funds endpoints exist here.
 */

import { redactText } from "./redact";
import { generateTotpCode, isValidSixDigitTotp } from "./totp";
import type { BrokerAuthState, ExchangeCode, MarketErrorCode } from "./types";

export const ANGEL_ONE_BASE_URL = "https://apiconnect.angelone.in";
const LOGIN_PATH = "/rest/auth/angelbroking/user/v1/loginByPassword";
const REFRESH_PATH = "/rest/auth/angelbroking/jwt/v1/generateTokens";
const PROFILE_PATH = "/rest/secure/angelbroking/user/v1/getProfile";

export type AuthSessionCredentials = {
  apiKey: string;
  clientId: string;
  mpin: string;
  totpSecret: string | null;
  localIp: string;
  publicIp: string;
  macAddress: string;
};

export type ActiveBrokerSession = {
  jwtToken: string;
  refreshToken: string | null;
  feedToken: string | null;
  authenticatedAtMs: number;
  expiresAtMs: number;
  enabledExchanges: ExchangeCode[];
};

export class BrokerAuthError extends Error {
  readonly code: MarketErrorCode;
  readonly authState: BrokerAuthState;
  readonly httpStatus: number;
  readonly brokerErrorCode: string;

  constructor(
    code: MarketErrorCode,
    authState: BrokerAuthState,
    message: string,
    httpStatus = 502,
    brokerErrorCode = "",
  ) {
    super(message);
    this.code = code;
    this.authState = authState;
    this.httpStatus = httpStatus;
    this.brokerErrorCode = brokerErrorCode;
  }
}

function mapExchangesFromProfile(rawExchanges: unknown): ExchangeCode[] {
  if (!Array.isArray(rawExchanges)) return [];
  const lower = new Set(
    rawExchanges
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.toLowerCase()),
  );
  const out: ExchangeCode[] = [];
  if (lower.has("nse_cm") || lower.has("nse")) out.push("NSE");
  if (lower.has("bse_cm") || lower.has("bse")) out.push("BSE");
  if (lower.has("mcx_fo") || lower.has("mcx")) out.push("MCX");
  return out;
}

/**
 * Computes conservative IST midnight expiry (Angel One sessions expire daily around midnight IST).
 * Caps session lifetime to <= 12 hours or next 00:00 IST, whichever is earlier.
 */
function nextIstMidnightMs(nowMs: number): number {
  const istOffsetMs = 5.5 * 3600 * 1000;
  const istNow = nowMs + istOffsetMs;
  const nextMidnightIst = (Math.floor(istNow / 86_400_000) + 1) * 86_400_000;
  const midnightUtcMs = nextMidnightIst - istOffsetMs;
  return Math.min(midnightUtcMs - 60_000, nowMs + 12 * 3600 * 1000);
}

export class BrokerAuthSession {
  private session: ActiveBrokerSession | null = null;
  private state: BrokerAuthState = "TOTP_REQUIRED";
  private lastError: string | null = null;
  private loginBlockedUntilMs = 0;
  private consecutiveAuthFailures = 0;
  private inflightLogin: Promise<ActiveBrokerSession> | null = null;

  private readonly creds: AuthSessionCredentials;
  private readonly fetcher: typeof fetch;

  constructor(
    creds: AuthSessionCredentials,
    fetcher: typeof fetch = fetch,
  ) {
    this.creds = creds;
    this.fetcher = fetcher;
    this.state = creds.totpSecret ? "EXPIRED" : "TOTP_REQUIRED";
  }

  private knownSecrets(): string[] {
    return [
      this.creds.apiKey,
      this.creds.clientId,
      this.creds.mpin,
      this.creds.totpSecret ?? "",
      this.session?.jwtToken ?? "",
      this.session?.refreshToken ?? "",
      this.session?.feedToken ?? "",
    ].filter(Boolean);
  }

  baseHeaders(includeAuth = false): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": this.creds.localIp,
      "X-ClientPublicIP": this.creds.publicIp,
      "X-MACAddress": this.creds.macAddress,
      "X-PrivateKey": this.creds.apiKey,
    };
    if (includeAuth && this.session?.jwtToken) {
      headers.Authorization = `Bearer ${this.session.jwtToken}`;
    }
    return headers;
  }

  getStatus(nowMs = Date.now()): {
    state: BrokerAuthState;
    authenticated: boolean;
    enabledExchanges: ExchangeCode[];
    expiresAtUTC: string | null;
    lastError: string | null;
  } {
    if (this.session && nowMs >= this.session.expiresAtMs) {
      this.state = "EXPIRED";
    }
    return {
      state: this.state,
      authenticated: this.session !== null && nowMs < this.session.expiresAtMs,
      enabledExchanges: this.session?.enabledExchanges ?? [],
      expiresAtUTC: this.session ? new Date(this.session.expiresAtMs).toISOString() : null,
      lastError: this.lastError,
    };
  }

  invalidate(reason?: string): void {
    this.session = null;
    this.state = this.creds.totpSecret ? "EXPIRED" : "TOTP_REQUIRED";
    if (reason) this.lastError = redactText(reason, this.knownSecrets());
  }

  private async postJson(
    path: string,
    payload: Record<string, unknown>,
    includeAuth = false,
  ): Promise<{ httpStatus: number; json: Record<string, unknown> | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const url = `${ANGEL_ONE_BASE_URL}${path}`;
      const res = await this.fetcher(url, {
        method: "POST",
        headers: this.baseHeaders(includeAuth),
        body: JSON.stringify(payload),
        redirect: "manual",
        signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        throw new BrokerAuthError(
          "UPSTREAM_ERROR",
          "AUTH_FAILED",
          "Angel One endpoint returned an unexpected redirect.",
          502,
        );
      }
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = null;
      }
      return { httpStatus: res.status, json };
    } catch (error) {
      if (error instanceof BrokerAuthError) throw error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      throw new BrokerAuthError(
        isAbort ? "TIMEOUT" : "UPSTREAM_ERROR",
        this.state,
        isAbort
          ? "Angel One authentication request timed out."
          : "Unable to reach Angel One authentication endpoint.",
        504,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private classifyAuthFailure(httpStatus: number, json: Record<string, unknown> | null): BrokerAuthError {
    const errorcode = String(json?.errorcode ?? "").trim().toUpperCase();
    const rawMsg = redactText(String(json?.message ?? ""), this.knownSecrets());
    const lower = `${errorcode} ${rawMsg}`.toLowerCase();

    if (httpStatus === 429 || lower.includes("rate") || lower.includes("exceeding access rate")) {
      return new BrokerAuthError(
        "RATE_LIMITED",
        "RATE_LIMITED",
        "Angel One authentication rate limit reached. Wait before retrying.",
        429,
        errorcode,
      );
    }

    if (
      httpStatus === 403 &&
      (lower.includes("ip") || lower.includes("whitelist") || lower.includes("static"))
    ) {
      return new BrokerAuthError(
        "BROKER_STATIC_IP_BLOCKED",
        "STATIC_IP_BLOCKED",
        "Angel One rejected this outbound IPv4 address (403). Verify static IPv4 registration on SmartAPI portal.",
        403,
        errorcode,
      );
    }

    if (errorcode === "AB1050" || lower.includes("totp")) {
      return new BrokerAuthError(
        "BROKER_TOTP_REQUIRED",
        "TOTP_REQUIRED",
        "Invalid or expired 6-digit TOTP code. Check device clock sync or enter a fresh authenticator code.",
        401,
        errorcode,
      );
    }

    if (
      httpStatus === 401 ||
      httpStatus === 403 ||
      errorcode === "AB1007" ||
      errorcode === "AB1010" ||
      errorcode === "AG8001" ||
      errorcode === "AG8002"
    ) {
      return new BrokerAuthError(
        "BROKER_AUTH_FAILED",
        "AUTH_FAILED",
        `Angel One rejected credentials or app authorization${errorcode ? ` (${errorcode})` : ""}. Verify Client ID, API Key, MPIN, and app status.`,
        401,
        errorcode,
      );
    }

    return new BrokerAuthError(
      "UPSTREAM_ERROR",
      "AUTH_FAILED",
      `Angel One login failed (HTTP ${httpStatus}${errorcode ? `, ${errorcode}` : ""}).`,
      502,
      errorcode,
    );
  }

  /**
   * Creates a fresh session using either an explicit manual 6-digit TOTP (preferred default)
   * or the user-opted-in local TOTP seed if configured. Never loops on invalid MFA.
   */
  async login(manualTotp?: string, nowMs = Date.now()): Promise<ActiveBrokerSession> {
    if (this.inflightLogin) return this.inflightLogin;

    if (nowMs < this.loginBlockedUntilMs && !manualTotp) {
      throw new BrokerAuthError(
        "BROKER_AUTH_FAILED",
        this.state,
        "Authentication cooldown active after previous failure to prevent account lockout. Retry shortly or submit fresh TOTP.",
        429,
      );
    }

    let totpCode: string;
    if (manualTotp !== undefined) {
      if (!isValidSixDigitTotp(manualTotp)) {
        throw new BrokerAuthError(
          "BROKER_TOTP_REQUIRED",
          "TOTP_REQUIRED",
          "Enter a valid 6-digit TOTP code from your authenticator app.",
          400,
        );
      }
      totpCode = manualTotp.trim();
    } else if (this.creds.totpSecret) {
      const generated = await generateTotpCode(this.creds.totpSecret, nowMs);
      totpCode = generated.code;
    } else {
      this.state = "TOTP_REQUIRED";
      throw new BrokerAuthError(
        "BROKER_TOTP_REQUIRED",
        "TOTP_REQUIRED",
        "Manual 6-digit TOTP code is required to open an Angel One read-only session.",
        401,
      );
    }

    const task = (async () => {
      try {
        const { httpStatus, json } = await this.postJson(LOGIN_PATH, {
          clientcode: this.creds.clientId,
          password: this.creds.mpin,
          totp: totpCode,
        });

        const data = (json?.data ?? null) as Record<string, unknown> | null;
        const jwtToken = typeof data?.jwtToken === "string" ? data.jwtToken : "";
        const refreshToken = typeof data?.refreshToken === "string" ? data.refreshToken : null;
        const feedToken = typeof data?.feedToken === "string" ? data.feedToken : null;

        if (httpStatus !== 200 || json?.status !== true || !jwtToken) {
          this.consecutiveAuthFailures += 1;
          const err = this.classifyAuthFailure(httpStatus, json);
          this.state = err.authState;
          this.lastError = err.message;
          // Back off automatically on non-manual failures so we never hammer Angel One login
          if (!manualTotp) {
            this.loginBlockedUntilMs =
              nowMs + Math.min(300_000, 15_000 * 2 ** Math.min(4, this.consecutiveAuthFailures - 1));
          }
          throw err;
        }

        this.session = {
          jwtToken,
          refreshToken,
          feedToken,
          authenticatedAtMs: nowMs,
          expiresAtMs: nextIstMidnightMs(nowMs),
          enabledExchanges: [],
        };
        this.state = "AUTHENTICATED";
        this.lastError = null;
        this.consecutiveAuthFailures = 0;
        this.loginBlockedUntilMs = 0;

        // Probe read-only profile exchanges (stores ONLY exchange codes, zero PII!)
        this.session.enabledExchanges = await this.fetchEnabledExchanges().catch(() => []);
        return this.session;
      } finally {
        this.inflightLogin = null;
      }
    })();

    this.inflightLogin = task;
    return task;
  }

  /**
   * Uses Angel One's official generateTokens endpoint to refresh JWT without re-sending TOTP.
   * Refresh inherits daily session validity; it does NOT replace daily TOTP MFA once expired.
   */
  async refreshSession(nowMs = Date.now()): Promise<ActiveBrokerSession | null> {
    if (!this.session?.refreshToken) return null;
    try {
      const { httpStatus, json } = await this.postJson(
        REFRESH_PATH,
        { refreshToken: this.session.refreshToken },
        true,
      );
      const data = (json?.data ?? null) as Record<string, unknown> | null;
      const newJwt = typeof data?.jwtToken === "string" ? data.jwtToken : "";
      if (httpStatus === 200 && json?.status === true && newJwt) {
        this.session = {
          ...this.session,
          jwtToken: newJwt,
          authenticatedAtMs: nowMs,
          expiresAtMs: nextIstMidnightMs(nowMs),
          refreshToken:
            typeof data?.refreshToken === "string"
              ? data.refreshToken
              : this.session.refreshToken,
          feedToken:
            typeof data?.feedToken === "string"
              ? data.feedToken
              : this.session.feedToken,
        };
        this.state = "AUTHENTICATED";
        this.lastError = null;
        return this.session;
      }
      this.invalidate("Session refresh rejected; fresh TOTP login required.");
      return null;
    } catch {
      return null;
    }
  }

  private async fetchEnabledExchanges(): Promise<ExchangeCode[]> {
    if (!this.session) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await this.fetcher(`${ANGEL_ONE_BASE_URL}${PROFILE_PATH}`, {
        method: "GET",
        headers: this.baseHeaders(true),
        redirect: "manual",
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { status?: boolean; data?: { exchanges?: unknown } };
      if (json?.status !== true) return [];
      // Extract ONLY exchange segment codes — discard name, email, phone, clientcode, pan immediately.
      return mapExchangesFromProfile(json.data?.exchanges);
    } finally {
      clearTimeout(timer);
    }
  }

  async ensureSession(nowMs = Date.now()): Promise<ActiveBrokerSession> {
    if (this.session && nowMs < this.session.expiresAtMs) {
      return this.session;
    }
    if (this.session?.refreshToken) {
      const refreshed = await this.refreshSession(nowMs);
      if (refreshed && nowMs < refreshed.expiresAtMs) {
        return refreshed;
      }
    }
    return this.login(undefined, nowMs);
  }
}
