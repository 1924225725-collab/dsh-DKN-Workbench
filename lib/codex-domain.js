import {realpath,stat,readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname,basename} from 'node:path';

export function flattenHistory(result){
  const items=result.items||result.data||result.thread?.turns?.flatMap(t=>(t.items||[]).map(i=>({...i,turnId:t.id})))||[];
  return items.map(x=>x.item?{...x.item,turnId:x.turnId??x.turn_id}:x);
}
export function textOf(item){
  if(typeof item.text==='string')return item.text;
  if(typeof item.message==='string')return item.message;
  if(Array.isArray(item.content))return item.content.map(p=>p.text??(p.type==='image'?'[图片]':'')).filter(Boolean).join('\n');
  return '';
}
export function normalizeItem(item){
  const type=item.type||'unknown',text=textOf(item);
  if(['userMessage','user_message'].includes(type))return{id:item.id,type:'user',text,turnId:item.turnId};
  if(['agentMessage','agent_message','assistant_message'].includes(type))return{id:item.id,type:'assistant',text,phase:item.phase,turnId:item.turnId};
  if(type==='commandExecution')return{id:item.id,type:'command',title:item.command,text:item.aggregatedOutput||'',status:item.status,exitCode:item.exitCode,cwd:item.cwd,turnId:item.turnId};
  if(type==='fileChange')return{id:item.id,type:'files',changes:item.changes||[],status:item.status,turnId:item.turnId};
  if(type==='reasoning')return{id:item.id,type:'reasoning',text:(item.summary||[]).map(x=>typeof x==='string'?x:x.text||'').join('\n'),turnId:item.turnId};
  if(/ToolCall|tool_call|webSearch|image|plan|review/i.test(type))return{id:item.id,type:'activity',title:type,text:text||JSON.stringify(item.result??item.output??item.arguments??item),status:item.status,turnId:item.turnId};
  return{id:item.id,type:'unknown',title:type,text:text||JSON.stringify(item),turnId:item.turnId};
}
export function artifactReferences(items,cwd){
  const map=new Map();
  for(const item of items){
    if(item.type==='fileChange')for(const c of item.changes||[]){const path=c.path;if(typeof path==='string')map.set(path,{path,status:item.status||'unknown',kind:c.kind,diff:c.diff||'',evidence:'fileChange',itemId:item.id});}
    const text=textOf(item);for(const m of text.matchAll(/\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))\)/g)){let path=m[1]||m[2];try{path=decodeURIComponent(path);}catch{}if(/^(?:[A-Za-z]:[\\/]|\/)/.test(path)){path=path.replace(/:\d+(?::\d+)?$/,'');if(!map.has(path))map.set(path,{path,status:'referenced',evidence:'message',itemId:item.id});}}
  }
  return [...map.values()].map(x=>({...x,absolutePath:cwd?resolve(cwd,x.path):x.path}));
}
export function sameValue(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function assertBaseline(actual,expected,fields){if(!expected)return;for(const key of fields)if(Object.hasOwn(expected,key)&&!sameValue(actual[key],expected[key]))throw Object.assign(new Error('内容已在另一端变化，请刷新后重新操作'),{code:'SYNC_CONFLICT'});}
function sensitiveArtifact(path){const name=basename(path).toLowerCase(),parts=path.toLowerCase().split(/[\\/]+/);return /^(?:\.env(?:\..*)?|auth\.json|credentials(?:\..*)?|token\.json|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|ed25519)|.*\.(?:pem|key|pfx))$/.test(name)||parts.some(x=>['.ssh','.aws','.azure','.gnupg'].includes(x));}
export async function readArtifact(path,roots,{maxBytes=8*1024*1024}={}){
  if(typeof path!=='string'||!isAbsolute(path))throw new Error('产物需要绝对路径');
  const real=await realpath(path);const allowed=await Promise.all(roots.filter(Boolean).map(r=>realpath(r).catch(()=>null)));
  if(!allowed.some(root=>root&&(relative(root,real)===''||(!relative(root,real).startsWith('..')&&!isAbsolute(relative(root,real))))))throw new Error('文件不在此对话的项目范围内');
  if(sensitiveArtifact(real))throw new Error('不在产物预览中打开认证或密钥文件');
  const info=await stat(real);if(!info.isFile()||info.size>maxBytes)throw new Error('文件不存在或超过 8 MiB 预览限制');
  const data=await readFile(real),ext=extname(real).toLowerCase();
  const image=(ext==='.png'&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))?'image/png':(['.jpg','.jpeg'].includes(ext)&&data[0]===255&&data[1]===216)?'image/jpeg':null;
  const text=/^\.(?:txt|md|json|js|mjs|ts|tsx|jsx|py|rs|go|css|html|xml|yaml|yml|toml|csv|log|diff|patch|svg)$/i.test(ext);
  return{data,type:image||(text?'text/plain; charset=utf-8':'application/octet-stream'),inline:!!image||text,name:basename(real),size:info.size};
}
