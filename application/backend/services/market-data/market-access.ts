import { getAuthenticatedUser } from "../../auth/session";
import { assertAdultConsent, HttpError } from "../../middleware/security";
import { account, rate } from "../../../database/queries/repository";

export async function marketAccess(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  const record = await account(user.userId);
  return record?.adult_confirmed === 1 && record.consent_version === "2026-11-14-v4" ? user.userId : null;
}

export async function requireMarketAccess(request: Request, operation: string, limit: number) {
  const user = await getAuthenticatedUser(request);
  if (!user) throw new HttpError(401, "Sign in for licensed market research.");
  const record = await account(user.userId);
  assertAdultConsent(record?.adult_confirmed === 1 && record.consent_version === "2026-11-14-v4");
  await rate(user.userId + ":" + operation, limit, 60_000);
  return user.userId;
}
