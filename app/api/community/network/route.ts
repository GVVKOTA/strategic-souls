import { getAuthenticatedUser } from "../../../../backend/auth/session";
import {
  body,
  HttpError,
  protectMutation,
} from "../../../../backend/middleware/security";
import {
  getPendingFollowRequests,
  getPostComments,
  getPostInsights,
  getPublicResearcherProfile,
  listProfileConnections,
  listWebSouls,
  mutateResearchNetwork,
  recordPostShare,
  recordPostView,
  searchPublicResearchers,
} from "../../../../backend/services/community/research-network";

export const dynamic = "force-dynamic";

function clientFingerprintFrom(request: Request): string {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  const ua = (request.headers.get("user-agent") || "unknown").slice(0, 120);
  return `${ip}|${ua}`;
}

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

    if (view === "insights") {
      const postId = params.get("postId") ?? "";
      return json(await getPostInsights(viewerId, postId), 200, true);
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

    if (view === "post") {
      const postId = params.get("postId") ?? "";
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(postId)) throw new HttpError(404, "Soul unavailable.");
      const result = await listWebSouls(viewerId, { postId });
      if (!result.posts.length) throw new HttpError(404, "Soul unavailable.");
      return json({ post: result.posts[0] }, 200, true);
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
    protectMutation(request, 16384);
    const input = await body(request, 16384);
    const user = await getAuthenticatedUser(request).catch(() => null);
    const action = String(input.action ?? "");

    if (action === "record-view") {
      const result = await recordPostView(
        user?.userId ?? null,
        String(input.postId ?? ""),
        clientFingerprintFrom(request),
      );
      return json({ ok: true, ...result }, 200, true);
    }

    if (action === "record-share") {
      const result = await recordPostShare(
        user?.userId ?? null,
        String(input.postId ?? ""),
        input.channel,
        clientFingerprintFrom(request),
      );
      return json({ ok: true, ...result }, 200, true);
    }

    if (!user) {
      throw new HttpError(401, "Sign in to interact with the Research Network.");
    }
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
