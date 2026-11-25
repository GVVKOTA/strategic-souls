import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { HttpError, assertAdultConsent } from "../../../../backend/middleware/security";
import {
  MarketGatewayError,
  gatewayQuotes,
} from "../../../../backend/services/market-data/angelone/gateway";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";
import {
  readSharedDailyQuotes,
  sharedHistoryGrants,
} from "../../../../backend/services/market-data/shared-history";
import { account, rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new MarketGatewayError(
        401,
        "UNAUTHENTICATED",
        "Sign in to access private broker market quotes.",
        "Sign in with your Strategic Souls account.",
      );
    }
    await rate(`${user.userId}:market-quote`, 45, 60_000);
    const current = await account(user.userId);
    assertAdultConsent(
      !!current &&
        current.adult_confirmed === 1 &&
        current.consent_version === "2026-11-14-v4",
    );

    const params = new URL(request.url).searchParams;
    const scope = params.get("scope");
    const rawIds = params.get("ids") ?? "";
    const ids = rawIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (scope === "shared") {
      if (ids.length > 160) {
        throw new MarketGatewayError(
          400,
          "INVALID_SYMBOL",
          "Request at most 160 instruments per shared quote query.",
          "Split shared quote requests into chunks of at most 160 instrument IDs.",
        );
      }
      if (ids.length === 0) {
        return Response.json({ quotes: [] }, { status: 200, headers: HEADERS });
      }
      const grants = await sharedHistoryGrants(Date.now(), "display");
      if (grants.length === 0) {
        return Response.json({ quotes: [] }, { status: 200, headers: HEADERS });
      }
      const shared = await readSharedDailyQuotes(ids, grants);
      const quotes = ids.flatMap((id) => {
        const quote = shared.get(id);
        if (!quote) return [];
        return [{
          id: quote.id,
          name: quote.instrument.name,
          assetClass: quote.instrument.type,
          currency: quote.instrument.currency,
          providerId: quote.providerId,
          value: quote.value,
          pctChange: quote.quality === "STALE" ? null : quote.pctChange,
          latestDate: quote.latestDate,
          quality: quote.quality,
          attribution: quote.attribution,
        }];
      });
      return Response.json({ quotes }, { status: 200, headers: HEADERS });
    }

    if (ids.length > 20) {
      throw new MarketGatewayError(
        400,
        "INVALID_SYMBOL",
        "Request at most 20 instruments per quote query.",
        "Pass 1 to 20 comma-separated instrument IDs.",
      );
    }

    const result = await gatewayQuotes({
      authenticated: true,
      isOwner: isDataOwner(user.userId),
      ids: ids.length > 0 ? ids : undefined,
      requestUrl: request.url,
    });
    return Response.json(result, { status: 200, headers: HEADERS });
  } catch (error) {
    if (error instanceof MarketGatewayError) {
      return Response.json(error.toResponseBody(), {
        status: error.status,
        headers: HEADERS,
      });
    }
    if (error instanceof HttpError) {
      return Response.json(
        {
          error: error.message,
          errorCode: error.status === 429 ? "RATE_LIMITED" : "PUBLIC_LICENSE_REQUIRED",
          actionHint: "Confirm workspace consent or wait before retrying.",
          serverTimestampUTC: new Date().toISOString(),
        },
        { status: error.status, headers: HEADERS },
      );
    }
    return Response.json(
      {
        error: "Market quote service temporarily unavailable.",
        errorCode: "UPSTREAM_ERROR",
        actionHint: "Retry shortly.",
        serverTimestampUTC: new Date().toISOString(),
      },
      { status: 503, headers: HEADERS },
    );
  }
}
