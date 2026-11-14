import {codebuddyAccountRequest,clearCodebuddyQuotaCache} from './codebuddy-quota.js';
import {projectBuddyCheckin,rewardFailure} from '../checkin.js';
const pending=new Map();
export async function codebuddyCheckin(config,{claim=false,fetchImpl=fetch}={}){
  const request=await codebuddyAccountRequest(config,'cn');
  const call=async(path,mutation=false)=>{
    let response;try{response=await fetchImpl('https://www.codebuddy.cn/v2/billing/meter/'+path,{method:'POST',headers:request.headers,body:'{}',redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw rewardFailure(mutation?'CLAIM_UNCERTAIN':'QUERY_FAILED')}
    if(response.status===401)throw rewardFailure('AUTH_REQUIRED');
    const body=await response.json().catch(()=>null);
    if(mutation&&(!body||response.status>=500))throw rewardFailure('CLAIM_UNCERTAIN');
    if(mutation&&body?.code===10001)return body; // Re-read status; never infer success from an error alone.
    if(!response.ok||!body||body.code!==0)throw rewardFailure(mutation?'CLAIM_REJECTED':'QUERY_FAILED');
    return body;
  };
  const read=async()=>projectBuddyCheckin(await call('checkin-activity-status'));
  if(!claim)return read();
  // Include credential identity internally so a changed login cannot inherit a pending claim.
  const key=request.path+':'+request.token;
  if(pending.has(key))return pending.get(key);
  const work=(async()=>{
    const before=await read();if(before.state!=='claimable')return before;
    await call('daily-checkin',true);
    clearCodebuddyQuotaCache();
    try{return {...await read(),mutationAccepted:true}}catch{return {state:'unknown',mutationAccepted:true,message:'官方已接受签到，请刷新状态核对',checkedAt:Date.now()}}
  })();pending.set(key,work);try{return await work}finally{pending.delete(key)}
}
