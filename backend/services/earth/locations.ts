export type EarthRegionEntry = {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  readonly lat: number;
  readonly lon: number;
  readonly zoom: number;
  readonly relatedInstruments: readonly string[];
  readonly summary: string;
};

/**
 * Curated geographic reference catalog for country/region search across SS Earth
 * (3D Globe + 2D Satellite World Map). Coordinates represent geographic centers /
 * capitals and do not assert live market or conflict conditions.
 */
export const EARTH_REGIONS: readonly EarthRegionEntry[] = Object.freeze([
  { id: "IN", name: "India", region: "Asia-Pacific", lat: 20.5937, lon: 78.9629, zoom: 4.2, relatedInstruments: ["NSE:NIFTY", "BSE:SENSEX", "NSE:HDFCBANK", "ECB:USDINR"], summary: "Major South Asian equity and commodity ecosystem anchored by NSE, BSE, and MCX in Mumbai." },
  { id: "US", name: "United States", region: "Americas", lat: 39.8283, lon: -98.5795, zoom: 3.4, relatedInstruments: ["GLOBAL:SPX", "GLOBAL:NDX", "UST:10Y", "ECB:EURUSD"], summary: "Global reserve currency and benchmark sovereign yield center (NYSE, Nasdaq, CME, US Treasury)." },
  { id: "GB", name: "United Kingdom", region: "Europe", lat: 54.5, lon: -2.5, zoom: 4.8, relatedInstruments: ["GLOBAL:FTSE", "ECB:GBPUSD"], summary: "London financial hub linking European equities, commodities, and global FX benchmarks." },
  { id: "DE", name: "Germany", region: "Europe", lat: 51.1657, lon: 10.4515, zoom: 5.0, relatedInstruments: ["GLOBAL:DAX", "ECB:EURUSD"], summary: "Eurozone industrial core and Frankfurt home of Xetra and the European Central Bank." },
  { id: "JP", name: "Japan", region: "Asia-Pacific", lat: 36.2048, lon: 138.2529, zoom: 4.6, relatedInstruments: ["GLOBAL:N225", "ECB:USDJPY"], summary: "East Asian capital-market hub anchored by Tokyo Stock Exchange and JPY funding markets." },
  { id: "CN", name: "China", region: "Asia-Pacific", lat: 35.8617, lon: 104.1954, zoom: 3.6, relatedInstruments: ["GLOBAL:SSE", "GLOBAL:HSI", "ECB:EURCNY"], summary: "Manufacturing and commodity demand center spanning Shanghai, Shenzhen, and Hong Kong venues." },
  { id: "UA", name: "Ukraine", region: "Europe", lat: 48.3794, lon: 31.1656, zoom: 5.0, relatedInstruments: ["ECB:EURUSD", "MCX:CRUDEOIL18DEC26FUT"], summary: "Eastern European grain, energy transit, and geopolitical focus region." },
  { id: "IL", name: "Israel & Levant", region: "Middle East/Africa", lat: 31.7683, lon: 35.2137, zoom: 6.0, relatedInstruments: ["MCX:GOLD04DEC26FUT", "MCX:CRUDEOIL18DEC26FUT"], summary: "Eastern Mediterranean strategic corridor closely monitored for regional stability and energy routes." },
  { id: "SA", name: "Saudi Arabia", region: "Middle East/Africa", lat: 23.8859, lon: 45.0792, zoom: 4.6, relatedInstruments: ["MCX:CRUDEOIL18DEC26FUT"], summary: "Gulf energy benchmark center and home of the Saudi Exchange (Tadawul) in Riyadh." },
  { id: "AE", name: "United Arab Emirates", region: "Middle East/Africa", lat: 24.4539, lon: 54.3773, zoom: 6.0, relatedInstruments: ["MCX:GOLD04DEC26FUT", "MCX:CRUDEOIL18DEC26FUT"], summary: "Middle Eastern maritime trade, bullion, and financial corridor connecting Asia and Europe." },
  { id: "SG", name: "Singapore", region: "Asia-Pacific", lat: 1.3521, lon: 103.8198, zoom: 7.2, relatedInstruments: ["ECB:EURSGD"], summary: "Southeast Asian maritime chokepoint (Strait of Malacca) and SGX derivatives hub." },
  { id: "AU", name: "Australia", region: "Asia-Pacific", lat: -25.2744, lon: 133.7751, zoom: 3.6, relatedInstruments: ["ECB:EURAUD"], summary: "Major iron ore, LNG, and mineral exporter anchored by ASX in Sydney." },
  { id: "BR", name: "Brazil", region: "Americas", lat: -14.235, lon: -51.9253, zoom: 3.6, relatedInstruments: ["ECB:EURUSD"], summary: "Latin America's largest equity and agricultural commodities market (B3, São Paulo)." },
  { id: "ZA", name: "South Africa", region: "Middle East/Africa", lat: -30.5595, lon: 22.9375, zoom: 4.6, relatedInstruments: ["MCX:GOLD04DEC26FUT"], summary: "Southern African precious metals, shipping route, and JSE capital market center." },
  { id: "SD", name: "Sudan & Red Sea", region: "Middle East/Africa", lat: 15.5007, lon: 32.5599, zoom: 4.8, relatedInstruments: ["MCX:CRUDEOIL18DEC26FUT", "MCX:GOLD04DEC26FUT"], summary: "Northeast African & Red Sea maritime corridor critical to global container and tanker transit." },
  { id: "TW", name: "Taiwan Strait", region: "Asia-Pacific", lat: 23.6978, lon: 120.9605, zoom: 6.2, relatedInstruments: ["GLOBAL:NDX"], summary: "Critical global semiconductor fabrication hub and Indo-Pacific maritime corridor." },
  { id: "KR", name: "South Korea", region: "Asia-Pacific", lat: 35.9078, lon: 127.7669, zoom: 5.6, relatedInstruments: ["GLOBAL:NDX"], summary: "Advanced electronics, shipbuilding, and KRX capital market center in Seoul." },
  { id: "FR", name: "France", region: "Europe", lat: 46.2276, lon: 2.2137, zoom: 5.0, relatedInstruments: ["ECB:EURUSD"], summary: "Core Eurozone financial market hosting Euronext Paris." },
  { id: "CH", name: "Switzerland", region: "Europe", lat: 46.8182, lon: 8.2275, zoom: 6.2, relatedInstruments: ["ECB:EURCHF", "MCX:GOLD04DEC26FUT"], summary: "Global wealth management, bullion refining, and SIX Swiss Exchange center." },
  { id: "CA", name: "Canada", region: "Americas", lat: 56.1304, lon: -106.3468, zoom: 3.1, relatedInstruments: ["ECB:EURCAD"], summary: "North American energy, mining, and TSX financial hub." },
  { id: "MM", name: "Myanmar", region: "Asia-Pacific", lat: 21.9162, lon: 95.956, zoom: 5.0, relatedInstruments: ["ECB:USDINR"], summary: "Southeast Asian overland corridor bordering India, China, and Thailand." },
  { id: "NG", name: "Nigeria & West Africa", region: "Middle East/Africa", lat: 9.082, lon: 8.6753, zoom: 5.0, relatedInstruments: ["MCX:CRUDEOIL18DEC26FUT"], summary: "West African crude oil producer and regional economic center." },
]);

export function searchEarthRegions(query: string): readonly EarthRegionEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return EARTH_REGIONS;
  return EARTH_REGIONS.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.id.toLowerCase() === q ||
      r.region.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q),
  );
}
