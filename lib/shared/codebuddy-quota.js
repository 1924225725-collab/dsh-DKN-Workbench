import {readFile,stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';

const cache=new Map();
export function clearCodebuddyQuotaCache(){cache.clear()}
const number=value=>value!==null&&value!==''&&value!==undefined&&Number.isFinite(Number(value))?Number(value):undefined;
const timestamp=value=>{if(value===undefined||value===null||value==='')return NaN;const n=Number(value);if(Number.isFinite(n))return n<1e12?n*1000:n;const text=String(value).replace(' ','T');return Date.parse(/[Zz]$|[+-]\d\d:\d\d$/.test(text)?text:text+'+08:00')};
export function projectCodebuddyQuota(body,region,now=Date.now()){
  const accounts=body?.data?.Response?.Data?.Accounts;
  if(body?.code!==0||!Array.isArray(accounts))throw new Error('CodeBuddy 未返回可识别的积分包');
  const buckets=[];
  for(const row of accounts){
    const cycle=timestamp(row.CycleEndTime),end=timestamp(row.DeductionEndTime);
    const recurring=Number.isFinite(cycle)&&Number.isFinite(end)&&end-cycle>2*86400000;
    const expiry=recurring?cycle:end;
    if(Number.isFinite(expiry)&&expiry<=now)continue;
    const prefix=recurring?'CycleCapacity':'Capacity';
    const remaining=number(row[prefix+'RemainPrecise'])??number(row[prefix+'Remain']);
    if(remaining===undefined)continue;
    const total=number(row[prefix+'SizePrecise'])??number(row[prefix+'Size']);
    const used=number(row[prefix+'UsedPrecise'])??number(row[prefix+'Used']);
    buckets.push({label:(region==='cn'?'国内版':'国际版')+' · '+String(row.PackageName||row.SubProductName||'积分包'),unit:'积分',remaining,...total===undefined?{}:{total},...used===undefined?{}:{used}});
  }
  return {state:'available',source:'codebuddy-account',region,buckets,remaining:Math.round(buckets.reduce((sum,row)=>sum+row.remaining,0)*100)/100};
}

export async function codebuddyAccountRequest(config={},region='cn'){
  const home=config.accountHome||homedir();
  const base=process.platform==='win32'?(config.accountHome?join(home,'AppData','Local'):process.env.LOCALAPPDATA||join(home,'AppData','Local')):process.platform==='darwin'?join(home,'Library','Application Support'):process.env.XDG_DATA_HOME||join(home,'.local','share');
  const path=join(base,'CodeBuddyExtension','Data','Public','auth','Tencent-Cloud.coding-copilot.info');
  try{await stat(path+'.logged-out');throw new Error('CodeBuddy CLI 已登出，请在配置页重新登录')}catch(error){if(error.code!=='ENOENT')throw error}
  let session;try{session=JSON.parse(await readFile(path,'utf8'))}catch{throw new Error('未找到当前 CodeBuddy CLI 登录，请先在配置页完成登录')}
  const token=session.auth?.accessToken;
  if(typeof token!=='string'||token.length>32768)throw new Error('当前 CLI 凭据格式暂不支持，请通过官方 CLI 登录后重试');
  let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString())}catch{throw new Error('CodeBuddy 登录凭据无效')}
  let issuer;try{issuer=new URL(claims.iss).hostname}catch{throw new Error('无法识别 CodeBuddy 登录区域')}
  const allowed=region==='cn'?['www.codebuddy.cn','www.workbuddy.cn','copilot.tencent.com']:['www.codebuddy.ai','www.workbuddy.ai'];
  if(!allowed.includes(issuer))throw new Error('当前 CLI 登录账号不属于'+(region==='cn'?'国内版':'国际版'));
  if(typeof claims.exp==='number'&&claims.exp*1000<=Date.now())throw new Error('CodeBuddy 登录已过期，请在官方 CLI 中重新登录');
  const host=region==='cn'?'www.codebuddy.cn':'www.codebuddy.ai';
  const headers={'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+token,'X-User-Id':String(session.account?.uid||claims.sub||''),'X-Domain':host,'X-Product':'SaaS'};
  if(session.account?.enterpriseId){headers['X-Enterprise-Id']=String(session.account.enterpriseId);headers['X-Tenant-Id']=String(session.account.enterpriseId)}
  return {path,token,host,headers};
}

export async function readCodebuddyQuota(config={},region='cn',{fetchImpl=fetch,refresh=false}={}){
  const {path,token,host,headers}=await codebuddyAccountRequest(config,region);
  const cacheKey=region+':'+path+':'+token;
  const hit=cache.get(cacheKey);if(!refresh&&hit&&Date.now()-hit.at<30000)return hit.value;
  const response=await fetchImpl('https://'+host+'/v2/billing/meter/get-user-resource',{method:'POST',headers,body:'{}',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('CodeBuddy 账号积分查询失败（HTTP '+response.status+'），请检查 CLI 登录');
  const value=projectCodebuddyQuota(await response.json(),region);
  cache.clear();cache.set(cacheKey,{at:Date.now(),value});
  return value;
}
