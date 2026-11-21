import { getAuthenticatedUser } from "../../../backend/auth/session";
import {
  body,
  HttpError,
  protectMutation,
} from "../../../backend/middleware/security";
import {
  getPrivateProfile,
  mutatePrivateProfile,
} from "../../../backend/services/profile/profile";
import { rate } from "../../../database/queries/repository";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function handle(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new HttpError(401, "Sign in to manage your profile and settings.");
    }
    await rate(user.userId + ":x6-profile-read", 120, 60_000);
    if (request.method === "GET") {
      return json({ profile: await getPrivateProfile(user) });
    }
    protectMutation(request, 8192);
    const input = await body(request, 8192);
    const profile = await mutatePrivateProfile(user, input);
    return json({ ok: true, profile });
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status);
    }
    console.error("Profile operation failed", {
      type: error instanceof Error ? error.name : "Unknown",
    });
    return json(
      {
        error:
          "Profile service is temporarily unavailable. No changes were saved; retry safely.",
      },
      503,
    );
  }
}

export const GET = handle;
export const POST = handle;
