import { getChatGPTUser } from "../../../chatgpt-auth";
import { rate } from "../../../../lib/repository";
import { body, HttpError, protectMutation } from "../../../../lib/security";
import { getSocial, mutateSocial } from "../../../../lib/x2/social";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function handle(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new HttpError(401, "Sign in to use the research network.");
    if (request.method !== "GET") protectMutation(request, 16384);
    await rate(user.userId + ":x2-social-read", 100, 60000);
    if (request.method === "GET")
      return json(
        await getSocial(user.userId, new URL(request.url).searchParams),
      );
    return json({
      ok: true,
      ...(await mutateSocial(user.userId, await body(request, 16384))),
    });
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    console.error("Research network operation failed", {
      type: error instanceof Error ? error.name : "Unknown",
    });
    return json(
      {
        error:
          "Research network storage is unavailable. No successful send is implied. Retry with the same request ID.",
      },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
