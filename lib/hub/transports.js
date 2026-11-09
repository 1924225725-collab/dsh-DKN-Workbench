import {randomUUID} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {listSessionRows,openFollow,waitForAssistant,historyEvents,replyText} from './dsh-session-core.js';

const progress=(options,value)=>{try{options?.onProgress?.(value);}catch{}};

export class DirectoryGate {
  constructor(){this.active=new Set();this.queue=[];this.closed=false;}
  close(){this.closed=true;for(const job of this.queue)job.reject(new Error('插件已关闭，未发送'));this.queue=[];}
  async run(cwd,work){
    if(this.closed)throw new Error('插件已关闭');if(typeof cwd!=='string'||!cwd)throw new Error('成员会话没有工作目录，请为该项目创建带目录的独立会话');
    const canonical=realpathSync(resolve(cwd));
    if(this.closed)throw new Error('插件已关闭');const normalized=canonical.endsWith(sep)?canonical.slice(0,-1):canonical;const key=process.platform==='win32'?normalized.toLowerCase():normalized;
    return new Promise((resolve,reject)=>{this.queue.push({key,work,resolve,reject});this.pump();});
  }
  overlaps(a,b){return a===b||a.startsWith(b+sep)||b.startsWith(a+sep);}
  pump(){
    if(this.closed)return;
    for(let i=0;i<this.queue.length&&this.active.size<4;){
      const job=this.queue[i];
      if([...this.active].some(key=>this.overlaps(key,job.key))||this.queue.slice(0,i).some(earlier=>this.overlaps(earlier.key,job.key))){i++;continue;}
      this.queue.splice(i,1);this.active.add(job.key);
      Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(()=>{this.active.delete(job.key);this.pump();});
    }
  }
}

export async function sendCodex(codex,sessionId,content,correlationId,options={}){
  await codex.connect();
  const runtime=codex.requireRuntime(),started=Date.now(),messages=new Map(),buffer=[];
  let turnId,userEventId,tokenUsage,accepted=false,finished=false,resolveTurn,rejectTurn;
  const result=new Promise((resolve,reject)=>{resolveTurn=resolve;rejectTurn=reject;});result.catch(()=>{});
  const fail=(error)=>{if(finished)return;finished=true;rejectTurn(Object.assign(error,{messageSent:accepted,submissionUncertain:accepted}));};
  const notification=m=>{
    const p=m.params||{};if(p.threadId!==sessionId)return;
    if(!turnId){buffer.push(m);return;}
    if(p.turnId!==undefined&&p.turnId!==turnId||p.turn?.id!==undefined&&p.turn.id!==turnId)return;
    if(m.method==='thread/tokenUsage/updated')tokenUsage=p.tokenUsage?.total||p.tokenUsage;
    if(m.method==='item/agentMessage/delta'){messages.set(p.itemId,(messages.get(p.itemId)||'')+p.delta);progress(options,{phase:'streaming',text:messages.get(p.itemId),itemId:p.itemId,elapsedMs:Date.now()-started});}
    if(['item/started','item/completed'].includes(m.method)&&p.item?.type==='userMessage')userEventId=p.item.id;
    if(m.method==='item/completed'&&p.item?.type==='agentMessage')messages.set(p.item.id,p.item.text||'');
    if(m.method==='turn/completed'){
      if(finished)return;finished=true;
      if(p.turn.status!=='completed')rejectTurn(Object.assign(new Error('Codex 回合'+p.turn.status),{messageSent:true,turnEnded:true}));
      else{const final=[...messages.entries()].filter(([,text])=>text).at(-1);resolveTurn({reply:final?.[1]||'',messageSent:true,turnEnded:true,eventId:final?.[0]||turnId,userEventId,tokenUsage});}
    }
  };
  const approval=key=>{const item=runtime.interactions.get(String(key));if(item?.params?.threadId!==sessionId||!/requestApproval$/.test(item.method))return;
    Promise.resolve(options.onApprovalRequest?.(item.method,item.params)??(item.method==='item/permissions/requestApproval'?{permissions:{},scope:'turn'}:{decision:'decline'})).then(answer=>{if(runtime.interactions.has(String(key)))runtime.answer(key,answer);}).catch(fail);
  };
  const aborted=()=>fail(new Error('插件已停止观察，原生运行结果需要核对'));
  options.signal?.addEventListener('abort',aborted,{once:true});
  const disconnected=reason=>fail(new Error(reason||'Codex 已断开，结果待核对'));
  runtime.on('notification',notification);runtime.on('interaction',approval);runtime.on('disconnected',disconnected);
  const timer=setTimeout(()=>fail(new Error('等待 Codex 回合结束超时；不会自动重发')),options.timeoutMs||1800000);
  try{
    if(options.signal?.aborted)throw new Error('发送已取消');
    options.onProgress?.({phase:'sending',elapsedMs:0});
    await codex.history({threadId:sessionId});options.beforeSend?.();
    const receipt=await codex.operate({action:'thread.send',operationId:correlationId,threadId:sessionId,content,model:options.model,effort:options.effort,sandbox:options.codexSandboxMode||'read-only',beforeSend:options.beforeSend});
    accepted=true;turnId=receipt.turnId;for(const m of buffer)notification(m);buffer.length=0;
    return await result;
  }catch(error){if(accepted&&!error.turnEnded)error.submissionUncertain=true;throw Object.assign(error,{messageSent:accepted||error.submissionUncertain===true});}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',aborted);runtime.off('notification',notification);runtime.off('interaction',approval);runtime.off('disconnected',disconnected);}
}

export function createHubTransports(ctx,codex){
  const gate=new DirectoryGate(),registry=new Map(),aborts=new Set();
  registry.directoryGate=gate;
  registry.close=()=>{gate.close();for(const controller of aborts)controller.abort();};
  const codexAdapter={software:'Codex',mode:'new-session',
    async health(){return{available:!!codex.runtime?.connected,mode:'native-app-server',evidence:'原生 app-server；不控制桌面对话窗口'};},
    async list(cursor,query,archived){await codex.connect();const result=await codex.catalog({cursor,search:query,archived});return{sessions:result.threads.map(t=>({sessionId:t.id,title:t.name||t.preview||'未命名对话',cwd:t.cwd})),nextCursor:result.nextCursor};},
    async models(){await codex.connect();const result=await codex.requireRuntime().call('model/list',{});return(result.data||[]).map(m=>({id:m.id||m.model,label:m.displayName||m.model||m.id,efforts:(m.supportedReasoningEfforts||[]).map(e=>e.reasoningEffort)}));},
    async create(input){await codex.connect();const sandbox=input.codexSandboxMode||'read-only';if(!['read-only','workspace-write'].includes(sandbox))throw new Error('不支持此沙箱权限');const result=await codex.requireRuntime().call('thread/start',{cwd:input.cwd,sandbox,approvalPolicy:'on-request',...(input.model?{model:input.model}:{}),...(input.effort?{config:{model_reasoning_effort:input.effort}}:{})},{mutation:true});if(!result.thread?.id)throw new Error('Codex 未返回线程编号');try{await codex.requireRuntime().call('thread/name/set',{threadId:result.thread.id,name:input.title},{mutation:true});}catch(error){throw Object.assign(error,{submissionUncertain:true,createdSessionId:result.thread.id});}return{sessionId:result.thread.id,mode:'new-session'};},
    async inspect(sessionId,cursor){await codex.connect();const h=await codex.history({threadId:sessionId,cursor});return{status:h.thread.status?.type==='active'?'running':h.thread.status?.type==='idle'?'idle':'unknown',cwd:h.thread.cwd,history:h.items.filter(i=>['user','assistant'].includes(i.type)).map(i=>({eventId:i.id,role:i.type==='assistant'?'assistant':'user',text:i.text||'',requestId:codex.operations.find(op=>op.action==='thread.send'&&op.threadId===sessionId&&op.result?.turnId===i.turnId)?.id})),nextCursor:h.nextCursor};},
    async send(sessionId,content,correlationId,options){await codex.connect();const {thread}=await codex.requireRuntime().call('thread/read',{threadId:sessionId,includeTurns:false});return gate.run(thread.cwd,async()=>{options?.beforeSend?.();const abort=new AbortController();aborts.add(abort);try{return await sendCodex(codex,sessionId,content,correlationId,{...options,signal:abort.signal});}finally{aborts.delete(abort);}});},
    async interrupt(sessionId){await codex.operate({action:'thread.interrupt',threadId:sessionId,operationId:'hub-stop-'+randomUUID()});},
  };
  registry.set('Codex',codexAdapter);
  const controller=ctx.sessionController;
  if(controller){
    const current=async id=>{const result=await controller.list({},AbortSignal.timeout(30000));const row=(Array.isArray(result)?result:result.items).find(r=>r.sessionId===id);if(!row)throw new Error('DSH 会话不存在');return row;};
    const select=async(id,model,effort)=>{if(!model)return;const value=JSON.parse(model);if(!Array.isArray(value)||value.length!==2)throw new Error('DSH 模型格式无效');await controller.selectModel({sessionId:id,provider:value[0],model:value[1],...(effort?{reasoningEffort:effort}:{})});};
    registry.set('DSH Desktop',{software:'DSH Desktop',mode:'plugin-bridge',
      async health(){return{available:true,hubApiVersion:4,liveReload:true,mode:'in-process'};},
      async list(_cursor,query){const result=await controller.list({},AbortSignal.timeout(30000));const summaries=Array.isArray(result)?result:result.items;const titles=await listSessionRows(controller,AbortSignal.timeout(30000));return{sessions:titles.filter(t=>!query||t.title.includes(query)).map(t=>({...t,cwd:summaries.find(r=>r.sessionId===t.sessionId)?.cwd}))};},
      async models(){const c=await controller.modelCatalog();return(c.groups||[]).flatMap(g=>(g.models||[]).map(m=>({id:JSON.stringify([g.id,m.id]),label:g.name+' / '+m.name,efforts:(m.reasoning?.efforts||[]).map(e=>e.id)})));},
      async create(input){const value=await controller.create({cwd:input.cwd});try{await controller.rename?.({sessionId:value.sessionId,title:input.title});await select(value.sessionId,input.model,input.effort);}catch(error){throw Object.assign(error,{submissionUncertain:true,createdSessionId:value.sessionId});}return{sessionId:value.sessionId,mode:'plugin-bridge'};},
      async inspect(sessionId,cursor){const row=await current(sessionId),signal=AbortSignal.timeout(30000);const page=await controller.page({address:{kind:'session',sessionId},...(cursor?{beforeSeq:Number(cursor)}:{}),maxMessages:100},signal);const events=historyEvents(page.records),requests=new Map(),ignoredEventIds=[];let turn;
        const history=events.flatMap(e=>{if(e.type==='turn/start')turn=e.data?.turn;if(!['user/message','assistant/message'].includes(e.type))return[];const source=e.data?.source;if(['runtime-context','time-context','skill-catalog','model-selection'].includes(source?.kind)){ignoredEventIds.push(String(e.seq));return[];}if(e.type==='user/message'&&source?.rpcId)requests.set(turn,source.rpcId);const text=replyText(e.data);return text?[{eventId:String(e.seq),role:e.type==='assistant/message'?'assistant':'user',text,requestId:source?.rpcId||requests.get(e.data?.turn??turn),createdAt:new Date(e.time).toISOString()}]:[];});
        return{cwd:row.cwd,status:row.running?'running':'idle',history,ignoredEventIds,nextCursor:page.hasMore&&events.length?String(Math.min(...events.map(e=>e.seq))):null};},
      async send(sessionId,content,correlationId,options={}){let row=await current(sessionId);return gate.run(row.cwd,async()=>{options.beforeSend?.();row=await current(sessionId);const deadline=Date.now()+(options.waitForIdleMs||0);while(row.running&&Date.now()<deadline){await sleep(250);row=await current(sessionId);}if(row.running)throw new Error('DSH 会话正在执行，请等待当前回合结束');await select(sessionId,options.model,options.effort);const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),1800000);let opening,accepted=false,submitted=false;aborts.add(abort);
        try{opening=await openFollow(controller,sessionId,abort.signal);const answer=waitForAssistant(opening.iterator,opening.afterSeq,abort.signal,correlationId);answer.catch(()=>{});options.onProgress?.({phase:'sending',elapsedMs:0});options.beforeSend?.();submitted=true;const receipt=await controller.prompt({sessionId,requestId:correlationId,mode:'queue',content:[{type:'text',text:content}]},abort.signal);if(receipt?.accepted!==true)throw new Error('DSH 未确认接收');accepted=true;const result=await answer;return{reply:result.answer,eventId:String(result.sequence),messageSent:true,turnEnded:true};}
        catch(e){throw Object.assign(e,{messageSent:accepted,submissionUncertain:submitted});}finally{clearTimeout(timer);aborts.delete(abort);abort.abort();await opening?.iterator.return?.();}});},
      async interrupt(sessionId){const result=await controller.cancel({sessionId});if(result.accepted!==true)throw new Error('DSH 未确认中断');},
    });
  }
  return registry;
}
