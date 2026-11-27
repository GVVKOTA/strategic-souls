import { getAuthenticatedUser } from "../../../../backend/auth/session";
import { account, rate } from "../../../../database/queries/repository";
import {
  HttpError,
  protectMutation,
  body,
  assertAdultConsent,
} from "../../../../backend/middleware/security";
import {
  workspaceState,
  workspaceScanSnapshot,
  mutateWorkspace,
  researchEvidence,
} from "../../../../backend/services/research/workspace";
export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
async function handle(request: Request) {
  let traceId: string | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user)
      throw new HttpError(401, "Sign in to use your private workspace.");
    await rate(user.userId + ":x1read", 180, 60000);
    const current = await account(user.userId);
    assertAdultConsent(
      !!current &&
        current.adult_confirmed === 1 &&
        current.consent_version === "2026-11-14-v4",
    );
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      if (params.has("researchEvidence"))
        return Response.json(
          await researchEvidence(user.userId, params.get("researchEvidence")),
          { headers: PRIVATE_HEADERS },
        );
      const scanId = params.get("scanId"),
        scanBefore = params.get("scanBefore");
      if (scanId !== null && scanBefore !== null)
        throw new HttpError(400, "Choose a scan snapshot or a history page.");
      return Response.json(
        scanId === null
          ? await workspaceState(
              user.userId,
              scanBefore === null ? {} : { scanBefore },
            )
          : await workspaceScanSnapshot(user.userId, scanId),
        { headers: PRIVATE_HEADERS },
      );
    }
    protectMutation(request, 16384);
    const input = await body(request, 16384);
    const isScan = ["preflight-scan", "run-scan", "run-draw-scan"].includes(String(input.action));
    traceId = isScan ? crypto.randomUUID() : undefined;
    const result = await mutateWorkspace(user.userId, input, traceId);
    return Response.json(
      { ok: true, ...result },
      {
        headers: traceId
          ? { ...PRIVATE_HEADERS, "X-Scan-Trace-Id": traceId }
          : PRIVATE_HEADERS,
      },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : "Workspace unavailable. No successful save is implied.",
      },
      {
        status: e instanceof HttpError ? e.status : 503,
        headers: traceId
          ? { ...PRIVATE_HEADERS, "X-Scan-Trace-Id": traceId }
          : PRIVATE_HEADERS,
      },
    );
  }
}
export const GET = handle;
export const POST = handle;
