import test from 'node:test';
import assert from 'node:assert/strict';
import {EXCHANGES,exchangeSession,exchangeLocalTime} from '../../backend/services/market-data/exchanges.ts';
import {marketSnapshot,parseEcb,parseTreasury,clearMarketCacheForTests} from '../../backend/services/market-data/market-data.ts';

const NOW=Date.parse('2026-11-17T14:00:00Z');
const ecb=(days=[['2026-11-16',1.1014,103.452],['2026-11-13',1.10,103.00]])=>`<?xml version="1.0"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><gesmes:name>European Central Bank</gesmes:name><Cube>${days.map(([date,usd,inr])=>`<Cube time='${date}'><Cube currency='USD' rate='${usd}'/><Cube currency='INR' rate='${inr}'/><Cube currency='JPY' rate='175.78'/><Cube currency='GBP' rate='0.8345'/></Cube>`).join('')}</Cube></gesmes:Envelope>`;
const treasury=(days=[['2026-11-16',4.0,4.5],['2026-11-13',3.9,4.3]])=>`<feed xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices">${days.map(([date,two,ten])=>`<entry><content><d:NEW_DATE>${date}T00:00:00</d:NEW_DATE><d:BC_2YEAR>${two}</d:BC_2YEAR><d:BC_10YEAR>${ten}</d:BC_10YEAR><d:BC_30YEAR m:null="true"/></content></entry>`).join('')}</feed>`;
function fetchFixture(options={}){
  const calls=[];
  const fetcher=async(url)=>{calls.push(url);if(url.includes('ecb'))return options.ecbFail?new Response('Down',{status:503}):new Response(options.ecb??ecb());return options.treasuryFail?new Response('Down',{status:503}):new Response(options.treasury??treasury());};
  return {calls,fetcher};
}

test('exchange registry contains 24 unique active MIC identities and valid geography/timezones',()=>{
  assert.equal(EXCHANGES.length,24);assert.equal(new Set(EXCHANGES.map(x=>x.mic)).size,24);
  for(const x of EXCHANGES){assert.match(x.mic,/^[A-Z0-9]{4}$/);assert.ok(Math.abs(x.lat)<=90&&Math.abs(x.lon)<=180);assert.equal(x.coordinatePrecision,'city');new Intl.DateTimeFormat('en',{timeZone:x.timeZone}).format(new Date(NOW));for(const url of [x.website,x.calendarUrl,...x.sources])assert.equal(new URL(url).protocol,'https:');}
});
test('co-located exchanges keep a shared geographic city point for cluster handling',()=>{
  for(const ids of [['XNYS','XNAS'],['XNSE','XBOM'],['XCME','XCBT']]){const [a,b]=ids.map(id=>EXCHANGES.find(x=>x.id===id));assert.equal(a.lat,b.lat);assert.equal(a.lon,b.lon);assert.equal(a.clusterKey,b.clusterKey);}
  assert.ok(EXCHANGES.find(x=>x.id==='BVMF').lat<0);assert.ok(EXCHANGES.find(x=>x.id==='XASX').lat<0);assert.equal(EXCHANGES.find(x=>x.id==='XKRX').city,'Seoul');
});
test('calendar does not extrapolate unsupported venues or years, or infer session from animation',()=>{
  assert.equal(exchangeSession(EXCHANGES.find(x=>x.id==='XNSE'),NOW).state,'SCHEDULE_UNKNOWN');
  assert.equal(exchangeSession(EXCHANGES[0],'2027-01-04T15:00:00Z').state,'SCHEDULE_UNKNOWN');
  assert.equal(exchangeSession(EXCHANGES[0],'invalid').state,'SCHEDULE_UNKNOWN');
  assert.equal(exchangeLocalTime(EXCHANGES[0],'invalid'),'Clock unavailable');
  assert.equal(exchangeSession(EXCHANGES[0],NOW).liveHalts,'UNKNOWN');
});
test('official 2026 US schedule honors IANA DST at open boundaries',()=>{
  const ny=EXCHANGES[0];
  assert.equal(exchangeSession(ny,'2026-03-06T14:29:59Z').state,'CLOSED');
  assert.equal(exchangeSession(ny,'2026-03-06T14:30:00Z').state,'OPEN');
  assert.equal(exchangeSession(ny,'2026-03-09T13:30:00Z').state,'OPEN');
  assert.equal(exchangeSession(ny,'2026-11-02T14:30:00Z').state,'OPEN');
});
test('official US holidays, weekends and exact half-day close are distinguished',()=>{
  for(const mic of ['XNYS','XNAS']){
    const venue=EXCHANGES.find(x=>x.id===mic);
    for(const date of ['2026-04-03','2026-07-03','2026-11-26'])assert.equal(exchangeSession(venue,date+'T15:00:00Z').state,'HOLIDAY');
    assert.equal(exchangeSession(venue,'2026-11-14T15:00:00Z').state,'CLOSED');
    assert.equal(exchangeSession(venue,'2026-11-27T17:59:00Z').state,'OPEN');
    assert.equal(exchangeSession(venue,'2026-11-27T18:00:00Z').state,'CLOSED');
    assert.equal(exchangeSession(venue,'2026-12-24T18:00:00Z').earlyClose,true);
    assert.equal(exchangeSession(venue,'2026-07-02T18:00:00Z').state,'OPEN');
  }
});
test('ECB parser accepts documented quote styles, preserves dates and sorts observations',()=>{
  const result=parseEcb(ecb(),NOW);assert.deepEqual(result.map(x=>x.date),['2026-11-13','2026-11-16']);assert.equal(result[1].rates.USD,1.1014);assert.equal(result[1].rates.EUR,1);
  assert.equal(parseEcb(ecb().replaceAll("'",'"'),NOW)[0].rates.INR,103);
});
test('ECB parser rejects future, impossible, duplicated and missing observation identities',()=>{
  for(const bad of [ecb([['2026-11-18',1,2]]),ecb([['2026-02-30',1,2]]),ecb([['2026-11-16',1,2],['2026-11-16',1,2]]),ecb().replace("currency='INR'","currency='USD'"),ecb().replaceAll("currency='USD'","currency='XXX'")])assert.throws(()=>parseEcb(bad,NOW));
});
test('XML DTD, invalid rates and excessive documents never become source observations',()=>{
  for(const bad of ['<!DOCTYPE example [<!ENTITY x "y">]>'+ecb(),ecb().replace("rate='1.1014'","rate='NaN'"),ecb().replace("rate='1.1014'","rate='0'"),ecb().replace('</gesmes:Envelope>',''),' '.repeat(500001)+ecb()])assert.throws(()=>parseEcb(bad,NOW));
});
test('Treasury parser retains null missing tenors and rejects future dates',()=>{
  const days=parseTreasury(treasury(),NOW);assert.equal(days[1].rates['10Y'],4.5);assert.equal(days[1].rates['30Y'],null);assert.equal(days[1].rates['3M'],null);
  assert.throws(()=>parseTreasury(treasury([['2026-11-18',4,5]]),NOW));
});
test('published rates preserve source date and retrieval time; derived FX uses same-date inputs',async()=>{
  clearMarketCacheForTests();const f=fetchFixture();const data=await marketSnapshot(f.fetcher,NOW);
  const cross=data.quotes.find(x=>x.id==='ECB:USDINR');assert.ok(Math.abs(cross.value-103.452/1.1014)<1e-12);assert.match(cross.derivation,/derived by Strategic Souls/);assert.equal(cross.state,'PUBLISHED_EOD');assert.equal(cross.eventAt,'2026-11-16');assert.equal(cross.retrievedAt,'2026-11-17T14:00:00.000Z');assert.equal(cross.eventTimePrecision,'DATE');
  assert.ok(data.quotes.every(x=>!String(x.state).includes('LIVE')));
  const hist=data.fxHistory.find(x=>x.id==='ECB:USDINR');assert.equal(hist.points.length,2);assert.ok(hist.points.every(x=>x.knownAt===data.asOf));
});
test("a cold request reuses shared official snapshots and keeps their original timestamps", async () => {
  clearMarketCacheForTests();
  const storage = new Map();
  const shared = {
    async read(url) { return storage.get(url) ?? null; },
    async write(url, { text, retrievedAt }) { storage.set(url, { text, retrievedAt }); },
  };
  const first = fetchFixture();
  await marketSnapshot(first.fetcher, NOW, shared);
  assert.equal(storage.size, 2);
  clearMarketCacheForTests();
  const cold = fetchFixture({ ecbFail: true, treasuryFail: true });
  const reused = await marketSnapshot(cold.fetcher, NOW + 60_000, shared);
  assert.deepEqual(cold.calls, []);
  assert.equal(reused.quotes.find((q) => q.id === "ECB:USDINR").retrievedAt, new Date(NOW).toISOString());
  assert.equal(reused.fxHistory.find((q) => q.id === "ECB:USDINR").canAnalyze, true);
  clearMarketCacheForTests();
  const expired = await marketSnapshot(cold.fetcher, NOW + 16 * 60_000, shared);
  assert.equal(expired.quotes.find((q) => q.id === "ECB:USDINR").state, "STALE");
  assert.equal(expired.fxHistory.find((q) => q.id === "ECB:USDINR").canAnalyze, false);
  assert.equal(storage.size, 2);
});
test('yield changes are basis points and absent tenors remain null rather than zero',async()=>{
  clearMarketCacheForTests();const f=fetchFixture();const data=await marketSnapshot(f.fetcher,NOW);
  const ten=data.yields.find(x=>x.id==='UST:10Y');assert.ok(Math.abs(ten.change-20)<1e-10);assert.equal(ten.changeUnit,'bp');assert.equal(ten.unit,'% annual par yield');
  assert.equal(data.yields.find(x=>x.id==='UST:30Y').value,null);assert.equal(data.yields.find(x=>x.id==='UST:30Y').state,'UNAVAILABLE');
});
test('a Treasury outage preserves ECB results and truthful independent provider errors',async()=>{
  clearMarketCacheForTests();const f=fetchFixture({treasuryFail:true});const data=await marketSnapshot(f.fetcher,NOW);
  assert.equal(data.providers[0].state,'CONNECTED');assert.equal(data.providers[1].state,'ERROR');assert.equal(data.quotes[0].state,'PUBLISHED_EOD');assert.ok(data.yields.every(y=>y.value===null));
});
test('old observations are stale, never relabeled as current by a fresh HTTP retrieval',async()=>{
  clearMarketCacheForTests();const f=fetchFixture({ecb:ecb([['2026-11-10',1,2]])});const data=await marketSnapshot(f.fetcher,NOW);
  assert.equal(data.quotes[0].state,'STALE');assert.equal(data.quotes[0].canAnalyze,false);assert.ok(data.fxHistory.every(h=>h.canAnalyze===false));
});
test('15 minute cache and single flight bound provider subscriptions and duplicate requests',async()=>{
  clearMarketCacheForTests();const f=fetchFixture();await Promise.all([marketSnapshot(f.fetcher,NOW),marketSnapshot(f.fetcher,NOW)]);assert.equal(f.calls.length,2);
  await marketSnapshot(f.fetcher,NOW+1000);assert.equal(f.calls.length,2);
});
test('failed refresh retains last good source with STALE status and one-minute backoff',async()=>{
  clearMarketCacheForTests();const f=fetchFixture();const good=await marketSnapshot(f.fetcher,NOW);
  const bad=fetchFixture({ecbFail:true,treasuryFail:true});const next=await marketSnapshot(bad.fetcher,NOW+16*60_000);
  assert.equal(next.quotes[0].value,good.quotes[0].value);assert.equal(next.quotes[0].state,'STALE');assert.equal(next.quotes[0].retrievedAt,good.quotes[0].retrievedAt);assert.equal(next.fxHistory[0].canAnalyze,false);
  await marketSnapshot(bad.fetcher,NOW+16*60_000+1000);assert.equal(bad.calls.length,2);
});
test('malformed refreshed XML cannot poison the previously accepted data cache',async()=>{
  clearMarketCacheForTests();const f=fetchFixture();const good=await marketSnapshot(f.fetcher,NOW);
  const bad=fetchFixture({ecb:'<html>Access denied</html>'});const next=await marketSnapshot(bad.fetcher,NOW+16*60_000);
  assert.equal(next.quotes[0].value,good.quotes[0].value);assert.equal(next.quotes[0].state,'STALE');assert.match(next.providers[0].reason,/data could not be verified/);
});
test('fresh invalid source has no fake fallback values and no entitled-equity claim',async()=>{
  clearMarketCacheForTests();const f=fetchFixture({ecb:'<html>Access denied</html>',treasuryFail:true});const data=await marketSnapshot(f.fetcher,NOW);
  assert.ok(data.quotes.every(q=>q.value===null&&q.state==='UNAVAILABLE'));assert.deepEqual(data.fxHistory,[]);assert.equal(data.providers[2].state,'NOT_CONFIGURED');
});
test('oversized response is rejected before decoding into values',async()=>{
  clearMarketCacheForTests();const fetcher=async()=>new Response('x',{headers:{'Content-Length':'500001'}});const data=await marketSnapshot(fetcher,NOW);assert.ok(data.quotes.every(q=>q.value===null));assert.match(data.providers[0].reason,/data could not be verified/);
});
test('Workers-compatible fetch contract uses manual redirects and connects both sources',async()=>{
  clearMarketCacheForTests();const modes=[];
  const workerFetch=async(url,init)=>{
    modes.push(init.redirect);
    if(!['manual','follow'].includes(init.redirect))throw new TypeError("Invalid redirect value, must be one of follow/manual (error won't be implemented)");
    return new Response(url.includes('ecb')?ecb():treasury());
  };
  const data=await marketSnapshot(workerFetch,NOW);
  assert.deepEqual(modes,['manual','manual']);assert.equal(data.providers[0].state,'CONNECTED');assert.equal(data.providers[1].state,'CONNECTED');
});
test('every HTTP redirect is rejected without following its destination',async()=>{
  for(const status of [301,302,303,307,308]){
    clearMarketCacheForTests();const calls=[];
    const fetcher=async(url,init)=>{calls.push({url,redirect:init.redirect});return new Response(null,{status,headers:{Location:'https://untrusted.example/market-data'}});};
    const data=await marketSnapshot(fetcher,NOW);
    assert.equal(calls.length,2);assert.ok(calls.every(c=>c.redirect==='manual'&&!c.url.includes('untrusted')));assert.ok(data.quotes.every(q=>q.value===null));
    assert.match(data.providers[0].reason,/source address changed/);assert.match(data.providers[1].reason,/source address changed/);
  }
});
test('already-followed and changed-destination responses are not accepted as official data',async()=>{
  for(const property of ['redirected','url']){
    clearMarketCacheForTests();
    const fetcher=async(url)=>{const response=new Response(url.includes('ecb')?ecb():treasury());Object.defineProperty(response,property,{value:property==='redirected'?true:'https://untrusted.example/data'});return response;};
    const data=await marketSnapshot(fetcher,NOW);assert.ok(data.quotes.every(q=>q.value===null));assert.match(data.providers[0].reason,/source address changed/);
  }
});
test('runtime exception details cannot leak through source health or numeric reasons',async()=>{
  clearMarketCacheForTests();
  const fetcher=async()=>{throw new TypeError("Invalid redirect value, must be one of follow/manual (error won't be implemented); sensitive runtime detail");};
  const data=await marketSnapshot(fetcher,NOW);
  assert.equal(data.providers[0].reason,'Provider connection unavailable. Please try again later.');
  assert.ok(data.quotes.every(q=>q.reason==='Provider connection unavailable. Please try again later.'));
  assert.doesNotMatch(JSON.stringify(data),/Invalid redirect|sensitive runtime|implemented\)/);
});

test("read-only official references use retained documents without network or cache writes", async () => {
  const calls = [];
  const cache = {
    read: async url => ({ text: url.includes("treasury") ? treasury() : ecb(), retrievedAt: new Date(NOW - 86400000).toISOString() }),
    write: async () => { calls.push("write"); },
  };
  const fetcher = async () => { calls.push("fetch"); throw new Error("Fixture has no network"); };
  const data = await marketSnapshot(fetcher, NOW, cache, true);
  assert.ok(data.quotes.some(q => q.value !== null));
  const empty = await marketSnapshot(fetcher, NOW, { ...cache, read: async () => null }, true);
  assert.ok(empty.quotes.every(q => q.value === null));
  assert.deepEqual(calls, []);
});
