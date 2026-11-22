import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
registerHooks({resolve(spec,ctx,next){if(spec==='@deepseek-ai/dsh-llm')return{url:'data:text/javascript,export class LlmAdapter {}',shortCircuit:true};return next(spec,ctx);}});
const {OrcaTermAdapter}=await import('../lib/orcaterm.js');
const {ApiExportService}=await import('../lib/api-export-service.js');

test('unified API verifies OrcaTerm and preserves namespaced upstream model IDs',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dkn-orca-api-'));
  let upstreamModel;
  const adapter=new OrcaTermAdapter({}, {}, {plugin:{config:async config=>{config.provider={orcaterm:{models:{'TokenHub/fixture':{name:'Fixture',limit:{context:100000}}}}}},auth:{loader:async()=>({fetch:async(_url,request)=>{upstreamModel=JSON.parse(request.body).model;return Response.json({choices:[{message:{content:'OK'}}]})}})}}});
  adapter.auth=async()=>({access:'fixture'});
  const api=new ApiExportService({directory,allowEphemeral:true,llm:{listProviders:()=>[{id:'orcaterm',name:'OrcaTerm'}],listModels:provider=>adapter.listModels(provider),stream:options=>adapter.stream(options)}});
  try{
    await api.ready;await api.refreshModels();const key=await api.control('rotate');await api.control('save',{port:0,models:['orcaterm/TokenHub/fixture']});assert.equal(api.enabledModels().length,0);
    await api.verify('orcaterm/TokenHub/fixture');assert.equal(api.enabledModels().length,1);await api.control('start');
    const response=await fetch(api.snapshot().baseUrl+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key.secret,'content-type':'application/json'},body:JSON.stringify({model:'dkn',messages:[{role:'user',content:'hello'}]})});
    const result=await response.json();assert.equal(response.status,200);assert.equal(result.model,'dkn');assert.equal(result.choices[0].message.content,'OK');assert.equal(upstreamModel,'TokenHub/fixture');
  }finally{await api.close();adapter.dispose();await rm(directory,{recursive:true,force:true})}
});

test('OrcaTerm native adapter preserves host call contract and refuses unsupported inputs',async()=>{
  let sent;
  const plugin={config:async config=>{config.provider={orcaterm:{models:{fixture:{name:'Fixture',limit:{context:100000}}}}}},auth:{loader:async()=>({fetch:async(_url,request)=>{sent=JSON.parse(request.body);return Response.json({choices:[{message:{content:'OK'}}]})}}),usage:async()=>({windows:[{amount:3,limit:100}]})}};
  const adapter=new OrcaTermAdapter({}, {orcatermModel:'fixture'}, {plugin});
  adapter.auth=async()=>({access:'fixture'});
  const prepared=await adapter.prepareCall('orcaterm','fixture');assert.equal(prepared.model.provider,'orcaterm');
  const events=[];for await(const event of prepared.stream({model:'fixture',messages:[{role:'user',content:[{type:'text',text:'hello'}]}]}))events.push(event);
  assert.equal(events.find(event=>event.type==='block-end').block.text,'OK');assert.equal(sent.model,'fixture');
  assert.equal((await adapter.quota()).buckets[0].remaining,97);
  assert.equal((await adapter.inspect()).connection.state,'ready');
  await assert.rejects(async()=>{for await(const _ of adapter.stream({messages:[{role:'user',content:[{type:'image'}]}]})){}},/仅支持文字/);
  assert.equal(adapter.inFlight,false);adapter.dispose();
});

test('OrcaTerm login persists only encrypted data and public status omits credentials',{skip:process.platform!=='win32'},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dkn-orcaterm-'));
  const adapter=new OrcaTermAdapter({}, {}, {directory});
  try{
    await adapter.saveAuth({access:'TEST_SECRET_NEVER_PLAIN',expires:Date.now()+3600000});
    const bytes=await readFile(join(directory,'login.dpapi'));assert.equal(bytes.includes(Buffer.from('TEST_SECRET_NEVER_PLAIN')),false);
    const reader=new OrcaTermAdapter({}, {}, {directory});assert.equal((await reader.auth()).access,'TEST_SECRET_NEVER_PLAIN');reader.dispose();assert.equal((await adapter.auth()).access,'TEST_SECRET_NEVER_PLAIN');
    const status=await adapter.inspect();assert.equal(status.authenticated,true);assert.equal(JSON.stringify(status).includes('TEST_SECRET_NEVER_PLAIN'),false);
  }finally{adapter.dispose();await rm(directory,{recursive:true,force:true})}
});

test('OrcaTerm default model resolves to a listed upstream model',async()=>{const adapter=new OrcaTermAdapter();adapter.auth=async()=>({access:'fixture'});assert.equal((await adapter.resolveModel('orcaterm','TokenHub/deepseek-v4.1-flash')).id,'TokenHub/deepseek-v4.1-flash');adapter.dispose();});
