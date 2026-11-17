import { env } from "cloudflare:workers";
import { HttpError } from "../security";
export type Config = {
  url: string;
  key: string;
  google: boolean;
  local: boolean;
};
export function config(): Config | null {
  const e = env as unknown as Record<string, string | undefined>;
  if (!e.SUPABASE_URL || !e.SUPABASE_PUBLISHABLE_KEY) return null;
  const url = new URL(e.SUPABASE_URL),
    local =
      e.V3_LOCAL_DEV === "1" &&
      ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (!local && url.protocol !== "https:")
  )
    throw new HttpError(503, "Backend configuration is invalid.");
  return {
    url: url.origin,
    key: e.SUPABASE_PUBLISHABLE_KEY,
    google: e.V3_GOOGLE_ENABLED === "1",
    local,
  };
}
export function requiredConfig(): Config {
  const c = config();
  if (!c)
    throw new HttpError(
      503,
      "Independent sign-in is not configured. Start the local Supabase stack and configure the server environment.",
    );
  return c;
}
export function cookies(request: Request): Record<string, string> {
  return Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((p) => p.trim().split(/=(.*)/).slice(0, 2))
      .filter((p) => p.length === 2),
  );
}
export function cookie(
  name: string,
  value: string,
  request: Request,
  age: number,
): string {
  const secure = new URL(request.url).protocol === "https:";
  return (
    name +
    "=" +
    encodeURIComponent(value) +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
    age +
    (secure ? "; Secure" : "")
  );
}
export async function backend(
  c: Config,
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<unknown> {
  if (!/^\/(auth\/v1\/|rest\/v1\/|storage\/v1\/)/.test(path))
    throw new HttpError(500, "Unsupported backend interface.");
  let response: Response;
  try {
    response = await fetch(c.url + path, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: {
        apikey: c.key,
        ...(token ? { Authorization: "Bearer " + token } : {}),
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new HttpError(
      503,
      "Research backend is unavailable. No successful save is implied.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = (data as { code?: string })?.code;
    const status =
      code === "23505"
        ? 409
        : code === "42501" || response.status === 403
          ? 403
          : response.status === 401
            ? 401
            : response.status === 404
              ? 404
              : response.status === 429
                ? 429
                : response.status >= 500
                  ? 503
                  : 400;
    const message =
      code === "23505"
        ? "Handle, request ID or version conflicts with an existing record."
        : code === "40001"
          ? "The research changed. Refresh before committing your revision."
          : status === 401
            ? "Your session expired. Sign in again."
            : status === 403
              ? "This action is not permitted for your current role."
              : status === 429
                ? "Too many requests. Wait before retrying."
                : status === 503
                  ? "The backend is unavailable. Retry safely."
                  : "The request was rejected. Check the fields and current permissions.";
    throw new HttpError(code === "40001" ? 409 : status, message);
  }
  return data;
}
export type Identity = { id: string; email?: string; token: string };
export async function identity(
  request: Request,
  c = requiredConfig(),
): Promise<Identity> {
  const token = decodeURIComponent(cookies(request).ss_access ?? "");
  if (!token || token.length > 8192)
    throw new HttpError(
      401,
      "Sign in with Google or an email code to continue.",
    );
  const result = (await backend(c, "/auth/v1/user", token)) as {
    id?: string;
    email?: string;
    email_confirmed_at?: string;
    is_anonymous?: boolean;
  };
  if (!result.id || !result.email_confirmed_at || result.is_anonymous)
    throw new HttpError(401, "A verified account is required.");
  return { id: result.id, email: result.email, token };
}
export async function rpc(
  c: Config,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  if (!/^[a-z_]+$/.test(name)) throw new HttpError(500, "Invalid operation.");
  const result = await backend(c, "/rest/v1/rpc/v3_" + name, token, {
    method: "POST",
    body: JSON.stringify(args),
  });
  // PostgREST returns named composite rows as a JSON array; JSONB scalar RPCs
  // return their object directly. Normalize only the explicitly single-row calls.
  if (
    [
      "save_profile",
      "create_team",
      "save_soul",
      "append_event",
      "comment",
      "task",
      "save_scan",
      "queue_run",
    ].includes(name) &&
    Array.isArray(result)
  ) {
    if (result.length !== 1)
      throw new HttpError(
        503,
        "The backend did not confirm exactly one saved record.",
      );
    return result[0];
  }
  return result;
}
export async function read(
  c: Config,
  token: string,
  table: string,
  query = "",
): Promise<unknown> {
  const allowed = [
    "holdings",
    "bodies",
    "teams",
    "memberships",
    "souls",
    "soul_versions",
    "soul_events",
    "scan_versions",
    "comments",
    "research_tasks",
    "audit_events",
    "moderation_cases",
    "notification_preferences",
    "scan_runs",
    "backtest_folds",
    "dataset_versions",
    "source_entitlements",
  ];
  if (!allowed.includes(table)) throw new HttpError(404, "Resource not found.");
  return backend(c, "/rest/v1/v3_" + table + "?" + query, token);
}
export function sessionHeaders(data: unknown, request: Request): Headers {
  const t = data as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!t.access_token || !t.refresh_token)
    throw new HttpError(401, "Sign-in did not return a valid session.");
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  headers.append(
    "Set-Cookie",
    cookie(
      "ss_access",
      t.access_token,
      request,
      Math.min(t.expires_in ?? 3600, 3600),
    ),
  );
  headers.append(
    "Set-Cookie",
    cookie("ss_refresh", t.refresh_token, request, 7 * 86400),
  );
  return headers;
}
