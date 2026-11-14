import {createHash} from 'node:crypto';
import {listSessionRows} from './dsh-session-core.js';

const identity=(kind,id)=>'dsh-'+kind+'-'+createHash('sha256').update(id).digest('hex').slice(0,24);
const pathKey=value=>process.platform==='win32'?value?.toLowerCase():value;

// DSH owns projects and session membership. Hub stores only collaboration metadata.
export async function syncDshWorkspaces(hub){
  if(hub.workspaceSync)return hub.workspaceSync;
  const work=async()=>{
    const registry=hub.ctx.workspaceRegistry;
    if(!registry?.list)throw new Error('DSH 工作区服务不可用，无法读取项目；请检查宿主版本和插件加载状态');
    const workspaces=await registry.list();
    if(!Array.isArray(workspaces))throw new Error('DSH 工作区列表格式无效');
    const rows=await listSessionRows(hub.ctx.sessionController,AbortSignal.timeout(30000));
    const sessions=new Map(rows.map(row=>[row.sessionId,row]));
    const projects=[],members=[],now=new Date().toISOString();
    const state=hub.core.state;
    for(const workspace of workspaces){
      const previous=state.projects.find(p=>p.dshWorkspaceId===workspace.id)||state.projects.find(p=>!p.dshWorkspaceId&&pathKey(p.path)===pathKey(workspace.path));
      const project={...previous,id:previous?.id||identity('workspace',workspace.id),dshWorkspaceId:workspace.id,name:workspace.title||workspace.path,path:workspace.path,description:previous?.description||'',goal:previous?.goal||'',progress:previous?.progress||'',risks:previous?.risks||'',milestones:previous?.milestones||'',stack:previous?.stack||[],updatedAt:previous?.updatedAt||now};
      projects.push(project);
      const source=[...workspace.sessionIds].map(id=>sessions.get(id)).filter(Boolean);
      const counts=new Map();for(const row of source)counts.set(row.title,(counts.get(row.title)||0)+1);
      for(const row of source){
        const old=state.members.find(m=>m.software==='DSH Desktop'&&m.sessionId===row.sessionId);
        members.push({...old,id:old?.id||identity('session',row.sessionId),dshSession:true,projectIds:[project.id],displayName:counts.get(row.title)>1?row.title+' · '+row.sessionId:row.title,software:'DSH Desktop',sessionId:row.sessionId,role:old?.role||'协作成员',instructions:old?.instructions||'',workingDirectory:workspace.path,directorySource:'dsh-workspace',connectionMode:'plugin-bridge',status:row.running?'running':'idle',model:row.model,selectedModel:undefined,selectedModelLabel:undefined,reasoningEffort:undefined,allowSend:old?.allowSend===true,allowAutomation:old?.allowAutomation===true,allowRelay:old?.allowRelay===true,lastActivityAt:old?.lastActivityAt||now,contextInitializedProjectIds:old?.contextInitializedProjectIds||[]});
      }
    }
    const changed=projects.some(p=>JSON.stringify(p)!==JSON.stringify(state.projects.find(v=>v.id===p.id)))||members.some(m=>JSON.stringify(m)!==JSON.stringify(state.members.find(v=>v.id===m.id)))||state.members.some(m=>m.software!=='Hub'&&!members.some(v=>v.id===m.id)&&(m.allowSend||m.allowAutomation||m.allowRelay||m.projectIds.length));
    if(changed)await hub.core.change(()=>{
      for(const project of projects){const old=state.projects.find(p=>p.id===project.id);if(old)Object.assign(old,project,...['description','goal','progress','risks','milestones','stack'].map(k=>({[k]:old[k]})));else state.projects.push(project);}
      for(const member of state.members)if(member.software!=='Hub'&&!members.some(v=>v.id===member.id)){member.projectIds=[];member.allowSend=false;member.allowAutomation=false;member.allowRelay=false;}
      for(const member of members){const old=state.members.find(m=>m.id===member.id);if(old){const local=Object.fromEntries(['role','instructions','allowSend','allowAutomation','allowRelay','lastActivityAt','contextInitializedProjectIds'].map(k=>[k,old[k]]));Object.assign(old,member,local);}else state.members.push(member);}
      const human=state.members.find(m=>m.id==='member-human');if(human)human.projectIds=projects.map(p=>p.id);
    });
    hub.workspaceProjectIds=new Set(projects.map(p=>p.id));
    hub.workspaceMemberIds=new Set(members.map(m=>m.id));
    return projects;
  };
  hub.workspaceSync=work();try{return await hub.workspaceSync;}finally{hub.workspaceSync=null;}
}
