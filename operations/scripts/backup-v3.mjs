/** DEPRECATED (legacy 9-table projection script): Use `wrangler d1 export` + `operations/scripts/verify-logical-backup.mjs` for full-schema (73+ table) X 3.0 backups. Read-only capture -> isolated SQLite recovery. Never writes to hosted storage. */
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {databaseMigrationsDir,repoRoot} from './repo-paths.mjs';
const [destination,previous]=process.argv.slice(2).map(p=>resolve(p));
assert.ok(destination&&previous,'Pass fresh private destination and prior logical snapshot.');
assert.ok(relative(repoRoot,destination).startsWith('..'),'Backup must be outside the source checkout.');
const hash=v=>createHash('sha256').update(v).digest('hex');
const raw=JSON.parse(readFileSync(join(destination,'live-table-projections.json'),'utf8'));
const older=JSON.parse(readFileSync(previous,'utf8'));
const required=['accounts','notebook_events','notebook_souls','outcomes','ownership','rate_limits','souls','support_requests','workspace_records'];
assert.deepEqual(Object.keys(raw.tables).sort(),required.sort());
const tables={};
for(const [name,t] of Object.entries(raw.tables)){
 assert.equal(t.binding_name,'DB'); assert.equal(t.table_name,name);
 assert.equal(t.model_projection.next_offset,null);
 assert.equal(t.model_projection.omitted_columns,0);assert.equal(t.model_projection.omitted_rows,0);
 if(name!=='souls')assert.equal(t.model_projection.truncated,false);
 tables[name]=structuredClone(t.rows);
 if(name==='souls')for(const row of tables[name]){
  if(t.model_projection.truncated){const saved=older.tables.souls.find(s=>s.id===row.id);assert.ok(saved,'Missing full prior payload');assert.equal(hash(saved.payload),row.digest);row.payload=saved.payload;}
  assert.equal(hash(row.payload),row.digest);
 }
 if(name==='notebook_souls')for(const row of tables[name])assert.equal(hash(JSON.stringify({id:row.id,created_at:row.created_at,payload:JSON.parse(row.payload)})),row.digest);
 if(name==='notebook_events')for(const row of tables[name])assert.equal(hash(JSON.stringify({id:row.id,soul_id:row.soul_id,recorded_at:row.recorded_at,payload:JSON.parse(row.payload)})),row.digest);
}
const dbPath=join(destination,'isolated-restore.sqlite');
assert.equal(existsSync(dbPath),false,'Refusing to overwrite restore evidence.');
const db=new DatabaseSync(dbPath);
for(const migration of readdirSync(databaseMigrationsDir).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(join(databaseMigrationsDir,migration),'utf8'));
db.exec('BEGIN');
try{
 for(const [name,rows] of Object.entries(tables)){
  assert.match(name,/^[a-z_]+$/);
  const cols=raw.tables[name].columns;cols.forEach(c=>assert.match(c,/^[a-z_]+$/));
  const insert=db.prepare('INSERT INTO '+name+' ('+cols.join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')');
  for(const row of rows)insert.run(...cols.map(c=>row[c]));
 }
 db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
for(const [name,rows] of Object.entries(tables))assert.equal(db.prepare('SELECT count(*) n FROM '+name).get().n,rows.length);
db.close();
const reopened=new DatabaseSync(dbPath,{readOnly:true});
assert.equal(reopened.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
for(const row of reopened.prepare('SELECT * FROM souls').all())assert.equal(hash(row.payload),row.digest);
reopened.close();
const snapshotPath=join(destination,'logical-application-backup.json');
writeFileSync(snapshotPath,JSON.stringify({format:'gvv-logical-backup-v3',capturedAt:raw.capturedAt,tables},null,2),{flag:'wx'});
const report={checkedAt:new Date().toISOString(),result:'PASS',tableCount:required.length,counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),snapshotSha256:hash(readFileSync(snapshotPath)),restoreSha256:hash(readFileSync(dbPath)),reopenedReadOnly:true,legacyPayloadSha256:tables.souls.map(s=>s.digest),limitations:['Separate live table reads, not a transaction-consistent snapshot.','Truncated legacy payload restored from prior full logical snapshot and verified against current live digest.','Not a provider-managed D1 snapshot. Hosted restore NOT RUN.']};
writeFileSync(join(destination,'restore-verification.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report,null,2));
