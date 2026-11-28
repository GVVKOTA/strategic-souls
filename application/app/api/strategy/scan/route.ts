/**
 * Strategic Souls — Strategy Scan Execution & Durable Job Endpoint.
 * Supports:
 *   - GET ?jobId=... : poll durable market scan job status (with bounded inline cached batch progression)
 *   - GET            : list active durable jobs for reload recovery
 *   - POST           : run-scan, run-draw-scan, run-watchlist-scan, run-watchlist-draw, cancel, preflight-scan, parse-discover
 * Enforces auth, adult consent, CSRF/origin checks, granular error codes, and zero phantom quota charges.
 */
import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { account, rate } from "../../../../database/queries/repository";
import {
  assertAdultConsent,
  body,
  HttpError,
  protectMutation,
} from "../../../../backend/middleware/security";
import { resolveGatewayConfig } from "../../../../backend/services/market-data/angelone/gateway";
import {
  hasLegacySharedCommercialConfig,
  isOwnerSubject,
  sharedUniverseReadiness,
} from "../../../../backend/services/market-data/shared-history";
import {
  ScanActionError,
  cancelMarketScan,
  listActiveMarketScans,
  marketScanStatus,
  submitMarketScan,
} from "../../../../backend/services/research/market-scan-jobs";
import { captureFrozenSoulMemory } from "../../../../backend/services/research/soul-memory";
import { getScanLineage } from "../../../../backend/services/research/reproducible-research";
import { mutateWorkspace } from "../../../../backend/services/research/workspace";

export const dynamic = "force-dynamic";

const MAX_SCAN_BODY_BYTES = 524_288; // 512 KB for private CSV OHLCV / Draw payloads

async function shouldUseDurableJob(userId: string, input: Record<string, unknown>): Promise<boolean> {
  if (input.async === true) return true;
  const preset = typeof input.universePreset === "string" ? input.universePreset : "";
  const universe = typeof input.universe === "string" ? input.universe : "";
  if (preset === "CUSTOM_CSV" || preset === "ECB_DAILY" || universe === "ECB_DAILY") {
    return false;
  }
  if (preset === "NIFTY_500" || universe === "NIFTY_500") {
    return true;
  }
  const explicitIds = Array.isArray(input.instrumentIds) ? input.instrumentIds : [];
  if (preset === "MARKET" && explicitIds.length === 0) {
    const owner = isOwnerSubject(userId);
    const gw = resolveGatewayConfig();
    const readiness = await sharedUniverseReadiness().catch(() => null);
    if (readiness?.status === "READY") return true;
    // Preserve owner's synchronous private Angel One broker scan when no shared Nifty 500 is ready.
    if (owner && gw.flags.enablePrivateBrokerData) return false;
    // Preserve legacy non-shared redistribution-enabled commercial configs (e.g. TrueData/EODHD).
    if (await hasLegacySharedCommercialConfig()) return false;
    // Otherwise route through durable preflight so ordinary users receive exact granular error codes.
    return true;
  }
  return false;
}

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
      const searchParams = new URL(request.url).searchParams;
      const jobId = searchParams.get("jobId");
      if (jobId) {
        return Response.json(await marketScanStatus(user.userId, jobId, true), { headers });
      }
      const lineageScanId = searchParams.get("lineage");
      if (lineageScanId && /^[a-zA-Z0-9_-]{8,80}$/.test(lineageScanId)) {
        return Response.json(await getScanLineage(user.userId, lineageScanId), { headers });
      }
      if (searchParams.get("soulMemory") === "1") {
        const mem = await captureFrozenSoulMemory(user.userId, Date.now());
        return Response.json(
          {
            soulMemory: {
              version: mem.scoreVersion,
              istDay: mem.istDay,
              stateVersion: mem.stateVersion,
              status: mem.status,
              scansAnalyzed: mem.scansAnalyzed,
              distinctSignals: mem.distinctSignals,
              evaluatedOutcomes: mem.evaluatedOutcomes,
              confirmedOutcomes: 0,
              asOfCutoff: mem.asOfCutoff,
              resetsAtUtc: mem.resetsAtUtc,
              resetLabel: "Resets 00:00 IST",
              note: "Point-in-time bounded 0–100 daily research ranking (no look-ahead). Resets at 00:00 IST without modifying your GRAVEYARD archive.",
            },
          },
          { headers },
        );
      }
      const [jobs, mem] = await Promise.all([
        listActiveMarketScans(user.userId),
        captureFrozenSoulMemory(user.userId, Date.now()),
      ]);
      return Response.json(
        {
          jobs,
          soulMemory: {
            version: mem.scoreVersion,
            istDay: mem.istDay,
            stateVersion: mem.stateVersion,
            status: mem.status,
            scansAnalyzed: mem.scansAnalyzed,
            distinctSignals: mem.distinctSignals,
            evaluatedOutcomes: mem.evaluatedOutcomes,
            confirmedOutcomes: 0,
            asOfCutoff: mem.asOfCutoff,
            resetsAtUtc: mem.resetsAtUtc,
            resetLabel: "Resets 00:00 IST",
            note: "Point-in-time bounded 0–100 daily research ranking (no look-ahead). Resets at 00:00 IST without modifying your GRAVEYARD archive.",
          },
        },
        { headers },
      );
    }

    protectMutation(request, MAX_SCAN_BODY_BYTES);
    const input = await body(request, MAX_SCAN_BODY_BYTES);
    const action = String(input.action ?? "");
    if (
      ![
        "preflight-scan",
        "run-scan",
        "parse-discover",
        "run-draw-scan",
        "cancel",
        "run-watchlist-scan",
        "run-watchlist-draw",
      ].includes(action)
    ) {
      throw new HttpError(400, "Unsupported strategy scan action.");
    }
    if (action === "cancel") {
      return Response.json(await cancelMarketScan(user.userId, input.jobId), { headers });
    }
    if (action === "run-watchlist-scan" || action === "run-watchlist-draw") {
      const submitted = await submitMarketScan(user.userId, {
        ...input,
        action: action === "run-watchlist-scan" ? "run-scan" : "run-draw-scan",
        scopeIntent: "EXPLICIT",
        universePreset: "MY_WATCHLIST",
      });
      console.info({ event: "soul_scan_request", traceId, action, status: 202, durationMs: Date.now() - started });
      return Response.json(submitted, { status: 202, headers });
    }
    if ((action === "run-scan" || action === "run-draw-scan") && (await shouldUseDurableJob(user.userId, input))) {
      const submitted = await submitMarketScan(user.userId, input);
      console.info({ event: "soul_scan_request", traceId, action, status: 202, durationMs: Date.now() - started });
      return Response.json(submitted, { status: 202, headers });
    }

    const result = await mutateWorkspace(user.userId, input, traceId);
    console.info({ event: "soul_scan_request", traceId, action, status: 200, durationMs: Date.now() - started });
    return Response.json(
      { ok: true, ...result },
      { headers },
    );
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 503;
    const errorCode = err instanceof ScanActionError ? err.errorCode : undefined;
    const retryable = err instanceof ScanActionError ? err.retryable : status >= 500;
    const details = err instanceof ScanActionError ? err.details : undefined;
    console.warn({ event: "soul_scan_request", traceId, status, errorCode, durationMs: Date.now() - started });
    return Response.json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Strategy scan unavailable. Retry with the same request to confirm its result.",
        ...(errorCode ? { errorCode } : {}),
        retryable,
        traceId,
        ...(details ? { details } : {}),
      },
      {
        status,
        headers,
      },
    );
  }
}

export const GET = handle;
export const POST = handle;
