export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ product: 'Strategic Souls', release: 'X1', sourceBase: '4283d14976201baf7c84db6db6ea29dea33374a8', schemaChanged: true, dashboards: ['Global','Strategy','Community'], exchangeVenues:24, data:'ECB daily reference FX and US Treasury daily par yields. No verified live tick feed; no broker execution, payments or public posting.' }, { headers: { 'Cache-Control': 'private, no-store' } });
}
