import {createServer} from 'node:http';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,mkdtemp,rm} from 'node:fs/promises';
import {join,dirname,basename,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';

const PROVIDERS=new Set(['codebuddy-cli-cn','codebuddy-cli-intl','codex-cli','qoder-acp','zcode-cli']);
const defaults=()=>({port:18789,autoStart:false,models:[],concurrency:1,timeoutMs:90000,keyHash:'',keyHint:'',keyCreatedAt:null});
const digest=value=>createHash('sha256').update(value).digest('hex');
function fail(message,status=400,code='invalid_request_error'){return Object.assign(new Error(message),{status,code,apiExportFault:true});}
function errorView(error){
  if(error?.apiExportFault===true)return{status:error.status,code:error.code,message:error.message};
  const text=String(error?.code||'')+' '+String(error?.message||'');
  if(/timeout|超时/i.test(text))return{status:504,code:'upstream_timeout',message:'模型请求超时，请检查提供方连接。'};
  if(/abort|cancel|停止|取消/i.test(text))return{status:499,code:'request_cancelled',message:'请求已取消。'};
  if(/balance|quota|额度|积分|resource package/i.test(text))return{status:402,code:'upstream_quota',message:'模型账号额度不足，请在提供方配置页查看。'};
  if(/rate.limit|too many|限流/i.test(text))return{status:429,code:'upstream_rate_limit',message:'模型平台限流，请稍后重试。'};
  if(/auth|login|credential|登录/i.test(text))return{status:502,code:'upstream_auth',message:'模型账号需要重新登录，请在提供方配置页处理。'};
  return{status:502,code:'upstream_error',message:'上游模型调用失败，请在提供方配置页检查连接。'};
}
async function abortable(promise,signal){
  signal.throwIfAborted();let abort;
  try{return await Promise.race([promise,new Promise((_,reject)=>{abort=()=>reject(signal.reason||fail('请求已取消',499,'request_cancelled'));signal.addEventListener('abort',abort,{once:true});})]);}
  finally{signal.removeEventListener('abort',abort);}
}
export function validateApiRequest(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('请求必须是 JSON 对象。');
  const allowed=new Set(['model','messages','stream','n','tools','tool_choice','stream_options']);
  for(const key of Object.keys(input))if(!allowed.has(key))throw fail('首版不支持参数：'+key,400,'unsupported_parameter');
  if(typeof input.model!=='string'||input.model.length>1000)throw fail('请选择有效的 model。');
  if(input.stream!==undefined&&typeof input.stream!=='boolean')throw fail('stream 必须为布尔值。');
  if(input.n!==undefined&&input.n!==1)throw fail('首版仅支持 n=1。');
  if(input.tools!==undefined&&(!Array.isArray(input.tools)||input.tools.length))throw fail('首版 API 仅支持文本，不支持工具调用。',400,'unsupported_tools');
  if(input.tool_choice!==undefined&&input.tool_choice!=='none')throw fail('首版不支持 tool_choice。');
  if(input.stream_options!==undefined){const value=input.stream_options;if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='include_usage')||value.include_usage!==false)throw fail('首版不提供精确 usage，请省略 stream_options。');}
  if(!Array.isArray(input.messages)||!input.messages.length||input.messages.length>128)throw fail('messages 需要包含 1–128 条文本消息。');
  const messages=input.messages.map(message=>{
    if(!message||typeof message!=='object'||!['system','user','assistant'].includes(message.role)||Object.keys(message).some(k=>!['role','content'].includes(k)))throw fail('仅支持 system/user/assistant 文本消息。');
    let content=message.content;
    if(Array.isArray(content)){if(content.some(b=>!b||b.type!=='text'||typeof b.text!=='string'||Object.keys(b).some(k=>!['type','text'].includes(k))))throw fail('首版不支持图片或文件内容。');content=content.map(b=>b.text).join('\n');}
    if(typeof content!=='string')throw fail('消息 content 必须是文本。');
    return{role:message.role,content:[{type:'text',text:content}]};
  });
  if(messages.at(-1).role!=='user'||!messages.at(-1).content[0].text.trim())throw fail('最后一条消息必须是非空 user 文本。');
  return{model:input.model,messages,stream:input.stream===true};
}

export class ApiExportService{
  constructor({directory,llm,allowEphemeral=false}){
    this.directory=directory;this.llm=llm;this.allowEphemeral=allowEphemeral;this.config=defaults();this.catalog=[];this.verified=new Map();this.controllers=new Set();this.records=[];this.active=0;this.waiters=[];this.server=null;this.closed=false;this.lastError='';this.controls=Promise.resolve();this.ready=this.initialize();
  }
  async initialize(){
    try{const saved=JSON.parse(await readFile(join(this.directory,'settings.json'),'utf8'));this.config={...defaults(),...this.validateSettings(saved),keyHash:/^[a-f0-9]{64}$/.test(saved.keyHash)?saved.keyHash:'',keyHint:typeof saved.keyHint==='string'?saved.keyHint.slice(0,24):'',keyCreatedAt:saved.keyCreatedAt||null};}
    catch(e){if(e.code!=='ENOENT')this.lastError='API 设置读取失败，服务未自动启动。';return;}
    if(this.config.autoStart&&!this.closed)try{await this.refreshModels();await this.startNow();}catch(e){this.lastError=errorView(e).message;}
  }
  validateSettings(input){
    const next={};
    for(const key of ['port','concurrency','timeoutMs'])if(key in input){const value=input[key],min=key==='port'?(this.allowEphemeral?0:1024):key==='concurrency'?1:1000,max=key==='port'?65535:key==='concurrency'?4:300000;if(!Number.isInteger(value)||value<min||value>max)throw fail('无效的 API 配置：'+key);next[key]=value;}
    if('autoStart'in input){if(typeof input.autoStart!=='boolean')throw fail('autoStart 必须为布尔值。');next.autoStart=input.autoStart;}
    if('models'in input){if(!Array.isArray(input.models)||input.models.length>300||input.models.some(v=>typeof v!=='string'||v.length>1000))throw fail('模型白名单无效。');next.models=[...new Set(input.models)];}
    return next;
  }
  async persist(){await mkdir(this.directory,{recursive:true});const target=join(this.directory,'settings.json'),temp=target+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(this.config,null,2),{mode:0o600});await rename(temp,target);}
  verifiedModel(id){return Date.now()-(this.verified.get(id)||0)<30*60*1000;}
  enabledModels(){return this.catalog.filter(row=>this.config.models.includes(row.id)&&(row.provider!=='zcode-cli'||this.verifiedModel(row.id)));}
  snapshot(){return{running:!!this.server,baseUrl:'http://127.0.0.1:'+(this.server?.address()?.port||this.config.port)+'/v1',...Object.fromEntries(['port','autoStart','models','concurrency','timeoutMs','keyHint','keyCreatedAt'].map(key=>[key,this.config[key]])),hasKey:!!this.config.keyHash,active:this.active,queued:this.waiters.length,lastError:this.lastError,catalog:this.catalog.map(row=>({...row,verified:this.verifiedModel(row.id),requiresVerification:row.provider==='zcode-cli'})),enabledCount:this.enabledModels().length,records:this.records.slice(-20).reverse()};}
  async refreshModels(){
    const providers=(this.llm.listProviders?.()||[]).filter(p=>PROVIDERS.has(p.id));const found=[];
    await Promise.all(providers.map(async p=>{let timer;try{const models=await Promise.race([this.llm.listModels(p.id),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),6000);})]);for(const model of models)if(typeof model.id==='string'&&model.id){found.push({id:p.id+'/'+model.id,provider:p.id,model:model.id,name:String(model.name||model.id),providerName:String(p.name||p.id),streaming:p.id==='codex-cli'||p.id.startsWith('codebuddy-')?'buffered':'adapter'});}}catch{}finally{clearTimeout(timer);}}));
    this.catalog=found.sort((a,b)=>a.id.localeCompare(b.id));return this.snapshot();
  }
  async control(action,input={}){
    const work=this.controls.then(async()=>{await this.ready;if(this.closed)throw fail('API 服务已卸载。',409);
      if(action==='refresh')return this.refreshModels();
      if(action==='save'){const next=this.validateSettings(input);if(this.server&&next.port!==undefined&&next.port!==this.config.port)throw fail('修改端口前请先停止 API 服务。',409);if(next.models){const known=new Set(this.catalog.map(m=>m.id));if(next.models.some(id=>!known.has(id)))throw fail('所选模型不在当前提供方目录中，请重新读取模型。');}
        const previous=this.config;this.config={...previous,...next};try{await this.persist();}catch(e){this.config=previous;throw e;}if(next.models)for(const item of this.controllers)if(!next.models.includes(item.model))item.controller.abort(fail('模型已停止导出。',499,'request_cancelled'));return this.snapshot();}
      if(action==='rotate'){const secret='dkn_'+randomBytes(32).toString('base64url'),previous=this.config;this.config={...previous,keyHash:digest(secret),keyHint:secret.slice(0,8)+'…'+secret.slice(-4),keyCreatedAt:Date.now()};try{await this.persist();}catch(e){this.config=previous;throw e;}this.cancelAll('API 密钥已更换。');return{...this.snapshot(),secret};}
      if(action==='start'){await this.refreshModels();await this.startNow();return this.snapshot();}
      if(action==='stop'){await this.stop();return this.snapshot();}
      throw fail('未知的 API 操作。');
    });this.controls=work.catch(()=>{});return work;
  }
  async startNow(){
    if(this.server)return;if(!this.config.keyHash)throw fail('请先生成 API Key。');if(!this.enabledModels().length)throw fail('请先选择可导出的模型；ZCode 需要先验证。');
    const server=createServer((req,res)=>{void this.handle(req,res).catch(()=>{res.destroy();});});server.requestTimeout=15000;server.headersTimeout=10000;
    try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(this.config.port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});server.on('error',()=>{this.lastError='API 监听异常，请停止后重新启动。';});this.server=server;this.lastError='';}
    catch(e){server.close();this.lastError=e.code==='EADDRINUSE'?'端口已被占用，请更换端口。':'无法启动 API 监听。';throw fail(this.lastError,409,'listen_error');}
  }
  cancelAll(reason){for(const item of this.controllers)item.controller.abort(fail(reason,499,'request_cancelled'));}
  async stop(){this.cancelAll('API 服务已停止。');const server=this.server;this.server=null;if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
  async close(){this.closed=true;await this.ready;await this.controls;await this.stop();}
  async acquire(signal){
    signal.throwIfAborted();let queued=false;if(this.active>=this.config.concurrency){if(this.waiters.length>=8)throw fail('请求队列已满，请稍后重试。',429,'queue_full');queued=true;await new Promise((resolve,reject)=>{const waiter={resolve:()=>{signal.removeEventListener('abort',abort);resolve();}};const abort=()=>{this.waiters=this.waiters.filter(v=>v!==waiter);reject(signal.reason);};this.waiters.push(waiter);signal.addEventListener('abort',abort,{once:true});});}if(signal.aborted){if(queued)this.releaseSlot();signal.throwIfAborted();}if(!queued)this.active++;
    let released=false;return()=>{if(released)return;released=true;this.releaseSlot();};
  }
  releaseSlot(){this.active--;if(this.waiters.length&&this.active<this.config.concurrency){this.active++;this.waiters.shift().resolve();}}
  async run(model,messages,signal,onText){
    const release=await this.acquire(signal);let iterator,cwd;
    try{
      cwd=await mkdtemp(join(tmpdir(),'dkn-api-'));signal.throwIfAborted();
      // A synthetic identity only: never attach API calls to an existing project/session.
      const sessionId='dkn-api-'+randomUUID();
      const source=this.llm.stream({provider:model.provider,model:model.model,messages,tools:[],signal,sessionId,purpose:'dkn-api-export',apiExportCwd:cwd});iterator=source[Symbol.asyncIterator]();
      let text='',completed=false;const blocks=new Map();
      for(;;){const item=await abortable(iterator.next(),signal);if(item.done)break;const event=item.value;
        const index=event.index??0;let delta='';
        if(event.type==='text-delta'&&typeof event.text==='string'){delta=event.text;blocks.set(index,(blocks.get(index)||'')+delta);}
        if(event.type==='block-end'&&event.block?.type==='text'){const final=event.block.text||'',partial=blocks.get(index)||'';delta=final.startsWith(partial)?final.slice(partial.length):'';blocks.set(index,final);}
        if(delta){text+=delta;if(Buffer.byteLength(text)>1024*1024)throw fail('模型输出超过限制。',502,'output_limit');await onText?.(delta);}
        if(event.type==='block-end'&&event.block?.type==='tool-call')throw fail('此 API 不执行工具调用。',502,'unsupported_tools');
        if(event.type==='finish'){if(event.reason?.kind!=='stop')throw Error(event.reason?.failure?.code||event.reason?.failure?.message||'upstream_error');completed=true;}
      }
      if(!completed||!text.trim())throw fail('模型没有返回完整文本。',502,'empty_response');return text;
    }finally{
      if(iterator?.return){let timer;try{await Promise.race([Promise.resolve(iterator.return()).catch(()=>{}),new Promise(r=>{timer=setTimeout(r,2000);})]);}finally{clearTimeout(timer);}}
      if(cwd&&dirname(resolve(cwd))===resolve(tmpdir())&&basename(cwd).startsWith('dkn-api-'))await rm(cwd,{recursive:true,force:true}).catch(()=>{});
      release();
    }
  }
  async verify(id){
    await this.ready;const model=this.catalog.find(m=>m.id===id);if(!model)throw fail('请先读取模型目录。');const controller=new AbortController(),entry={controller,model:id};this.controllers.add(entry);const timer=setTimeout(()=>controller.abort(fail('连接验证超时。',504,'upstream_timeout')),this.config.timeoutMs);
    try{const reply=await this.run(model,[{role:'user',content:[{type:'text',text:'Reply with exactly OK. Do not use any tools or access any files.'}]}],controller.signal);this.verified.set(id,Date.now());return{state:'ready',model:id,reply:reply.slice(0,200)};}catch(e){this.verified.delete(id);const view=errorView(e);throw fail(view.message,view.status,view.code);}finally{clearTimeout(timer);this.controllers.delete(entry);}
  }
  async handle(req,res){
    const json=(status,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    let releaseController,timer,heartbeat,started=Date.now(),modelId;
    try{
      const host=new URL('http://'+req.headers.host);if(!['127.0.0.1','localhost'].includes(host.hostname)||req.headers.origin)throw fail('API 仅接受本机非浏览器跨域请求。',403,'forbidden');
      const key=req.headers.authorization?.match(/^Bearer (dkn_[A-Za-z0-9_-]{43})$/)?.[1];if(!key||!this.config.keyHash||!timingSafeEqual(Buffer.from(digest(key)),Buffer.from(this.config.keyHash)))throw fail('API Key 无效。',401,'authentication_error');
      const path=new URL(req.url,'http://127.0.0.1').pathname;
      if(req.method==='GET'&&path==='/v1/models')return json(200,{object:'list',data:this.enabledModels().map(m=>({id:m.id,object:'model',created:0,owned_by:m.provider}))});
      if(req.method!=='POST'||path!=='/v1/chat/completions')throw fail('接口不存在。',404,'not_found');
      if(req.headers['content-type']?.split(';')[0]!=='application/json')throw fail('需要 application/json。',415);
      const chunks=[];let size=0;for await(const data of req){size+=data.length;if(size>128*1024)throw fail('请求体超过 128 KB。',413,'request_too_large');chunks.push(data);}let input;try{input=validateApiRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){if(e.status)throw e;throw fail('JSON 格式无效。');}
      const model=this.enabledModels().find(m=>m.id===input.model);if(!model)throw fail('模型未启用导出或尚未验证。',404,'model_not_found');modelId=model.id;
      const controller=new AbortController(),entry={controller,model:model.id};this.controllers.add(entry);releaseController=()=>this.controllers.delete(entry);
      const abort=()=>{if(!res.writableEnded)controller.abort(fail('客户端已断开。',499,'request_cancelled'));};res.once('close',abort);timer=setTimeout(()=>controller.abort(fail('模型请求超时。',504,'upstream_timeout')),this.config.timeoutMs);
      const id='chatcmpl-'+randomUUID(),created=Math.floor(Date.now()/1000),packet=(delta,finish_reason=null)=>({id,object:'chat.completion.chunk',created,model:model.id,choices:[{index:0,delta,finish_reason}]});
      const emit=async value=>{controller.signal.throwIfAborted();if(!res.write('data: '+JSON.stringify(value)+'\n\n'))await once(res,'drain',{signal:controller.signal});};
      let streamStarted=false;
      const onText=input.stream?async text=>{if(!streamStarted){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'});streamStarted=true;await emit(packet({role:'assistant'}));heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},15000);}await emit(packet({content:text}));}:undefined;
      const text=await this.run(model,input.messages,controller.signal,onText);
      if(input.stream){await emit(packet({},'stop'));res.end('data: [DONE]\n\n');}else json(200,{id,object:'chat.completion',created,model:model.id,choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}]});
      this.lastError='';this.records.push({time:started,model:model.id,status:'success',elapsedMs:Date.now()-started});
    }catch(e){const view=errorView(e);if(modelId){this.lastError=view.message;this.records.push({time:started,model:modelId,status:view.code,elapsedMs:Date.now()-started});}if(!res.destroyed){if(res.headersSent)res.end('data: '+JSON.stringify({error:{message:view.message,type:view.code,code:view.code}})+'\n\ndata: [DONE]\n\n');else json(view.status,{error:{message:view.message,type:view.code,code:view.code}});}}
    finally{clearTimeout(timer);clearInterval(heartbeat);releaseController?.();this.records=this.records.slice(-20);}
  }
}
