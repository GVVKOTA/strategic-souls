import {WATCHLIST} from '../legacy/research';

export const COVERAGE_REVIEW_DATE='2026-11-14';
type Mapping={symbol:string;venue:string;contractType:'INDEX'|'SOVEREIGN_YIELD'|'SPOT_SELECTED_DISPLAY_VENUE';currency:string|null;unit:string;timeZone:string;sourceUrl:string};
// Official symbol-page identity evidence. A symbol page does not prove widget availability.
const mappings:Record<string,Mapping>={
 BTCUSDT:{symbol:'BINANCE:BTCUSDT',venue:'Binance spot (explicit display venue only)',contractType:'SPOT_SELECTED_DISPLAY_VENUE',currency:'USDT',unit:'USDT per BTC',timeZone:'Etc/UTC',sourceUrl:'https://www.tradingview.com/symbols/BTCUSDT/'},
 VIX:{symbol:'CBOE:VIX',venue:'CBOE',contractType:'INDEX',currency:null,unit:'index points',timeZone:'America/Chicago',sourceUrl:'https://www.tradingview.com/symbols/CBOE-VIX/'},
 INDIAVIX:{symbol:'NSE:INDIAVIX',venue:'NSE',contractType:'INDEX',currency:null,unit:'index points',timeZone:'Asia/Kolkata',sourceUrl:'https://www.tradingview.com/symbols/NSE-INDIAVIX/'},
 IN10Y:{symbol:'TVC:IN10Y',venue:'TVC composite yield',contractType:'SOVEREIGN_YIELD',currency:null,unit:'percent yield',timeZone:'Asia/Kolkata',sourceUrl:'https://www.tradingview.com/symbols/TVC-IN10Y/'},
 US10Y:{symbol:'TVC:US10Y',venue:'TVC composite yield',contractType:'SOVEREIGN_YIELD',currency:null,unit:'percent yield',timeZone:'America/New_York',sourceUrl:'https://www.tradingview.com/symbols/TVC-US10Y/'},
 US02Y:{symbol:'TVC:US02Y',venue:'TVC composite yield',contractType:'SOVEREIGN_YIELD',currency:null,unit:'percent yield',timeZone:'America/New_York',sourceUrl:'https://www.tradingview.com/symbols/TVC-US02Y/'},
 DXY:{symbol:'TVC:DXY',venue:'TVC index display',contractType:'INDEX',currency:null,unit:'index points',timeZone:'America/New_York',sourceUrl:'https://www.tradingview.com/symbols/TVC-DXY/'},
 NDX:{symbol:'NASDAQ:NDX',venue:'NASDAQ',contractType:'INDEX',currency:'USD',unit:'index points',timeZone:'America/New_York',sourceUrl:'https://www.tradingview.com/symbols/NASDAQ-NDX/'},
 SPX:{symbol:'SP:SPX',venue:'S&P index display',contractType:'INDEX',currency:'USD',unit:'index points',timeZone:'America/New_York',sourceUrl:'https://www.tradingview.com/symbols/SPX/'},
 NIFTY:{symbol:'NSE:NIFTY',venue:'NSE',contractType:'INDEX',currency:'INR',unit:'index points',timeZone:'Asia/Kolkata',sourceUrl:'https://www.tradingview.com/symbols/NSE-NIFTY/'},
 NIFTYJR:{symbol:'NSE:NIFTYJR',venue:'NSE',contractType:'INDEX',currency:'INR',unit:'index points',timeZone:'Asia/Kolkata',sourceUrl:'https://www.tradingview.com/symbols/NSE-NIFTYJR/'},
 CNXMIDCAP:{symbol:'NSE:CNXMIDCAP',venue:'NSE',contractType:'INDEX',currency:'INR',unit:'index points',timeZone:'Asia/Kolkata',sourceUrl:'https://www.tradingview.com/symbols/NSE-CNXMIDCAP/'},
};
export const INSTRUMENTS=WATCHLIST.map(([label,name,assetClass])=>{
 const m=mappings[label];
 return {id:'gvv:'+label,label,name,assetClass,venue:m?.venue??null,vendorSymbol:m?.symbol??null,contractType:m?.contractType??(label.endsWith('1!')?'CONTINUOUS_FUTURE_UNVERIFIED':'UNVERIFIED'),currency:m?.currency??null,unit:m?.unit??null,timeZone:m?.timeZone??null,timeZoneStatus:m?'VENUE_CONVENTION_NOT_SESSION_VERIFIED':'UNVERIFIED',tickSize:null,contractSize:null,marketHours:null,expiry:null,rollRule:null,originalVenueStatus:label==='BTCUSDT'?'UNVERIFIED':m?'IDENTITY_DOCUMENTED':'UNVERIFIED',widgetSupport:['NIFTY','US10Y'].includes(label)?'RESTRICTED_TO_TRADINGVIEW_OBSERVED_LOCAL':label==='BTCUSDT'?'DISPLAY_OBSERVED_LOCAL':'NOT_OBSERVED',mappingStatus:label==='BTCUSDT'?'EXPLICIT_DISPLAY_VENUE_ORIGINAL_UNVERIFIED':m?'IDENTITY_DOCUMENTED':'UNVERIFIED',numericProvider:null,numericRights:'NOT_CONFIGURED',quoteStatus:'NOT_CONFIGURED',lastPrice:null,exchangeTimestampUTC:null,expectedDelayMinutes:null,dataTiming:'Data timing varies by exchange/provider — see chart source.',sourceUrl:m?.sourceUrl??'https://www.tradingview.com/widget-docs/markets/',checkedDate:COVERAGE_REVIEW_DATE};
});
export const instrumentByLabel=(label:string)=>INSTRUMENTS.find(instrument=>instrument.label===label);
export const widgetSymbolAllowed=(symbol:string)=>INSTRUMENTS.some(instrument=>instrument.vendorSymbol===symbol);
export const WIDGET_OVERVIEW_SYMBOLS=['BINANCE:BTCUSDT','SP:SPX','TVC:DXY'] as const;
