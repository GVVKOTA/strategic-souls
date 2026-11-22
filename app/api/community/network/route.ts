import { getAuthenticatedUser } from "../../../../backend/auth/session";
import {
  body,
  HttpError,
  protectMutation,
} from "../../../../backend/middleware/security";
import {
  getPendingFollowRequests,
  getPostComments,
  getPublicResearcherProfile,
  listProfileConnections,
  listWebSouls,
  mutateResearchNetwork,
  searchPublicResearchers,
} from "../../../../backend/services/community/research-network";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200, isPrivate = true): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": isPrivate
        ? "private, no-store"
        : "public, max-age=30, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const view = params.get("view") ?? "web";
    const user = await getAuthenticatedUser(request).catch(() => null);
    const viewerId = user?.userId ?? null;

    if (view === "profile") {
      const handle = params.get("handle") ?? "";
      return json(await getPublicResearcherProfile(viewerId, handle), 200, true);
    }

    if (view === "search") {
      const q = params.get("q") ?? "";
      return json(await searchPublicResearchers(viewerId, q), 200, true);
    }

    if (view === "followers" || view === "following") {
      const handle = params.get("handle") ?? "";
      return json(
        await listProfileConnections(viewerId, handle, view),
        200,
        true,
      );
    }

    if (view === "comments") {
      const postId = params.get("postId") ?? "";
      return json(await getPostComments(viewerId, postId), 200, true);
    }

    if (view === "follow-requests") {
      if (!viewerId) {
        throw new HttpError(401, "Sign in to view follow requests.");
      }
      return json(
        { requests: await getPendingFollowRequests(viewerId) },
        200,
        true,
      );
    }

    const rawSort = params.get("sort") ?? "newest";
    const sort =
      rawSort === "following" || rawSort === "evidence" ? rawSort : "newest";

    const feed = await listWebSouls(viewerId, {
      mode: params.get("mode") ?? "ALL",
      timeframe: params.get("timeframe") ?? "ALL",
      symbol: params.get("symbol") ?? "",
      search: params.get("q") ?? "",
      authorHandle: params.get("author") ?? "",
      savedOnly: params.get("saved") === "1",
      sort,
    });
    return json(feed, 200, !!viewerId);
  } catch (err) {
    return json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Community network is temporarily unavailable.",
      },
      err instanceof HttpError ? err.status : 503,
      true,
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new HttpError(401, "Sign in to interact with the Research Network.");
    }
    protectMutation(request, 16384);
    const input = await body(request, 16384);
    const result = await mutateResearchNetwork(user.userId, input);
    return json({ ok: true, ...result }, 200, true);
  } catch (err) {
    return json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Could not complete Community action. Retry safely.",
      },
      err instanceof HttpError ? err.status : 503,
      true,
    );
  }
}
