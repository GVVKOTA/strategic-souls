import { resolveGatewayConfig } from "../../../backend/services/market-data/angelone/gateway";
import { PROVIDER_READINESS_MATRIX } from "../../../backend/services/intelligence/news-and-disasters";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const gw = resolveGatewayConfig(undefined, request.url);
  return Response.json(
    {
      product: "Strategic Souls",
      release: "X5.2",
      releaseName: "Post-X5.1 Precision 24-Feature Release",
      revisionMarker: "x5.2-precision-24-2026-11-22",
      dashboards: ["Global", "Strategy", "Community"],
      exchangeVenues: 24,
      classicPresets: 50,
      avatarPresets: 50,
      bannerPresets: 8,
      earthMapBasemap: "NASA GIBS Blue Marble Next Generation & VIIRS Black Marble (Public Domain)",
      auth: "Cloudflare Workers D1 session authentication (email/password; optional Google OAuth)",
      marketData: {
        publicSources:
          "ECB daily reference FX, US Treasury daily par yields, USGS M4.5+ earthquakes, and NASA EONET open natural events. No public commercial exchange quote redistribution enabled.",
        privateBrokerProvider: gw.flags.provider,
        mode: gw.flags.mode,
        privateBrokerEnabled: gw.flags.enablePrivateBrokerData,
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
      data: "ECB daily reference FX, US Treasury daily par yields, USGS/NASA EONET official public feeds. Private owner read-only NSE/BSE/MCX gateway gated behind owner auth; no broker execution, payments or public redistribution.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
