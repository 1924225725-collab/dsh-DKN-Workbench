import test from 'node:test';
import assert from 'node:assert/strict';
import {AntigravityAdapter,AntigravityConnection,isAntigravityNotice,locateAntigravity} from '../lib/antigravity-acp.js';
import {antigravityEnv} from '../lib/antigravity-network.js';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';

function adapter(text='REAL_SYNTHETIC_OK'){
 const calls=[],clients=[];const value=new AntigravityAdapter({emit(){}},{antigravityPath:process.execPath,antigravitySystemProxy:'false'},{clientFactory:()=>{
  const client={closed:false,async initialize(){return{protocolVersion:1,agentInfo:{name:'synthetic'}}},async call(method,params){calls.push([method,params]);if(method==='session/new')return{sessionId:'fixture',models:{availableModels:[{modelId:'model-a',name:'Model A'}]}};if(method==='session/prompt'){client.onUpdate({sessionId:'fixture',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}});return{stopReason:'end_turn'}}return{}},close(){client.closed=true}};clients.push(client);return client;
 }});return{value,calls,clients};
}
test('Antigravity reads the account catalogue, switches exact model IDs and marks ready only after final model text',async()=>{
 const {value,calls,clients}=adapter();try{await value.probe();assert.equal((await value.inspect()).connection.state,'connected');assert.ok((await value.listModels('antigravity-acp')).some(m=>m.id==='model-a'));const events=[];for await(const event of value.stream({model:'model-a',messages:[{role:'user',content:'synthetic request'}]}))events.push(event);assert.equal(events.filter(e=>e.type==='text-delta').map(e=>e.text).join(''),'REAL_SYNTHETIC_OK');assert.ok(calls.some(([method,params])=>method==='session/set_model'&&params.modelId==='model-a'));assert.equal((await value.inspect()).connection.state,'ready');assert.ok(clients.every(c=>c.closed));}finally{value.dispose();}
});
test('official verification notices are failures, never emitted as a successful model response',async()=>{
 assert.equal(isAntigravityNotice('\n⚠ Verification Required\n'),true);assert.equal(isAntigravityNotice('normal answer'),false);
 const {value}=adapter('\n⚠ Verification Required\n');const emitted=[];try{await assert.rejects(async()=>{for await(const event of value.stream({messages:[{role:'user',content:'synthetic'}]}))emitted.push(event)},/需要官方验证/);assert.equal(emitted.some(e=>e.type==='text-delta'||e.type==='finish'),false);assert.equal((await value.inspect()).connection.state,'error');}finally{value.dispose();}
});
test('native launch uses acp subcommand and rejects permission requests instead of granting access',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};let args,launch;const client=new AntigravityConnection('agy.exe',{env:{HTTPS_PROXY:'http://localhost:7897'},spawnImpl:(path,a,options)=>{args=a;launch=options;return child}});
 try{assert.deepEqual(args,['acp']);assert.equal(launch.env.HTTPS_PROXY,'http://localhost:7897');const messages=[];child.stdin.on('data',b=>messages.push(JSON.parse(b.toString())));child.stdout.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'session/request_permission',params:{options:[{kind:'allow_once',optionId:'allow'},{kind:'reject_once',optionId:'reject'}]}})+'\n');assert.equal(messages[0].result.outcome.optionId,'reject');}finally{client.close();}
});
test('proxy configuration is scoped to child environment and invalid/authenticated addresses are rejected',async()=>{
 const before=process.env.HTTPS_PROXY;const env=await antigravityEnv({antigravityProxy:'http://127.0.0.1:7897',antigravitySystemProxy:'false'});assert.equal(env.HTTPS_PROXY,'http://127.0.0.1:7897');assert.equal(process.env.HTTPS_PROXY,before);await assert.rejects(antigravityEnv({antigravityProxy:'not a url'}),/格式/);await assert.rejects(antigravityEnv({antigravityProxy:'http://user:secret@localhost:7897'}),/认证代理/);assert.equal(locateAntigravity({antigravityPath:process.execPath}),process.execPath);
});
