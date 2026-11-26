import {env} from "cloudflare:workers";
import {HttpError,assertOwner} from "../../backend/middleware/security";
import type {Soul,Outcome} from "../../backend/engines/engine";
export function database():D1Database{if(!env.DB)throw new HttpError(503,"Persistent storage is unavailable. No record was saved.");return env.DB;}
export type Account={subject:string;alias:string;consent_at:string;consent_version:string;adult_confirmed:number;last_active:string};
export async function account(subject:string):Promise<Account|null>{return database().prepare("SELECT * FROM accounts WHERE subject = ?").bind(subject).first<Account>();}
/** Atomic conditional UPSERT prevents concurrent callers exceeding the limit. */
export async function rate(key:string,max:number,ttl:number):Promise<void>{
  const db=database(),now=Date.now();
  const result=await db.prepare("INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END WHERE expires_at<=? OR count<? RETURNING count").bind(key,now+ttl,now,now,now,max).first();
  if(!result)throw new HttpError(429,"Usage limit reached. Please try again later.");
}
export async function history(subject:string):Promise<{soul:Soul;outcome?:Outcome}[]>{
  const result=await database().prepare("SELECT s.payload,s.digest,o.payload AS outcome FROM ownership m JOIN souls s ON s.id=m.soul_id LEFT JOIN outcomes o ON o.soul_id=s.id WHERE m.subject=? ORDER BY s.created_at DESC LIMIT 201").bind(subject).all<{payload:string;digest:string;outcome:string|null}>();
  if(result.results.length>200)throw new HttpError(413,"Legacy archive exceeds the alpha export limit; request a complete operator export.");
  return result.results.map(r=>({soul:{...JSON.parse(r.payload),digest:r.digest} as Soul,...(r.outcome?{outcome:JSON.parse(r.outcome) as Outcome}:{})}));
}
export async function ownedSoul(subject:string,id:string):Promise<Soul>{
  const record=await database().prepare("SELECT s.payload,s.digest FROM souls s JOIN ownership m ON m.soul_id=s.id WHERE m.subject=? AND s.id=?").bind(subject,id).first<{payload:string;digest:string}>();
  assertOwner(!!record);return {...JSON.parse(record!.payload),digest:record!.digest};
}
/** Request-driven cleanup; no unattended schedule is claimed. */
export async function retention():Promise<void>{
  const db=database();const stale=new Date(Date.now()-180*86400000).toISOString();const tickets=new Date(Date.now()-90*86400000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM support_requests WHERE created_at<? OR subject IN (SELECT subject FROM accounts WHERE last_active<?)").bind(tickets,stale),
    db.prepare("DELETE FROM ownership WHERE subject IN (SELECT subject FROM accounts WHERE last_active<?)").bind(stale),
    db.prepare("DELETE FROM rate_limits WHERE expires_at<?").bind(Date.now()),
    db.prepare("DELETE FROM accounts WHERE last_active<?").bind(stale),
  ]);
}
