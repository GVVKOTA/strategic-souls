import {HttpError} from './security';
import {parseFormula, type Ast} from './research';

export const NOTEBOOK_VERSION = 'notebook-v1';
export type Evidence = {title:string;url:string;claim:string;stance:'SUPPORTS'|'OPPOSES'|'CONTEXT';publishedAt:string;knownAt:string;verification:'USER_SUPPLIED';rights:'REFERENCE_ONLY'};
export type Notebook = {name:string;topic:string;thesis:string;counterThesis:string;falsification:string;reviewBy:string;evidence:Evidence[];formula:string|null;formulaAst:Ast|null;parentId:string|null;version:typeof NOTEBOOK_VERSION;mode:'RESEARCH_NOTEBOOK';visibility:'PRIVATE';assessment:'ABSTAIN';gaps:string[]};
export type Review = {type:'REVIEW';conclusion:'SUPPORTS'|'CONTRADICTS'|'INCONCLUSIVE';note:string;observedAt:string;knownAt:string;sourceUrl:string;verification:'USER_SUPPLIED';status:'INCONCLUSIVE'|'INVALIDATED'};
export type NotebookEvent = Review|{type:'ARCHIVE'|'RESTORE';note:string};
export type StoredNotebook={id:string;created_at:string;digest:string;payload:Notebook};
export type StoredEvent={id:string;soul_id:string;recorded_at:string;digest:string;payload:NotebookEvent};

function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Expected a structured research record.');return value as Record<string,unknown>;}
function text(value:unknown,name:string,max:number,min=1):string{if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new HttpError(400,`${name} must contain ${min}–${max} characters.`);return value.trim();}
/** UTC normalization accepts explicit offsets only. O(1) time and space. */
export function timestamp(value:unknown,name:string):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new HttpError(400,`${name} needs a valid date and explicit timezone.`);
 const [year,month,day]=value.slice(0,10).split('-').map(Number);
 if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())throw new HttpError(400,`${name} is not a real calendar date.`);
 return new Date(value).toISOString();
}
/** Reference-only HTTPS links: never fetched, previewed, or treated as licensed evidence. */
export function sourceUrl(value:unknown):string{
 const raw=text(value,'Source URL',700);let u:URL;try{u=new URL(raw);}catch{throw new HttpError(400,'Use a valid HTTPS source URL.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)||u.hostname.includes(':')||/^\d+(\.\d+){3}$/.test(u.hostname))throw new HttpError(400,'Use a public HTTPS source link without credentials or a custom port.');
 return u.href;
}
/** O(E + L) bounded validation, where E <= 6 sources and L <= 1000 formula characters. */
export function validateNotebook(value:unknown,now:string):Notebook{
 const p=object(value),reviewBy=timestamp(p.reviewBy,'Review deadline');
 if(Date.parse(reviewBy)<=Date.parse(now)||Date.parse(reviewBy)>Date.parse(now)+366*5*86400000)throw new HttpError(400,'Review deadline must be in the future and within five years.');
 if(!Array.isArray(p.evidence)||p.evidence.length>6)throw new HttpError(400,'Include zero to six source references.');
 const evidence:Evidence[]=p.evidence.map(raw=>{const e=object(raw),publishedAt=timestamp(e.publishedAt,'Publication time'),knownAt=timestamp(e.knownAt,'Known-at time');
  if(publishedAt>knownAt||knownAt>now)throw new HttpError(400,'Evidence must be published before it was known, and cannot be from the future.');
  if(!['SUPPORTS','OPPOSES','CONTEXT'].includes(String(e.stance)))throw new HttpError(400,'Choose a source stance.');
  return {title:text(e.title,'Source title',160),url:sourceUrl(e.url),claim:text(e.claim,'Your source interpretation',600),stance:e.stance as Evidence['stance'],publishedAt,knownAt,verification:'USER_SUPPLIED',rights:'REFERENCE_ONLY'};
 });
 if(new Set(evidence.map(e=>e.url)).size!==evidence.length)throw new HttpError(400,'Use each source URL once; describe mixed evidence in its interpretation.');
 const formula=p.formula==null||p.formula===''?null:text(p.formula,'Formula',1000);let formulaAst:Ast|null=null;
 if(formula){try{formulaAst=parseFormula(formula).ast;}catch(e){throw new HttpError(400,(e as Error).message);}}
 const gaps=['Source content and reuse rights have not been independently verified.','No entitled market dataset: quantitative analysis abstains.'];
 if(!evidence.length)gaps.push('No source references supplied.');
 if(!evidence.some(e=>e.stance==='OPPOSES'))gaps.push('No opposing source supplied.');
 return {name:text(p.name,'Title',80),topic:text(p.topic,'Topic',80),thesis:text(p.thesis,'Hypothesis',1500,10),counterThesis:text(p.counterThesis,'Counter-thesis',1200,10),falsification:text(p.falsification,'Falsification criteria',1200,10),reviewBy,evidence,formula,formulaAst,parentId:p.parentId?text(p.parentId,'Parent Soul ID',64):null,version:NOTEBOOK_VERSION,mode:'RESEARCH_NOTEBOOK',visibility:'PRIVATE',assessment:'ABSTAIN',gaps};
}
/** Later observations append; no mutation can revise the original hypothesis. O(1). */
export function validateReview(value:unknown,soul:StoredNotebook,now:string):Review{
 const p=object(value),observedAt=timestamp(p.observedAt,'Observation time'),knownAt=timestamp(p.knownAt,'Known-at time');
 if(observedAt<soul.created_at||observedAt>soul.payload.reviewBy||knownAt<observedAt||knownAt>now)throw new HttpError(400,'Observation must fall inside the original review window; known-at must follow observation and cannot be in the future.');
 if(!['SUPPORTS','CONTRADICTS','INCONCLUSIVE'].includes(String(p.conclusion)))throw new HttpError(400,'Choose a review conclusion.');
 return {type:'REVIEW',conclusion:p.conclusion as Review['conclusion'],note:text(p.note,'Review reasoning',1500,10),observedAt,knownAt,sourceUrl:sourceUrl(p.sourceUrl),verification:'USER_SUPPLIED',status:p.conclusion==='CONTRADICTS'?'INVALIDATED':'INCONCLUSIVE'};
}
export function notebookStatus(soul:StoredNotebook,events:StoredEvent[],now=new Date().toISOString()):string{
 const own=events.filter(e=>e.soul_id===soul.id).sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at)||a.id.localeCompare(b.id));
 const state=own.filter(e=>e.payload.type==='ARCHIVE'||e.payload.type==='RESTORE').at(-1);
 if(state?.payload.type==='ARCHIVE')return 'ARCHIVED';
 const review=own.filter(e=>e.payload.type==='REVIEW').at(-1)?.payload as Review|undefined;
 if(review)return review.status;
 return now<soul.payload.reviewBy?'PENDING':'INCONCLUSIVE';
}
