import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {tmpdir} from 'node:os';import {join} from 'node:path';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const asModule=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const security=asModule(compile('lib/security.ts')),research=asModule(compile('lib/research.ts'));
const notebook=await import(asModule(compile('lib/notebook.ts').replace("'./security'",JSON.stringify(security)).replace("'./research'",JSON.stringify(research))));
const {normalizeQuote}=await import(asModule(compile('lib/quotes.ts')));
const now=Date.parse('2026-11-07T00:00:00Z');
const contract={id:'TEST',provider:'test-fixture',nativeSymbol:'TEST',venue:'TEST',currency:'USD',units:'points',timeZone:'America/New_York',maxAgeMs:10000};
const rights={display:true,analysis:true,history:false,redistribution:false,licenseReference:'TEST ONLY'};
const obs={...contract,value:123,eventAt:new Date(now-1000).toISOString(),retrievedAt:new Date(now-500).toISOString(),session:'OPEN',delayMs:0};
test('quote adapter fails closed for missing rights, stale data and identity mismatch',()=>{
 assert.equal(normalizeQuote(null,null,null,now).state,'NOT_CONFIGURED');assert.equal(normalizeQuote(contract,null,obs,now).state,'NOT_ENTITLED');assert.equal(normalizeQuote(contract,rights,null,now).state,'OFFLINE');
 for(const changes of [{venue:'WRONG'},{currency:'INR'},{units:'lots'},{value:NaN},{eventAt:'2027-01-01T00:00:00Z'},{session:'UNKNOWN'}]){const result=normalizeQuote(contract,rights,{...obs,...changes},now);assert.equal(result.state,'ERROR');assert.equal(result.value,null);}
 const stale=normalizeQuote(contract,rights,obs,now+60000);assert.equal(stale.state,'STALE');assert.equal(stale.value,null);
});
test('freshness distinguishes open, delayed, and closed using test fixtures only',()=>{
 const live=normalizeQuote(contract,rights,obs,now);assert.equal(live.state,'VERIFIED_LIVE');assert.ok(live.eventAtIST.includes('IST'));
 assert.equal(normalizeQuote(contract,rights,{...obs,session:'CLOSED'},now).state,'EXCHANGE_CLOSED');assert.equal(normalizeQuote(contract,rights,{...obs,delayMs:900000},now).state,'DELAYED');
 assert.equal(normalizeQuote(contract,{...rights,analysis:false},obs,now).canAnalyze,false);
});
test('UTC/IST crossing midnight, explicit offsets and leap-day validation',()=>{
 assert.equal(notebook.timestamp('2026-11-07T01:00:00+05:30','time'),'2026-11-06T19:30:00.000Z');
 assert.equal(notebook.timestamp('2024-02-29T00:00:00Z','time'),'2024-02-29T00:00:00.000Z');
 for(const t of ['2026-02-29T00:00:00Z','2026-02-30T00:00:00Z','2026-11-07T00:00:00'])assert.throws(()=>notebook.timestamp(t,'time'));
 // DST offsets are accepted as explicit instants, without guessing exchange hours.
 assert.equal(Date.parse(notebook.timestamp('2026-11-01T01:30:00-05:00','time'))-Date.parse(notebook.timestamp('2026-11-01T01:30:00-04:00','time')),3600000);
});
test('archive lifecycle never treats deadline expiry or manual support as verified success',()=>{
 const soul={id:'test',created_at:'2026-11-01T00:00:00Z',payload:{reviewBy:'2026-11-05T00:00:00Z'}};
 assert.equal(notebook.notebookStatus(soul,[],'2026-11-02T00:00:00Z'),'PENDING');assert.equal(notebook.notebookStatus(soul,[],'2026-11-06T00:00:00Z'),'INCONCLUSIVE');
 const events=[{id:'1',soul_id:'test',recorded_at:'2026-11-06T00:00:00Z',payload:{type:'ARCHIVE'}},{id:'2',soul_id:'test',recorded_at:'2026-11-06T00:00:01Z',payload:{type:'RESTORE'}}];
 assert.equal(notebook.notebookStatus(soul,events.slice(0,1)),'ARCHIVED');assert.equal(notebook.notebookStatus(soul,events),'INCONCLUSIVE');
});
test('all migrations are additive; local backup restores exact rows and immutable triggers',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'gvv-restore-')),path=join(dir,'original.db'),backup=join(dir,'backup.db');
 try{
  const db=new DatabaseSync(path);const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();for(const f of files.slice(0,3))db.exec(readFileSync('drizzle/'+f,'utf8'));
  db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,?)').run('test','Alias','2020','v1',1,'2020');db.prepare('INSERT INTO souls VALUES (?,?,?,?,?,?,?)').run('legacy','2020','2020','TEST','old','{"legacy":true}','kept');
  const before=db.prepare('SELECT * FROM souls').all();for(const f of files.slice(3))db.exec(readFileSync('drizzle/'+f,'utf8'));assert.deepEqual(db.prepare('SELECT * FROM souls').all(),before);
  db.prepare('INSERT INTO notebook_souls VALUES (?,?,?,?,?,?)').run('test-notebook','test','2026','{}','digest','key');
  db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");db.close();const restored=new DatabaseSync(backup);assert.deepEqual(restored.prepare('SELECT * FROM souls').all(),before);assert.equal(restored.prepare('SELECT count(*) n FROM notebook_souls').get().n,1);assert.throws(()=>restored.exec("UPDATE notebook_souls SET payload='changed'"),/immutable/);assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');restored.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
