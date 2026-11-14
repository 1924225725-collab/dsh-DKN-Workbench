import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ApiExportService,validateApiRequest} from '../lib/api-export-service.js';
const prompt=()=>({model:'qoder-acp/test',messages:[{role:'user',content:'Only synthetic text'}]});
async function fixture(fn){
  const directory=await mkdtemp(join(tmpdir(),'dkn-api-test-')),calls=[];
  const llm={listProviders:()=>[{id:'qoder-acp',name:'Qoder'},{id:'zcode-cli',name:'ZCode'},{id:'dkn-codex-agent',name:'Native projects'}],listModels:async()=>[{id:'test',name:'Synthetic'}],async *stream(options){calls.push(options);yield{type:'text-delta',index:0,text:'API_'};yield{type:'text-delta',index:0,text:'OK'};yield{type:'block-end',index:0,block:{type:'text',text:'API_OK'}};yield{type:'block-end',index:1,block:{type:'text',text:'!'}};yield{type:'finish',reason:{kind:'stop'}};}};
  const service=new ApiExportService({directory,llm,allowEphemeral:true});
  try{await service.ready;await service.control('refresh');const key=(await service.control('rotate')).secret;await service.control('save',{port:0,models:['qoder-acp/test']});await service.control('start');
    const request=(body=prompt(),custom={})=>fetch(service.snapshot().baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),...custom});
    await fn({service,llm,calls,key,request,directory});
  }finally{await service.close();await rm(directory,{recursive:true,force:true});}
}
test('one API enforces key/whitelist, hashes its secret and preserves JSON/SSE without duplication',async()=>fixture(async({service,calls,key,request,directory})=>{
  assert.equal((await fetch(service.snapshot().baseUrl+'/models')).status,401);
  const listing=await(await fetch(service.snapshot().baseUrl+'/models',{headers:{Authorization:'Bearer '+key}})).json();assert.deepEqual(listing.data.map(m=>m.id),['qoder-acp/test']);assert.equal(service.snapshot().catalog.some(m=>m.provider==='dkn-codex-agent'),false);
  const result=await(await request()).json();assert.equal(result.choices[0].message.content,'API_OK!');assert.equal(result.usage,undefined);
  const response=await request({...prompt(),stream:true});assert.match(response.headers.get('content-type'),/event-stream/);const sse=await response.text();const events=sse.split('\n').filter(l=>l.startsWith('data: {')).map(l=>JSON.parse(l.slice(6)));assert.equal(events.map(e=>e.choices?.[0].delta.content||'').join(''),'API_OK!');assert.equal(events.at(-1).choices[0].finish_reason,'stop');assert.match(sse,/data: \[DONE\]/);
  assert.equal(new Set(calls.map(c=>c.sessionId)).size,2);assert.equal(calls.every(c=>c.tools.length===0),true);for(const c of calls)await assert.rejects(stat(c.apiExportCwd),{code:'ENOENT'});
  assert.equal((await readFile(join(directory,'settings.json'),'utf8')).includes(key),false);assert.equal(JSON.stringify(service.snapshot()).includes(key),false);assert.equal(JSON.stringify(service.snapshot().records).includes('Only synthetic text'),false);
  const second=(await service.control('rotate')).secret;assert.notEqual(second,key);assert.equal((await request()).status,401);assert.equal((await fetch(service.snapshot().baseUrl+'/models',{headers:{Authorization:'Bearer '+second,Origin:'https://foreign.example'}})).status,403);
}));
test('unsupported parameters, modalities and non-exported models fail before inference',async()=>fixture(async({request,calls})=>{
  for(const value of [{...prompt(),temperature:0},{...prompt(),max_tokens:0},{...prompt(),tools:[{type:'function'}]},{...prompt(),messages:[{role:'user',content:[{type:'image_url',image_url:{url:'https://example.com'}}]}]}])assert.equal((await request(value)).status,400);
  assert.equal((await request({...prompt(),model:'zcode-cli/test'})).status,404);assert.equal((await request(prompt(),{body:'x'.repeat(130*1024)})).status,413);assert.equal(calls.length,0);
}));
test('ZCode requires fresh successful text verification and does not restore stale verification',async()=>fixture(async({service,directory,llm})=>{
  await service.control('save',{models:['zcode-cli/test']});assert.equal(service.enabledModels().length,0);assert.equal((await service.verify('zcode-cli/test')).reply,'API_OK!');assert.equal(service.enabledModels().length,1);
  const reopened=new ApiExportService({directory,llm,allowEphemeral:true});try{await reopened.ready;await reopened.refreshModels();assert.equal(reopened.config.models[0],'zcode-cli/test');assert.equal(reopened.enabledModels().length,0);}finally{await reopened.close();}
}));
test('queued calls stay bounded; client cancellation propagates and stop releases the listener',async()=>fixture(async({service,llm,request})=>{
  let active=0,max=0,aborted=0;llm.stream=async function*(options){active++;max=Math.max(max,active);try{await delay(180,undefined,{signal:options.signal});yield{type:'block-end',block:{type:'text',text:'complete'}};yield{type:'finish',reason:{kind:'stop'}};}finally{active--;if(options.signal.aborted)aborted++;}};
  const controller=new AbortController(),a=request(prompt(),{signal:controller.signal});a.catch(()=>{});await delay(30);const b=request();await delay(20);assert.ok(service.snapshot().queued>=1);controller.abort();await assert.rejects(a);assert.equal((await b).status,200);assert.equal(max,1);assert.ok(aborted>=1);
  await Promise.all(Array.from({length:3},()=>request().then(r=>r.json())));assert.equal(max,1);const url=service.snapshot().baseUrl;await service.control('stop');await assert.rejects(fetch(url+'/models'));assert.equal(service.snapshot().running,false);
}));
test('errors redact upstream details and timeout bounds an uncooperative iterator',async()=>fixture(async({service,llm,request})=>{
  llm.stream=async function*(){throw Object.assign(Error('sensitive-token-and-private-path'),{status:500});};const response=await request();assert.equal(response.status,502);assert.equal((await response.text()).includes('sensitive-token'),false);
  await service.control('save',{timeoutMs:1000});llm.stream=()=>({[Symbol.asyncIterator](){return this;},next(){return new Promise(()=>{});}});const start=Date.now();const timed=await request();assert.equal(timed.status,504);assert.ok(Date.now()-start<3500);assert.equal(service.snapshot().active,0);
}));
test('text parts project to text, invalid role/continuation/count reject explicitly',()=>{
  assert.equal(validateApiRequest({...prompt(),messages:[{role:'user',content:[{type:'text',text:'a'},{type:'text',text:'b'}]}]}).messages[0].content[0].text,'a\nb');for(const body of [{...prompt(),n:2},{...prompt(),messages:[{role:'tool',content:'x'}]},{...prompt(),messages:[{role:'assistant',content:'x'}]}])assert.throws(()=>validateApiRequest(body));
});

test('WorkBuddy CN connectivity request max_tokens=1 is accepted with a bounded SSE response',async()=>fixture(async({request,calls})=>{
  // Observed in WorkBuddy 5.11.3 main/server.js: testLocalCustomModelConnectivity -> maxOutputTokens=1 -> buildRequest max_tokens=1.
  const response=await request({model:'qoder-acp/test',messages:[{role:'user',content:'Reply with OK.'}],stream:true,max_tokens:1});assert.equal(response.status,200);
  const events=(await response.text()).split('\n').filter(line=>line.startsWith('data: {')).map(line=>JSON.parse(line.slice(6)));
  assert.equal(events.some(event=>event.error),false);const text=events.map(e=>e.choices?.[0]?.delta?.content||'').join('');assert.ok(Buffer.byteLength(text)<=1);assert.equal(events.at(-1).choices[0].finish_reason,'length');assert.equal(calls[0].maxTokens,1);
}));

test('output budgets keep UTF-8 whole and report length, including an empty bounded response',async()=>fixture(async({request,llm,service})=>{
  llm.stream=async function*(){yield{type:'block-end',index:0,block:{type:'text',text:'中文回复'}};yield{type:'finish',reason:{kind:'stop'}};};
  const value=await(await request({...prompt(),max_completion_tokens:3})).json();assert.equal(value.choices[0].message.content,'中');assert.equal(value.choices[0].finish_reason,'length');
  const empty=await(await request({...prompt(),max_tokens:1})).json();assert.equal(empty.choices[0].message.content,'');assert.equal(empty.choices[0].finish_reason,'length');
  const sse=await(await request({...prompt(),max_tokens:1,stream:true})).text();assert.match(sse,/event-stream|chat.completion.chunk/);assert.match(sse,/"finish_reason":"length"/);assert.equal(sse.includes('error'),false);
  assert.equal((await request({...prompt(),max_tokens:1,max_completion_tokens:1})).status,400);
  assert.ok(service.snapshot().records.some(r=>r.status==='invalid_request_error'&&r.httpStatus===400));
}));

test('saved autostart reuses the hashed key and port conflicts are recoverable',async()=>fixture(async({service,directory,llm,key})=>{
  await service.control('save',{autoStart:true});const second=new ApiExportService({directory,llm,allowEphemeral:true});
  try{await second.ready;assert.equal(second.snapshot().running,true);assert.equal((await fetch(second.snapshot().baseUrl+'/models',{headers:{Authorization:'Bearer '+key}})).status,200);}
  finally{await second.close();}
  const port=service.server.address().port;const thirdDirectory=await mkdtemp(join(tmpdir(),'dkn-api-conflict-')),third=new ApiExportService({directory:thirdDirectory,llm});
  try{await third.ready;await third.control('refresh');await third.control('rotate');await third.control('save',{port,models:['qoder-acp/test']});await assert.rejects(third.control('start'),/占用/);assert.equal(third.snapshot().running,false);}
  finally{await third.close();await rm(thirdDirectory,{recursive:true,force:true});}
}));

test('queue limit and cancellation of queued work do not create hidden upstream calls',async()=>fixture(async({service,llm,request})=>{
  let calls=0;llm.stream=async function*(options){calls++;await delay(10000,undefined,{signal:options.signal});yield{type:'finish',reason:{kind:'stop'}};};
  const controller=new AbortController(),requests=[];for(let i=0;i<10;i++){const work=request(prompt(),{signal:controller.signal}).then(async res=>({status:res.status,body:await res.text()})).catch(()=>({status:'cancelled'}));requests.push(work);}
  for(let i=0;i<100&&service.snapshot().queued<8;i++)await delay(10);assert.equal(service.snapshot().queued,8);assert.equal(calls,1);
  const first=await Promise.race(requests);assert.equal(first.status,429);controller.abort();await Promise.all(requests);for(let i=0;i<100&&(service.active||service.waiters.length);i++)await delay(10);assert.equal(service.snapshot().queued,0);assert.equal(calls,1);assert.equal(service.snapshot().active,0);
}));
