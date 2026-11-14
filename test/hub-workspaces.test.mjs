import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {EmbeddedHub} from '../lib/hub/service.js';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'dkn-workspaces-'));let workspaces=[{id:'workspace-a',title:'DSH 项目',path:root,sessionIds:['a','b']}],rows=[{sessionId:'a',title:'相同标题',cwd:root},{sessionId:'b',title:'相同标题',cwd:root}],failure=false,reply='合成 DSH 回复';
 const frames=[];let wake;const push=event=>{frames.push(event);wake?.();wake=null;};const prompts=[];
 const controller={list:async()=>{if(failure)throw Error('原生读取失败');return{items:rows};},async *follow(_request,signal){yield{type:'snapshot',cursor:0,records:[],header:{cwd:root}};while(!signal.aborted){if(!frames.length)await new Promise(resolve=>{wake=resolve;signal.addEventListener('abort',resolve,{once:true});});if(frames.length)yield frames.shift();}},prompt:async request=>{prompts.push(request);for(const [seq,type,data] of [[1,'turn/start',{turn:1}],[2,'user/message',{turn:1,source:{kind:'rpc',rpcId:request.requestId},content:request.content}],[3,'assistant/message',{turn:1,content:[{type:'text',text:reply}]}],[4,'turn/end',{turn:1,reason:{kind:'completed'}}]])push({type:'event',event:{seq,type,data}});return{accepted:true};}};
 const hub=new EmbeddedHub({workspaceRegistry:{list:()=>workspaces},sessionController:controller},{runtime:null},join(root,'hub'));
 const action=(type,data)=>hub.action({operationId:randomUUID(),type,data});
 return{root,hub,prompts,action,set reply(value){reply=value;},get workspaces(){return workspaces;},set workspaces(v){workspaces=v;},get rows(){return rows;},set failure(v){failure=v;},async close(){await hub.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}

test('Hub mirrors DSH workspace identities and conversations, preserving permissions across rename and move',async()=>{
 const f=await fixture();try{
  let state=await f.hub.snapshot();assert.equal(state.nativeWorkspace,true);assert.deepEqual(state.runtimes,['DSH Desktop']);assert.equal(state.projects.length,1);assert.equal(state.members.filter(m=>m.software==='DSH Desktop').length,2);assert.equal(f.prompts.length,0);
  const project=state.projects[0],member=state.members.find(m=>m.sessionId==='a');assert.notEqual(member.displayName,state.members.find(m=>m.sessionId==='b').displayName);assert.equal(member.allowSend,false);
  await f.action('member.save',{id:member.id,projectId:project.id,software:'Claude',sessionId:'forged',selectedModel:'forged',role:'审查者',allowSend:true});assert.equal(member.software,'DSH Desktop');assert.equal(member.sessionId,'a');assert.equal(member.selectedModel,undefined);
  await f.hub.snapshot();const revision=f.hub.core.state.revision;await f.hub.snapshot();assert.equal(f.hub.core.state.revision,revision,'unchanged refresh does not write');
  f.workspaces[0].title='改名项目';f.rows[0].title='改名对话';state=await f.hub.snapshot();assert.equal(state.projects[0].id,project.id);assert.equal(member.displayName,'改名对话');assert.equal(member.allowSend,true);assert.equal(member.role,'审查者');
  f.workspaces.push({id:'workspace-b',title:'另一个项目',path:f.root,sessionIds:['a']});f.workspaces[0].sessionIds=['b'];state=await f.hub.snapshot();assert.deepEqual(member.projectIds,[state.projects.find(p=>p.dshWorkspaceId==='workspace-b').id]);assert.equal(member.id,state.members.find(m=>m.sessionId==='a').id);
  f.workspaces=[];state=await f.hub.snapshot();assert.equal(state.projects.length,0);assert.equal(state.members.filter(m=>m.software!=='Hub').length,0);assert.equal(member.allowSend,false);assert.deepEqual(member.projectIds,[]);
 }finally{await f.close();}
});

test('Hub uses DSH session transport and refuses standalone project/member creation and moved sessions',async()=>{
 const f=await fixture();try{
  const state=await f.hub.snapshot(),project=state.projects[0],member=state.members.find(m=>m.sessionId==='a');
  await assert.rejects(f.action('project.save',{name:'不能新建',path:f.root}),/DSH/);await assert.rejects(f.action('member.create',{projectId:project.id,displayName:'不能新建'}),/DSH/);await assert.rejects(f.action('member.remove',{projectId:project.id,memberId:member.id}),/DSH/);
  await f.action('member.save',{id:member.id,projectId:project.id,allowSend:true});
  const result=await f.hub.transports.get('DSH Desktop').send(member.sessionId,'只回复合成内容','synthetic-id',{beforeSend(){}});assert.equal(result.reply,'合成 DSH 回复');assert.equal(f.prompts.length,1);assert.equal(f.prompts[0].sessionId,'a');
  f.workspaces[0].sessionIds=['b'];await assert.rejects(f.hub.transports.get('DSH Desktop').send('a','不应发送','second-id'),/移出/);assert.equal(f.prompts.length,1);
 }finally{await f.close();}
});

test('DSH read failures are explicit and retain saved collaboration data',async()=>{
 const f=await fixture();try{
  const state=await f.hub.snapshot(),id=state.projects[0].id;f.failure=true;await assert.rejects(f.hub.snapshot(),/原生读取失败/);assert.equal(f.hub.core.state.projects[0].id,id);
 }finally{f.failure=false;await f.close();}
});


test('DSH collaboration scopes issues and template management without permitting workspace mutation',async()=>{
 const f=await fixture();try{
  const state=await f.hub.snapshot(),project=state.projects[0];const issue=await f.action('issue.save',{projectId:project.id,title:'项目问题',detail:'记录证据',status:'open',blocking:true});assert.equal(issue.projectId,project.id);
  await assert.rejects(f.action('issue.save',{projectId:'other',id:issue.id,title:'不能越界'}),/项目/);
  await assert.rejects(f.action('library.manage',{kind:'project',id:project.id,operation:'delete'}),/DSH/);
  await assert.rejects(f.action('workflow.generate',{projectId:project.id,memberId:state.members.find(m=>m.sessionId==='a').id,requirement:'生成计划'}),/发送权限/);assert.equal(f.prompts.length,0);
 }finally{await f.close();}
});


test('existing DSH conversation can design and save a validated workflow template',async()=>{
 const f=await fixture();try{
  const state=await f.hub.snapshot(),project=state.projects[0],member=state.members.find(m=>m.sessionId==='a');await f.action('member.save',{id:member.id,projectId:project.id,allowSend:true});
  f.reply=JSON.stringify({name:'生成的合成流程',entry:'work',roles:[{id:'author',name:'实施者',instructions:'只处理本项目'}],nodes:[{id:'work',title:'实施',type:'agent',roleId:'author',instructions:'按要求实施',maxVisits:1},{id:'end',title:'结束',type:'end',instructions:'',maxVisits:1}],edges:[{from:'work',to:'end',outcome:'success'}]});
  await f.action('workflow.generate',{projectId:project.id,memberId:member.id,requirement:'为当前项目设计流程'});
  for(let i=0;i<500&&!f.hub.core.state.messages.some(m=>m.senderId===member.id&&m.body.includes('nodes'));i++)await new Promise(resolve=>setTimeout(resolve,5));
  const response=f.hub.core.state.messages.find(m=>m.senderId===member.id&&m.body.includes('nodes'));assert.ok(response);const saved=await f.action('workflow.fromMessage',{projectId:project.id,messageId:response.id});assert.equal(saved.name,'生成的合成流程');assert.equal(f.prompts.length,1);assert.equal(f.hub.core.state.workflowRuns.length,0,'generation does not execute workflow');
 }finally{await f.close();}
});

test('native collaboration supports scoped avatars, file downloads and prompt analysis without creating another runtime',async()=>{
 const f=await fixture();try{
  const state=await f.hub.snapshot(),project=state.projects[0],member=state.members.find(row=>row.sessionId==='a');
  await f.action('member.save',{id:member.id,projectId:project.id,allowSend:true});
  const avatar='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
  await f.action('avatar.set',{projectId:project.id,memberId:member.id,avatar});assert.equal(member.avatar,avatar);
  await assert.rejects(f.action('avatar.set',{projectId:project.id,memberId:'other-project-member',avatar}),/不属于/);
  await writeFile(join(f.root,'deliverable.txt'),'synthetic deliverable');
  const artifact=await f.action('artifact.save',{projectId:project.id,name:'file',location:'deliverable.txt',kind:'document'});
  assert.equal((await f.hub.artifact(project.id,artifact.id)).name,'deliverable.txt');
  await assert.rejects(f.hub.artifact('wrong-project',artifact.id),/不存在|不属于/);
  await f.action('prompt.optimize',{projectId:project.id,memberId:member.id,body:'合成草稿，仅用于分析'});
  for(let i=0;i<200&&!f.prompts.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.prompts.length,1);assert.match(JSON.stringify(f.prompts[0].content),/optimizedPrompt/);assert.match(JSON.stringify(f.prompts[0].content),/合成草稿/);
  assert.equal(f.hub.core.state.workflowRuns.length,0);assert.equal(f.hub.core.state.members.filter(row=>row.software!=='Hub').length,2);
 }finally{await f.close();}
});
