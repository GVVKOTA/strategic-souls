import { resolveGatewayConfig } from "../../../backend/services/market-data/angelone/gateway";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const gw = resolveGatewayConfig(undefined, request.url);
  return Response.json(
    {
      product: "Strategic Souls",
      release: "X4",
      revisionMarker: "x4-intelligent-scanner-search-community-2026-11-21",
      dashboards: ["Global", "Strategy", "Community"],
      exchangeVenues: 24,
      auth: "Cloudflare Workers D1 session authentication (email/password; optional Google OAuth)",
      marketData: {
        publicSources:
          "ECB daily reference FX and US Treasury daily par yields. No public commercial exchange quote redistribution enabled.",
        privateBrokerProvider: gw.flags.provider,
        mode: gw.flags.mode,
        privateBrokerEnabled: gw.flags.enablePrivateBrokerData,
        publicExchangeQuotesEnabled: gw.flags.enablePublicExchangeQuotes,
        demoMode: gw.flags.demoMode,
        readOnlyOnly: true,
      },
      data: "ECB daily reference FX and US Treasury daily par yields. Private owner read-only NSE/BSE/MCX gateway gated behind owner auth; no broker execution, payments or public redistribution.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
