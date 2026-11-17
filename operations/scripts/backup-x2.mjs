import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {join} from 'node:path';
const dir=process.argv[2];assert.ok(dir,'Supply a unique private recovery directory');
const raw=JSON.parse(readFileSync(join(dir,'live-table-projections.json'),'utf8'));
const owner=JSON.parse(readFileSync(join(dir,'full-owner-export.json'),'utf8'));
const prior=JSON.parse(readFileSync('../recovery/logical-application-backup.json','utf8'));
const hash=v=>createHash('sha256').update(v).digest('hex');
const tables={};
for(const [name,p] of Object.entries(raw.tables)){
 assert.equal(p.model_projection.next_offset,null);assert.equal(p.model_projection.omitted_rows,0);
 tables[name]=structuredClone(p.rows);
 if(p.model_projection.truncated)for(const row of tables[name]){
  if(name==='souls')row.payload=prior.tables.souls.find(x=>x.id===row.id).payload;
  else if(name==='x1_scans')row.payload=JSON.stringify(owner.x1Workspace.scans.find(x=>x.id===row.id).payload);
  else throw Error('Unresolved truncation: '+name);
  assert.equal(hash(row.payload),row.digest,'Full payload must match the current live digest');
 }
}
assert.equal(tables.accounts[0].subject,owner.account.subject);
const db=new DatabaseSync(join(dir,'isolated-restore.sqlite'));
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(join('drizzle',f),'utf8'));
db.exec('BEGIN');
for(const [name,rows] of Object.entries(tables)){
 assert.match(name,/^[a-z0-9_]+$/);const cols=raw.tables[name].columns;cols.forEach(x=>assert.match(x,/^[a-z0-9_]+$/));
 for(const row of rows)db.prepare(`INSERT INTO ${name} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...cols.map(k=>row[k]));
}
db.exec('COMMIT');assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
for(const [name,rows] of Object.entries(tables))assert.equal(db.prepare(`SELECT count(*) n FROM ${name}`).get().n,rows.length);
db.close();const reopened=new DatabaseSync(join(dir,'isolated-restore.sqlite'),{readOnly:true});
assert.equal(reopened.prepare('PRAGMA integrity_check').get().integrity_check,'ok');reopened.close();
writeFileSync(join(dir,'logical-backup.json'),JSON.stringify({capturedAt:raw.capturedAt,tables},null,2),{flag:'wx'});
const report={at:new Date().toISOString(),result:'PASS',tables:Object.keys(tables).length,counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),snapshotSha256:hash(readFileSync(join(dir,'logical-backup.json'))),restoreSha256:hash(readFileSync(join(dir,'isolated-restore.sqlite'))),limitations:['Separate native table reads; not atomic or provider-managed.','Full new scan payloads from authenticated owner export match current native digests.','Legacy payload reconstructed from prior full backup and matched current live digest.','Hosted restore not executed.']};
writeFileSync(join(dir,'restore-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
