import { resolveGatewayConfig } from "../../../backend/services/market-data/angelone/gateway";
import { PROVIDER_READINESS_MATRIX } from "../../../backend/services/intelligence/news-and-disasters";
import { APP_RELEASE } from "../../../backend/services/release-meta";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const gw = resolveGatewayConfig(undefined, request.url);
  return Response.json(
    {
      product: APP_RELEASE.productName,
      organization: APP_RELEASE.organization,
      release: APP_RELEASE.releaseTrack,
      releaseName: APP_RELEASE.versionLabel,
      supportEmail: APP_RELEASE.supportEmail,
      targetLaunchDate: APP_RELEASE.targetLaunchDate,
      revisionMarker: "v3-rc1-2026-11-24",
      buildCommit:
        typeof process === "undefined"
          ? null
          : process.env.STRATEGIC_SOULS_BUILD_SHA ?? null,
      dashboards: ["Global", "Strategy", "Community"],
      globalMarketTiles: 8,
      exchangeVenues: 24,
      classicPresets: 50,
      avatarPresets: 50,
      profileBannerPresets: 8,
      portfolioBackdropPresets: 8,
      indianStatesAndUts: 36,
      earthMapBasemap:
        "NASA Blue Marble Next Generation & VIIRS Black Marble 3D Perspective Earth (Public Domain)",
      auth: "Cloudflare Workers D1 session authentication (email/password)",
      marketData: {
        publicSources:
          "ECB daily reference FX, US Treasury daily par yields, USGS M4.5+ earthquakes, and NASA EONET open natural events.",
        mode: gw.flags.mode,
        publicExchangeQuotesEnabled: gw.flags.enablePublicExchangeQuotes,
        demoMode: gw.flags.demoMode,
        readOnlyOnly: true,
      },
      providerReadiness: PROVIDER_READINESS_MATRIX.map((p) => ({
        id: p.id,
        provider: p.provider,
        currentStatus: p.currentStatus,
        requiresPaidOrCommercialLicense: p.requiresPaidOrCommercialLicense,
        requiresStaticIp: p.requiresStaticIp,
      })),
      data: "ECB daily reference FX, US Treasury daily par yields, USGS/NASA EONET official public feeds. Shared NSE, BSE, and MCX historical feeds require verified commercial data entitlements.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
