/** Reads Supabase local status from stdin. Never prints key values. */
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {appRoot} from './repo-paths.mjs';
const status=JSON.parse(readFileSync(0,'utf8'));
const address=status.API_URL??status.api_url;
const key=status.PUBLISHABLE_KEY??status.ANON_KEY??status.publishable_key??status.anon_key;
if(!address||!key)throw new Error('Local status must include its returned API URL and publishable/anon key.');
const url=new URL(address);
if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Refusing to configure a hosted or non-loopback backend.');
const file=resolve(appRoot,'.dev.vars');
let content=existsSync(file)?readFileSync(file,'utf8'):'';
if(content)writeFileSync(file+'.backup-'+randomUUID(),content,{flag:'wx'});
for(const [name,value] of Object.entries({SUPABASE_URL:url.origin,SUPABASE_PUBLISHABLE_KEY:key,V3_LOCAL_DEV:'1'})){
 const line=name+'='+JSON.stringify(value);
 const re=new RegExp('^'+name+'=.*$','m');
 content=re.test(content)?content.replace(re,()=>line):content+line+'\n';
}
if(!/^V3_GOOGLE_ENABLED=/m.test(content))content+='V3_GOOGLE_ENABLED="0"\n';
if(!/^V3_QUANT_ENABLED=/m.test(content))content+='V3_QUANT_ENABLED="0"\n';
const temporary=file+'.tmp-'+randomUUID();writeFileSync(temporary,content,{flag:'wx'});renameSync(temporary,file);
console.log('Configured loopback Supabase in ignored .dev.vars. Key values were not printed.');
