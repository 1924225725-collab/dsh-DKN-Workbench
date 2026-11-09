import {EmbeddedHub} from './hub/service.js';
import z from '@deepseek-ai/schemastery';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {CodexService} from './codex-service.js';
import {CodexNativeAdapter,codexNativeProvider} from './codex-native-adapter.js';
import {ensureDshSidebarPatch} from './dsh-sidebar-patcher.js';
import {CodexCliAdapter,codexCliProvider,inspectCodexCli,runCodexCliPrompt} from './codex-cli-adapter.js';
import {apply as applyZcode, resolveOptions as resolveZcode, ZcodeAppServerAdapter} from './zcode/index.js';
import {statSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export const name='dkn-agent-codex';
export const inject=['webServer','llm','agents','sessionController','credentials'];
export const Config=z.object({codexPath:z.string().description('Codex 可执行文件；留空自动发现本机版本。').default('').volatile(),codexCliPath:z.string().description('可选：Codex CLI 可执行文件；留空使用 codexPath 或自动发现。').default('').volatile(),codexCliModel:z.string().description('可选：Codex CLI 默认模型 ID。').default('').volatile(),codexCliModels:z.string().description('可选：Codex CLI 模型列表，使用逗号或换行分隔。').default('').volatile(),codexCliTimeoutMs:z.string().description('Codex CLI 单次调用超时（毫秒）。').default('180000').volatile(),codexCliCwd:z.string().description('Codex CLI 默认工作目录；留空跟随当前 DSH 会话目录。').default('').volatile(),codexCliReasoningEffort:z.string().description('Codex CLI 默认推理强度；留空跟随模型默认值。').default('').volatile(),zcodeEnabled:z.string().description('是否启用 ZCode CLI 模型提供方。').default('true').volatile(),zcodeCliPath:z.string().description('ZCode CLI 的 zcode.cjs 路径；留空自动发现。').default('').volatile(),zcodeCliNode:z.string().description('运行 ZCode CLI 的 Node 可执行文件。').default('node').volatile(),zcodeAccountMode:z.string().description('ZCode 账号通道：standalone 或 start-plan。').default('standalone').volatile(),zcodeCliModels:z.string().description('可选固定模型清单 JSON；留空跟随 ZCode CLI 账号清单。').default('').volatile(),zcodeCliTimeoutMs:z.string().description('ZCode 单次回合超时（毫秒）。').default('900000').volatile(),zcodeCliCwd:z.string().description('ZCode app-server 工作目录；留空使用独立临时工作区。').default('').volatile(),zcodeDataBaseDir:z.string().description('ZCode 数据目录；留空使用原生目录。').default('').volatile(),zcodeAuthorizationPolicy:z.string().description('ZCode 工具权限策略，默认 deny。').default('deny').volatile(),zcodeAppServerTimeoutMs:z.string().description('ZCode app-server 请求超时（毫秒）。').default('120000').volatile(),deepSeekApiKeyEnv:z.string().description('DeepSeek API Key 所在环境变量名，不保存或显示 API Key。').default('DEEPSEEK_API_KEY').volatile(),showCodeBuddyQuota:z.string().description('是否显示 CodeBuddy 用量入口。').default('true').volatile(),showDeepSeekQuota:z.string().description('是否显示 DeepSeek 余额入口。').default('true').volatile(),showCodexQuota:z.string().description('是否显示 Codex 用量入口。').default('true').volatile(),claudePath:z.string().description('可选：官方 Claude Code CLI 可执行文件；留空从 PATH 查找。不管理账号。').default('').volatile(),codexHome:z.string().description('可选 Codex 数据目录；留空由官方运行时使用原生目录。不复制认证。').default('').volatile()});
export function trustedRequest(req,mutation=false){
  let host;try{host=new URL('http://'+req.headers.host);}catch{return false;}if(!['127.0.0.1','localhost','[::1]'].includes(host.hostname))return false;
  const origin=req.headers.origin;if(req.headers['sec-fetch-site']==='cross-site'&&origin!=='dsh-app://app')return false;if(origin&&origin!=='dsh-app://app'){try{const u=new URL(origin);if(!['http:','https:'].includes(u.protocol)||u.host.toLowerCase()!==host.host.toLowerCase())return false;}catch{return false;}}
  if(mutation&&(req.headers['x-dkn-action']!=='1'||req.headers['content-type']?.split(';')[0]!=='application/json'))return false;return true;
}
export async function readJson(req,maximum=3*1024*1024){const parts=[];let size=0;for await(const part of req){const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);size+=chunk.length;if(size>maximum)throw new Error('请求过大');parts.push(chunk);}const value=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('请求格式错误');return value;}

function json(res,code,value){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
function parseZcodeModels(value){if(Array.isArray(value))return value;if(typeof value!=='string'||!value.trim())return[];try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return[];}}
function zcodeOptions(config){
  const value=key=>typeof config[key]?.get==='function'?config[key].get():config[key];
  return {
    enabled:String(value('zcodeEnabled')??'true')==='true',
    zcodeCliPath:value('zcodeCliPath'), zcodeCliNode:value('zcodeCliNode'),
    accountMode:value('zcodeAccountMode'), cliCwd:value('zcodeCliCwd'),
    zcodeDataBaseDir:value('zcodeDataBaseDir'), authorizationPolicy:value('zcodeAuthorizationPolicy'),
    cliModels:parseZcodeModels(value('zcodeCliModels')),
    zcodeCliTimeoutMs:Number(value('zcodeCliTimeoutMs'))||900000,
    appServerTimeoutMs:Number(value('zcodeAppServerTimeoutMs'))||120000,
    communityRetry:{enabled:false},
  };
}

async function testZcode(config){
  const options=resolveZcode({...zcodeOptions(config),authorizationPolicy:'deny'});
  if(!options.zcodeCliPath||!statSync(options.zcodeCliPath,{throwIfNoEntry:false})?.isFile()){
    throw new Error('未找到 ZCode CLI，请安装或检查配置路径。');
  }
  const adapter=new ZcodeAppServerAdapter({options:()=>options});
  try{
    const [model]=await adapter.readCatalog();
    if(!model)throw new Error('ZCode 没有返回可用模型，请在终端运行 zcode login 并完成登录。');
    let reply='';
    for await(const chunk of adapter.stream({provider:'zcode-cli',model:model.modelId,sessionId:randomUUID(),messages:[{role:'user',content:[{type:'text',text:'Reply with exactly OK. Do not use any tools.'}]}],tools:[],signal:AbortSignal.timeout(60000)})){
      if(chunk.type==='block-end'&&chunk.block.type==='text')reply+=chunk.block.text;
      if(chunk.type==='finish'&&chunk.reason.kind!=='stop')throw new Error(chunk.reason.failure?.message||'ZCode 测试回合失败');
    }
    if(!reply.trim())throw new Error('ZCode 已结束，但没有返回文本。');
    return {state:'ready',model:model.modelId,text:reply};
  }finally{adapter.dispose();}
}

function zcodeConnectionKey(options){
  return JSON.stringify([options.zcodeCliPath,options.zcodeCliNode,options.accountMode,options.zcodeDataBaseDir,options.cliCwd]);
}
export function createHandler(service){return async(req,res)=>{
  if(!trustedRequest(req,req.method!=='GET'))return json(res,403,{error:'来源不可信'});
  const url=new URL(req.url,'http://localhost');
  try{
    if(url.pathname.includes('/hub/')){const hub=service.getHub?.();if(!hub)return json(res,503,{error:'协作模块尚未加载'});const route=url.pathname.split('/hub/')[1];if(req.method==='GET'&&route==='state')return json(res,200,await hub.snapshot());if(req.method==='GET'&&route==='export')return json(res,200,await hub.exportBackup());if(req.method==='GET'&&route==='receipt')return json(res,200,await hub.receipt(url.searchParams.get('id')));if(req.method==='GET'&&route==='sessions')return json(res,200,await hub.sessions(url.searchParams.get('software'),url.searchParams.get('cursor')||undefined,url.searchParams.get('query')||undefined));if(req.method==='GET'&&route==='models')return json(res,200,await hub.models(url.searchParams.get('software')));if(req.method==='GET'&&route==='files')return json(res,200,await hub.files(url.searchParams.get('projectId')));if(req.method==='GET'&&route==='preview')return json(res,200,await hub.preview(url.searchParams.get('projectId'),url.searchParams.get('path')));if(req.method==='POST'&&route==='action')return json(res,200,await hub.action(await readJson(req,32*1024*1024)));return json(res,404,{error:'协作接口不存在'});}
    if(req.method==='GET'&&url.pathname.endsWith('/state'))return json(res,200,service.snapshot());
    if(req.method==='GET'&&url.pathname.endsWith('/cli/status')){try{return json(res,200,{state:'ready',...await inspectCodexCli(service.options),connection:service.codexConnection});}catch(error){return json(res,200,{state:'error',error:error.message,checkedAt:Date.now()});}}
    if(req.method==='GET'&&url.pathname.endsWith('/zcode/status')){
      const options=resolveZcode(zcodeOptions(service.options));
      const path=options.zcodeCliPath;
      const found=path&&statSync(path,{throwIfNoEntry:false})?.isFile();
      const registered=service.ctx?.llm?.listProviders?.().some(provider=>provider.id==='zcode-cli')??null;
      const last=service.zcodeConnection;
      const connection=last?.key===zcodeConnectionKey(options)?last.result:undefined;
      return json(res,200,{state:found?'found':'missing',path,enabled:options.enabled,registered,connection,checkedAt:Date.now()});
    }
    if(req.method==='POST'&&url.pathname.endsWith('/zcode/test')){
      await readJson(req,4096);
      const key=zcodeConnectionKey(resolveZcode(zcodeOptions(service.options)));
      try{
        const result=await testZcode(service.options);
        service.zcodeConnection={key,result:{state:'ready',model:result.model,testedAt:Date.now()}};
        return json(res,200,result);
      }catch(error){
        service.zcodeConnection={key,result:{state:'error',testedAt:Date.now()}};
        throw error;
      }
    }
    if(req.method==='POST'&&url.pathname.endsWith('/cli/test')){
      const input=await readJson(req,16*1024);
      const prompt=typeof input.prompt==='string'&&input.prompt.trim()?input.prompt.trim():'Reply with OK.';
      try{
        const result=await runCodexCliPrompt(service.options,prompt);
        service.codexConnection={state:'ready',testedAt:Date.now()};
        return json(res,200,{state:'ready',...result});
      }catch(error){
        service.codexConnection={state:'error',testedAt:Date.now()};
        throw error;
      }
    }
    if(req.method==='GET'&&url.pathname.endsWith('/quota'))return json(res,200,await service.quota());
    if(req.method==='GET'&&url.pathname.endsWith('/catalog')){const input=Object.fromEntries(url.searchParams);if(input.projectId==='null')input.projectId=null;if(input.sectionId==='null')input.sectionId=null;input.archived=input.archived==='true';return json(res,200,await service.catalog(input));}
    if(req.method==='GET'&&url.pathname.endsWith('/history'))return json(res,200,await service.history(Object.fromEntries(url.searchParams)));
    if(req.method==='GET'&&url.pathname.endsWith('/file')){const file=await service.file(Object.fromEntries(url.searchParams));res.writeHead(200,{'Content-Type':file.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`${file.inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`});return res.end(file.data);}
    if(req.method==='POST'&&url.pathname.endsWith('/connect')){const input=await readJson(req);if(input.disconnect){await service.runtime?.close();service.runtime=null;service.ctx?.emit('llm/adapters-updated');return json(res,200,service.snapshot());}const result=await service.connect();service.ctx?.emit('llm/adapters-updated');return json(res,200,result);}
    if(req.method==='POST'&&url.pathname.endsWith('/native/import'))return json(res,200,await service.importNativeThread((await readJson(req)).threadId));
    if(req.method==='POST'&&url.pathname.endsWith('/action'))return json(res,200,await service.operate(await readJson(req)));
    return json(res,404,{error:'接口不存在'});
  }catch(error){return json(res,error.submissionUncertain?409:400,{error:error.message,code:error.code,submissionUncertain:error.submissionUncertain===true});}
};}
export function apply(ctx,config){
  const service=new CodexService({...config,dataDirectory:join(process.env.LOCALAPPDATA||join(homedir(),'.local','state'),'dsh-dkn-agent')});
  service.ctx=ctx;let hub;service.getHub=()=>hub??=new EmbeddedHub(ctx,service,join(service.directory,'hub'));
  void ensureDshSidebarPatch().then(result=>service.setSidebarPatch(result)).catch(error=>service.setSidebarPatch({status:'failed',reason:error.message}));
  const releaseAdapter=ctx.llm?.registerAdapter?.([codexNativeProvider],new CodexNativeAdapter(ctx,service))||(()=>{});
  const releaseCliAdapter=ctx.llm?.registerAdapter?.([codexCliProvider],new CodexCliAdapter(ctx,config))||(()=>{});
  applyZcode(ctx,zcodeOptions(config));
  const handler=createHandler(service),releases=[];for(const route of ['state','quota','cli/status','cli/test','zcode/status','zcode/test','catalog','history','file','connect','action','native/import','hub/state','hub/export','hub/receipt','hub/sessions','hub/models','hub/action','hub/files','hub/preview'])releases.push(ctx.webServer.register({kind:'exact',path:'/plugins/dkn-agent/'+route,handler}));
  ctx.effect(()=>async()=>{releaseCliAdapter();releaseAdapter();for(const release of releases.reverse())release();await hub?.close();await service.close();},'dkn-agent: native Codex');
}
