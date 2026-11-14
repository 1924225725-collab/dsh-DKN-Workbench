import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
registerHooks({resolve(spec,ctx,next){if(spec==='@deepseek-ai/dsh-llm')return{url:'data:text/javascript,export class LlmAdapter {}',shortCircuit:true};return next(spec,ctx);}});
const {QoderAdapter,QoderConnection,qoderModels,qoderPromptText}=await import('../lib/qoder-acp.js');
const path=fileURLToPath(new URL('./fixtures/qoder-acp.cjs',import.meta.url));
test('Qoder accepts prior reasoning and tool history without leaking reasoning or replaying tools',async()=>{
  const messages=[
    {role:'user',content:[{type:'text',text:'first question'}]},
    {role:'assistant',content:[{type:'reasoning',text:'PRIVATE REASONING'},{type:'text',text:'prior answer'},{type:'tool-call',id:'call-1',name:'read_file',arguments:'{"path":"example.txt"}'}]},
    {role:'tool',toolCallId:'call-1',content:[{type:'text',text:'file result'}]},
    {role:'developer',content:[{type:'tool-addition',toolName:'read_file'},{type:'tool-removal',toolName:'read_file'}]},
    {role:'assistant',content:[{type:'reasoning',text:'MORE PRIVATE REASONING'}]},
    {role:'user',content:[{type:'text',text:'next question'}]},
  ];
  const prompt=qoderPromptText(messages);
  assert.ok(!prompt.includes('PRIVATE REASONING'));assert.match(prompt,/prior answer/);assert.match(prompt,/call-1/);assert.match(prompt,/file result/);assert.match(prompt,/next question/);assert.match(prompt,/仅作记录/);
  const adapter=new QoderAdapter({}, {qoderPath:path});
  try{const chunks=[];for await(const chunk of adapter.stream({messages}))chunks.push(chunk);assert.equal(chunks.find(c=>c.type==='block-end').block.text,'你好');}finally{adapter.dispose();}
});
test('Qoder distinguishes real attachments from unknown history block types',()=>{
  for(const type of ['image','file'])assert.throws(()=>qoderPromptText([{role:'user',content:[{type}]}]),/附件（历史消息 1）/);
  assert.throws(()=>qoderPromptText([{role:'assistant',content:[{type:'future-block'}]}]),/内容块 future-block/);
});
test('Qoder ACP negotiates sessions, reads dynamic models and streams a selected model',async()=>{
  const adapter=new QoderAdapter({}, {qoderPath:path});
  try{
    const state=await adapter.probe();assert.equal(state.connection.state,'connected');assert.equal(state.models[1].id,'fixture-model');
    const chunks=[];for await(const c of adapter.stream({model:'fixture-model',messages:[{role:'user',content:'hello'}]}))chunks.push(c);
    assert.equal(chunks.filter(c=>c.type==='text-delta').map(c=>c.text).join(''),'你好');
    assert.equal(chunks.find(c=>c.type==='block-end').block.text,'你好');assert.equal(chunks.at(-1).reason.kind,'stop');assert.equal(adapter.active.size,0);
  }finally{adapter.dispose();}
});
test('Qoder ACP cancellation and invalid protocol close the child and release pending requests',async()=>{
  for(const prompt of ['WAIT_FOREVER','BAD_JSON']){
    const adapter=new QoderAdapter({}, {qoderPath:path}),signal=AbortSignal.timeout(300);
    try{await assert.rejects(async()=>{for await(const c of adapter.stream({messages:[{role:'user',content:prompt}],signal})){};},prompt==='BAD_JSON'?/无效/:/取消/);assert.equal(adapter.active.size,0);}finally{adapter.dispose();}
  }
});
test('Qoder model configuration groups and missing CLI diagnostics are explicit',async()=>{
  assert.deepEqual(qoderModels({configOptions:[{id:'model',options:[{name:'group',options:[{value:'m1',name:'Model'}]}]}]}),[{id:'m1',name:'Model'}]);
  const adapter=new QoderAdapter({}, {qoderPath:'/missing/qoder'});assert.equal((await adapter.inspect()).state,'missing');assert.deepEqual(await adapter.listModels('qoder-acp'),[]);
});
test('Qoder ACP denies an incoming permission request instead of automatically allowing tools',async()=>{
  const c=new QoderConnection(path);try{await c.initialize();await c.call('session/new',{});let response;
    const send=c.send.bind(c);c.send=m=>{if(m.id===999)response=m;send(m);};
    const pending=c.call('session/prompt',{prompt:[{type:'text',text:'PERMISSION'}]},1000).catch(()=>{});
    await new Promise(r=>setTimeout(r,80));assert.equal(response.result.outcome.optionId,'deny');c.close();await pending;
  }finally{c.close();}
});
