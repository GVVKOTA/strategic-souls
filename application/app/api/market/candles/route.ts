import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { HttpError, assertAdultConsent } from "../../../../backend/middleware/security";
import {
  MarketGatewayError,
  gatewayCandles,
} from "../../../../backend/services/market-data/angelone/gateway";
import type { CandleInterval } from "../../../../backend/services/market-data/angelone/types";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";
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
        "Sign in to access private historical candles.",
        "Sign in with your Strategic Souls account.",
      );
    }
    await rate(`${user.userId}:market-candles`, 30, 60_000);
    const current = await account(user.userId);
    assertAdultConsent(
      !!current &&
        current.adult_confirmed === 1 &&
        current.consent_version === "2026-11-14-v4",
    );

    const params = new URL(request.url).searchParams;
    const id = (params.get("id") ?? "").trim();
    const intervalRaw = (params.get("interval") ?? "1d").trim();
    const daysRaw = Number(params.get("days") ?? "90");

    if (!id) {
      throw new MarketGatewayError(
        400,
        "INVALID_SYMBOL",
        "Instrument id query parameter is required.",
        "Pass id=NSE:SBIN, id=BSE:SBIN, or id=MCX:GOLD04DEC26FUT.",
      );
    }
    if (!["1d", "1h", "15m", "5m"].includes(intervalRaw)) {
      throw new MarketGatewayError(
        400,
        "INVALID_SYMBOL",
        "Unsupported candle interval. Allowed values: 1d, 1h, 15m, 5m.",
        "Select a supported interval.",
      );
    }

    const result = await gatewayCandles({
      authenticated: true,
      isOwner: isDataOwner(user.userId),
      id,
      interval: intervalRaw as CandleInterval,
      days: Number.isFinite(daysRaw) ? daysRaw : 90,
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
        error: "Historical candles temporarily unavailable.",
        errorCode: "UPSTREAM_ERROR",
        actionHint: "Quotes remain independent; retry candles shortly.",
        serverTimestampUTC: new Date().toISOString(),
      },
      { status: 503, headers: HEADERS },
    );
  }
}
