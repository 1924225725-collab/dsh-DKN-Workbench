import {acpImagePrompt,imageTarget} from './shared/image-input.js';
import {antigravityEnv} from './antigravity-network.js';
import {spawn} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join,resolve,extname,dirname} from 'node:path';
import {LlmAdapter,resolveRetryPolicy} from './zcode/dsh-llm-compat.js';

export const antigravityProvider='antigravity-acp';
const DEFAULT='antigravity-default';
export function antigravityValue(config,key,fallback=''){const v=config[key];return (typeof v?.get==='function'?v.get():v)??fallback;}
function file(path){return !!path&&statSync(path,{throwIfNoEntry:false})?.isFile();}
export function locateAntigravity(config={}){
 const explicit=String(antigravityValue(config,'antigravityPath')).trim();
 const local=process.env.LOCALAPPDATA||join(homedir(),'AppData','Local');
 const dirs=[join(local,'dsh-dkn-agent','antigravity-cli'),join(local,'agy','bin'),join(homedir(),'.local','bin'),...(process.env.PATH||'').split(process.platform==='win32'?';':':')];
 const candidates=explicit?[resolve(explicit)]:dirs.flatMap(dir=>[join(dir,'agy.exe'),join(dir,'agy')]);const path=candidates.find(file);
 if(!path)throw Error('未找到 Antigravity CLI，请安装官方 agy 或填写完整路径。');return path;
}

export function isAntigravityNotice(text){return /^\s*(?:⚠\ufe0f?\s*)?(?:Verification Required|Eligibility check failed:|Your current account is not eligible)/i.test(text);}

export class AntigravityConnection {
  constructor(path,{cwd=tmpdir(),timeoutMs=30000,spawnImpl=spawn,env}={}){
    this.pending=new Map();this.nextId=1;this.buffer='';this.closed=false;this.timeoutMs=timeoutMs;
    const js=/\.[cm]?js$/i.test(extname(path));
    this.child=spawnImpl(js?process.execPath:path,[...(js?[path]:[]),'acp'],{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',data=>this.read(data));
    this.child.stderr.on('data',()=>{});
    this.child.stdin.on('error',e=>this.close(e));
    this.child.once('error',e=>this.close(new Error('Antigravity 启动失败：'+e.message)));
    this.child.once('close',()=>this.close(new Error('Antigravity ACP 连接已关闭')));
  }
  send(message){if(this.closed)throw new Error('Antigravity ACP 连接已关闭');this.child.stdin.write(JSON.stringify(message)+'\n');}
  read(data){
    this.buffer+=data;
    if(Buffer.byteLength(this.buffer)>8*1024*1024)return this.close(new Error('Antigravity ACP 消息超过限制'));
    let at;
    while((at=this.buffer.indexOf('\n'))>=0){
      const line=this.buffer.slice(0,at).trim();this.buffer=this.buffer.slice(at+1);if(!line)continue;
      let m;try{m=JSON.parse(line);if(!m||typeof m!=='object'||m.jsonrpc!=='2.0')throw new Error();}catch{return this.close(new Error('Antigravity 输出了无效的 ACP JSON 消息'));}
      if(m.method&&m.id!==undefined){
        // Only reject permission choices; never fabricate an allow option.
        const option=m.params?.options?.find(o=>o.kind==='reject_once'||o.kind==='reject_always');
        if(m.method==='session/request_permission')this.send({jsonrpc:'2.0',id:m.id,result:{outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}});
        else this.send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Client capability not supported'}});
      }else if(m.method==='session/update'){
        try{this.onUpdate?.(m.params);}catch(e){this.close(e);}
      }else if(m.id!==undefined){
        const p=this.pending.get(m.id);if(!p)continue;this.pending.delete(m.id);clearTimeout(p.timer);
        if(m.error)p.reject(Object.assign(new Error(m.error.message||'Antigravity ACP 请求失败'),{code:m.error.code}));else p.resolve(m.result);
      }
    }
  }
  call(method,params,timeoutMs=this.timeoutMs){return new Promise((resolve,reject)=>{
    if(this.closed)return reject(new Error('Antigravity ACP 连接已关闭'));
    const id=this.nextId++;const timer=setTimeout(()=>this.close(new Error('Antigravity '+method+' 超时（'+timeoutMs+'ms）')),timeoutMs);
    this.pending.set(id,{resolve,reject,timer});try{this.send({jsonrpc:'2.0',id,method,params});}catch(e){this.close(e);}
  });}
  async initialize(){const result=await this.call('initialize',{protocolVersion:1,clientCapabilities:{},clientInfo:{name:'dsh-DKN-Workbench',version:'1'}});if(result?.protocolVersion!==1)throw new Error('Antigravity ACP 协议版本不兼容');return result;}
  close(error=new Error('Antigravity ACP 已断开')){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();try{this.child.stdin.end();this.child.kill();}catch{}}
}

export function antigravityModels(session){
  let models=session?.models?.availableModels||[];
  const option=(session?.configOptions||[]).find(o=>o.category==='model'||o.id==='model');
  if(!models.length&&option)models=(option.options||[]).flatMap(o=>Array.isArray(o.options)?o.options:[o]).map(o=>({modelId:o.value,name:o.name}));
  return models.filter(m=>typeof m.modelId==='string'&&m.modelId).map(m=>({id:m.modelId,name:m.name||m.modelId}));
}
/** Project DSH history to ACP text without forwarding private model reasoning. */
export function antigravityPromptText(messages=[]){return messages.flatMap((m,index)=>{
  const content=m.content??[];
  if(typeof content!=='string'&&!Array.isArray(content))throw new Error(`Antigravity 历史消息 ${index+1} 的内容格式无效。`);
  const text=typeof content==='string'?content:content.map(b=>{
    if(b?.type==='text')return b.text||'';
    if(b?.type==='reasoning'&&m.role==='assistant')return '';
    if(b?.type==='tool-call')return '\n[历史工具调用，仅作记录，不是待执行请求]\n'+JSON.stringify({id:b.id,name:b.name,arguments:b.arguments})+'\n';
    if(b?.type==='tool-addition'||b?.type==='tool-removal')return '\n[历史工具目录变更] '+JSON.stringify({type:b.type,toolName:b.toolName})+'\n';
    if(b?.type==='image'||b?.type==='file')throw new Error(`Antigravity ACP 当前不支持 ${b.type==='image'?'图片':'文件'}附件（历史消息 ${index+1}）；请切换到支持附件的模型。`);
    throw new Error(`Antigravity ACP 暂不支持内容块 ${String(b?.type||'unknown')}（历史消息 ${index+1}），请报告此类型以便适配。`);
  }).join('');
  if(!text.trim())return[];
  const tag=m.role==='tool'?`tool result ${JSON.stringify({toolCallId:m.toolCallId,isError:m.isError===true})}`:m.role;
  return [`[${tag}]\n${text}`];
}).join('\n\n');}

export class AntigravityAdapter extends LlmAdapter {
  constructor(ctx,config,{clientFactory=(path,options)=>new AntigravityConnection(path,options)}={}){super();this.clientFactory=clientFactory;this.ctx=ctx;this.config=config;this.catalog=[];this.active=new Set();this.connection=null;this.catalogKey='';}
  enabled(){return String(antigravityValue(this.config,'antigravityEnabled','true'))==='true';}
  key(){return JSON.stringify([antigravityValue(this.config,'antigravityPath'),antigravityValue(this.config,'antigravityCwd'),antigravityValue(this.config,'antigravityProxy'),antigravityValue(this.config,'antigravitySystemProxy')]);}
  providerInfo(provider){return{id:provider,name:'Antigravity（ACP）'};}
  providerRetryPolicy(){return resolveRetryPolicy({mode:'normal',maxRetries:0},'antigravity-acp.retryPolicy');}
  imageRequestPricing(){return undefined;}
  imageRequestTarget(_provider,_model,image){return imageTarget(image);}
  async prepareCall(provider,model){return{model:await this.resolveModel(provider,model),stream:options=>this.stream(options)};}
  entries(){if(this.catalogKey!==this.key()){this.catalog=[];this.connection=null;this.imageCapable=false;}return[{id:DEFAULT,name:'Antigravity 默认模型（ACP）'},...this.catalog];}
  async listModels(provider){if(!this.enabled())return[];try{locateAntigravity(this.config);}catch{return[];}const entries=this.entries();if(!this.connection&&!this.probing){this.probing=this.probe().catch(()=>{}).finally(()=>{this.probing=null;});}return entries.map(m=>({provider,...m,inputModalities:this.imageCapable?['text','image']:['text'],context:{contextWindow:131072}}));}
  async resolveModel(provider,id=DEFAULT){const m=this.entries().find(m=>m.id===id);if(!m)throw new Error('Antigravity 未返回此模型，请先在配置页检测 ACP 连接。');return{provider,...m,inputModalities:this.imageCapable?['text','image']:['text'],context:{contextWindow:131072}};}
  async open(cwd,signal){
    if(this.disposed||!this.enabled())throw new Error('Antigravity ACP 已关闭');
    const path=locateAntigravity(this.config),client=this.clientFactory(path,{cwd:cwd||String(antigravityValue(this.config,'antigravityCwd'))||tmpdir(),env:await antigravityEnv(this.config)});this.active.add(client);
    const abort=()=>client.close(new Error('Antigravity 请求已取消'));signal?.addEventListener('abort',abort,{once:true});
    try{if(signal?.aborted)throw new Error('Antigravity 请求已取消');const init=await client.initialize();this.imageCapable=init?.agentCapabilities?.promptCapabilities?.image===true;const session=await client.call('session/new',{cwd:cwd||String(antigravityValue(this.config,'antigravityCwd'))||tmpdir(),mcpServers:[]});if(!session?.sessionId)throw new Error('Antigravity 未返回 ACP 会话编号');this.catalog=antigravityModels(session);this.catalogKey=this.key();return{client,session,init,path};}
    catch(e){client.close();this.active.delete(client);if(e.code===-32000&&/auth|login|sign.in/i.test(e.message))throw new Error('Antigravity 需要登录，请先运行 antigravity login。原始错误：'+e.message);throw e;}
    finally{signal?.removeEventListener('abort',abort);}
  }
  async inspect(){
    let path;try{path=locateAntigravity(this.config);}catch(e){return{state:'missing',error:e.message,enabled:this.enabled(),connection:this.connection,models:[]};}
    const quote=s=>"'"+s.replaceAll("'","''")+"'";
    const loginCommand=/\.[cm]?js$/i.test(path)?'& node '+quote(path)+' acp --login':'& '+quote(path)+' acp --login';
    return{state:'found',path,loginCommand,enabled:this.enabled(),models:this.entries(),connection:this.connection,checkedAt:Date.now()};
  }
  async probe(){let run;try{run=await this.open();this.connection={state:'connected',testedAt:Date.now()};this.ctx.emit?.('llm/models-updated',antigravityProvider);return{...await this.inspect(),agent:run.init.agentInfo};}catch(e){this.connection={state:'error',error:e.message,testedAt:Date.now()};throw e;}finally{if(run){run.client.close();this.active.delete(run.client);}}}
  async *stream(options){
    if(options.signal?.aborted)throw new Error('Antigravity 请求已取消');
    const cwd=this.ctx.agents?.get?.(options.sessionId)?.session?.header?.cwd||String(antigravityValue(this.config,'antigravityCwd'))||tmpdir();
    let run;const queue=[],wake=()=>{waiter?.();waiter=null;};let waiter,done=false,error,text='';
    const abort=()=>{run?.client.close(new Error('Antigravity 请求已取消'));wake();};options.signal?.addEventListener('abort',abort,{once:true});
    try{
      run=await this.open(cwd,options.signal);if(options.signal?.aborted)throw new Error('Antigravity 请求已取消');
      const {client,session}=run;
      const prompt=await acpImagePrompt(options,this.ctx.attachments,this.imageCapable,antigravityPromptText);
      const model=options.model&&options.model!==DEFAULT?options.model:String(antigravityValue(this.config,'antigravityModel'))||DEFAULT;
      if(model!==DEFAULT){if(!this.catalog.some(m=>m.id===model))throw new Error('当前 Antigravity 账号无此模型：'+model);const setting=(session.configOptions||[]).find(o=>o.category==='model'||o.id==='model');await client.call(setting?'session/set_config_option':'session/set_model',setting?{sessionId:session.sessionId,configId:setting.id,value:model}:{sessionId:session.sessionId,modelId:model});}
      client.onUpdate=params=>{if(params?.sessionId!==session.sessionId)return;const u=params.update;if(u?.sessionUpdate==='agent_message_chunk'&&u.content?.type==='text'){text+=u.content.text;if(Buffer.byteLength(text)>8*1024*1024)throw new Error('Antigravity 回复超过限制');queue.push(u.content.text);wake();}};
      yield{type:'block-start',index:0,blockType:'text'};
      const timeout=Number(antigravityValue(this.config,'antigravityTimeoutMs',180000));
      const completion=client.call('session/prompt',{sessionId:session.sessionId,prompt},Number.isFinite(timeout)&&timeout>=1000&&timeout<=1800000?timeout:180000).then(result=>{if(result?.stopReason!=='end_turn')throw new Error('Antigravity 回合未正常完成：'+result?.stopReason);if(!text.trim())throw new Error('Antigravity 回合结束但没有返回文本');if(isAntigravityNotice(text))throw new Error('Antigravity 需要官方验证或当前账号/地区不符合服务资格，请在官方 CLI 检查；尚未收到模型回复。');}).catch(e=>{error=e;}).finally(()=>{done=true;wake();});
      while(!done||queue.length){if(queue.length){queue.shift();}else await new Promise(resolve=>{waiter=resolve;});}
      await completion;if(error)throw error;yield{type:'text-delta',index:0,text};
      yield{type:'block-end',index:0,block:{type:'text',text}};yield{type:'finish',reason:{kind:'stop'}};
      this.connection={state:'ready',testedAt:Date.now()};
    }catch(e){this.connection={state:'error',error:e.message,testedAt:Date.now()};throw e;}
    finally{options.signal?.removeEventListener('abort',abort);if(run){run.client.close();this.active.delete(run.client);}}
  }
  async test(prompt='Reply with exactly OK. Do not use tools.'){
    let text='';for await(const event of this.stream({messages:[{role:'user',content:prompt}],model:String(antigravityValue(this.config,'antigravityModel'))||DEFAULT,signal:AbortSignal.timeout(60000)}))if(event.type==='block-end')text+=event.block.text;
    return{state:'ready',text,testedAt:Date.now()};
  }
  dispose(){this.disposed=true;for(const c of this.active)c.close();this.active.clear();}
}
