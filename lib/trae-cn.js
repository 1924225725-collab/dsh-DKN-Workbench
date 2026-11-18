import {readFileSync,statSync} from 'node:fs';
import {join,dirname,resolve,extname} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {LlmAdapter,resolveRetryPolicy} from './zcode/dsh-llm-compat.js';
import {decryptStorageValue} from './trae/decrypt.js';
import {refreshModels,streamChat,deleteSession,resetAccountCaches} from './trae/upstream.js';
import {qoderPromptText} from './qoder-acp.js';
export const traeProvider='trae-cn';
const value=(config,key,fallback='')=>{const v=config[key];return(typeof v?.get==='function'?v.get():v)??fallback;};
let registryRoot,registryAt=0;
export function traeInstallRoot(config={}){
  let explicit=String(value(config,'traeInstallPath')).trim();if(explicit)return extname(explicit).toLowerCase()==='.exe'?dirname(resolve(explicit)):resolve(explicit);
  if(process.platform==='win32'&&Date.now()-registryAt>60000){registryAt=Date.now();try{registryRoot=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*' -ErrorAction SilentlyContinue | Where-Object DisplayName -eq 'TRAE CN (User)' | Select-Object -First 1 -ExpandProperty InstallLocation"],{encoding:'utf8',windowsHide:true,timeout:5000}).trim();}catch{registryRoot='';}}
  return registryRoot||join(process.env.LOCALAPPDATA||homedir(),'Programs','Trae CN');
}
export function readTraeAuth(config={}){
  const base=String(value(config,'traeDataDir')).trim()||join(process.env.APPDATA||join(homedir(),'.config'),'Trae CN');
  const path=base.endsWith('storage.json')?resolve(base):join(resolve(base),'User','globalStorage','storage.json');
  let auth;try{const stored=JSON.parse(readFileSync(path,'utf8'))['iCubeAuthInfo://icube.cloudide'];if(typeof stored!=='string')throw Error();auth=JSON.parse(stored.trim().startsWith('{')?stored:decryptStorageValue(stored));}catch{throw Error('未找到有效的 TRAE CN 登录态；请打开国内版桌面客户端完成登录。');}
  if(typeof auth.token!=='string'||!auth.token||auth.host&&new URL(auth.host).hostname!=='api.trae.cn')throw Error('请使用 TRAE 国内个人版账号登录。');
  const expiry=Date.parse(auth.expiredAt);if(Number.isFinite(expiry)&&expiry<=Date.now())throw Error('TRAE CN 登录已过期，请在官方客户端重新登录。');
  return{token:auth.token,deviceId:typeof auth.deviceId==='string'?auth.deviceId:'',fingerprint:createHash('sha256').update(auth.token).digest('hex'),path};
}
export function traeEndpoints(config={}){
  const root=traeInstallRoot(config);let product;try{product=JSON.parse(readFileSync(join(root,'resources','app','product.json'),'utf8'));}catch{}
  if(product&&product.packageType!=='TRAE_CN')throw Error('所选安装目录不是 TRAE 国内版。');
  const host=product?.bootConfig?.remote?.trae?.normal||'https://trae-api-cn.mchost.guru';
  const u=new URL(host);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!['trae-api-cn.mchost.guru','api.trae.cn'].includes(u.hostname))throw Error('TRAE 国内上游地址未验证，已停止发送登录凭据。');
  return{remoteBase:u.origin+'/api/remote/v1',webOrigin:'https://solo.trae.cn'};
}
export function traeQuotaProjection(payload){
  const data=payload?.data||payload,summary=data?.usage_summary,total=summary?.total_amount,consumed=summary?.consumed_amount;
  if(typeof total!=='number'||!Number.isFinite(total)||typeof consumed!=='number'||!Number.isFinite(consumed))throw Error('TRAE 未返回有效余额。');
  const remaining=Math.max(0,total-consumed);return{state:'available',source:'trae-cn-account',buckets:[{label:'可用积分',remaining,total,unit:'积分'}],remaining,consumed};
}
async function accountRequest(config,path,{signal,body={},fingerprint}={}){
  const auth=readTraeAuth(config);if(fingerprint&&fingerprint!==auth.fingerprint)throw Error('TRAE 账号已切换，请重新操作。');
  const response=await fetch('https://api.trae.cn'+path,{method:'POST',redirect:'error',signal:signal||AbortSignal.timeout(20000),headers:{Authorization:'Cloud-IDE-JWT '+auth.token,'Content-Type':'application/json','X-User-Region':'CN',...(auth.deviceId?{'x-device-id':auth.deviceId}:{})},body:JSON.stringify(body)});
  if(!response.ok)throw Error('TRAE 账号请求失败（HTTP '+response.status+'），请检查官方客户端登录。');
  const result=await response.json();if(result.code!==undefined&&result.code!==0)throw Error('TRAE 账号接口拒绝请求（'+result.code+'）。');return result.data||result;
}
export async function readTraeQuota(config={}){try{return traeQuotaProjection(await accountRequest(config,'/trae/api/v2/pay/ide_user_ent_usage',{body:{require_usage:true,req_source:1}}))}catch{return{state:'error',error:'TRAE 额度未读取，请检查国内版登录状态。'}}}
const claims=new Map();
export async function traeCheckin(config={},options={}){
  let auth;try{auth=readTraeAuth(config)}catch{return{state:'login-required',message:'请先在 TRAE 国内版登录。'}}
  const query=async()=>{const d=await accountRequest(config,'/trae/api/v2/ug/checkin_credits/status',{fingerprint:auth.fingerprint});if(typeof d.checked_in!=='boolean'||typeof d.enable!=='boolean')return{state:'unknown',message:'签到状态尚未识别。'};return{state:d.checked_in?'claimed':d.enable?'claimable':'no-activity',amount:Number.isFinite(d.credits)?d.credits:undefined};};
  if(!options.claim){try{return await query()}catch{return{state:'error',message:'TRAE 签到状态查询失败。'}}}
  if(claims.has(auth.fingerprint))return claims.get(auth.fingerprint);
  const pending=(async()=>{try{const before=await query();if(before.state!=='claimable')return before;if(!auth.deviceId)return{state:'client-required',message:'官方登录态缺少设备标识，请先在 TRAE 客户端签到。'};await accountRequest(config,'/trae/api/v2/ug/checkin_credits/claim',{fingerprint:auth.fingerprint});const after=await query();return after.state==='claimed'?{...after,mutationAccepted:true}:{state:'unknown',message:'领取请求已发出，请刷新核对；不会自动重试。'};}catch{return{state:'unknown',message:'领取结果未确认，请在官方客户端核对；不会自动重试。'}}finally{claims.delete(auth.fingerprint)}})();claims.set(auth.fingerprint,pending);return pending;
}
export class TraeCnAdapter extends LlmAdapter{
  constructor(ctx,config){super();this.ctx=ctx;this.config=config;this.catalog=[];this.fingerprint='';this.active=new Set();this.connection=null;}
  enabled(){return String(value(this.config,'traeEnabled','true'))!=='false';}
  providerInfo(id){return{id,name:'TRAE CN（国内个人版）'};}
  providerRetryPolicy(){return resolveRetryPolicy({mode:'normal',maxRetries:0},'trae-cn.retryPolicy');}
  imageRequestPricing(){} imageRequestTarget(){}
  async prepareCall(provider,model){return{model:await this.resolveModel(provider,model),stream:options=>this.stream(options)}}
  auth(){const auth=readTraeAuth(this.config);const key=JSON.stringify([value(this.config,'traeInstallPath'),value(this.config,'traeDataDir'),this.enabled()]);if(auth.fingerprint!==this.fingerprint||key!==this.authConfigKey){for(const controller of this.active)controller.abort();resetAccountCaches();this.catalog=[];this.connection=null;this.fingerprint=auth.fingerprint;this.authConfigKey=key;}return auth;}
  async probe(){try{const auth=this.auth();const models=await refreshModels(auth.token,AbortSignal.timeout(15000),'cn',traeEndpoints(this.config));this.catalog=models.filter(m=>!m.locked);this.fetchedAt=Date.now();return this.inspect(false);}catch{this.catalog=[];this.connection={state:'error',error:'TRAE 登录或模型目录不可用'};throw Error('TRAE 登录或模型目录不可用，请检查国内版登录和网络。');}}
  info(provider,m){return{provider,id:m.id,name:m.name+(m.traeRate!==undefined?' · ×'+m.traeRate:''),inputModalities:['text'],context:{contextWindow:m.contextWindow||200000},...(m.traeEfforts?.length?{reasoning:{efforts:m.traeEfforts.map(id=>({id,name:({light:'轻量',high:'深入',extra_high:'极高'})[id]||id}))}}:{})};}
  async listModels(provider){if(!this.enabled())return[];try{this.auth();if(!this.catalog.length||Date.now()-this.fetchedAt>300000)await this.probe();return this.catalog.map(m=>this.info(provider,m))}catch{return[]}}
  async resolveModel(provider,id){const models=await this.listModels(provider),found=models.find(m=>m.id===id);if(!found)throw Error('TRAE 当前账号没有返回此可用模型，请检测登录与模型。');return found;}
  async inspect(read=true){let auth;try{auth=this.auth()}catch(e){return{state:'missing',enabled:this.enabled(),error:e.message,connection:this.connection,models:[]}}const installPath=traeInstallRoot(this.config);return{state:'found',enabled:this.enabled(),installPath,desktopFound:!!statSync(join(installPath,'resources','app','product.json'),{throwIfNoEntry:false}),dataPath:auth.path,loginFound:true,connection:this.connection,models:this.catalog.map(m=>this.info(traeProvider,m))};}
  async *stream(options){
    if(!this.enabled())throw Error('TRAE CN 已关闭');await this.resolveModel(traeProvider,options.model);const fingerprint=this.fingerprint;const auth=this.auth();if(fingerprint!==auth.fingerprint)throw Error('TRAE 账号已切换，请重试。');let prompt;try{prompt=qoderPromptText(options.messages||[])}catch{throw Error('TRAE 当前仅支持文本历史；请移除图片、文件或不支持的内容。');}const endpoints=traeEndpoints(this.config);const controller=new AbortController();this.active.add(controller);const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(Math.max(1000,Math.min(900000,Number(value(this.config,'traeTimeoutMs',180000))||180000))),...(options.signal?[options.signal]:[])]);
    let text='',sessionId,done=false,usage;
    try{yield{type:'block-start',index:0,blockType:'text'};
      for await(const event of streamChat(auth.token,options.model,[{role:'user',content:prompt}],signal,{reasoningEffort:options.reasoningEffort,endpoints},'cn')){
        if(event.type==='session')sessionId=event.sessionId;
        if(event.type==='text'){text+=event.text;if(text.length>4*1024*1024)throw Error('TRAE 输出超过限制');yield{type:'text-delta',index:0,text:event.text}}
        if(event.type==='usage'&&Number.isSafeInteger(event.input)&&Number.isSafeInteger(event.output)&&event.input>=0&&event.output>=0)usage={inputTokens:event.input,outputTokens:event.output};
        if(event.type==='done')done=true;
      }
      if(!done||!text.trim())throw Error('TRAE 未返回完整模型文本。');yield{type:'block-end',index:0,block:{type:'text',text}};if(usage)yield{type:'usage',usage};yield{type:'finish',reason:{kind:'stop'}};this.connection={state:'ready',testedAt:Date.now()};
    }catch(e){this.connection={state:'error',testedAt:Date.now()};if(signal.aborted)throw Error('TRAE 请求已取消或超时。');throw Error('TRAE 模型请求失败，请检查账号、额度或稍后重试。');}
    finally{this.active.delete(controller);if(sessionId)await deleteSession(auth.token,sessionId,'cn',endpoints);}
  }
  async test(prompt='Reply with exactly OK. Do not use tools.'){const models=await this.listModels(traeProvider);const id=String(value(this.config,'traeModel')).trim()||models.find(m=>m.id==='deepseek-v4.1-flash')?.id||models[0]?.id;if(!id)throw Error('TRAE 没有可用模型');let text='';for await(const chunk of this.stream({provider:traeProvider,model:id,sessionId:randomUUID(),messages:[{role:'user',content:[{type:'text',text:prompt}]}],tools:[]}))if(chunk.type==='block-end')text=chunk.block.text;return{state:'ready',model:id,text};}
  dispose(){for(const controller of this.active)controller.abort();this.active.clear();}
}
