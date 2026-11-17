/** Offline only. Never connects to or writes a hosted database. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';

const directory=resolve(process.argv[2]??'');
if(!process.argv[2])throw new Error('Provide the private backup directory, outside source.');
const projections=JSON.parse(readFileSync(join(directory,'table-projections-before.json'),'utf8'));
const exported=JSON.parse(readFileSync(join(directory,'account-export-before.json'),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const tables=Object.fromEntries(Object.entries(projections).map(([name,value])=>[name,value.rows]));
for(const [name,value] of Object.entries(projections)){
  if(value.projection.next_offset!==null||value.projection.omitted_rows||value.projection.omitted_columns)throw new Error('Incomplete table '+name);
  if(name!=='souls'&&value.projection.truncated)throw new Error('Truncated table '+name);
}
for(const row of tables.souls){
  const record=exported.legacySyntheticArchive.find(entry=>entry.soul.id===row.id);
  assert.ok(record,'Complete account export must contain every legacy Soul.');
  const {digest,...soul}=record.soul;
  const payload=JSON.stringify(soul);
  assert.equal(hash(payload),row.digest,'Reconstructed payload must exactly match the stored SHA-256.');
  assert.equal(digest,row.digest);
  row.payload=payload;
}
assert.equal(exported.workspace.length,tables.workspace_records.length);
const snapshot={format:'gvv-logical-backup-v1',capturedAt:new Date().toISOString(),tables,notice:'Logical application snapshot from bounded table reads and authenticated export; not provider Time Travel or a transaction-consistent physical D1 backup. Rate counters and last_active are operational, separately captured values.'};
const snapshotFile=join(directory,'logical-application-backup.json');
writeFileSync(snapshotFile,JSON.stringify(snapshot,null,2));
const dbFile=join(directory,'isolated-restore.sqlite');
if(existsSync(dbFile))throw new Error('Restore destination already exists; retain it and choose a new private backup directory.');
const db=new DatabaseSync(dbFile);
for(const migration of ['0000_bent_reptil.sql','0001_early_hawkeye.sql','0002_aberrant_nighthawk.sql'])db.exec(readFileSync('drizzle/'+migration,'utf8'));
db.exec('BEGIN');
try{
 for(const [name,rows] of Object.entries(tables)){
  assert.match(name,/^[a-z_]+$/);
  const columns=projections[name].columns;columns.forEach(column=>assert.match(column,/^[a-z_]+$/));
  const statement=db.prepare('INSERT INTO '+name+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')');
  for(const row of rows)statement.run(...columns.map(column=>row[column]));
 }
 db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}
const rowsBefore=db.prepare('SELECT * FROM souls ORDER BY id').all();
db.exec(readFileSync('drizzle/0003_peaceful_smasher.sql','utf8'));
assert.deepEqual(db.prepare('SELECT * FROM souls ORDER BY id').all(),rowsBefore);
for(const [name,rows] of Object.entries(tables))assert.equal(db.prepare('SELECT count(*) n FROM '+name).get().n,rows.length);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
assert.throws(()=>db.prepare("UPDATE souls SET payload='{}'").run(),/immutable/);
db.close();
const report={checkedAt:new Date().toISOString(),logicalRestore:'PASS',pendingAdditiveMigration:'PASS',legacyPayloadHashes:'PASS',counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),snapshotSha256:hash(readFileSync(snapshotFile)),restoreSha256:hash(readFileSync(dbFile)),limitations:['Not a provider-managed D1 backup.','Operational counters and last_active are not captured in one database transaction.','Hosted restore is not exercised; no live records were changed by this script.']};
writeFileSync(join(directory,'restore-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
