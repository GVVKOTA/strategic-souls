import {database} from './repository';
import {HttpError} from '../../backend/middleware/security';
import {validateNotebook,validateReview,type StoredNotebook,type StoredEvent,type NotebookEvent} from '../../backend/services/legacy/notebook';

export async function digest(value:unknown):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,'0')).join('');}
type RawSoul=Omit<StoredNotebook,'payload'>&{payload:string};
type RawEvent=Omit<StoredEvent,'payload'>&{payload:string};
/** Bound storage reads; never silently truncate an account export. */
export async function notebookArchive(subject:string):Promise<{souls:StoredNotebook[];events:StoredEvent[]}>{
 const db=database();const [souls,events]=await Promise.all([
 db.prepare('SELECT id,created_at,payload,digest FROM notebook_souls WHERE subject=? ORDER BY created_at DESC,id DESC LIMIT 1001').bind(subject).all<RawSoul>(),
 db.prepare('SELECT e.id,e.soul_id,e.recorded_at,e.payload,e.digest FROM notebook_events e JOIN notebook_souls s ON s.id=e.soul_id WHERE s.subject=? ORDER BY e.recorded_at,e.id LIMIT 5001').bind(subject).all<RawEvent>()]);
 if(souls.results.length>1000||events.results.length>5000)throw new HttpError(413,'Archive exceeds this alpha export limit. Contact the operator for a complete database export; no partial export returned.');
 return {souls:souls.results.map(s=>({...s,payload:JSON.parse(s.payload)})),events:events.results.map(e=>({...e,payload:JSON.parse(e.payload)}))};
}
export async function ownedNotebook(subject:string,id:unknown):Promise<StoredNotebook>{
 if(typeof id!=='string'||id.length>64)throw new HttpError(400,'Soul ID required.');
 const row=await database().prepare('SELECT id,created_at,payload,digest FROM notebook_souls WHERE id=? AND subject=?').bind(id,subject).first<RawSoul>();
 if(!row)throw new HttpError(404,'Soul not found.');return {...row,payload:JSON.parse(row.payload)};
}
/** One INSERT is atomic; unique ownership+payload key makes transport retries safe. */
export async function createNotebook(subject:string,input:unknown):Promise<StoredNotebook>{
 const now=new Date().toISOString(),payload=validateNotebook(input,now),db=database();
 if(payload.parentId)await ownedNotebook(subject,payload.parentId);
 const key=await digest(payload),id=crypto.randomUUID(),checksum=await digest({id,created_at:now,payload});
 await db.prepare('INSERT OR IGNORE INTO notebook_souls (id,subject,created_at,payload,digest,dedupe_key) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM accounts WHERE subject=?)').bind(id,subject,now,JSON.stringify(payload),checksum,key,subject).run();
 const existing=await db.prepare('SELECT id,created_at,payload,digest FROM notebook_souls WHERE subject=? AND dedupe_key=?').bind(subject,key).first<RawSoul>();
 if(!existing)throw new HttpError(503,'Save not confirmed. Retry with the same inputs.');
 return {...existing,payload:JSON.parse(existing.payload)};
}
export async function appendNotebookEvent(subject:string,input:Record<string,unknown>):Promise<{saved:true}>{
 const soul=await ownedNotebook(subject,input.soulId),now=new Date().toISOString();let payload:NotebookEvent;
 if(input.type==='REVIEW')payload=validateReview(input.payload,soul,now);
 else if(input.type==='ARCHIVE'||input.type==='RESTORE')payload={type:input.type,note:input.type==='ARCHIVE'?'Hidden from active research; history retained.':'Returned to active research.'};
 else throw new HttpError(400,'Unsupported event.');
 const requestId=input.requestId;if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId))throw new HttpError(400,'A stable request ID is required for retry safety.');
 const db=database(),key=await digest({soulId:soul.id,requestId}),payloadHash=await digest(payload),id=crypto.randomUUID();
 const prior=await db.prepare('SELECT payload FROM notebook_events WHERE soul_id=? AND dedupe_key=?').bind(soul.id,key).first<{payload:string}>();
 if(prior){if(await digest(JSON.parse(prior.payload))!==payloadHash)throw new HttpError(409,'Request ID already used for different content.');return {saved:true};}
 await db.prepare('INSERT OR IGNORE INTO notebook_events (id,soul_id,recorded_at,payload,digest,dedupe_key) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM notebook_souls WHERE id=? AND subject=?)').bind(id,soul.id,now,JSON.stringify(payload),await digest({id,soul_id:soul.id,recorded_at:now,payload}),key,soul.id,subject).run();
 const saved=await db.prepare('SELECT payload FROM notebook_events WHERE soul_id=? AND dedupe_key=?').bind(soul.id,key).first<{payload:string}>();
 if(!saved)throw new HttpError(409,'Soul no longer exists.');
 if(await digest(JSON.parse(saved.payload))!==payloadHash)throw new HttpError(409,'Request ID already used for different content.');return {saved:true};
}
