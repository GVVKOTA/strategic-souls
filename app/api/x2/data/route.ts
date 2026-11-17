import { getChatGPTUser } from "../../../chatgpt-auth";
import { account, rate } from "../../../../lib/repository";
import {
  HttpError,
  assertAdultConsent,
  body,
  protectMutation,
} from "../../../../lib/security";
import {
  assetResearch,
  chartLayout,
  instrumentRegistry,
  saveChartLayout,
  loadExtendedMarketData,
} from "../../../../lib/x2/data-service";
import type { Interval } from "../../../../lib/x2/data-types";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getChatGPTUser();
    if (!user) throw new HttpError(401, "Sign in to view research.");
    await rate(user.userId + ":x2dataread", 120, 60000);
    const current = await account(user.userId);
    assertAdultConsent(
      !!current &&
        current.adult_confirmed === 1 &&
        current.consent_version === "2026-11-14-v4",
    );
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      if (params.get("view") === "overview")
        return Response.json(
          await loadExtendedMarketData(
            user.userId,
            params.has("ids")
              ? (params.get("ids") ?? "").split(",").filter(Boolean)
              : undefined,
          ),
          { headers },
        );
      if (params.get("view") === "instruments")
        return Response.json(
          { instruments: await instrumentRegistry() },
          { headers },
        );
      const id = params.get("id") ?? "",
        interval = (params.get("interval") ?? "1d") as Interval;
      if (!id || id.length > 80)
        throw new HttpError(400, "Choose an instrument.");
      const [asset, layout] = await Promise.all([
        assetResearch(id, user.userId, interval),
        chartLayout(user.userId, id),
      ]);
      return Response.json({ asset, layout }, { headers });
    }
    protectMutation(request, 16384);
    return Response.json(
      {
        ok: true,
        layout: await saveChartLayout(user.userId, await body(request, 16384)),
      },
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : "Research data unavailable. No successful save is implied.",
      },
      { status: e instanceof HttpError ? e.status : 503, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
