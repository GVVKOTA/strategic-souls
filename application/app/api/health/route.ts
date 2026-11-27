import { env } from "cloudflare:workers";
import { evaluateHealthReadiness } from "../../../backend/services/health";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request): Promise<Response> {
  const mode = new URL(request.url).searchParams.get("mode") === "live" ? "live" : "ready";
  const buildCommit =
    typeof process === "undefined" ? null : process.env.STRATEGIC_SOULS_BUILD_SHA ?? null;
  const workerVersionId = env.CF_VERSION_METADATA?.id ?? null;

  const result = await evaluateHealthReadiness({
    mode,
    db: env.DB ?? null,
    buildCommit,
    workerVersionId,
    includeHeartbeats: true,
  });

  return Response.json(result.body, {
    status: result.statusCode,
    headers: HEADERS,
  });
}
