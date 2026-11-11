import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {registerHooks} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
registerHooks({resolve(spec,ctx,next){if(spec==='@deepseek-ai/schemastery')return{url:'data:text/javascript,export default {object:x=>x,string:()=>({description(){return this},default(){return this},volatile(){return this}})}',shortCircuit:true};if(spec==='@deepseek-ai/dsh-llm')return{url:'data:text/javascript,export class LlmAdapter {}',shortCircuit:true};return next(spec,ctx);}});
const {trustedRequest,apply,inject,readJson}=await import('../lib/index.js');
const {ZcodeAppServerAdapter}=await import('../lib/zcode/app-server.js');

test('ZCode Start Plan publishes the catalog after a shared background probe',async()=>{
  const probe=Promise.withResolvers();
  const changed=Promise.withResolvers();
  const adapter=new ZcodeAppServerAdapter({
    options:()=>({accountMode:'start-plan',cliModels:[]}),
    onCatalogChanged:changed.resolve,
  });
  let reads=0;
  adapter.readCatalog=async()=>{
    reads++;
    adapter.catalog=await probe.promise;
    return adapter.catalog;
  };
  try{
    assert.deepEqual(await Promise.all([adapter.listModels('zcode-cli'),adapter.listModels('zcode-cli')]),[[],[]]);
    assert.equal(reads,1);
    probe.resolve([{providerId:'account:zai-start-plan',modelId:'fixture-model',label:'Fixture',providerLabel:'Fixture'}]);
    await changed.promise;
    assert.equal((await adapter.listModels('zcode-cli'))[0].id,'fixture-model');
  }finally{adapter.dispose();}
});

test('ZCode Start Plan exposes the real probe error and permits a retry',async()=>{
  const failed=Promise.withResolvers();
  const retried=Promise.withResolvers();
  const adapter=new ZcodeAppServerAdapter({
    options:()=>({accountMode:'start-plan',cliModels:[]}),
    onCatalogChanged:failed.resolve,
  });
  adapter.readCatalog=async()=>{throw new Error('Start Plan authorization failed');};
  try{
    assert.deepEqual(await adapter.listModels('zcode-cli'),[]);
    await failed.promise;
    await assert.rejects(adapter.listModels('zcode-cli'),/Start Plan authorization failed/);
    adapter.onCatalogChanged=retried.resolve;
    adapter.readCatalog=async()=>(adapter.catalog=[]);
    assert.deepEqual(await adapter.listModels('zcode-cli'),[]);
    await retried.promise;
    assert.deepEqual(await adapter.listModels('zcode-cli'),[]);
  }finally{adapter.dispose();}
});
test('Host plugin declares the LLM service it uses for native Codex registration',()=>{assert.ok(inject.includes('llm'));assert.ok(inject.includes('webServer'));assert.ok(inject.includes('agents'));assert.ok(inject.includes('sessionController'));});
test('local Host routes reject foreign origins, forged mutations and remote hosts',()=>{assert.equal(trustedRequest({headers:{host:'127.0.0.1:3080',origin:'https://evil.example'}}),false);assert.equal(trustedRequest({headers:{host:'127.0.0.1:3080'}}),true);assert.equal(trustedRequest({headers:{host:'127.0.0.1:3080',origin:'dsh-app://app','x-dkn-action':'1','content-type':'application/json'}},true),true);assert.equal(trustedRequest({headers:{host:'127.0.0.1:3080'}},true),false);assert.equal(trustedRequest({headers:{host:'evil.test'}}),false);});
test('Host plugin mounts routes and registers a native DSH Codex provider without starting Codex; disposal unwinds',async()=>{const directory=await mkdtemp(join(tmpdir(),'dkn-host-apply-')),prior=process.env.LOCALAPPDATA;process.env.LOCALAPPDATA=directory;try{const paths=[],releases=[],cleanup=[],registrations=[];apply({llm:{registerAdapter(providers,adapter){const registration={providers,adapter};registrations.push(registration);return()=>{registration.released=true;}}},webServer:{register(x){paths.push(x.path);return()=>releases.push(x.path);}},effect(fn){cleanup.push(fn());}},{zcodeEnabled:'false'});assert.equal(paths.length,21);assert.ok(paths.includes('/plugins/dkn-agent/zcode/test'));assert.ok(paths.includes('/plugins/dkn-agent/native/session-map'));assert.deepEqual(registrations.map(value=>value.providers).flat().sort(),['codex-cli','dkn-codex-agent'].sort());assert.equal(registrations.find(value=>value.providers[0]==='dkn-codex-agent').adapter.providerInfo('dkn-codex-agent').name,'Codex Agent（项目模式）');assert.ok(registrations.every(value=>value.released===undefined));for(const c of cleanup)await c();assert.equal(releases.length,21);assert.ok(registrations.every(value=>value.released===true));}finally{if(prior===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=prior;await rm(directory,{recursive:true,force:true});}});

test('JSON body decoding preserves Chinese text across byte boundaries',async()=>{const text=JSON.stringify({body:'项目协作上下文'}),bytes=Buffer.from(text),at=bytes.indexOf(Buffer.from('项'))+1;const value=await readJson({async *[Symbol.asyncIterator](){yield bytes.subarray(0,at);yield bytes.subarray(at);}});assert.equal(value.body,'项目协作上下文');});
