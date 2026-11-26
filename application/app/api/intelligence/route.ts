import { env as cfEnv } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../../backend/auth/session";
import {
  body,
  HttpError,
  protectMutation,
} from "../../../backend/middleware/security";
import {
  buildDailyWorldBriefing,
  COUNTRY_PROFILES,
  fetchMarketIntelligenceNews,
  fetchNaturalHazards,
} from "../../../backend/services/intelligence/news-and-disasters";
import {
  GEOPOLITICS_MARKET_PATHWAYS,
  NSE_SECTOR_INDICES,
} from "../../../backend/services/market-data/sectors-and-ecosystem";
import {
  getWatchRegions,
  mutateWatchRegions,
} from "../../../backend/services/user/preferences-store";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200, isPrivate = true): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": isPrivate
        ? "private, no-store"
        : "public, max-age=120, stale-while-revalidate=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function readWorkerSecrets(): Record<string, string | undefined> {
  try {
    const raw = cfEnv as unknown as Record<string, unknown>;
    return {
      SS_NEWS_API_KEY:
        typeof raw?.SS_NEWS_API_KEY === "string"
          ? raw.SS_NEWS_API_KEY
          : process.env.SS_NEWS_API_KEY,
    };
  } catch {
    return { SS_NEWS_API_KEY: process.env.SS_NEWS_API_KEY };
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const [hazards, news, watchRegions] = await Promise.all([
      fetchNaturalHazards(),
      fetchMarketIntelligenceNews(readWorkerSecrets()),
      user ? getWatchRegions(user.userId) : Promise.resolve(null),
    ]);
    const briefing = buildDailyWorldBriefing(hazards.events);

    return json(
      {
        asOfUTC: new Date().toISOString(),
        news,
        hazards,
        briefing,
        sectors: NSE_SECTOR_INDICES,
        countries: COUNTRY_PROFILES,
        geopoliticsPathways: GEOPOLITICS_MARKET_PATHWAYS,
        watchRegions,
      },
      200,
      Boolean(user),
    );
  } catch (err) {
    return json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "World intelligence services are temporarily unavailable.",
      },
      err instanceof HttpError ? err.status : 503,
      true,
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      throw new HttpError(401, "Sign in to manage your Watch Regions.");
    }
    protectMutation(request, 8192);
    const input = await body(request, 8192);
    const watchRegions = await mutateWatchRegions(user.userId, input);
    return json({ ok: true, watchRegions }, 200, true);
  } catch (err) {
    return json(
      {
        error:
          err instanceof HttpError
            ? err.message
            : "Could not save Watch Regions. Retry safely.",
      },
      err instanceof HttpError ? err.status : 503,
      true,
    );
  }
}
