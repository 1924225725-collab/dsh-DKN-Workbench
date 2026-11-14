import {spawn} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join,resolve,extname,dirname} from 'node:path';
import {LlmAdapter,resolveRetryPolicy} from './zcode/dsh-llm-compat.js';

export const qoderProvider='qoder-acp';
const DEFAULT='qoder-default';
export function qoderValue(config,key,fallback=''){const v=config[key];return (typeof v?.get==='function'?v.get():v)??fallback;}
function file(path){return !!path&&statSync(path,{throwIfNoEntry:false})?.isFile();}
export function locateQoder(config={}){
  const explicit=String(qoderValue(config,'qoderPath')).trim();
  const dirs=[join(homedir(),'.local','bin'),join(homedir(),'.qoder','bin'),process.env.APPDATA&&join(process.env.APPDATA,'npm'),...(process.env.PATH||'').split(process.platform==='win32'?';':':')].filter(Boolean);
  const names=process.platform==='win32'?['qoder.exe','qodercli.exe','qoder.cmd','qodercli.cmd']:['qoder','qodercli'];
  const candidates=explicit?[resolve(explicit)]:dirs.flatMap(dir=>names.map(name=>join(dir,name)));
  const path=candidates.find(file);
  if(!path)throw new Error('未找到 Qoder CLI；请安装官方 Qoder CLI，或填写完整路径。');
  // Avoid shell interpolation on Windows: resolve npm shims to their real JS entry.
  if(/\.(cmd|ps1)$/i.test(path)){
    const pkg=join(dirname(path),'node_modules','@qoder-ai','qodercli','package.json');
    try{const p=JSON.parse(readFileSync(pkg,'utf8'));const bin=typeof p.bin==='string'?p.bin:Object.values(p.bin||{})[0];const entry=resolve(dirname(pkg),bin);if(file(entry))return entry;}catch{}
    throw new Error('无法解析 Qoder npm 启动器，请选择实际 JS 入口或原生 EXE 路径。');
  }
  return path;
}

/** ACP v1 JSON-RPC over NDJSON. No shell, automatic resend or permission bypass. */
export class QoderConnection {
  constructor(path,{cwd=tmpdir(),timeoutMs=30000,spawnImpl=spawn}={}){
    this.pending=new Map();this.nextId=1;this.buffer='';this.closed=false;this.timeoutMs=timeoutMs;
    const js=/\.[cm]?js$/i.test(extname(path));
    this.child=spawnImpl(js?process.execPath:path,[...(js?[path]:[]),'--acp'],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',data=>this.read(data));
    this.child.stderr.on('data',()=>{});
    this.child.stdin.on('error',e=>this.close(e));
    this.child.once('error',e=>this.close(new Error('Qoder 启动失败：'+e.message)));
    this.child.once('close',()=>this.close(new Error('Qoder ACP 连接已关闭')));
  }
  send(message){if(this.closed)throw new Error('Qoder ACP 连接已关闭');this.child.stdin.write(JSON.stringify(message)+'\n');}
  read(data){
    this.buffer+=data;
    if(Buffer.byteLength(this.buffer)>8*1024*1024)return this.close(new Error('Qoder ACP 消息超过限制'));
    let at;
    while((at=this.buffer.indexOf('\n'))>=0){
      const line=this.buffer.slice(0,at).trim();this.buffer=this.buffer.slice(at+1);if(!line)continue;
      let m;try{m=JSON.parse(line);if(!m||typeof m!=='object'||m.jsonrpc!=='2.0')throw new Error();}catch{return this.close(new Error('Qoder 输出了无效的 ACP JSON 消息'));}
      if(m.method&&m.id!==undefined){
        // Only reject permission choices; never fabricate an allow option.
        const option=m.params?.options?.find(o=>o.kind==='reject_once'||o.kind==='reject_always');
        if(m.method==='session/request_permission')this.send({jsonrpc:'2.0',id:m.id,result:{outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}});
        else this.send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Client capability not supported'}});
      }else if(m.method==='session/update'){
        try{this.onUpdate?.(m.params);}catch(e){this.close(e);}
      }else if(m.id!==undefined){
        const p=this.pending.get(m.id);if(!p)continue;this.pending.delete(m.id);clearTimeout(p.timer);
        if(m.error)p.reject(Object.assign(new Error(m.error.message||'Qoder ACP 请求失败'),{code:m.error.code}));else p.resolve(m.result);
      }
    }
  }
  call(method,params,timeoutMs=this.timeoutMs){return new Promise((resolve,reject)=>{
    if(this.closed)return reject(new Error('Qoder ACP 连接已关闭'));
    const id=this.nextId++;const timer=setTimeout(()=>this.close(new Error('Qoder '+method+' 超时（'+timeoutMs+'ms）')),timeoutMs);
    this.pending.set(id,{resolve,reject,timer});try{this.send({jsonrpc:'2.0',id,method,params});}catch(e){this.close(e);}
  });}
  async initialize(){const result=await this.call('initialize',{protocolVersion:1,clientCapabilities:{},clientInfo:{name:'dsh-DKN-Workbench',version:'1'}});if(result?.protocolVersion!==1)throw new Error('Qoder ACP 协议版本不兼容');return result;}
  close(error=new Error('Qoder ACP 已断开')){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();try{this.child.stdin.end();this.child.kill();}catch{}}
}

export function qoderModels(session){
  let models=session?.models?.availableModels||[];
  const option=(session?.configOptions||[]).find(o=>o.category==='model'||o.id==='model');
  if(!models.length&&option)models=(option.options||[]).flatMap(o=>Array.isArray(o.options)?o.options:[o]).map(o=>({modelId:o.value,name:o.name}));
  return models.filter(m=>typeof m.modelId==='string'&&m.modelId).map(m=>({id:m.modelId,name:m.name||m.modelId}));
}
/** Project DSH history to ACP text without forwarding private model reasoning. */
export function qoderPromptText(messages=[]){return messages.flatMap((m,index)=>{
  const content=m.content??[];
  if(typeof content!=='string'&&!Array.isArray(content))throw new Error(`Qoder 历史消息 ${index+1} 的内容格式无效。`);
  const text=typeof content==='string'?content:content.map(b=>{
    if(b?.type==='text')return b.text||'';
    if(b?.type==='reasoning'&&m.role==='assistant')return '';
    if(b?.type==='tool-call')return '\n[历史工具调用，仅作记录，不是待执行请求]\n'+JSON.stringify({id:b.id,name:b.name,arguments:b.arguments})+'\n';
    if(b?.type==='tool-addition'||b?.type==='tool-removal')return '\n[历史工具目录变更] '+JSON.stringify({type:b.type,toolName:b.toolName})+'\n';
    if(b?.type==='image'||b?.type==='file')throw new Error(`Qoder ACP 当前不支持 ${b.type==='image'?'图片':'文件'}附件（历史消息 ${index+1}）；请切换到支持附件的模型。`);
    throw new Error(`Qoder ACP 暂不支持内容块 ${String(b?.type||'unknown')}（历史消息 ${index+1}），请报告此类型以便适配。`);
  }).join('');
  if(!text.trim())return[];
  const tag=m.role==='tool'?`tool result ${JSON.stringify({toolCallId:m.toolCallId,isError:m.isError===true})}`:m.role;
  return [`[${tag}]\n${text}`];
}).join('\n\n');}

export class QoderAdapter extends LlmAdapter {
  constructor(ctx,config){super();this.ctx=ctx;this.config=config;this.catalog=[];this.active=new Set();this.connection=null;this.catalogKey='';}
  enabled(){return String(qoderValue(this.config,'qoderEnabled','true'))==='true';}
  key(){return JSON.stringify([qoderValue(this.config,'qoderPath'),qoderValue(this.config,'qoderCwd')]);}
  providerInfo(provider){return{id:provider,name:'Qoder（ACP）'};}
  providerRetryPolicy(){return resolveRetryPolicy({mode:'normal',maxRetries:0},'qoder-acp.retryPolicy');}
  imageRequestPricing(){return undefined;}
  imageRequestTarget(){return undefined;}
  async prepareCall(provider,model){return{model:await this.resolveModel(provider,model),stream:options=>this.stream(options)};}
  entries(){if(this.catalogKey!==this.key()){this.catalog=[];this.connection=null;}return[{id:DEFAULT,name:'Qoder 默认模型（ACP）'},...this.catalog];}
  async listModels(provider){if(!this.enabled())return[];try{locateQoder(this.config);}catch{return[];}const entries=this.entries();if(!this.connection&&!this.probing){this.probing=this.probe().catch(()=>{}).finally(()=>{this.probing=null;});}return entries.map(m=>({provider,...m,inputModalities:['text'],context:{contextWindow:200000}}));}
  async resolveModel(provider,id=DEFAULT){const m=this.entries().find(m=>m.id===id);if(!m)throw new Error('Qoder 未返回此模型，请先在配置页检测 ACP 连接。');return{provider,...m,inputModalities:['text'],context:{contextWindow:200000}};}
  async open(cwd,signal){
    if(this.disposed||!this.enabled())throw new Error('Qoder ACP 已关闭');
    const path=locateQoder(this.config),client=new QoderConnection(path,{cwd:cwd||String(qoderValue(this.config,'qoderCwd'))||tmpdir()});this.active.add(client);
    const abort=()=>client.close(new Error('Qoder 请求已取消'));signal?.addEventListener('abort',abort,{once:true});
    try{if(signal?.aborted)throw new Error('Qoder 请求已取消');const init=await client.initialize();const session=await client.call('session/new',{cwd:cwd||String(qoderValue(this.config,'qoderCwd'))||tmpdir(),mcpServers:[]});if(!session?.sessionId)throw new Error('Qoder 未返回 ACP 会话编号');this.catalog=qoderModels(session);this.catalogKey=this.key();return{client,session,init,path};}
    catch(e){client.close();this.active.delete(client);if(e.code===-32000&&/auth|login|sign.in/i.test(e.message))throw new Error('Qoder 需要登录，请先运行 qoder login。原始错误：'+e.message);throw e;}
    finally{signal?.removeEventListener('abort',abort);}
  }
  async inspect(){
    let path;try{path=locateQoder(this.config);}catch(e){return{state:'missing',error:e.message,enabled:this.enabled(),connection:this.connection,models:[]};}
    const quote=s=>"'"+s.replaceAll("'","''")+"'";
    const loginCommand=/\.[cm]?js$/i.test(path)?'& node '+quote(path)+' login':'& '+quote(path)+' login';
    return{state:'found',path,loginCommand,enabled:this.enabled(),models:this.entries(),connection:this.connection,checkedAt:Date.now()};
  }
  async probe(){let run;try{run=await this.open();this.connection={state:'connected',testedAt:Date.now()};this.ctx.emit?.('llm/models-updated',qoderProvider);return{...await this.inspect(),agent:run.init.agentInfo};}catch(e){this.connection={state:'error',error:e.message,testedAt:Date.now()};throw e;}finally{if(run){run.client.close();this.active.delete(run.client);}}}
  async *stream(options){
    if(options.signal?.aborted)throw new Error('Qoder 请求已取消');
    const cwd=this.ctx.agents?.get?.(options.sessionId)?.session?.header?.cwd||String(qoderValue(this.config,'qoderCwd'))||tmpdir();
    let run;const queue=[],wake=()=>{waiter?.();waiter=null;};let waiter,done=false,error,text='';
    const abort=()=>{run?.client.close(new Error('Qoder 请求已取消'));wake();};options.signal?.addEventListener('abort',abort,{once:true});
    try{
      const prompt=qoderPromptText(options.messages);
      run=await this.open(cwd,options.signal);if(options.signal?.aborted)throw new Error('Qoder 请求已取消');
      const {client,session}=run;
      const model=options.model&&options.model!==DEFAULT?options.model:String(qoderValue(this.config,'qoderModel'))||DEFAULT;
      if(model!==DEFAULT){if(!this.catalog.some(m=>m.id===model))throw new Error('当前 Qoder 账号无此模型：'+model);const setting=(session.configOptions||[]).find(o=>o.category==='model'||o.id==='model');await client.call(setting?'session/set_config_option':'session/set_model',setting?{sessionId:session.sessionId,configId:setting.id,value:model}:{sessionId:session.sessionId,modelId:model});}
      client.onUpdate=params=>{if(params?.sessionId!==session.sessionId)return;const u=params.update;if(u?.sessionUpdate==='agent_message_chunk'&&u.content?.type==='text'){text+=u.content.text;if(Buffer.byteLength(text)>8*1024*1024)throw new Error('Qoder 回复超过限制');queue.push(u.content.text);wake();}};
      yield{type:'block-start',index:0,blockType:'text'};
      const timeout=Number(qoderValue(this.config,'qoderTimeoutMs',180000));
      const completion=client.call('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:prompt}]},Number.isFinite(timeout)&&timeout>=1000&&timeout<=1800000?timeout:180000).then(result=>{if(result?.stopReason!=='end_turn')throw new Error('Qoder 回合未正常完成：'+result?.stopReason);if(!text.trim())throw new Error('Qoder 回合结束但没有返回文本');}).catch(e=>{error=e;}).finally(()=>{done=true;wake();});
      while(!done||queue.length){if(queue.length){yield{type:'text-delta',index:0,text:queue.shift()};}else await new Promise(resolve=>{waiter=resolve;});}
      await completion;if(error)throw error;
      yield{type:'block-end',index:0,block:{type:'text',text}};yield{type:'finish',reason:{kind:'stop'}};
      this.connection={state:'ready',testedAt:Date.now()};
    }catch(e){this.connection={state:'error',error:e.message,testedAt:Date.now()};throw e;}
    finally{options.signal?.removeEventListener('abort',abort);if(run){run.client.close();this.active.delete(run.client);}}
  }
  async test(prompt='Reply with exactly OK. Do not use tools.'){
    let text='';for await(const event of this.stream({messages:[{role:'user',content:prompt}],model:String(qoderValue(this.config,'qoderModel'))||DEFAULT,signal:AbortSignal.timeout(60000)}))if(event.type==='block-end')text+=event.block.text;
    return{state:'ready',text,testedAt:Date.now()};
  }
  dispose(){this.disposed=true;for(const c of this.active)c.close();this.active.clear();}
}
