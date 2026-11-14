import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createDecipheriv} from 'node:crypto';
import {execFile} from 'node:child_process';
import {dailyQoderCampaigns,projectQoderCheckin,rewardFailure} from './checkin.js';
import {qoderDesktopIdentityHeaders} from './qoder-desktop-identity.js';

// Only the verified Windows international desktop login. Never reads browser stores,
// refreshes tokens, invents device identities, or writes native authentication files.
export async function readQoderDesktopToken(){
  if(process.platform!=='win32')throw rewardFailure('CREDENTIAL_UNAVAILABLE');
  let key,clear;
  try{
    const dir=join(process.env.APPDATA||join(homedir(),'AppData','Roaming'),'com.qoder.app.stable');
    const encrypted=await readFile(join(dir,'auth.v1.dat'));
    if(encrypted.subarray(0,3).toString()!=='v10')throw Error();
    const local=JSON.parse(await readFile(join(dir,'Local State'),'utf8'));
    const wrapped=Buffer.from(local.os_crypt?.encrypted_key||'','base64');if(wrapped.subarray(0,5).toString()!=='DPAPI')throw Error();
    key=await new Promise((resolve,reject)=>{
      const script="Add-Type -AssemblyName System.Security;$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());[Console]::Write([Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser')))";
      const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:65536},(error,stdout)=>error?reject(Error()):resolve(Buffer.from(stdout.trim(),'base64')));
      child.stdin.on('error',()=>{});child.stdin.end(wrapped.subarray(5).toString('base64'));
    });
    const decipher=createDecipheriv('aes-256-gcm',key,encrypted.subarray(3,15));decipher.setAuthTag(encrypted.subarray(-16));
    clear=Buffer.concat([decipher.update(encrypted.subarray(15,-16)),decipher.final()]);
    const auth=JSON.parse(clear.toString());if(typeof auth.token!=='string'||!auth.token||auth.token.length>32768)throw Error();
    return auth.token;
  }catch{throw rewardFailure('CREDENTIAL_UNAVAILABLE')}finally{key?.fill(0);clear?.fill(0)}
}
const pending=new Map();
export async function qoderCheckin({claim=false,fetchImpl=fetch,readToken=readQoderDesktopToken,readIdentity=qoderDesktopIdentityHeaders,desktopPath=''}={}){
  const token=await readToken();if(!token)throw rewardFailure('LOGIN_REQUIRED');
  const headers={Authorization:'Bearer '+token,Accept:'application/json','Cosy-ClientType':'10','User-Agent':'Qoder'};
  const root='https://openapi.qoder.sh/sash/api/v1/me/campaigns';
  const call=async(url,mutation=false)=>{
    let response;try{response=await fetchImpl(url,{method:mutation?'POST':'GET',headers,...mutation?{body:'{}',headers:{...headers,'Content-Type':'application/json'}}:{},redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw rewardFailure(mutation?'CLAIM_UNCERTAIN':'QUERY_FAILED')}
    if(response.status===401)throw rewardFailure('AUTH_REQUIRED');
    if(mutation&&response.status>=500)throw rewardFailure('CLAIM_UNCERTAIN');
    if(!response.ok)throw rewardFailure(mutation?'CLAIM_REJECTED':'QUERY_FAILED');
    const body=await response.json().catch(()=>null);if(!body)throw rewardFailure(mutation?'CLAIM_UNCERTAIN':'QUERY_FAILED');return body;
  };
  const read=()=>call(root+'?clientType=10');
  // A successful minimal response can silently hide daily rewards. Always use the
  // real installed desktop identity before interpreting or claiming campaigns.
  const initial=await read();
  Object.assign(headers,await readIdentity({uid:initial.uid,desktopPath}));
  if(!claim)return projectQoderCheckin(await read());
  if(pending.has(token))return pending.get(token);
  const work=(async()=>{
    const body=await read(),before=projectQoderCheckin(body);if(before.state!=='claimable')return before;
    const campaign=dailyQoderCampaigns(body)[0];
    if(typeof campaign.campaignId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(campaign.campaignId))throw rewardFailure('QUERY_FAILED');
    const receipt=await call(root+'/'+encodeURIComponent(campaign.campaignId)+'/claim',true);
    if(receipt.success===false||receipt.code!==undefined&&receipt.code!==0&&receipt.code!==200)throw rewardFailure('CLAIM_REJECTED');
    try{return {...projectQoderCheckin(await read()),mutationAccepted:true}}catch{return {state:'unknown',mutationAccepted:true,message:'官方已接受领取，请刷新状态核对',checkedAt:Date.now()}}
  })();pending.set(token,work);try{return await work}finally{pending.delete(token)}
}
