import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { HttpError, body, protectMutation } from "../../../../backend/middleware/security";
import {
  MarketGatewayError,
  gatewayAuthenticateTotp,
} from "../../../../backend/services/market-data/angelone/gateway";
import { isDataOwner } from "../../../../backend/services/market-data/data-service";
import { rate } from "../../../../database/queries/repository";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Owner-only manual 6-digit TOTP unlock endpoint.
 * Never persists the 6-digit TOTP; forwards only to the authenticated private adapter.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new MarketGatewayError(
        401,
        "UNAUTHENTICATED",
        "Sign in as workspace owner to unlock the broker session.",
        "Sign in first.",
      );
    }
    protectMutation(request, 1024);
    await rate(`${user.userId}:market-totp`, 6, 300_000);
    const payload = await body(request, 1024);
    const totp = typeof payload.totp === "string" ? payload.totp.trim() : "";

    const result = await gatewayAuthenticateTotp({
      authenticated: true,
      isOwner: isDataOwner(user.userId),
      totp,
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
          errorCode: error.status === 429 ? "RATE_LIMITED" : "BROKER_AUTH_FAILED",
          actionHint: "Wait before retrying TOTP unlock.",
          serverTimestampUTC: new Date().toISOString(),
        },
        { status: error.status, headers: HEADERS },
      );
    }
    return Response.json(
      {
        error: "Unable to authenticate private broker session.",
        errorCode: "UPSTREAM_ERROR",
        actionHint: "Check private adapter health.",
        serverTimestampUTC: new Date().toISOString(),
      },
      { status: 503, headers: HEADERS },
    );
  }
}
