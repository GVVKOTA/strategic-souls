import { getAuthenticatedUser } from "../../../../backend/auth/session";
import {
  body,
  HttpError,
  protectMutation,
} from "../../../../backend/middleware/security";
import {
  getSearchHistory,
  mutateSearchHistory,
} from "../../../../backend/services/user/preferences-store";

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
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new HttpError(401, "Sign in to access private search history.");
    }
    return json(await getSearchHistory(user.userId), 200);
  } catch (err) {
    return json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Search history is temporarily unavailable.",
      },
      err instanceof HttpError ? err.status : 503,
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new HttpError(401, "Sign in to save private search history.");
    }
    protectMutation(request, 8192);
    const input = await body(request, 8192);
    const state = await mutateSearchHistory(user.userId, input);
    return json({ ok: true, ...state }, 200);
  } catch (err) {
    return json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Could not update search history.",
      },
      err instanceof HttpError ? err.status : 503,
    );
  }
}
