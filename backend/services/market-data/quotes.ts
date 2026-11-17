/** Provider-independent contract. No adapter or commercial entitlement is configured. */
export type QuoteState='NOT_CONFIGURED'|'NOT_ENTITLED'|'CONNECTING'|'VERIFIED_LIVE'|'EXCHANGE_CLOSED'|'DELAYED'|'STALE'|'ERROR'|'OFFLINE';
export type InstrumentContract={id:string;provider:string;nativeSymbol:string;venue:string;currency:string;units:string;timeZone:string;maxAgeMs:number};
export type Entitlement={display:boolean;analysis:boolean;history:boolean;redistribution:boolean;licenseReference:string};
export type Observation={id:string;provider:string;nativeSymbol:string;venue:string;currency:string;units:string;value:number;eventAt:string;retrievedAt:string;session:'OPEN'|'CLOSED'|'UNKNOWN';delayMs:number};
export type Quote={state:QuoteState;value:number|null;canAnalyze:boolean;reason:string;eventAtUTC:string|null;eventAtIST:string|null;retrievedAt:string|null;session:'OPEN'|'CLOSED'|'UNKNOWN';provider:string|null;venue:string|null;currency:string|null;units:string|null};
export type NumericQuoteStatus='VERIFIED_LIVE'|'DELAYED'|'LAST_CLOSE'|'STALE'|'NOT_CONFIGURED'|'NOT_ENTITLED'|'UNSUPPORTED'|'ERROR';
/** Future backend API contract. Widget frames never supply any of these fields. */
export type NumericQuote={instrumentId:string;providerId:string|null;providerSymbol:string|null;venue:string|null;assetClass:string;currency:string|null;unit:string|null;lastPrice:number|null;change:number|null;changePct:number|null;bid:number|null;ask:number|null;volume:number|null;quoteStatus:NumericQuoteStatus;marketState:'OPEN'|'CLOSED'|'UNKNOWN';exchangeTimestampUTC:string|null;retrievalTimestampUTC:string;sourceTimezone:string|null;delayMinutes:number|null;entitlement:Entitlement|null;sourceUrl:string|null;errorCode:string|null};
export function numericQuoteEnvelope(instrumentId:string,assetClass:string,contract:InstrumentContract|null,rights:Entitlement|null,observation:Observation|null,now:number,sourceUrl:string|null,lastAcceptedEventUTC:string|null=null):NumericQuote{
 const normalized=normalizeQuote(contract,rights,observation,now);
 const status:NumericQuoteStatus=normalized.state==='EXCHANGE_CLOSED'?'LAST_CLOSE':['OFFLINE','CONNECTING'].includes(normalized.state)?'ERROR':normalized.state as NumericQuoteStatus;
 const outOfOrder=!!(lastAcceptedEventUTC&&observation&&Date.parse(observation.eventAt)<Date.parse(lastAcceptedEventUTC));
 return {instrumentId,providerId:contract?.provider??null,providerSymbol:contract?.nativeSymbol??null,venue:contract?.venue??null,assetClass,currency:contract?.currency??null,unit:contract?.units??null,lastPrice:outOfOrder?null:normalized.value,change:null,changePct:null,bid:null,ask:null,volume:null,quoteStatus:outOfOrder?'ERROR':status,marketState:normalized.session,exchangeTimestampUTC:normalized.eventAtUTC,retrievalTimestampUTC:new Date(now).toISOString(),sourceTimezone:contract?.timeZone??null,delayMinutes:normalized.value===null?null:(observation?.delayMs??0)/60000,entitlement:rights,sourceUrl,errorCode:outOfOrder?'OUT_OF_ORDER':normalized.value===null?normalized.state:null};
}
/** O(1). Caller supplies trusted server configuration, never browser entitlement input. */
export function normalizeQuote(contract:InstrumentContract|null,rights:Entitlement|null,observation:Observation|null,now:number):Quote{
 const base:Quote={state:'NOT_CONFIGURED',value:null,canAnalyze:false,reason:'Provider not configured.',eventAtUTC:null,eventAtIST:null,retrievedAt:null,session:'UNKNOWN',provider:contract?.provider??null,venue:contract?.venue??null,currency:contract?.currency??null,units:contract?.units??null};
 if(!contract)return base;
 if(!rights?.display||!rights.licenseReference)return {...base,state:'NOT_ENTITLED',reason:'Display rights not verified.'};
 if(!observation)return {...base,state:'OFFLINE',reason:'No provider observation available.'};
 const o=observation,t=Date.parse(o.eventAt),f=Date.parse(o.retrievedAt);
 const mismatch=(['id','provider','nativeSymbol','venue','currency','units'] as const).some(k=>o[k]!==contract[k]);
 if(mismatch||![o.value,t,f,now,o.delayMs,contract.maxAgeMs].every(Number.isFinite)||o.delayMs<0||contract.maxAgeMs<1||t>f||f>now||t>now||!/(Z|[+-]\d{2}:\d{2})$/.test(o.eventAt)||!/(Z|[+-]\d{2}:\d{2})$/.test(o.retrievedAt))return {...base,state:'ERROR',reason:'Identity, unit, timestamp or value validation failed.'};
 const stamp={...base,eventAtUTC:new Date(t).toISOString(),eventAtIST:new Date(t).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'})+' IST',retrievedAt:new Date(f).toISOString(),session:o.session};
 if(now-f>contract.maxAgeMs||now-t>contract.maxAgeMs+o.delayMs)return {...stamp,state:'STALE',reason:'Observation freshness exceeds the configured budget.'};
 if(o.session==='UNKNOWN')return {...stamp,state:'ERROR',reason:'Official trading session not verified.'};
 if(o.session==='CLOSED')return {...stamp,state:'EXCHANGE_CLOSED',value:o.value,reason:'Exchange closed; this is a past observation, not live.',canAnalyze:false};
 if(o.delayMs>0)return {...stamp,state:'DELAYED',value:o.value,reason:'Provider declares delayed data.',canAnalyze:rights.analysis};
 return {...stamp,state:'VERIFIED_LIVE',value:o.value,reason:'Contract, rights, timestamps and open session verified by adapter.',canAnalyze:rights.analysis};
}
