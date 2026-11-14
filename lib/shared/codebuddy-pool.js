import {readCodebuddyQuota} from './codebuddy-quota.js';

export async function readAccountPoolQuota(accounts,base,region,id,{readQuota=readCodebuddyQuota,refresh=false}={}){
  try{return {id,...await readQuota(await accounts.profile(base,id),region,{refresh})}}
  catch(error){return {id,state:'error',error:error.message}}
}

export async function readAccountPoolQuotas(accounts,base,region,{readQuota=readCodebuddyQuota,refresh=false}={}){
  const snapshot=await accounts.snapshot();
  if(snapshot.storageError)return {rows:[],error:'账号列表暂不可读取'};
  const queue=[{id:null,label:'默认 CLI 登录'},...snapshot.accounts];
  const rows=new Array(queue.length);let next=0;
  await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{
    while(next<queue.length){const index=next++,account=queue[index];
      try{const config=await accounts.profile(base,account.id);const value=await readQuota(config,region,{refresh});rows[index]={id:account.id,label:account.label,...value}}
      catch(error){rows[index]={id:account.id,label:account.label,state:'error',error:error.message}}
    }
  }));
  return {rows,checkedAt:Date.now()};
}
