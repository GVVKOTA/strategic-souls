import { getAuthenticatedUser } from "../../../../backend/auth/session";
import {
  body,
  HttpError,
  protectMutation,
} from "../../../../backend/middleware/security";
import {
  DEFAULT_NINE_CARD_IDS,
  getMarketOverviewPayload,
  saveUserMarketLayout,
} from "../../../../backend/services/market-data/nine-card-markets";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const payload = await getMarketOverviewPayload(user?.userId ?? null);
    return Response.json(payload, {
      headers: {
        "Cache-Control": user
          ? "private, no-store"
          : "public, max-age=60, stale-while-revalidate=120",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return Response.json(
      {
        code: "MARKET_OVERVIEW_UNAVAILABLE",
        error:
          err instanceof HttpError
            ? err.message
            : "Market overview is temporarily unavailable.",
        retryable: true,
      },
      {
        status: err instanceof HttpError ? err.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new HttpError(401, "Sign in to save your customized 8-card market grid.");
    }
    protectMutation(request, 8192);
    const input = await body(request, 8192);
    const ids =
      input.action === "reset" ? [...DEFAULT_NINE_CARD_IDS] : input.ids;
    const expectedVersion = Number(input.expectedVersion ?? input.version ?? 0);
    const layout = await saveUserMarketLayout(user.userId, expectedVersion, ids);
    const overview = await getMarketOverviewPayload(user.userId);
    return Response.json(
      { ok: true, layout, cards: overview.cards },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (err) {
    return Response.json(
      {
        code: err instanceof HttpError && err.status === 409 ? "LAYOUT_VERSION_CONFLICT" : "LAYOUT_SAVE_FAILED",
        error:
          err instanceof HttpError
            ? err.message
            : "Could not save market grid layout. Retry safely.",
        retryable: !(err instanceof HttpError && err.status === 400),
      },
      {
        status: err instanceof HttpError ? err.status : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
