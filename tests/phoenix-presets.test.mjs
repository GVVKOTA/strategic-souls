import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const context=vm.createContext({structuredClone,URL,TextEncoder,TextDecoder,crypto:globalThis.crypto});
const cache=new Map();
async function load(file){
  if(cache.has(file))return cache.get(file);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const mod=new vm.SourceTextModule(code,{context,identifier:file});cache.set(file,mod);
  await mod.link((spec,ref)=>{let target=resolve(dirname(ref.identifier),spec);if(!existsSync(target))target+='.ts';return load(target);});return mod;
}
const loaded=await load(resolve('lib/v3/scan-presets.ts'));await loaded.evaluate();
const {scanFromPreset,SCAN_PRESETS,SCAN_LEVEL_HELP}=loaded.namespace;
test('templates have exact explicit rule semantics, costs and no selected data',()=>{
  const expected = [['close_vs_sma','gt',1,50,'ratio'],['rsi','lt',35,14,'percent'],['avg_traded_value','gte',10000000,20,'INR']];
  SCAN_PRESETS.forEach((p,i)=>{const s=JSON.parse(JSON.stringify(scanFromPreset(p.id)));assert.deepEqual(Object.values(s.conditions[0]),expected[i]);assert.deepEqual(s.costs,{feeBps:10,slippageBps:10,taxBps:0});assert.equal(s.dataSource,null);assert.equal(s.exit.holdingBars,5);});
});
test('preset edits do not mutate future templates',()=>{const first=scanFromPreset('rsi');first.conditions[0].value=80;assert.equal(scanFromPreset('rsi').conditions[0].value,35);assert.throws(()=>scanFromPreset('unknown'));});
test('advanced guidance names real implementation limits',()=>{assert.match(SCAN_LEVEL_HELP.Advanced,/not implemented/);assert.match(SCAN_LEVEL_HELP.Standard,/Intermediate/);});
