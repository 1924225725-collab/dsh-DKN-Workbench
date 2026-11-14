import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {readDshAccountBalance,projectStartPlanBalance} from '../lib/account-quota.js';
import {projectCodebuddyQuota,readCodebuddyQuota} from '../lib/shared/codebuddy-quota.js';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readQoderQuota} from '../lib/qoder-quota.js';
import {CodexService} from '../lib/codex-service.js';

test('native DSH balance keeps recharge and bonus decimals and never projects private fields',async()=>{
 const value=await readDshAccountBalance({async getBalance(client){assert.equal(client.version,'test');return {status:'ready',value:[{currency:'CNY',balance:'123.456789',token:'secret'}],bonusWallets:[{currency:'CNY',balance:'0'}],token:'secret'}}},{version:'test'});
 assert.deepEqual(value,{state:'available',source:'dsh-account',wallets:[{currency:'CNY',balance:'123.456789',kind:'充值'},{currency:'CNY',balance:'0',kind:'赠金'}]});
 assert.equal((await readDshAccountBalance({getBalance:async()=>null},{})).state,'signed-out');
 assert.equal((await readDshAccountBalance({getBalance:async()=>({status:'failed'})},{})).state,'error');
});
test('quota queries use native account without API key lookup and coalesce account probes',async()=>{
 const service=new CodexService({dataDirectory:'unused'});let native=0,probes=0;
 service.ctx={get(){throw new Error('API credentials should not be read')}};
 service.readAccountBalance=async()=>{native++;return {state:'available',source:'dsh-account',wallets:[]}};
 service.readQoderQuota=async()=>{probes++;throw new Error('Qoder offline')};
 const [a,b]=await Promise.all([service.quota(),service.quota()]);assert.equal(a,b);assert.equal(native,1);assert.equal(probes,1);assert.equal(a.deepseek.state,'available');assert.equal(a.qoder.state,'error');
 await service.quota(true);assert.equal(native,2);
});
test('Start Plan counts only active owner-matched current balances without inventing remaining quota',()=>{
 const value=projectStartPlanBalance({responseTime:100,payload:{data:{plans:[{plan_id:'p',status:'active',entitlements:[{entitlement_id:'e'}]}],balances:[{plan_id:'p',entitlement_id:'e',show_name:'GLM',total_units:100,remaining_units:40,unit_type:'token'},{plan_id:'other',entitlement_id:'e',remaining_units:9000},{plan_id:'p',entitlement_id:'e',period_end:50,remaining_units:500},{plan_id:'p',entitlement_id:'e',show_name:'No numeric counter'}]}}});
 assert.equal(value.buckets.length,1);assert.equal(value.buckets[0].remaining,40);assert.equal(value.entitlements.length,2);
 assert.equal(projectStartPlanBalance({payload:{data:{plans:[],balances:[]}}}).activePlans,0);
});
test('CodeBuddy uses current cycle remaining, precise counters and excludes expired packages',()=>{
 const now=1800000000000;
 const result=projectCodebuddyQuota({code:0,data:{Response:{Data:{Accounts:[{PackageName:'Recurring',CycleEndTime:(now+86400000)/1000,DeductionEndTime:(now+86400000*30)/1000,CycleCapacityRemainPrecise:'13.25',CycleCapacitySizePrecise:'100',CapacityRemain:999},{PackageName:'Expired',DeductionEndTime:(now-1000)/1000,CapacityRemain:999},{PackageName:'No counter',CapacitySize:100},{PackageName:'Zero',DeductionEndTime:(now+86400000)/1000,CapacityRemain:0,CapacitySize:100}]}}}},'cn',now);
 assert.equal(result.remaining,13.25);assert.equal(result.buckets.length,2);assert.equal(result.buckets[1].remaining,0);
 assert.throws(()=>projectCodebuddyQuota({code:0,data:{}},'cn'),/未返回/);
});
test('CodeBuddy quota respects isolated account home, region and logout without refreshing tokens',{skip:process.platform!=='win32'},async()=>{
 const home=await mkdtemp(join(tmpdir(),'dkn-quota-account-')),directory=join(home,'AppData','Local','CodeBuddyExtension','Data','Public','auth');
 await mkdir(directory,{recursive:true});const path=join(directory,'Tencent-Cloud.coding-copilot.info');
 const token='header.'+Buffer.from(JSON.stringify({iss:'https://www.codebuddy.cn/realm',sub:'fixture-user',exp:Date.now()/1000+3600})).toString('base64url')+'.signature';
 await writeFile(path,JSON.stringify({auth:{accessToken:token,refreshToken:'must-not-use'},account:{uid:'fixture-user'}}));let calls=0;
 const options={fetchImpl:async(url,request)=>{calls++;assert.equal(url,'https://www.codebuddy.cn/v2/billing/meter/get-user-resource');assert.equal(request.headers.Authorization,'Bearer '+token);assert.equal(request.redirect,'error');return {ok:true,json:async()=>({code:0,data:{Response:{Data:{Accounts:[{CapacityRemain:10,CapacitySize:100}]}}}})}}};
 try{
  const value=await readCodebuddyQuota({accountHome:home},'cn',options);assert.equal(value.remaining,10);assert.doesNotMatch(JSON.stringify(value),/fixture-user|signature|must-not-use/);
  await assert.rejects(readCodebuddyQuota({accountHome:home},'intl',options),/不属于国际版/);assert.equal(calls,1);
  await writeFile(path+'.logged-out','');await assert.rejects(readCodebuddyQuota({accountHome:home},'cn',options),/已登出/);assert.equal(calls,1);
 }finally{await rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
});
test('Qoder account-only daemon sends no prompt or session and closes after projecting quota',async()=>{
 const methods=[];let child;
 const value=await readQoderQuota('fixture.exe',{spawnImpl:(_command,args,options)=>{
  assert.deepEqual(args,['--sdk']);assert.equal(options.windowsHide,true);
  child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.killed=true};
  child.stdin=new Writable({write(chunk,_encoding,done){const m=JSON.parse(String(chunk));methods.push(m.request.type);const response=m.request_id==='init'?{capabilities:['multi_session_v2','daemon_queries_v1']}:{usage:{userId:'private',token:'secret',userQuota:{remaining:23,total:100,used:77,unit:'credits'}}};queueMicrotask(()=>child.stdout.write(JSON.stringify({type:'control_response',response:{subtype:'success',request_id:m.request_id,response}})+'\n'));done()}});return child;
 }});
 assert.deepEqual(methods,['daemon.initialize','daemon.get_usage_info']);assert.equal(child.killed,true);assert.equal(value.buckets[0].remaining,23);assert.doesNotMatch(JSON.stringify(value),/private|secret/);
});
