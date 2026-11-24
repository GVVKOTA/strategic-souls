/**
 * Strategic Souls X5.1 — Strategy Scan Execution Endpoint (supports up to 512 KB for private CSVs & Draw strokes).
 * Delegates strictly to the canonical mutateWorkspace() service and enforces auth + consent + CSRF.
 */
import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { account, rate } from "../../../../database/queries/repository";
import {
  assertAdultConsent,
  body,
  HttpError,
  protectMutation,
} from "../../../../backend/middleware/security";
import { cancelMarketScan, listActiveMarketScans, marketScanStatus, submitMarketScan } from "../../../../backend/services/research/market-scan-jobs";
import { mutateWorkspace } from "../../../../backend/services/research/workspace";

export const dynamic = "force-dynamic";

const MAX_SCAN_BODY_BYTES = 524_288; // 512 KB for private CSV OHLCV / Draw payloads

export const GET = handle;
export const POST = handle;

async function handle(request: Request): Promise<Response> {
  const traceId = crypto.randomUUID();
  const started = Date.now();
  const headers = { "Cache-Control": "private, no-store", "X-Scan-Trace-Id": traceId };
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new HttpError(401, "Sign in to run Soul Scans.");
    }
    await rate(user.userId + ":x51-scan-req", 90, 60_000);
    const current = await account(user.userId);
    assertAdultConsent(
      !!current &&
        current.adult_confirmed === 1 &&
        current.consent_version === "2026-11-14-v4",
    );
    if (request.method === "GET") {
      const jobId = new URL(request.url).searchParams.get("jobId");
      return Response.json(jobId
        ? await marketScanStatus(user.userId, jobId)
        : { jobs: await listActiveMarketScans(user.userId) }, { headers });
    }
    protectMutation(request, MAX_SCAN_BODY_BYTES);
    const input = await body(request, MAX_SCAN_BODY_BYTES);
    if (
      !["run-scan", "parse-discover", "run-draw-scan", "cancel", "run-watchlist-scan", "run-watchlist-draw"].includes(
        String(input.action ?? ""),
      )
    ) {
      throw new HttpError(400, "Unsupported strategy scan action.");
    }
    const action = input.action;
    if (action === "cancel")
      return Response.json(await cancelMarketScan(user.userId, input.jobId), { headers });
    if (action === "run-scan" || action === "run-draw-scan")
      return Response.json(await submitMarketScan(user.userId, input), { status: 202, headers });
    if (action === "run-watchlist-scan" || action === "run-watchlist-draw")
      return Response.json(await submitMarketScan(user.userId, {
        ...input, action: action === "run-watchlist-scan" ? "run-scan" : "run-draw-scan",
        scopeIntent: "EXPLICIT", universePreset: "MY_WATCHLIST",
      }), { status: 202, headers });
    const result = await mutateWorkspace(user.userId, input, traceId);
    console.info({ event: "soul_scan_request", traceId, action: input.action, status: 200, durationMs: Date.now() - started });
    return Response.json(
      { ok: true, ...result },
      { headers },
    );
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 503;
    console.warn({ event: "soul_scan_request", traceId, status, durationMs: Date.now() - started });
    return Response.json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Strategy scan unavailable. Retry with the same request to confirm its result.",
      },
      {
        status,
        headers,
      },
    );
  }
}
