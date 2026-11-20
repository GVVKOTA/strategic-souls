export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(
    {
      product: 'Strategic Souls',
      release: 'X2',
      dashboards: ['Global', 'Strategy', 'Community'],
      exchangeVenues: 24,
      auth: 'Cloudflare Workers D1 session authentication (email/password; optional Google OAuth)',
      data: 'ECB daily reference FX and US Treasury daily par yields. No verified live tick feed; no broker execution, payments or public posting.',
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
