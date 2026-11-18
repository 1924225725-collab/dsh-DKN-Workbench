import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {TraeCnAdapter,readTraeAuth,traeEndpoints,traeQuotaProjection,traeCheckin} from '../lib/trae-cn.js';
test('TRAE native account quota subtracts consumed balance and preserves decimals',()=>{
  assert.equal(traeQuotaProjection({usage_summary:{total_amount:2900.25,consumed_amount:100.1}}).remaining,2800.15);
  assert.throws(()=>traeQuotaProjection({usage_summary:{total_amount:NaN,consumed_amount:0}}));
});
test('TRAE personal desktop auth, real catalogue, streaming and login isolation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dkn-trae-test-')),data=join(dir,'User','globalStorage'),app=join(dir,'resources','app');await mkdir(data,{recursive:true});await mkdir(app,{recursive:true});const storage=join(data,'storage.json');
  await writeFile(storage,JSON.stringify({'iCubeAuthInfo://icube.cloudide':JSON.stringify({token:'synthetic-token',host:'https://api.trae.cn',deviceId:'synthetic-device'})}));await writeFile(join(app,'product.json'),JSON.stringify({packageType:'TRAE_CN',bootConfig:{remote:{trae:{normal:'https://trae-api-cn.mchost.guru'}}}}));
  const config={traeInstallPath:dir,traeDataDir:dir},oldFetch=globalThis.fetch;let claimCount=0,claimed=false;
  globalThis.fetch=async(url,options={})=>{
    assert.ok(['api.trae.cn','trae-api-cn.mchost.guru'].includes(new URL(url).hostname));
    if(String(url).includes('/models?'))return Response.json({data:[{name:'test-model',display_name:'Test',is_preset:true,features:JSON.stringify({access:{enable:false}}),context_window_tokens:{dev:128000}},{name:'locked',is_preset:true,features:JSON.stringify({access:{enable:true}})}]});
    if(String(url).endsWith('/status'))return Response.json({checked_in:claimed,enable:true,credits:100});
    if(String(url).endsWith('/claim')){claimCount++;claimed=true;return Response.json({code:0})}
    if(options.method==='DELETE')return Response.json({});
    if(String(url).endsWith('/chat_sessions'))return Response.json({data:{chat_session_id:'synthetic-session',message_id:'synthetic-message'}});
    if(String(url).includes('/events?'))return new Response('event: message\ndata: {"content":"O"}\n\nevent: message\ndata: {"content":"OK"}\n\nevent: done\ndata: {}\n\n');
    throw Error('Unexpected fixture request');
  };
  const adapter=new TraeCnAdapter({},config);
  try{
    assert.equal(readTraeAuth(config).token,'synthetic-token');assert.equal(traeEndpoints(config).remoteBase,'https://trae-api-cn.mchost.guru/api/remote/v1');
    await adapter.probe();const models=await adapter.listModels('trae-cn');assert.ok(models.some(m=>m.id==='test-model'));assert.ok(!models.some(m=>m.id==='locked'));assert.equal(JSON.stringify(await adapter.inspect()).includes('synthetic-token'),false);
    const chunks=[];for await(const chunk of adapter.stream({model:'test-model',messages:[{role:'user',content:[{type:'text',text:'synthetic test'}]}]}))chunks.push(chunk);assert.equal(chunks.filter(c=>c.type==='text-delta').map(c=>c.text).join(''),'OK');assert.equal(chunks.find(c=>c.type==='block-end').block.text,'OK');assert.equal((await adapter.inspect()).connection.state,'ready');assert.equal(chunks.some(c=>c.type==='usage'),false,'no fake usage');
    const results=await Promise.all([traeCheckin(config,{claim:true}),traeCheckin(config,{claim:true})]);assert.equal(claimCount,1);assert.ok(results.every(r=>r.state==='claimed'));
    await writeFile(join(app,'product.json'),JSON.stringify({packageType:'TRAE_CN',bootConfig:{remote:{trae:{normal:'https://untrusted.example'}}}}));assert.throws(()=>traeEndpoints(config));
    await writeFile(storage,'{}');assert.deepEqual(await adapter.listModels('trae-cn'),[]);assert.equal((await traeCheckin(config)).state,'login-required');
  }finally{adapter.dispose();globalThis.fetch=oldFetch;await rm(dir,{recursive:true,force:true})}
});
