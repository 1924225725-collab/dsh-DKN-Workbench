import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {CodexRuntime,locateCodex} from '../lib/codex-runtime.js';
import {CodexService} from '../lib/codex-service.js';
const root=await mkdtemp(resolve('research/native-'));
for(const d of ['home','profile','temp','project'])await mkdir(join(root,d),{recursive:true});
let modelRequests=0;const trap=createServer((req,res)=>{modelRequests++;res.writeHead(503);res.end('No model calls in integration tests');});await new Promise(r=>trap.listen(0,'127.0.0.1',r));const port=trap.address().port;
const env={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:join(process.env.SystemRoot,'System32')+';'+dirname(process.execPath),CODEX_HOME:join(root,'home'),HOME:join(root,'profile'),USERPROFILE:join(root,'profile'),APPDATA:join(root,'profile','AppData'),LOCALAPPDATA:join(root,'profile','LocalAppData'),TEMP:join(root,'temp'),TMP:join(root,'temp'),HTTP_PROXY:'http://127.0.0.1:1',HTTPS_PROXY:'http://127.0.0.1:1',ALL_PROXY:'http://127.0.0.1:1',NO_PROXY:'127.0.0.1,localhost',OTEL_SDK_DISABLED:'true'};
await writeFile(join(root,'home','config.toml'),`model_provider = "probe_local"\nmodel = "probe-never-called"\n[model_providers.probe_local]\nname = "Isolated test"\nbase_url = "http://127.0.0.1:${port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n[analytics]\nenabled = false\n[features]\nsqlite = true\napps = false\n`);
// A synthetic, completed legacy transcript, never a user log and never sent to a model.
const threadId=randomUUID(),date=new Date().toISOString(),userText='Synthetic user request',answer='Synthetic completed answer';
const directory=join(root,'home','sessions',...date.slice(0,10).split('-'));await mkdir(directory,{recursive:true});
const entries=[{type:'session_meta',payload:{id:threadId,timestamp:date,cwd:join(root,'project'),originator:'dkn_agent_fixture',cli_version:'0.166.0-alpha.5.1',source:'vscode',model_provider:'probe_local',base_instructions:{text:'Synthetic fixture only'}}},{type:'event_msg',payload:{type:'task_started',turn_id:'fixture-turn',model_context_window:128000,collaboration_mode_kind:'default'}},{type:'event_msg',payload:{type:'user_message',message:userText,images:[],local_images:[],text_elements:[]}},{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:userText}]}},{type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:answer}],phase:'final_answer'}},{type:'event_msg',payload:{type:'agent_message',message:answer,phase:'final_answer'}},{type:'event_msg',payload:{type:'task_complete',turn_id:'fixture-turn',last_agent_message:answer}}].map(x=>({timestamp:date,...x}));
await writeFile(join(directory,`rollout-${date.slice(0,19).replaceAll(':','-')}-${threadId}.jsonl`),entries.map(x=>JSON.stringify(x)).join('\n')+'\n');
const runtimeOptions={codexPath:await locateCodex(),codexHome:join(root,'home'),env,cwd:join(root,'project')};
const runtimes=[],services=[],checks=[];const check=async(name,fn)=>{try{const detail=await fn();checks.push({name,pass:true,detail});console.log('PASS '+name+' '+JSON.stringify(detail??{}));}catch(e){checks.push({name,pass:false,error:e.message});console.error('FAIL '+name+' '+e.message);}};
try{
 const service=new CodexService({...runtimeOptions,dataDirectory:join(root,'plugin-state')});services.push(service);await service.connect();
 const other=new CodexRuntime(runtimeOptions);runtimes.push(other);await other.connect();
 await check('synthetic-history-enumeration',async()=>{const c=await service.catalog();assert.ok(c.threads.some(t=>t.id===threadId));return{found:true};});
 await check('synthetic-history-rendering',async()=>{const history=await service.history({threadId});assert.ok(history.items.some(x=>x.type==='user'&&x.text===userText));assert.ok(history.items.some(x=>x.type==='assistant'&&x.text===answer));return{items:history.items.length};});
 let project;
 await check('project-create-and-cross-process-read',async()=>{project=(await service.operate({operationId:randomUUID(),action:'project.create',name:'Synthetic Project',roots:[join(root,'project')]})).project;const read=await other.call('project/read',{projectId:project.id});assert.equal(read.project.name,'Synthetic Project');});
 await check('legacy-directory-membership-without-assignment',async()=>{const catalog=await service.catalog({projectId:project.id});const legacy=catalog.threads.find(t=>t.id===threadId);assert.ok(legacy);assert.equal(legacy.displayMembership,'directory');assert.equal((await service.history({threadId})).thread.projectId,null);});
 await check('project-membership-and-filter',async()=>{await service.history({threadId});await service.operate({operationId:randomUUID(),action:'thread.project',threadId,projectId:project.id});const c=await service.catalog({projectId:project.id});assert.ok(c.threads.some(t=>t.id===threadId));return{found:true};});
 await check('cross-process-poll-reconciliation',async()=>{await other.call('project/update',{projectId:project.id,name:'Other client renamed'});const c=await service.catalog();assert.equal(c.projects.find(x=>x.id===project.id).name,'Other client renamed');});
 await check('native-section-move-and-readback',async()=>{const section=(await service.operate({operationId:randomUUID(),action:'section.create',name:'Synthetic Section'})).section;await service.operate({operationId:randomUUID(),action:'thread.section',threadId,sectionId:section.id});const history=await service.history({threadId});assert.equal(history.thread.section.id,section.id);});
 await check('archive-and-restore-synthetic-thread',async()=>{await service.operate({operationId:randomUUID(),action:'thread.archive',threadId,confirm:true});assert.ok((await service.catalog({archived:true})).threads.some(t=>t.id===threadId));await service.operate({operationId:randomUUID(),action:'thread.unarchive',threadId,confirm:true});assert.ok((await service.catalog()).threads.some(t=>t.id===threadId));});
 await check('no-model-requests',async()=>{assert.equal(modelRequests,0);return{modelRequests};});
}finally{for(const s of services)await s.close();for(const r of runtimes)await r.close();await new Promise(r=>trap.close(r));await writeFile(join(root,'results.json'),JSON.stringify({checks,modelRequests,pids:[...services.map(s=>s.runtime?.child?.pid),...runtimes.map(r=>r.child?.pid)],root},null,2));}
console.log('Evidence: '+join(root,'results.json'));if(checks.some(x=>!x.pass))process.exitCode=1;
