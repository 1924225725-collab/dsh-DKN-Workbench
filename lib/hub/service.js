import {parseWorkflow,workflowFormat} from './vendor/server/workflows.js';
import {promptAssistantInstructions} from './vendor/src/prompt-assistant.js';
import {syncDshWorkspaces} from './workspaces.js';
import {createHash,randomUUID} from 'node:crypto';
import {realpath,stat,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {HubService} from './core.js';
import {createHubTransports} from './transports.js';

const ALLOWED=new Set(['avatar.set','library.manage','issue.save','project.save','member.save','member.remove','member.sync','message.send','message.linkTask','task.save','task.transition','task.execute','job.stop','job.interrupt','discussion.start','discussion.stop','relay.approve','relay.reject','artifact.save','artifact.check','artifact.linkMessage','codex.approval.respond','workflow.template.save','workflow.start','workflow.pause','workflow.stop','workflow.resume','workflow.confirm','workflow.resolve','workflow.intervene','workflow.review.revalidate']);
const check=(value,message)=>{if(!value)throw new Error(message);};
export class EmbeddedHub {
  constructor(ctx,codex,directory,{adapters}={}){
    this.ctx=ctx;this.nativeWorkspace=!adapters||!!ctx.workspaceRegistry;this.codex=codex;this.closed=false;this.inflight=new Map();this.transports=adapters||createHubTransports(ctx,codex);
    if(!adapters)this.transports.delete('Codex');
    this.core=new HubService(directory,join(directory,'state'),{embedded:true,adapters:this.transports,protectedDirectory:directory});
    for(const [software,adapter] of this.transports){const send=adapter.send.bind(adapter);adapter.send=async(sessionId,...args)=>{const unresolved=this.core.state.jobs.some(j=>j.submissionUncertain&&!j.uncertaintyResolved&&this.core.state.members.some(m=>m.id===j.memberId&&m.software===software&&m.sessionId===sessionId));check(!unresolved,'此成员有结果不确定的原生执行，请先同步历史并记录核对结果');if(this.nativeWorkspace){const options=args[2]||{},before=options.beforeSend;const member=this.core.state.members.find(m=>m.software===software&&m.sessionId===sessionId);const project=this.core.state.projects.find(p=>member?.projectIds.includes(p.id));args[2]={...options,beforeSend:()=>{const workspace=this.ctx.workspaceRegistry.list().find(w=>w.id===project?.dshWorkspaceId);check(workspace?.sessionIds.includes(sessionId),'对话已移出 DSH 项目，未发送');before?.();}};}return send(sessionId,...args);};}
    this.ready=this.core.ready.then(()=>this.core.change(()=>{
      this.core.state.pluginReceipts??=[];
      this.core.state.assistanceRequests??=[];
      for(const request of this.core.state.assistanceRequests)if(request.status==='sending')request.status='unknown';
      for(const receipt of this.core.state.pluginReceipts)if(receipt.status==='pending')receipt.status='unknown';
    }));
  }
  async snapshot(){await this.ready;if(this.nativeWorkspace)await syncDshWorkspaces(this);return{...this.core.state,...(this.nativeWorkspace?{nativeWorkspace:true,projects:[...this.workspaceProjectIds].map(id=>this.core.state.projects.find(p=>p.id===id)),members:this.core.state.members.filter(m=>m.software==='Hub'||this.workspaceMemberIds.has(m.id))}:{}),runtimes:[...this.transports.keys()],approvals:this.core.codexApprovals(),live:this.core.liveTurns(),runtimeInteractions:[...(this.codex.runtime?.interactions.values()||[])],receipts:this.core.state.pluginReceipts.filter(r=>['pending','unknown'].includes(r.status)).map(({id,type,status,createdAt,createdSessionId})=>({id,type,status,createdAt,createdSessionId}))};}
  async sessions(software,cursor,query){await this.ready;check(this.transports.has(software),'此运行时未配置');return this.core.listSessions(software,cursor,query);}
  async models(software){await this.ready;return this.core.models(software);}
  async receipt(id){await this.ready;const row=this.core.state.pluginReceipts.find(r=>r.id===id);return row?{id:row.id,status:row.status,result:row.result,createdSessionId:row.createdSessionId}:{id,status:'absent'};}
  async exportBackup(){await this.ready;return{schemaVersion:1,snapshot:structuredClone(this.core.state)};}
  async action(input){
    await this.ready;check(!this.closed,'插件正在关闭');
    check(typeof input.operationId==='string'&&/^[\w-]{1,128}$/.test(input.operationId),'操作编号无效');
    const hash=createHash('sha256').update(JSON.stringify({type:input.type,data:input.data||{}})).digest('hex');
    const pending=this.inflight.get(input.operationId);if(pending){check(pending.hash===hash,'操作编号已用于其他内容');return pending.work;}
    const prior=this.core.state.pluginReceipts.find(r=>r.id===input.operationId);
    if(prior){check(prior.hash===hash,'操作编号已用于其他内容');if(prior.status==='done')return prior.result;throw Object.assign(new Error('此操作结果需要核对，不会自动重发'),{submissionUncertain:true});}
    check(!this.core.state.pluginReceipts.some(r=>r.status==='unknown'&&r.hash===hash),'存在相同内容且结果未确认的操作，请先核对记录');
    const work=this.execute(input,hash);this.inflight.set(input.operationId,{hash,work});try{return await work;}finally{this.inflight.delete(input.operationId);}
  }
  async execute(input,hash){
    const receipt={id:input.operationId,hash,type:input.type,status:'pending',createdAt:Date.now()};
    await this.core.change(()=>{this.core.state.pluginReceipts.push(receipt);if(this.core.state.pluginReceipts.length>2000)this.core.state.pluginReceipts=this.core.state.pluginReceipts.filter(r=>['pending','unknown'].includes(r.status)||this.core.state.pluginReceipts.indexOf(r)>=this.core.state.pluginReceipts.length-1500);});
    try{
      const result=await this.dispatch(input.type,input.data||{});
      await this.core.change(()=>{let current=this.core.state.pluginReceipts.find(r=>r.id===receipt.id);if(!current){current={...receipt};this.core.state.pluginReceipts.push(current);}current.status='done';current.result=result??{ok:true};});
      return result;
    }catch(error){await this.core.change(()=>{let current=this.core.state.pluginReceipts.find(r=>r.id===receipt.id);if(!current){current={...receipt};this.core.state.pluginReceipts.push(current);}current.status=error.submissionUncertain||error.messageSent?'unknown':'failed';if(error.createdSessionId)current.createdSessionId=error.createdSessionId;});throw error;}
  }
  async dispatch(type,data){
    if(this.nativeWorkspace){
      await syncDshWorkspaces(this);
      if(type==='library.manage')check(['workflow','workflow-run'].includes(data.kind)&&['pin','move-up','move-down','rename','delete'].includes(data.operation),'这里只能整理工作流模板与运行记录；项目请在 DSH 中管理');
      if(['member.create','member.remove'].includes(type))throw new Error('请在 DSH 项目中管理对话，Hub 会自动同步为成员');
      if(type==='project.ensure'){
        const project=this.core.state.projects.find(p=>this.workspaceProjectIds.has(p.id)&&(data.workspaceId?p.dshWorkspaceId===data.workspaceId:(process.platform==='win32'?p.path?.toLowerCase()===data.path?.toLowerCase():p.path===data.path)));
        check(project,'未找到对应的 DSH 工作区，请先在 DSH 工作区添加项目');return project;
      }
      if(type==='project.save'){
        const project=this.core.state.projects.find(p=>p.id===data.id&&this.workspaceProjectIds.has(p.id));check(project,'请在 DSH 工作区管理项目');
        data={...project,...Object.fromEntries(['description','goal','progress','risks','milestones','stack'].filter(k=>k in data).map(k=>[k,data[k]])),stack:data.stack??project.stack.join('，')};
      }
      if(type==='issue.save'){check(this.core.state.projects.some(p=>p.id===data.projectId),'项目不存在');const old=this.core.state.issues.find(i=>i.id===data.id);check(!old||old.projectId===data.projectId,'问题不属于此项目');const result=await this.core.action({type,data});await this.core.change(()=>{result.projectId=data.projectId;});return result;}
    if(type==='member.save'){
        const member=this.core.state.members.find(m=>m.id===data.id&&this.workspaceMemberIds.has(m.id)&&m.projectIds.includes(data.projectId));check(member,'此对话已移出项目，请刷新成员列表');
        data={...member,projectId:data.projectId,...Object.fromEntries(['role','instructions','allowSend','allowAutomation','allowRelay'].filter(k=>k in data).map(k=>[k,data[k]]))};
      }
      if(data.projectId)check(this.workspaceProjectIds.has(data.projectId),'此 DSH 项目已移除，请刷新');
      if(type==='avatar.set')check(this.core.state.members.some(member=>member.id===data.memberId&&member.projectIds.includes(data.projectId)&&this.workspaceMemberIds.has(member.id)),'对话不属于此项目');
      if(type==='library.manage'&&data.kind==='workflow-run')check(this.core.state.workflowRuns.some(run=>run.id===data.id&&run.projectId===data.projectId),'运行记录不属于此项目');
    }
    if(type==='prompt.optimize'){
      const member=this.core.state.members.find(row=>row.id===data.memberId&&row.projectIds.includes(data.projectId));
      check(member?.allowSend,'请选择已开启发送权限的项目对话');
      check(typeof data.body==='string'&&data.body.trim()&&data.body.length<=12000,'请输入 1 至 12000 字的分析素材');
      return this.core.sendMessage({projectId:data.projectId,recipientIds:[member.id],body:promptAssistantInstructions+'\n\n[本次待分析素材]\n'+data.body});
    }
    if(type==='workflow.generate'){
      const member=this.core.state.members.find(m=>m.id===data.memberId&&m.projectIds.includes(data.projectId));check(member?.allowSend,'请选择已开启发送权限的项目对话');check(typeof data.requirement==='string'&&data.requirement.trim()&&data.requirement.length<=8000,'请输入 1 至 8000 字的流程需求');
      return this.core.sendMessage({projectId:data.projectId,recipientIds:[member.id],body:'[协作流程设计]\n'+workflowFormat+'\n需求：\n'+data.requirement});
    }
    if(type==='workflow.fromMessage'){
      const message=this.core.state.messages.find(m=>m.id===data.messageId&&m.projectId===data.projectId);check(message&&message.senderId!=='member-human','请选择成员返回的流程定义');
      for(const candidate of [message.body,...[...message.body.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m=>m[1])]){let template;try{template=parseWorkflow(JSON.parse(candidate));}catch{continue;}return this.core.action({type:'workflow.template.save',data:{template}});}
      throw new Error('此回复不包含有效的流程 JSON，请在编辑模板中调整后保存');
    }
    if(type==='assistance.reject'||type==='assistance.approve'){
      const proposal=this.core.state.assistanceRequests.find(r=>r.id===data.requestId&&r.projectId===data.projectId);check(proposal?.status==='pending','此协助提议已处理');
      if(type==='assistance.reject')return this.core.change(()=>{proposal.status='rejected';return{ok:true};});
      const source=this.core.state.members.find(m=>m.id===proposal.sourceMemberId),target=this.core.state.members.find(m=>m.id===proposal.toMemberId);
      check(source?.allowRelay&&target?.allowRelay&&target.allowSend&&target.projectIds.includes(data.projectId),'成员权限或归属已变化，未转发');
      check(proposal.depth<3&&!proposal.visited.includes(target.id),'交接链超过上限或形成循环');
      await this.core.change(()=>{check(proposal.status==='pending','此提议已处理');proposal.status='sending';});let queued;
      try{
        queued=await this.core.sendMessage({projectId:data.projectId,recipientIds:[target.id],body:'[负责人批准的成员协助请求]\n来源：'+source.displayName+'；记录：'+proposal.sourceMessageId+'\n要求：'+proposal.message+'\n期待：'+proposal.expectation,assistanceContext:{assistanceRootId:proposal.rootId,assistanceDepth:proposal.depth+1,assistanceVisited:[...proposal.visited,target.id]}});
        await this.core.change(()=>{proposal.status='queued';proposal.messageId=queued.messageId;proposal.jobIds=queued.jobIds;const message=this.core.state.messages.find(m=>m.id===queued.messageId);if(message){message.replyToId=proposal.sourceMessageId;message.kind='handoff';}});return queued;
      }catch(error){if(queued)error.submissionUncertain=true;await this.core.change(()=>{proposal.status=error.submissionUncertain?'unknown':'pending';});throw error;}
    }
    if(type==='codex.approval.respond'&&data.decision==='approve'){
      const approval=this.core.codexApprovals(data.projectId).find(a=>a.id===data.approvalId),member=this.core.state.members.find(m=>m.id===approval?.memberId),job=this.core.state.jobs.find(j=>j.id===approval?.jobId);
      check(member?.allowSend&&!job?.cancelRequested&&(job?.kind!=='workflow'||member.allowAutomation),'成员权限已撤销或执行已停止，请拒绝此审批');
    }
    if(type==='member.save'){
      const identity=(software,session)=>software==='DSH Desktop'&&this.codex.nativeThreads?.has(session)?'Codex:'+this.codex.nativeThreads.get(session):software+':'+session;
      const same=this.core.state.members.find(m=>m.id!==data.id&&m.projectIds.includes(data.projectId)&&identity(m.software,m.sessionId)===identity(data.software,data.sessionId));
      check(!same,'同一原生运行时会话已加入此项目；独立职责和审查需要不同会话');
    }
    if(type==='job.reconcile'){const job=this.core.state.jobs.find(j=>j.id===data.jobId&&j.projectId===data.projectId);check(job?.submissionUncertain,'此执行无需核对');check(data.evidence?.trim(),'请填写原生历史的实际核对结果');const member=this.core.state.members.find(m=>m.id===job.memberId);if(member?.software==='Claude')await this.transports.get('Claude').reconcile(member.sessionId,data.evidence);return this.core.change(()=>{job.uncertaintyResolved=true;job.reconciliationEvidence=data.evidence.slice(0,4000);this.core.state.events.unshift({id:randomUUID(),type:'job.updated',entityId:job.id,projectId:job.projectId,origin:'human',actorId:'member-human',occurredAt:new Date().toISOString(),summary:'已人工核对原生执行，未重发：'+job.reconciliationEvidence});return job;});}
    if(type==='claude.reconcile'){const member=this.core.state.members.find(m=>m.id===data.memberId&&m.projectIds.includes(data.projectId)&&m.software==='Claude');check(member,'Claude 成员不存在');return this.transports.get('Claude').reconcile(member.sessionId,data.evidence);}
    if(type==='member.save'&&data.software==='Claude'){const project=this.core.state.projects.find(p=>p.id===data.projectId);check(project?.path,'请先为项目登记目录');await this.transports.get('Claude').bind(data.sessionId,{cwd:data.cwd||project.path,title:data.displayName});}
    if(type==='message.handoff'){
      const source=this.core.state.messages.find(m=>m.id===data.messageId&&m.projectId===data.projectId);check(source,'交接来源消息不存在');
      check(data.recipientIds?.length,'请选择交接成员');
      const author=this.core.state.members.find(m=>m.id===source.senderId)?.displayName||source.senderId;
      const receipt=await this.core.sendMessage({projectId:data.projectId,recipientIds:data.recipientIds,taskId:source.taskId,body:'[负责人批准的交接]\n来源：'+author+'；消息记录：'+source.id+'\n要求：'+(data.note||'请按职责继续处理')+'\n\n[来源正文]\n'+source.body});
      await this.core.change(()=>{const target=this.core.state.messages.find(m=>m.id===receipt.messageId);if(target){target.replyToId=source.id;target.kind='handoff';}});
      return receipt;
    }
    if(type==='project.ensure'){
      const path=await realpath(data.path);check((await stat(path)).isDirectory(),'项目目录不存在');
      const key=process.platform==='win32'?path.toLowerCase():path;
      const existing=this.core.state.projects.find(p=>p.path&&(process.platform==='win32'?p.path.toLowerCase():p.path)===key);
      return existing||this.core.action({type:'project.save',data:{name:data.name,path}});
    }
    if(type==='receipt.resolve')return this.core.change(()=>{const row=this.core.state.pluginReceipts.find(r=>r.id===data.receiptId);check(row?.status==='unknown','此记录无需核对');check(typeof data.evidence==='string'&&data.evidence.trim(),'请填写实际核对结果');row.status='resolved';row.evidence=data.evidence.slice(0,4000);this.core.state.events.unshift({id:randomUUID(),type:'job.updated',entityId:row.id,projectId:data.projectId||'',origin:'human',actorId:'member-human',occurredAt:new Date().toISOString(),summary:'人工核对不确定操作：'+row.evidence});return{ok:true};});
    if(type==='backup.import'){
      check(data.confirm===true,'请确认恢复本地协作备份');check(!this.core.state.jobs.some(j=>['queued','running','waiting'].includes(j.status)),'请先等待或停止当前执行');
      const source=data.snapshot?.snapshot||data.snapshot;
      check(source&&typeof source==='object','备份格式无效');
      check(!source.pluginReceipts||Array.isArray(source.pluginReceipts)&&source.pluginReceipts.every(r=>r&&typeof r.id==='string'&&typeof r.hash==='string'&&typeof r.type==='string'&&['pending','unknown','done','failed','resolved'].includes(r.status)),'操作回执格式无效');
      check(!source.assistanceRequests||Array.isArray(source.assistanceRequests)&&source.assistanceRequests.every(r=>r&&typeof r.id==='string'&&typeof r.projectId==='string'&&typeof r.message==='string'&&typeof r.rootId==='string'&&Number.isInteger(r.depth)&&r.depth>=0&&r.depth<=3&&Array.isArray(r.visited)&&r.visited.length<=4&&r.visited.every(id=>typeof id==='string')&&['pending','sending','unknown','queued','rejected'].includes(r.status)),'成员协助记录格式无效');
      const backupDirectory=join(this.core.dataDirectory,'backups');await mkdir(backupDirectory,{recursive:true});
      const backup='before-import-'+Date.now()+'-'+randomUUID()+'.json';await writeFile(join(backupDirectory,backup),JSON.stringify(await this.exportBackup()),{mode:0o600,flag:'wx'});
      const existingMembers=new Set(this.core.state.members.map(m=>m.id));
      const result=await this.core.importSnapshot(data.snapshot);
      await this.core.change(()=>{
        this.core.state.pluginReceipts??=[];this.core.state.assistanceRequests??=[];
        for(const key of ['pluginReceipts','assistanceRequests']){const ids=new Set(this.core.state[key].map(r=>r.id));this.core.state[key].push(...(source[key]||[]).filter(r=>!ids.has(r.id)).map(r=>structuredClone(r)));}
        for(const r of this.core.state.pluginReceipts)if(r.status==='pending')r.status='unknown';for(const r of this.core.state.assistanceRequests)if(r.status==='sending')r.status='unknown';
        for(const member of this.core.state.members)if(member.software!=='Hub'&&!existingMembers.has(member.id)){member.allowSend=false;member.allowAutomation=false;member.allowRelay=false;member.status='unknown';}
        this.core.state.events.unshift({id:randomUUID(),type:'workspace.imported',entityId:'workspace',projectId:'',origin:'human',actorId:'member-human',occurredAt:new Date().toISOString(),summary:'合并恢复协作备份，导入前记录保存在 '+backup});
      });
      return{...result,backup};
    }
    if(type==='member.create'){
      const project=this.core.state.projects.find(p=>p.id===data.projectId);check(project,'项目不存在');
      const adapter=this.transports.get(data.software);check(adapter?.create,'此运行时不支持创建会话');
      check(data.displayName?.trim(),'请填写成员名称');
      const cwd=await realpath(data.cwd||project.path);check((await stat(cwd)).isDirectory(),'成员工作目录不存在');
      if(data.selectedModel){const model=(await adapter.models()).find(m=>m.id===data.selectedModel);check(model,'请选择运行时目录中的模型');check(!data.reasoningEffort||model.efforts?.includes(data.reasoningEffort),'模型不支持此推理强度');}
      const created=await adapter.create({cwd,title:project.name+' · '+data.displayName,model:data.selectedModel,effort:data.reasoningEffort,codexSandboxMode:data.codexSandboxMode||'read-only'});
      let member;try{member=await this.core.action({type:'member.save',data:{...data,sessionId:created.sessionId}});}catch(error){throw Object.assign(error,{submissionUncertain:true,createdSessionId:created.sessionId});}
      await this.core.change(()=>{member.workingDirectory=cwd;member.directorySource='created';member.connectionMode=created.mode;});
      return member;
    }
    if(type==='member.open'){
      const member=this.core.state.members.find(m=>m.id===data.memberId&&m.projectIds.includes(data.projectId));check(member,'成员不存在');
      if(member.software==='Codex')return this.codex.importNativeThread(member.sessionId);
      if(member.software==='DSH Desktop')return{sessionId:member.sessionId};
      throw new Error('请在协作面板中与此成员单独对话');
    }
    if(type==='runtime.interaction')return this.codex.operate({action:'interaction.answer',operationId:randomUUID(),...data});
    check(ALLOWED.has(type),'此操作不在插件基础版范围内');
    if(type==='message.send')check(typeof data.body==='string'&&data.body.length<=24000,'消息最多 24000 个字符，请先拆分内容');
    if(type==='message.send'&&!(data.recipientIds?.length)){
      const members=this.core.state.members.filter(m=>m.projectIds.includes(data.projectId)&&m.software!=='Hub');
      const names=members.filter(m=>{const body=String(data.body||''),token='@'+m.displayName;for(let at=body.indexOf(token);at>=0;at=body.indexOf(token,at+token.length)){const after=body[at+token.length];if(!after||/[\s，,。.!！?？:：;；、）)\]]/.test(after))return true;}return false;});
      data={...data,recipientIds:names.map(m=>m.id)};
    }
    if(type==='message.send'){data={...data};delete data.assistanceContext;}
    // A missing acknowledgement is not a second model request. Native creation
    // and accepted sends retain their independent durable Hub receipt and job.
    return this.core.action({type,data});
  }
  async files(projectId){await this.ready;if(this.nativeWorkspace){await syncDshWorkspaces(this);check(this.workspaceProjectIds.has(projectId),'DSH 项目不存在');}return this.core.fileTree(projectId);}
  async preview(projectId,path){await this.ready;if(this.nativeWorkspace){await syncDshWorkspaces(this);check(this.workspaceProjectIds.has(projectId),'DSH 项目不存在');}return this.core.preview(projectId,path);}
  async artifact(projectId,artifactId){await this.ready;if(this.nativeWorkspace){await syncDshWorkspaces(this);check(this.workspaceProjectIds.has(projectId),'DSH 项目不存在');}check(this.core.state.artifacts.some(row=>row.id===artifactId&&row.projectId===projectId),'产物不属于此项目');return this.core.artifactFile(artifactId);}
  async close(){
    this.closed=true;await this.ready;
    await this.core.change(()=>{for(const j of this.core.state.jobs)if(['queued','running','waiting'].includes(j.status))j.cancelRequested=true;for(const r of this.core.state.workflowRuns)if(r.status==='running')r.status='paused';for(const d of this.core.state.discussions)if(d.status==='active')d.status='stopped';});
    for(const finish of this.core.codexApprovalWaiters.values())finish(false);
    this.transports.close?.();
    await Promise.race([Promise.allSettled([...this.core.locks.values()]),new Promise(resolve=>setTimeout(resolve,5000).unref())]);
    await this.core.change(()=>{});
  }
}
