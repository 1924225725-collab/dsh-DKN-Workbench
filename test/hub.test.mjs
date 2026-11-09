import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {EmbeddedHub} from '../lib/hub/service.js';
import {DirectoryGate} from '../lib/hub/transports.js';
const until=async fn=>{for(let i=0;i<1000;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('等待测试执行结束超时');};
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'dkn-embedded-hub-')),calls=[];
 const adapter={software:'Codex',mode:'new-session',health:async()=>({available:true}),models:async()=>[],inspect:async()=>({status:'idle',cwd:root,history:[]}),send:async(id,body)=>{calls.push({id,body});return{reply:'成员的普通回答',messageSent:true,turnEnded:true,eventId:randomUUID()};},create:async()=>({sessionId:randomUUID(),mode:'new-session'})};
 const hub=new EmbeddedHub({}, {runtime:null},join(root,'hub'),{adapters:new Map([['Codex',adapter]])});await hub.ready;
 const action=(type,data,operationId=randomUUID())=>hub.action({type,data,operationId});
 const project=await action('project.save',{name:'隔离项目',path:root});
 const member=await action('member.save',{projectId:project.id,displayName:'A',software:'Codex',sessionId:'session-a',allowSend:true,allowAutomation:true});
 const reviewer=await action('member.save',{projectId:project.id,displayName:'AB',software:'Codex',sessionId:'session-b',allowSend:true,allowAutomation:true});
 return{root,hub,adapter,action,project,member,reviewer,calls,async close(){await hub.close();await rm(root,{recursive:true,force:true});}};
}
test('Hub deduplicates concurrent submissions, routes exact @members and preserves independent task acceptance',async()=>{
 const f=await fixture();try{
   const id=randomUUID(),input={projectId:f.project.id,body:'@AB 请独立审查'};
   const [first,second]=await Promise.all([f.action('message.send',input,id),f.action('message.send',input,id)]);
   assert.deepEqual(first,second);await until(()=>f.hub.core.state.jobs.every(j=>j.status==='completed'));
   assert.equal(f.calls.length,1);assert.equal(f.calls[0].id,f.reviewer.sessionId);assert.equal(f.hub.core.state.tasks.length,0);
   await assert.rejects(f.action('message.send',{...input,body:'其他内容'},id),/操作编号/);
   assert.equal((await f.hub.receipt(id)).status,'done');
   const task=await f.action('task.save',{projectId:f.project.id,title:'人工任务',detail:'内容',reviewerId:'member-human',assigneeId:f.member.id});
   await f.action('task.transition',{taskId:task.id,status:'running'});await f.action('task.transition',{taskId:task.id,status:'review',evidence:'已检查合成目录与预期内容一致'});
   assert.equal(task.status,'review');await f.action('task.transition',{taskId:task.id,status:'done',evidence:'负责人已独立核对合成产物与验收要求一致'});assert.equal(task.status,'done');
 }finally{await f.close();}
});
test('Hub reuses original develop/review workflow and only accepts a valid independent review',async()=>{
 const f=await fixture();try{
   f.adapter.send=async(id)=>({messageSent:true,turnEnded:true,eventId:randomUUID(),reply:id===f.member.sessionId?JSON.stringify({summary:'开发完成',selfTest:{passed:true,evidence:'合成输入得到预期输出，已完成独立测试'}}):JSON.stringify({accepted:true,evidence:[{object:'合成产物',check:'独立验证返回值',result:'实际观察结果与目标一致'}],unverified:[]})});
   const task=await f.action('task.save',{projectId:f.project.id,title:'开发并审查',detail:'完成合成任务',acceptanceCriteria:'独立检查结果',assigneeId:f.member.id,reviewerId:f.reviewer.id,workflow:'develop-review'});
   await f.action('task.execute',{taskId:task.id});await until(()=>['done','blocked','failed'].includes(task.status));
   assert.equal(task.status,'done');assert.ok(task.reviewEvidence.includes('实际观察结果'));
   const saved=JSON.parse(await readFile(join(f.root,'hub','state','workspace.json'),'utf8'));assert.ok(saved.snapshot.events.length>0);
 }finally{await f.close();}
});
test('Hub restart blocks pending receipts and queued work instead of replaying native sends',async()=>{
 const f=await fixture();let other;
 try{
   await f.hub.core.change(()=>f.hub.core.state.pluginReceipts.push({id:'lost-ack',type:'message.send',hash:'hash',status:'pending',createdAt:Date.now()}));
   other=new EmbeddedHub({}, {runtime:null},join(f.root,'hub'),{adapters:new Map([['Codex',f.adapter]])});await other.ready;
   assert.equal((await other.receipt('lost-ack')).status,'unknown');assert.equal(f.calls.length,0);
   await assert.rejects(other.action({operationId:'lost-ack',type:'message.send',data:{}}),/编号|核对/);
 }finally{await other?.close();await f.close();}
});
test('overlapping project directories serialize while separate worktrees can execute concurrently',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dkn-directory-gate-')),gate=new DirectoryGate();
 try{
   const child=join(root,'child'),other=join(root,'other');await mkdir(child);await mkdir(other);const running=new Set(),events=[];
   const work=(name,wait=15)=>async()=>{running.add(name);events.push([...running]);await new Promise(r=>setTimeout(r,wait));running.delete(name);};
   await Promise.all([gate.run(root,work('parent')),gate.run(child,work('child')),gate.run(other,work('other'))]);
   assert.ok(events.every(active=>!(active.includes('parent')&&active.length>1)));
   assert.ok(events.some(active=>active.includes('other')&&active.length>1));
 }finally{gate.close();await rm(root,{recursive:true,force:true});}
});

test('member assistance is proposed, explicitly approved, attributed and bounded against returning loops',async()=>{
 const f=await fixture();try{
   for(const member of [f.member,f.reviewer])await f.action('member.save',{...member,projectId:f.project.id,allowRelay:true});
   f.adapter.send=async(id)=>({reply:JSON.stringify({summary:'需要协助',hub:{handoffs:[{toMemberId:id===f.member.sessionId?f.reviewer.id:f.member.id,message:'请独立核对输出',expectation:'返回检查证据'}]}}),messageSent:true,turnEnded:true,eventId:randomUUID()});
   await f.action('message.send',{projectId:f.project.id,recipientIds:[f.member.id],body:'请按职责处理'});
   await until(()=>f.hub.core.state.assistanceRequests.length===1);
   assert.equal(f.hub.core.state.jobs.length,1);const proposal=f.hub.core.state.assistanceRequests[0];assert.equal(proposal.status,'pending');
   await f.action('assistance.approve',{projectId:f.project.id,requestId:proposal.id});
   await until(()=>f.hub.core.state.jobs.length===2&&f.hub.core.state.jobs.every(j=>j.status==='completed'));
   await f.hub.core.change(()=>{});
   assert.equal(f.hub.core.state.assistanceRequests.length,1);assert.equal(proposal.status,'queued');
   assert.equal(f.hub.core.state.messages.find(m=>m.id===proposal.messageId).replyToId,proposal.sourceMessageId);
 }finally{await f.close();}
});
test('uncertain native delivery blocks the session until a human records reconciliation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dkn-hub-uncertain-'));let sends=0,hub;
 try{
   const adapter={software:'Codex',mode:'new-session',inspect:async()=>({status:'idle',cwd:root,history:[]}),send:async()=>{sends++;if(sends===1)throw Object.assign(new Error('lost observation'),{messageSent:true,submissionUncertain:true});return{reply:'已核对后的新回答',messageSent:true,turnEnded:true,eventId:randomUUID()};}};
   hub=new EmbeddedHub({}, {runtime:null},join(root,'hub'),{adapters:new Map([['Codex',adapter]])});await hub.ready;
   const action=(type,data)=>hub.action({type,data,operationId:randomUUID()});const project=await action('project.save',{name:'合成项目',path:root});const member=await action('member.save',{projectId:project.id,displayName:'成员',software:'Codex',sessionId:'s',allowSend:true});
   await action('message.send',{projectId:project.id,recipientIds:[member.id],body:'第一项'});await until(()=>hub.core.state.jobs[0]?.status==='failed');
   await action('message.send',{projectId:project.id,recipientIds:[member.id],body:'新的请求'});await until(()=>hub.core.state.jobs.length===2&&hub.core.state.jobs[1]?.status==='failed');assert.equal(sends,1);
   await action('job.reconcile',{projectId:project.id,jobId:hub.core.state.jobs[0].id,evidence:'已从原生历史确认上一项完成，保存了实际产物并核对最终回复'});
   await action('message.send',{projectId:project.id,recipientIds:[member.id],body:'核对后继续新工作'});await until(()=>hub.core.state.jobs.at(-1)?.status==='completed');assert.equal(sends,2);
 }finally{await hub?.close();await rm(root,{recursive:true,force:true});}
});
test('backup merge keeps a separate pre-import copy and imports no active work automatically',async()=>{
 const f=await fixture();try{
   const backup=await f.hub.exportBackup();backup.snapshot.projects.push({id:'restored',name:'恢复项目',path:f.root,stack:[],updatedAt:new Date().toISOString()});
   const result=await f.action('backup.import',{snapshot:backup,confirm:true});assert.ok(result.backup.startsWith('before-import-'));
   assert.ok(f.hub.core.state.projects.some(p=>p.id==='restored'));assert.ok(f.hub.core.state.projects.some(p=>p.id===f.project.id));
   const before=JSON.parse(await readFile(join(f.root,'hub','state','backups',result.backup),'utf8'));assert.equal(before.snapshot.projects.length,1);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});

test('Hub file browsing excludes case-insensitive native authentication and private runtime directories',async()=>{
 const f=await fixture();try{
   await writeFile(join(f.root,'AUTH.JSON'),'synthetic secret');await mkdir(join(f.root,'.CLAUDE'));await writeFile(join(f.root,'.CLAUDE','private.txt'),'synthetic private');await writeFile(join(f.root,'deliverable.txt'),'public result');
   const tree=await f.hub.files(f.project.id);assert.ok(tree.files.some(v=>v.path==='deliverable.txt'));assert.ok(!tree.files.some(v=>/AUTH|CLAUDE/.test(v.path)));
   await assert.rejects(f.hub.preview(f.project.id,'AUTH.JSON'),/可浏览/);await assert.rejects(f.hub.preview(f.project.id,'.CLAUDE/private.txt'),/可浏览/);assert.equal((await f.hub.preview(f.project.id,'deliverable.txt')).content,'public result');
 }finally{await f.close();}
});

test('revoking send permission while a directory lease is queued prevents native delivery',async()=>{
 const f=await fixture(),gate=new DirectoryGate();let release,queued=false;
 const blocker=gate.run(f.root,()=>new Promise(resolve=>{release=resolve;}));await until(()=>release);
 try{
   f.adapter.send=async(_id,_body,_correlation,options)=>{queued=true;return gate.run(f.root,()=>{options.beforeSend();f.calls.push({native:true});return{reply:'must not send',messageSent:true,turnEnded:true};});};
   await f.action('message.send',{projectId:f.project.id,recipientIds:[f.member.id],body:'排队期间撤销'});await until(()=>queued);
   await f.hub.core.change(()=>{f.member.allowSend=false;});release();await blocker;await until(()=>f.hub.core.state.jobs[0]?.status==='failed');assert.equal(f.calls.length,0);
 }finally{release?.();gate.close();await f.close();}
});
