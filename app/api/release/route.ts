import { hasReadySharedHistory, sharedHistoryGrants } from "../../../backend/services/market-data/shared-history";
import { APP_RELEASE } from "../../../backend/services/release-meta";
import {
  CLASSIC_DAILY_LIMIT, ADVANCED_ROLLING_LIMIT,
} from "../../../backend/services/research/scan-quota";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = await sharedHistoryGrants().catch(() => []);
  const [daily, halfHour, hourly] = await Promise.all((["1d", "30m", "1h"] as const).map((resolution) =>
    hasReadySharedHistory(configured, resolution).catch(() => false)));
  const intervals = [["30m", halfHour], ["1h", hourly]].flatMap(([resolution, available]) => available ? [resolution] : []);

  return Response.json(
    {
      product: APP_RELEASE.productName,
      organization: APP_RELEASE.organization,
      release: APP_RELEASE.releaseTrack,
      releaseName: APP_RELEASE.versionLabel,
      supportEmail: APP_RELEASE.supportEmail,
      targetLaunchDate: APP_RELEASE.targetLaunchDate,
      revisionMarker: APP_RELEASE.revisionMarker,
      buildCommit:
        typeof process === "undefined"
          ? null
          : process.env.STRATEGIC_SOULS_BUILD_SHA ?? null,
      dashboards: ["Global", "Strategy", "Community"],
      globalMarketTiles: 8,
      exchangeVenues: 24,
      classicPresets: 50,
      classicDailyLimit: CLASSIC_DAILY_LIMIT,
      advancedRollingLimit: ADVANCED_ROLLING_LIMIT,
      avatarPresets: 50,
      profileBannerPresets: 8,
      portfolioBackdropPresets: 8,
      indianStatesAndUts: 36,
      earthMapBasemap:
        "NASA Blue Marble Next Generation & VIIRS Black Marble 3D Perspective Earth (Public Domain)",
      auth: "Session authentication (email/password)",
      capabilities: {
        publicOfficialReferences: true,
        sharedCommercialMarketData: daily || halfHour || hourly,
        sharedIntradayIntervalsAvailable: intervals,
        intradayIntervalsSupported: ["30m", "1h"],
        tradingExecutionEnabled: false,
      },
      marketData: {
        publicSources:
          "ECB daily reference FX, US Treasury daily par yields, USGS M4.5+ earthquakes, and NASA EONET open natural events.",
        readOnlyOnly: true,
      },
      data: "ECB daily reference FX, US Treasury daily par yields, USGS/NASA EONET official public feeds. Shared NSE, BSE, MCX, and global futures feeds require verified commercial data entitlements.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
