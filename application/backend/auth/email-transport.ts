import { env } from "cloudflare:workers";

export type SecurityEmailPurpose = "PASSWORD_RESET" | "EMAIL_VERIFY";

export type SecurityEmailMessage = {
  to: string;
  purpose: SecurityEmailPurpose;
  subject: string;
  text: string;
  /** Token is passed to the transport only (never returned in HTTP responses or logged). */
  token: string;
  actionUrl: string;
};

export type SecurityEmailDeliveryResult = {
  delivered: boolean;
  configured: boolean;
  provider: "resend" | "webhook" | "test" | "none";
  statusCode?: number;
  errorCode?: string;
};

type EmailTransportFn = (
  message: SecurityEmailMessage,
) => Promise<SecurityEmailDeliveryResult>;

let testTransportOverride: EmailTransportFn | null = null;

/**
 * Test-only hook for automated integration verification of reset/verification flows.
 * Never exposed to client code or HTTP routes.
 */
export function setTestSecurityEmailTransport(fn: EmailTransportFn | null): void {
  testTransportOverride = fn;
}

function runtimeEnv(): Record<string, string | undefined> {
  try {
    return (env as unknown as Record<string, string | undefined>) ?? {};
  } catch {
    return {};
  }
}

function validHttpsUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || !/^https:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\.|^::1$/.test(host)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isSecurityEmailConfigured(): boolean {
  if (testTransportOverride) return true;
  const e = runtimeEnv();
  return Boolean(
    (e.RESEND_API_KEY?.trim() && (e.SS_EMAIL_FROM?.trim() || "no-reply@strategicsouls.app")) ||
      validHttpsUrl(e.SS_EMAIL_WEBHOOK_URL),
  );
}

/**
 * Honest transactional email transport for security workflows (password reset & email verification).
 * If no provider is configured in Worker secrets, returns { delivered: false, configured: false }
 * cleanly without faking delivery or leaking raw tokens.
 */
export async function sendSecurityEmail(
  message: SecurityEmailMessage,
): Promise<SecurityEmailDeliveryResult> {
  if (testTransportOverride) {
    return testTransportOverride(message);
  }
  const e = runtimeEnv();
  const resendKey = e.RESEND_API_KEY?.trim();
  if (resendKey) {
    const from =
      e.SS_EMAIL_FROM?.trim() || "Strategic Souls <no-reply@strategicsouls.app>";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: controller.signal,
      });
      return {
        delivered: res.ok,
        configured: true,
        provider: "resend",
        statusCode: res.status,
        errorCode: res.ok ? undefined : `RESEND_HTTP_${res.status}`,
      };
    } catch (err) {
      return {
        delivered: false,
        configured: true,
        provider: "resend",
        errorCode: err instanceof Error && err.name === "AbortError" ? "RESEND_TIMEOUT" : "RESEND_NETWORK_ERROR",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const webhookUrl = validHttpsUrl(e.SS_EMAIL_WEBHOOK_URL);
  if (webhookUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (e.SS_EMAIL_WEBHOOK_TOKEN?.trim()) {
        headers.Authorization = `Bearer ${e.SS_EMAIL_WEBHOOK_TOKEN.trim()}`;
      }
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: message.to,
          purpose: message.purpose,
          subject: message.subject,
          text: message.text,
        }),
        signal: controller.signal,
      });
      return {
        delivered: res.ok,
        configured: true,
        provider: "webhook",
        statusCode: res.status,
        errorCode: res.ok ? undefined : `WEBHOOK_HTTP_${res.status}`,
      };
    } catch (err) {
      return {
        delivered: false,
        configured: true,
        provider: "webhook",
        errorCode: err instanceof Error && err.name === "AbortError" ? "WEBHOOK_TIMEOUT" : "WEBHOOK_NETWORK_ERROR",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { delivered: false, configured: false, provider: "none", errorCode: "EMAIL_NOT_CONFIGURED" };
}
