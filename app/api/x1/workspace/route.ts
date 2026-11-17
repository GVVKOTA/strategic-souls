import { getChatGPTUser } from "../../../chatgpt-auth";
import { account, rate } from "../../../../lib/repository";
import {
  HttpError,
  protectMutation,
  body,
  assertAdultConsent,
} from "../../../../lib/security";
import {
  workspaceState,
  workspaceScanSnapshot,
  mutateWorkspace,
  researchEvidence,
} from "../../../../lib/x1/workspace";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    const user = await getChatGPTUser();
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
      );
    }
    protectMutation(request, 16384);
    const result = await mutateWorkspace(
      user.userId,
      await body(request, 16384),
    );
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : "Workspace unavailable. No successful save is implied.",
      },
      { status: e instanceof HttpError ? e.status : 503 },
    );
  }
}
export const GET = handle;
export const POST = handle;
