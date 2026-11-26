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

export function isSecurityEmailConfigured(): boolean {
  if (testTransportOverride) return true;
  const e = runtimeEnv();
  return Boolean(
    (e.RESEND_API_KEY?.trim() && (e.SS_EMAIL_FROM?.trim() || "no-reply@strategicsouls.app")) ||
      e.SS_EMAIL_WEBHOOK_URL?.trim(),
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
      return { delivered: res.ok, configured: true, provider: "resend" };
    } catch {
      return { delivered: false, configured: true, provider: "resend" };
    } finally {
      clearTimeout(timer);
    }
  }

  const webhookUrl = e.SS_EMAIL_WEBHOOK_URL?.trim();
  if (webhookUrl && /^https:\/\//i.test(webhookUrl)) {
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
      return { delivered: res.ok, configured: true, provider: "webhook" };
    } catch {
      return { delivered: false, configured: true, provider: "webhook" };
    } finally {
      clearTimeout(timer);
    }
  }

  return { delivered: false, configured: false, provider: "none" };
}
