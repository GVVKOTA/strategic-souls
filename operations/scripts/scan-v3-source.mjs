/** Pattern scan of Git-distributable text. Does not claim absence of every secret. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
const root=process.cwd();
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
const patterns=[
 ['PRIVATE_KEY',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['GOOGLE_API_KEY',/\bAIza[0-9A-Za-z_-]{30,}\b/],
 ['OPENAI_KEY',/\bsk-(?:proj-|svcacct-)[A-Za-z0-9_-]{24,}\b/],
 ['GITHUB_TOKEN',/\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b/],
 ['SUPABASE_SECRET',/\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
 ['SITE_BYPASS_VALUE',/siwc_bypass_bearer_token["']?\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/],
 ['AUTH_JWT_LITERAL',/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
];
const findings=[];let count=0;
for(const name of files){
 if(!['.ts','.tsx','.mts','.js','.jsx','.mjs','.cjs','.json','.py','.sql','.md','.toml','.yml','.yaml','.html','.ps1','.bat'].includes(extname(name)))continue;
 const path=resolve(root,name);if(!path.startsWith(root))throw new Error('Unsafe scan path');if(!existsSync(path))continue;
 const value=readFileSync(path,'utf8');count++;
 for(const [rule,re] of patterns)if(re.test(value))findings.push({file:name,rule}); // Never emit a matched value.
}
const report={recordedAt:new Date().toISOString(),result:findings.length?'REVIEW_REQUIRED':'PASS',filesExamined:count,scope:'Git tracked and non-ignored source text; pattern scan, not a guarantee.',findings};
mkdirSync('operations/docs/v3/evidence',{recursive:true});writeFileSync('operations/docs/v3/evidence/source-scan.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(findings.length)process.exitCode=1;
