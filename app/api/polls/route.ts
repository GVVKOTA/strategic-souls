import { getAuthenticatedUser } from "../../../backend/auth/session";
import {
  body,
  HttpError,
  protectMutation,
} from "../../../backend/middleware/security";
import {
  castDailyPulseVote,
  getDailyPulsePolls,
} from "../../../backend/services/market-data/daily-pulse";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const payload = await getDailyPulsePolls(user?.userId ?? null);
    return json(payload, 200);
  } catch (err) {
    return json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Daily Market Pulse is temporarily unavailable.",
      },
      err instanceof HttpError ? err.status : 503,
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new HttpError(401, "Sign in to cast your Daily Market Pulse vote.");
    }
    protectMutation(request, 4096);
    const input = await body(request, 4096);
    const poll = await castDailyPulseVote(user.userId, input);
    return json({ ok: true, poll }, 200);
  } catch (err) {
    return json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Could not record your vote. Retry safely.",
      },
      err instanceof HttpError ? err.status : 503,
    );
  }
}
