/** Real local Supabase/Auth/Mailpit HTTP journey. No mocks or production targets.
 * Creates disposable ssqa_* accounts locally; retains their records for investigation.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const origin=process.env.V3_TEST_ORIGIN??'http://127.0.0.1:5173';
const mailbox=process.env.V3_TEST_MAILPIT??'http://127.0.0.1:54324';
for(const address of [origin,mailbox]){const u=new URL(address);assert.ok(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname),'Loopback tests only.');}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
class Client{
 jar=new Map();
 async call(path,payload){
 const response=await fetch(origin+'/api/v3/'+path,{method:payload===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...this.jar].map(([k,v])=>k+'='+v).join('; ')},body:payload===undefined?undefined:JSON.stringify(payload),redirect:'manual'});
 for(const value of response.headers.getSetCookie()){const first=value.split(';')[0],i=first.indexOf('=');const name=first.slice(0,i),v=first.slice(i+1);if(value.includes('Max-Age=0'))this.jar.delete(name);else this.jar.set(name,v);}
 const data=await response.json();return {status:response.status,data};
 }
 async signIn(address){
 assert.equal((await this.call('auth/email-code',{email:address})).status,200);
 let code;
 for(let n=0;n<40&&!code;n++){
 const response=await fetch(mailbox+'/api/v1/messages');assert.equal(response.status,200);
 const box=await response.json();const msg=box.messages?.find(m=>m.To?.some(to=>to.Address.toLowerCase()===address));
 if(msg){const data=await (await fetch(mailbox+'/api/v1/message/'+encodeURIComponent(msg.ID))).json();code=(data.Text??data.HTML??'').match(/\b\d{6}\b/)?.[0];}
 if(!code)await pause(500);
 }
 assert.ok(code,'A real local OTP message must exist; no fixture code is accepted.');
 assert.equal((await this.call('auth/verify',{email:address,code})).status,200);
 assert.equal((await this.call('session')).data.authenticated,true);
 }
}
try{
 const probe=new Client(),health=await probe.call('health');
 if(health.data.backend==='NOT_CONFIGURED'){console.error('BLOCKED: the real local Supabase stack/environment is unavailable. No integration tests completed.');process.exitCode=2;}
 else {
 const run=randomUUID().replaceAll('-','').slice(0,10),a=new Client(),b=new Client();
 await a.signIn('ssqa_'+run+'_a@example.test');await b.signIn('ssqa_'+run+'_b@example.test');
 const p={handle:'ssqa_'+run,displayName:'Disposable local QA',bio:'TEST ONLY',isPublic:false,mode:'Beginner',adult:true,privacy:true,terms:true};
 const collision=await Promise.all([a.call('profile',p),b.call('profile',p)]);
 assert.deepEqual(collision.map(r=>r.status).sort(),[201,409]);
 const winner=collision[0].status===201?a:b,other=winner===a?b:a;
 assert.equal((await other.call('profile',{...p,handle:'ssqa_'+run+'_other'})).status,201);
 const payload={title:'LOCAL QA immutable hypothesis',topic:'Software fixture',hypothesis:'The local application must preserve this test record after a reload.',horizon:'One month',reasoning:'HTTP readback is required.',opposingCase:'A persistence or authorization error may contradict the test.',invalidation:'A changed immutable snapshot fails this disposable test.',reviewAt:new Date(Date.now()+86400000).toISOString(),tags:['LOCAL-QA'],evidence:[],commitment:'COMMITTED',dataRequired:false};
 const request={payload,teamId:null,soulId:null,expectedHead:null,requestId:randomUUID()};
 const saved=await winner.call('soul',request);assert.equal(saved.status,201);
 const retry=await winner.call('soul',request);assert.equal(retry.data.id,saved.data.id);
 assert.equal((await other.call('versions?soulId='+saved.data.soul_id)).data.rows.length,0);
 assert.ok((await winner.call('versions?soulId='+saved.data.soul_id)).data.rows.some(v=>v.id===saved.data.id&&v.payload.hypothesis===payload.hypothesis));
 const team=await winner.call('team',{name:'Disposable local QA Team',slug:'ssqa-'+run});assert.equal(team.status,201);
 const invitation=await winner.call('invite',{teamId:team.data.id,role:'EDITOR'});assert.equal(invitation.status,201);
 assert.equal((await other.call('accept-invite',{token:invitation.data.token})).status,200);
 const shared=await other.call('soul',{...request,teamId:team.data.id,requestId:randomUUID()});assert.equal(shared.status,201);
 const otherSession=(await other.call('session')).data;
 assert.equal((await winner.call('member',{teamId:team.data.id,bodyId:otherSession.id,action:'remove'})).status,200);
 assert.equal((await other.call('versions?soulId='+shared.data.soul_id)).data.rows.length,0);
 assert.equal((await winner.call('export')).status,200);
 assert.equal((await other.call('auth/logout',{})).status,200);assert.equal((await other.call('session')).data.authenticated,false);
 console.log(JSON.stringify({result:'PASS',scope:'Real loopback Auth OTP, Mailpit delivery, handle collision, private persistence/idempotency/IDOR, Teams, immediate revocation, export and logout',google:'NOT RUN - real OAuth credentials/user journey required',fixturesRetained:true}));
 }
}catch(e){console.error(JSON.stringify({result:'FAIL',message:e.message,scope:'Real local integration only; tokens and OTPs withheld'}));process.exitCode=1;}
