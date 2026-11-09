import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sendCodex,createHubTransports} from '../lib/hub/transports.js';
import {ClaudeCliAdapter} from '../lib/hub/claude.js';

test('Codex transport buffers pre-ack events, correlates final item and delegates only its own approval',async()=>{
 const runtime=new EventEmitter();runtime.interactions=new Map();let answers=0,submissions=0;
 runtime.answer=(key,result)=>{assert.equal(key,'own');assert.equal(result.decision,'accept');answers++;runtime.interactions.delete(key);};
 const codex={connect:async()=>{},requireRuntime:()=>runtime,history:async()=>{},operate:async input=>{submissions++;assert.equal(input.sandbox,'read-only');runtime.interactions.set('other',{method:'item/commandExecution/requestApproval',params:{threadId:'different'}});runtime.emit('interaction','other');runtime.interactions.set('own',{method:'item/commandExecution/requestApproval',params:{threadId:'t'}});runtime.emit('interaction','own');
   for(const params of [{threadId:'t',turnId:'turn',item:{id:'user-item',type:'userMessage'}},{threadId:'t',turnId:'turn',item:{id:'final-item',type:'agentMessage',text:'已完成'}}])runtime.emit('notification',{method:'item/completed',params});
   runtime.emit('notification',{method:'turn/completed',params:{threadId:'t',turn:{id:'turn',status:'completed'}}});return{turnId:'turn'};}};
 const result=await sendCodex(codex,'t','内容','request',{onApprovalRequest:async()=>({decision:'accept'})});
 assert.equal(result.reply,'已完成');assert.equal(result.eventId,'final-item');assert.equal(result.userEventId,'user-item');assert.equal(result.turnEnded,true);assert.equal(answers,1);assert.equal(submissions,1);assert.equal(runtime.listenerCount('notification'),0);
});
test('Codex disconnected after acknowledgement is uncertain and is never resubmitted by the transport',async()=>{
 const runtime=new EventEmitter();runtime.interactions=new Map();let count=0;
 const codex={connect:async()=>{},requireRuntime:()=>runtime,history:async()=>{},operate:async()=>{count++;setImmediate(()=>runtime.emit('disconnected','connection lost'));return{turnId:'turn'};}};
 await assert.rejects(sendCodex(codex,'t','内容','request'),error=>error.submissionUncertain&&error.messageSent);assert.equal(count,1);assert.equal(runtime.listenerCount('disconnected'),0);
});
test('DSH in-process transport waits for the addressed turn end and preserves request identity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dkn-dsh-adapter-'));let resolveNext,frames=[];
 const push=frame=>{frames.push(frame);resolveNext?.();resolveNext=null;};
 const controller={list:async()=>({items:[{sessionId:'s',running:false,cwd:root}]}),async *follow(_request,signal){yield{type:'snapshot',cursor:0,records:[],header:{cwd:root}};while(!signal.aborted){if(!frames.length)await new Promise(resolve=>{resolveNext=resolve;signal.addEventListener('abort',resolve,{once:true});});if(frames.length)yield frames.shift();}},prompt:async request=>{assert.equal(request.requestId,'correlation');for(const [seq,type,data] of [[1,'turn/start',{turn:1}],[2,'user/message',{turn:1,source:{kind:'rpc',rpcId:'correlation'},content:[{type:'text',text:'要求'}]}],[3,'assistant/message',{turn:1,content:[{type:'text',text:'答复'}]}],[4,'turn/end',{turn:1,reason:{kind:'completed'}}]])push({type:'event',event:{seq,type,data}});return{accepted:true};}};
 const registry=createHubTransports({sessionController:controller},{});
 try{const result=await registry.get('DSH Desktop').send('s','要求','correlation');assert.equal(result.reply,'答复');assert.equal(result.turnEnded,true);assert.equal(result.eventId,'3');}finally{registry.close();await rm(root,{recursive:true,force:true});}
});
test('Claude uses official new/resume flags, keeps prompts on stdin and never enables permission bypass',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dkn-claude-adapter-')),calls=[];
 const adapter=new ClaudeCliAdapter(join(root,'state'),{command:{command:'synthetic-cli',args:[]},spawn(_command,args,options){calls.push({args,options});const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();let prompt='';child.stdin=new Writable({write(chunk,_encoding,callback){prompt+=chunk.toString();callback();},final(callback){callback();setImmediate(()=>{const id=args.includes('--resume')?args[args.indexOf('--resume')+1]:args[args.indexOf('--session-id')+1];assert.ok(prompt.includes('合成输入'));child.stdout.write(JSON.stringify({type:'assistant',session_id:id,message:{content:[{type:'text',text:'合成结果'}]}})+'\n');child.stdout.write(JSON.stringify({type:'result',session_id:id,is_error:false,result:'合成结果'})+'\n');child.emit('close',0);});}});child.kill=()=>child.emit('close',1);return child;}});
 try{const created=await adapter.create({cwd:root,title:'Claude 合成会话'});assert.equal(calls.length,0);const first=await adapter.send(created.sessionId,'合成输入','a');assert.equal(first.turnEnded,true);await adapter.send(created.sessionId,'合成输入后续','b');assert.ok(calls[0].args.includes('--session-id'));assert.ok(calls[1].args.includes('--resume'));assert.ok(calls.every(call=>!call.args.includes('--dangerously-skip-permissions')&&!call.args.includes('bypassPermissions')));assert.ok(calls[0].args.includes('Read,Glob,Grep'));assert.equal((await adapter.inspect(created.sessionId)).history.length,4);}finally{adapter.close();await rm(root,{recursive:true,force:true});}
});
