/** X1 venue registry. City markers are geography, never exchange premises or live quotes. */
export type ExchangeRegion = 'Americas' | 'Europe' | 'Middle East/Africa' | 'Asia-Pacific';
export type Exchange = {
  id: string; name: string; city: string; country: string; region: ExchangeRegion;
  lat: number; lon: number; timeZone: string; mic: string; website: string;
  calendarUrl: string; benchmark: string; coordinatePrecision: 'city';
  clusterKey: string; sources: readonly string[]; verifiedAt: string;
  sessionDefinition: string;
};
export const EXCHANGE_REGISTRY_VERIFIED_AT = '2026-11-17';
export const MIC_SOURCE = 'https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC.csv';
export const GEOGRAPHY_SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson';
const NYSE_CALENDAR = 'https://www.nyse.com/trade/hours-calendars';
const NASDAQ_CALENDAR = 'https://www.nasdaqtrader.com/Trader.aspx?id=calendar';
type Seed = [string, string, string, string, ExchangeRegion, number, number, string, string, string, string];
const seeds: Seed[] = [
  ['XNYS','New York Stock Exchange','New York','United States','Americas',40.721562,-73.995718,'America/New_York','https://www.nyse.com',NYSE_CALENDAR,'NYSE Composite'],
  ['XNAS','Nasdaq','New York','United States','Americas',40.721562,-73.995718,'America/New_York','https://www.nasdaq.com',NASDAQ_CALENDAR,'Nasdaq Composite'],
  ['XTSE','Toronto Stock Exchange','Toronto','Canada','Americas',43.664645,-79.389459,'America/Toronto','https://www.tsx.com','https://www.tsx.com/en/trading/calendars-and-trading-hours/calendar','S&P/TSX Composite'],
  ['BVMF','B3 — Brasil Bolsa Balcão','São Paulo','Brazil','Americas',-23.556734,-46.626966,'America/Sao_Paulo','https://www.b3.com.br','https://www.b3.com.br/pt_br/noticias/calendario-de-negociacao-da-b3-confira-o-funcionamento-da-bolsa-em-2026.htm','Ibovespa'],
  ['XCME','Chicago Mercantile Exchange','Chicago','United States','Americas',41.847961,-87.635237,'America/Chicago','https://www.cmegroup.com','https://www.cmegroup.com/trading-hours.html','Contract-specific; no single equity benchmark'],
  ['XCBT','Chicago Board of Trade','Chicago','United States','Americas',41.847961,-87.635237,'America/Chicago','https://www.cmegroup.com','https://www.cmegroup.com/trading-hours.html','Contract-specific; no single equity benchmark'],
  ['XLON','London Stock Exchange','London','United Kingdom','Europe',51.501941,-0.118668,'Europe/London','https://www.londonstockexchange.com','https://www.londonstockexchange.com/en','FTSE 100'],
  ['XPAR','Euronext Paris','Paris','France','Europe',48.858092,2.352992,'Europe/Paris','https://www.euronext.com','https://www.euronext.com/en/trading/trading-hours-holidays','CAC 40'],
  ['XAMS','Euronext Amsterdam','Amsterdam','Netherlands','Europe',52.351914,4.914694,'Europe/Amsterdam','https://www.euronext.com','https://www.euronext.com/en/trading/trading-hours-holidays','AEX'],
  ['XBRU','Euronext Brussels','Brussels','Belgium','Europe',50.835263,4.331371,'Europe/Brussels','https://www.euronext.com','https://www.euronext.com/en/trading/trading-hours-holidays','BEL 20'],
  ['XETR','Deutsche Börse — Xetra','Frankfurt','Germany','Europe',50.099977,8.675015,'Europe/Berlin','https://www.deutsche-boerse.com','https://www.eurexgroup.com/xetra-en/newsroom/trading-calendar','DAX'],
  ['XSWX','SIX Swiss Exchange','Zürich','Switzerland','Europe',47.381934,8.548064,'Europe/Zurich','https://www.six-group.com','https://www.six-group.com/en/market-data/news-tools/trading-currency-holiday-calendar.html','SMI'],
  ['XJSE','Johannesburg Stock Exchange','Johannesburg','South Africa','Middle East/Africa',-26.168099,28.028064,'Africa/Johannesburg','https://www.jse.co.za','https://clientportal.jse.co.za/reports/trading-calendars','FTSE/JSE All Share'],
  ['XSAU','Saudi Exchange','Riyadh','Saudi Arabia','Middle East/Africa',24.634497,46.720487,'Asia/Riyadh','https://www.saudiexchange.sa','https://www.saudiexchange.sa/wps/portal/saudiexchange/rules-guidance/capital-market-overview/trading-cycle-and-times?locale=en','TASI'],
  ['XDFM','Dubai Financial Market','Dubai','United Arab Emirates','Middle East/Africa',25.214912,55.286946,'Asia/Dubai','https://www.dfm.ae','https://www.dfm.ae/the-exchange/news-disclosures/settlement-trading-calendar','DFM General Index'],
  ['XNSE','National Stock Exchange of India','Mumbai','India','Asia-Pacific',19.068408,72.875839,'Asia/Kolkata','https://www.nseindia.com','https://www.nseindia.com/resources/exchange-communication-holidays','Nifty 50'],
  ['XBOM','BSE','Mumbai','India','Asia-Pacific',19.068408,72.875839,'Asia/Kolkata','https://www.bseindia.com','https://www.bseindia.com/static/markets/marketinfo/listholi.aspx','S&P BSE SENSEX'],
  ['XSES','Singapore Exchange','Singapore','Singapore','Asia-Pacific',1.294979,103.853875,'Asia/Singapore','https://www.sgx.com','https://www.sgx.com/securities/trading','Straits Times Index'],
  ['XHKG','Hong Kong Exchanges and Clearing','Hong Kong','Hong Kong SAR','Asia-Pacific',22.306927,114.183064,'Asia/Hong_Kong','https://www.hkex.com.hk','https://www.hkex.com.hk/Services/Trading/Securities/Overview/Trading-Calendar-and-Holiday-Schedule?sc_lang=en','Hang Seng Index'],
  ['XSHG','Shanghai Stock Exchange','Shanghai','China','Asia-Pacific',31.218398,121.434559,'Asia/Shanghai','https://english.sse.com.cn','https://english.sse.com.cn/start/trading/schedule/','SSE Composite'],
  ['XSHE','Shenzhen Stock Exchange','Shenzhen','China','Asia-Pacific',22.548097,114.061154,'Asia/Shanghai','https://www.szse.cn/English','https://www.szse.cn/English/services/trading/calendar/index.html','SZSE Component'],
  ['XTKS','Japan Exchange Group — Tokyo Stock Exchange','Tokyo','Japan','Asia-Pacific',35.686963,139.749462,'Asia/Tokyo','https://www.jpx.co.jp/english','https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html','TOPIX'],
  ['XKRX','Korea Exchange — stock market','Seoul','South Korea','Asia-Pacific',37.568295,126.997785,'Asia/Seoul','https://global.krx.co.kr','https://global.krx.co.kr','KOSPI'],
  ['XASX','Australian Securities Exchange','Sydney','Australia','Asia-Pacific',-33.871373,151.212548,'Australia/Sydney','https://www.asx.com.au','https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours/trading-calendar','S&P/ASX 200'],
];

export const EXCHANGES: readonly Exchange[] = Object.freeze(seeds.map(([mic,name,city,country,region,lat,lon,timeZone,website,calendarUrl,benchmark]) => Object.freeze({
  id:mic,name,city,country,region,lat,lon,timeZone,mic,website,calendarUrl,benchmark,
  coordinatePrecision:'city' as const,clusterKey:city,sources:[MIC_SOURCE,GEOGRAPHY_SOURCE,calendarUrl],verifiedAt:EXCHANGE_REGISTRY_VERIFIED_AT,
  sessionDefinition:mic==='XNYS'||mic==='XNAS' ? 'Regular cash-equity core session only; official 2026 holiday and half-day calendar. Live halts and extended sessions not monitored.' : 'Venue/product-specific calendar not ingested. Follow the official calendar; session state remains unknown.',
})));

export type ExchangeSession = {
  state:'OPEN'|'CLOSED'|'HOLIDAY'|'SCHEDULE_UNKNOWN'; label:string; localTime:string;
  localDate:string|null; sourceUrl:string; reason:string; scheduledOnly:true;
  liveHalts:'UNKNOWN'; earlyClose:boolean; verifiedThrough:string|null;
};

/** Uses IANA timezone rules, including DST. Supply a trusted server timestamp. */
export function exchangeLocalTime(exchange:Exchange,at:Date|string|number):string {
  const date=new Date(at);
  if(!Number.isFinite(date.getTime())) return 'Clock unavailable';
  return new Intl.DateTimeFormat('en-GB',{timeZone:exchange.timeZone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
}

const US_HOLIDAYS_2026 = new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25']);
const US_HALF_DAYS_2026 = new Set(['2026-11-27','2026-12-24']);
/** Calendar-based schedule, not proof that trading is operational or a quote is live. */
export function exchangeSession(exchange:Exchange,at:Date|string|number):ExchangeSession {
  const date=new Date(at);
  const base:ExchangeSession={state:'SCHEDULE_UNKNOWN',label:'Schedule unknown',localTime:exchangeLocalTime(exchange,at),localDate:null,sourceUrl:exchange.calendarUrl,reason:'A complete authoritative calendar has not been connected for this venue.',scheduledOnly:true,liveHalts:'UNKNOWN',earlyClose:false,verifiedThrough:null};
  if(!Number.isFinite(date.getTime()))return {...base,reason:'Trusted server time unavailable.'};
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:exchange.timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const part=(key:string)=>parts.find(p=>p.type===key)?.value??'';
  const day=`${part('year')}-${part('month')}-${part('day')}`;
  base.localDate=day;
  if(!['XNYS','XNAS'].includes(exchange.mic))return base;
  if(part('year')!=='2026')return {...base,reason:'Verified calendar coverage is 2026 only; no extrapolated holidays.',verifiedThrough:'2026-12-31'};
  const common={...base,verifiedThrough:'2026-12-31',reason:'Official 2026 regular cash-equity schedule; live halts and special notices are not monitored.'};
  if(US_HOLIDAYS_2026.has(day))return {...common,state:'HOLIDAY',label:'Scheduled holiday'};
  if(['Sat','Sun'].includes(part('weekday')))return {...common,state:'CLOSED',label:'Scheduled closed'};
  const minutes=Number(part('hour'))*60+Number(part('minute'));
  const earlyClose=US_HALF_DAYS_2026.has(day),close=earlyClose?13*60:16*60;
  const open=minutes>=9*60+30&&minutes<close;
  return {...common,state:open?'OPEN':'CLOSED',label:open?'Scheduled open':'Scheduled closed',earlyClose};
}
