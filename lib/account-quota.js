export async function readDshAccountBalance(account,client){
  const result=await account.getBalance(client);
  if(result===null)return {state:'signed-out',source:'dsh-account',error:'DSH 当前尚未登录 DeepSeek 账号'};
  if(result?.status!=='ready')return {state:'error',source:'dsh-account',error:'DSH 账号余额查询失败，请稍后重试'};
  const rows=(values,kind)=>(values||[]).filter(row=>typeof row.currency==='string'&&typeof row.balance==='string'&&row.balance.trim()!==''&&Number.isFinite(Number(row.balance))).map(row=>({currency:row.currency,balance:row.balance,kind}));
  const wallets=[...rows(result.value,'充值'),...rows(result.bonusWallets,'赠金')];
  return {state:'available',source:'dsh-account',wallets};
}

export function projectStartPlanBalance({payload,responseTime}){
  const now=Number.isFinite(responseTime)?responseTime:Date.now()/1000;
  const inWindow=(value,end=false)=>value==null||value===0||(Number.isFinite(Number(value))&&(end?Number(value)>now:Number(value)<=now));
  const plans=payload.data.plans.filter(plan=>String(plan.status).toLowerCase()==='active'&&inWindow(plan.starts_at)&&inWindow(plan.ends_at,true));
  const balances=(payload.data.balances||[]).filter(row=>inWindow(row.period_start)&&inWindow(row.period_end,true)&&inWindow(row.effective_at)&&inWindow(row.expires_at,true)&&plans.some(plan=>(!row.user_plan_id||plan.user_plan_id===row.user_plan_id)&&(!row.plan_id||plan.plan_id===row.plan_id)&&(row.user_plan_id||row.plan_id)&&plan.entitlements?.some(grant=>grant.entitlement_id===row.entitlement_id)));
  // Current endpoint may grant models without a numeric credit counter.
  const numeric=value=>value!==null&&value!==''&&value!==undefined&&Number.isFinite(Number(value))?Number(value):undefined;
  const buckets=balances.flatMap(row=>{const remaining=numeric(row.remaining_units??row.available_units);if(remaining===undefined)return [];return [{label:row.show_name||'Start Plan',unit:row.unit_type==='token'?'Token':row.unit_type||'',remaining,...numeric(row.total_units)===undefined?{}:{total:numeric(row.total_units)}}]});
  return {state:'available',source:'zcode-start-plan',activePlans:plans.length,buckets,entitlements:balances.map(row=>({name:typeof row.show_name==='string'?row.show_name:'套餐权益',expiresAt:row.expires_at||row.period_end||null}))};
}
