import { getChatGPTUser } from "../../../../backend/auth/chatgpt-auth";
import { HttpError, body, protectMutation } from "../../../../backend/middleware/security";
import {
  configureProvider,
  isDataOwner,
  providerSettings,
  testProvider,
} from "../../../../backend/services/market-data/data-service";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getChatGPTUser();
    if (!user) throw new HttpError(401, "Sign in.");
    if (request.method === "GET") {
      if (new URL(request.url).searchParams.get("view") === "capabilities")
        return Response.json(
          { isOwner: isDataOwner(user.userId) },
          { headers },
        );
      return Response.json(await providerSettings(user.userId), { headers });
    }
    protectMutation(request, 32768);
    const input = await body(request, 32768);
    if (input.op !== "configure" && input.op !== "test")
      throw new HttpError(400, "Choose a supported settings action.");
    return Response.json(
      input.op === "configure"
        ? await configureProvider(user.userId, input)
        : await testProvider(user.userId, input),
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : "Provider control unavailable. Secrets are not returned.",
      },
      { status: e instanceof HttpError ? e.status : 503, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
