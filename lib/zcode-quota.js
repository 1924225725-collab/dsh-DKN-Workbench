import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {credentialsPath,readCredentials} from './zcode/credentials.js';
import {resolveBuiltinRuntime} from './zcode/zcode-runtime.js';
import {fetchStartPlanBalance} from './zcode/start-plan.js';
import {projectStartPlanBalance} from './account-quota.js';

export async function readZcodeQuota(options,{fetchImpl=fetch}={}){
  const root=options.zcodeDataBaseDir;
  if(options.accountMode!=='start-plan'){
    const credentials=readCredentials(root);
    if(credentials['oauth:active_provider']==='bigmodel'){
      const tokens=[];
      try{const config=JSON.parse(await readFile(join(dirname(credentialsPath(root)),'config.json'),'utf8'));for(const [id,provider] of Object.entries(config.provider||{})){const token=provider?.options?.apiKey;if(id.includes('coding-plan')&&provider.enabled!==false&&typeof token==='string'&&!token.startsWith('enc:'))tokens.push(token)}}catch{}
      tokens.push(credentials['oauth:bigmodel:access_token'],credentials.zcodejwttoken);
      for(const token of [...new Set(tokens.filter(token=>typeof token==='string'&&token.length>20))]){
        try{
          const response=await fetchImpl('https://open.bigmodel.cn/api/monitor/usage/quota/limit',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(6000)});
          if(!response.ok)continue;
          const body=await response.json();
          if(body.success===false||body.code!==undefined&&body.code!==0&&body.code!==200)continue;
          if(!Array.isArray(body.data?.limits)||!body.data.limits.length)continue;
          const numeric=value=>value!==null&&value!==''&&value!==undefined&&Number.isFinite(Number(value))?Number(value):undefined;
          const buckets=body.data.limits.map(row=>({label:row.type==='TOKENS_LIMIT'?'Coding Plan 提示次数':row.type==='TIME_LIMIT'?'Coding Plan 使用时长':String(row.type||'Coding Plan'),unit:row.type==='TOKENS_LIMIT'?'次':row.type==='TIME_LIMIT'?'分钟':'',remaining:numeric(row.remaining),used:numeric(row.currentValue),total:numeric(row.usage)})).map(row=>({...row,remaining:row.remaining??(row.total!==undefined&&row.used!==undefined?Math.max(0,row.total-row.used):undefined)})).filter(row=>row.remaining!==undefined);
          if(buckets.length)return {state:'available',source:'zcode-coding-plan',buckets};
        }catch{}
      }
    }
  }
  return projectStartPlanBalance(await fetchStartPlanBalance(resolveBuiltinRuntime(root,options.zcodeCliPath),root,fetchImpl));
}
