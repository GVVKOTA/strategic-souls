import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const moduleUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const research=moduleUrl(compile('lib/research.ts'));
const registry=moduleUrl(compile('lib/instruments.ts').replace("'./research'",JSON.stringify(research)));
const {INSTRUMENTS}=await import(registry);
const {widgetConfiguration,WIDGET_SCRIPT}=await import(moduleUrl(compile('lib/tradingview.ts').replace("'./instruments'",JSON.stringify(registry))));
const {numericQuoteEnvelope}=await import(moduleUrl(compile('lib/quotes.ts')));
const expected=['VIX','INDIAVIX','IN10Y','US10Y','US02Y','DXY','USDINR','USDJPY','BRENT','CRUDEOIL1!','NG1!','NATURALGAS1!','XAUUSD','GOLD1!','SILVER1!','HG1!','NQ1!','NDX','SPX','NIKKEI225','KOSPI','NIFTY1!','NIFTY','NIFTYJR','CNXMIDCAP','BTCUSDT','ETHUSDT','SOLUSDT'];
test('original identities and order survive; widgets cannot create numeric coverage',()=>{
 assert.deepEqual(INSTRUMENTS.map(i=>i.label),expected);
 assert.equal(new Set(INSTRUMENTS.map(i=>i.id)).size,28);
 assert.equal(INSTRUMENTS.find(i=>i.label==='BTCUSDT').originalVenueStatus,'UNVERIFIED');
 assert.equal(INSTRUMENTS.find(i=>i.label==='BTCUSDT').mappingStatus,'EXPLICIT_DISPLAY_VENUE_ORIGINAL_UNVERIFIED');
 assert.ok(INSTRUMENTS.every(i=>i.lastPrice===null&&i.numericProvider===null&&i.numericRights==='NOT_CONFIGURED'&&i.exchangeTimestampUTC===null));
 for(const label of ['BRENT','NG1!','NATURALGAS1!','NIFTY1!','KOSPI']){const i=INSTRUMENTS.find(i=>i.label===label);assert.equal(i.vendorSymbol,null);assert.equal(i.mappingStatus,'UNVERIFIED');}
});
test('only documented fixed identities enter chart settings; malicious/user symbols fail',()=>{
 const config=widgetConfiguration('chart','NSE:NIFTY');assert.equal(config.symbol,'NSE:NIFTY');assert.equal(config.allow_symbol_change,false);assert.equal(config.theme,'dark');
 for(const symbol of ['BINANCE:ETHUSDT','NIFTY','<script>alert(1)</script>','NSE:NIFTY;alert(1)',null,undefined])assert.throws(()=>widgetConfiguration('chart',symbol));
 const overview=widgetConfiguration('overview');assert.ok(overview.tabs[0].symbols.every(item=>INSTRUMENTS.some(i=>i.vendorSymbol===item.s)));
});
test('calendar is an independent vendor view without fabricated structured events',()=>{
 assert.deepEqual(Object.keys(widgetConfiguration('calendar')).sort(),['colorTheme','height','isTransparent','locale','width'].sort());
 assert.ok(Object.values(WIDGET_SCRIPT).every(url=>url.startsWith('https://s3.tradingview.com/external-embedding/')));
});
test('canonical numeric contract keeps missing data null and rejects out-of-order test ticks',()=>{
 const now=Date.parse('2026-11-14T00:00:00Z');
 const empty=numericQuoteEnvelope('TEST','test',null,null,null,now,null);
 assert.equal(empty.quoteStatus,'NOT_CONFIGURED');assert.equal(empty.marketState,'UNKNOWN');
 for(const field of ['lastPrice','change','changePct','bid','ask','volume','exchangeTimestampUTC'])assert.equal(empty[field],null);
 const contract={id:'TEST',provider:'TEST ONLY',nativeSymbol:'TEST',venue:'TEST',currency:'USD',units:'test unit',timeZone:'Etc/UTC',maxAgeMs:10000};
 const rights={display:true,analysis:false,history:false,redistribution:false,licenseReference:'ISOLATED TEST FIXTURE'};
 const observation={...contract,value:1,eventAt:new Date(now-2000).toISOString(),retrievedAt:new Date(now-1000).toISOString(),session:'OPEN',delayMs:0};
 const result=numericQuoteEnvelope('TEST','test',contract,rights,observation,now,'https://example.com',new Date(now-1500).toISOString());
 assert.equal(result.quoteStatus,'ERROR');assert.equal(result.errorCode,'OUT_OF_ORDER');assert.equal(result.lastPrice,null);
});
test('accessible text colors meet AA against the shipped obsidian and raised backgrounds',()=>{
 const luminance=hex=>{const rgb=hex.match(/\w\w/g).map(h=>parseInt(h,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 for(const background of ['070A0C','111C20'])for(const foreground of ['E8F0EE','B8C6CB','8DCDB4']){const ratio=(luminance(foreground)+.05)/(luminance(background)+.05);assert.ok(ratio>=4.5,foreground+' on '+background+' = '+ratio);}
 assert.ok((luminance('8DCDB4')+.05)/(luminance('0D2420')+.05)>=4.5);
});
