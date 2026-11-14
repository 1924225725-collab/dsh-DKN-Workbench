// Explicit user-triggered rewards only. Never schedules claims or retries mutations.
export function nextRewardReset(now=Date.now(),hour=10){
  const offset=8*3600000,day=86400000;let next=Math.floor((now+offset)/day)*day+hour*3600000-offset;
  if(next<=now)next+=day;return next;
}
export function projectBuddyCheckin(body,now=Date.now()){
  if(body?.code!==0||!body.data||typeof body.data!=='object')throw Error('签到状态响应无法识别');
  const data=body.data;
  const claimed=data.today_checked_in??data.checked_in;
  const state=data.active===false?'no-activity':claimed===true?'claimed':claimed===false?'claimable':'unavailable';
  return {state,label:'每日签到',resetAt:nextRewardReset(now,0),checkedAt:now,
    ...(Number.isFinite(data.daily_credit)?{amount:data.daily_credit}:{}),...(Number.isFinite(data.streak_days)?{streakDays:data.streak_days}:{})};
}
function campaignTexts(node){
  const texts=[];function walk(value,depth=0){if(!value||typeof value!=='object'||depth>8||texts.length>32)return;for(const [key,item] of Object.entries(value)){if(typeof item==='string'&&/^(title|subtitle|text|label|description|headline|buttonText)$/.test(key))texts.push(item.slice(0,300));else if(item&&typeof item==='object')walk(item,depth+1)}}walk(node);return texts;
}
export function dailyQoderCampaigns(body){
  if(!Array.isArray(body?.campaigns))throw Error('Qoder 活动列表响应无法识别');
  return body.campaigns.filter(row=>row.actionType==='CLAIM_BENEFIT'&&campaignTexts(row.placements).some(text=>/每天领\s*100\s*Credits|Claim\s+100\s+Credits\s+Daily|每日.*100.*Credits/i.test(text)));
}
export function projectQoderCheckin(body,now=Date.now()){
  const rows=dailyQoderCampaigns(body);if(rows.length>1)throw Error('每日活动匹配不唯一，请在 Qoder 客户端查看');
  const row=rows[0],map={CLAIMABLE:'claimable',CLAIMED:'claimed',NOT_ELIGIBLE:'not-eligible',EXPIRED:'expired',NOT_STARTED:'not-started'};
  return {state:row?map[row.claimStatus]||'unavailable':'no-activity',label:'每日 100 Credits',amount:100,resetAt:nextRewardReset(now),checkedAt:now};
}
export function rewardError(error){
  const map={LOGIN_REQUIRED:'请先登录对应的官方客户端',CREDENTIAL_UNAVAILABLE:'无法读取对应客户端登录态，请检查安装和登录',QUERY_FAILED:'查询失败，请检查网络或登录状态',AUTH_REQUIRED:'登录已过期，请在官方客户端重新登录',CLAIM_UNCERTAIN:'领取结果不确定，请刷新状态后核对，系统不会自动重试',CLAIM_REJECTED:'官方拒绝领取，请到客户端检查资格或完成验证'};
  return {state:error?.code==='CLAIM_UNCERTAIN'?'unknown':error?.code==='AUTH_REQUIRED'||error?.code==='LOGIN_REQUIRED'?'login-required':'error',message:map[error?.code]||'签到服务暂不可用，请检查对应客户端',checkedAt:Date.now()};
}
export const rewardFailure=code=>Object.assign(Error(code),{code});
