import { getChatGPTUser } from '../../../../backend/auth/chatgpt-auth';
import { rate } from '../../../../database/queries/repository';
import { body, HttpError, protectMutation } from '../../../../backend/middleware/security';
import { getCommunity, mutateCommunity } from '../../../../backend/services/community/community';
import { COMMUNITY_LIMITS } from '../../../../backend/services/community/community-model';

export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });

async function handle(request: Request): Promise<Response> {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new HttpError(401, 'Sign in with ChatGPT to use your private Community.');
    if (request.method !== 'GET') protectMutation(request, 16384);
    await rate(user.userId + ':x1-community-read', COMMUNITY_LIMITS.requestsPerMinute, 60000);
    const url = new URL(request.url);
    if (request.method === 'GET') return json(await getCommunity(user.userId, url.searchParams.get('groupId'), url.searchParams.get('before')));
    const result = await mutateCommunity(user.userId, await body(request, 16384));
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error('Community operation failed', { type: error instanceof Error ? error.name : 'Unknown' });
    return json({ error: 'Community storage is unavailable. No successful save is implied; retry safely.' }, 503);
  }
}

export const GET = handle;
export const POST = handle;
