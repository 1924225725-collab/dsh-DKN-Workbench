import test from 'node:test';
import assert from 'node:assert/strict';
import {nextRewardReset,projectBuddyCheckin,projectQoderCheckin,rewardError} from '../lib/checkin.js';
import {qoderCheckin} from '../lib/qoder-checkin.js';
import {codebuddyCheckin} from '../lib/shared/codebuddy-checkin.js';

const daily=status=>({campaignId:'daily-fixture',actionType:'CLAIM_BENEFIT',claimStatus:status,placements:[{title:'Claim 100 Credits Daily'}]});
const response=value=>({ok:true,status:200,json:async()=>value});
test('daily status uses the right reset window and does not confuse gifts or absent campaigns with a claimed daily reward',()=>{
  const before=Date.parse('2026-11-14T01:59:59Z'),reset=Date.parse('2026-11-14T02:00:00Z');
  assert.equal(nextRewardReset(before),reset);assert.equal(nextRewardReset(reset),reset+86400000);
  assert.equal(projectBuddyCheckin({code:0,data:{today_checked_in:false,active:true}},before).state,'claimable');
  assert.equal(projectBuddyCheckin({code:0,data:{active:true}},before).state,'unavailable');
  assert.equal(projectBuddyCheckin({code:0,data:{today_checked_in:false,active:false}}).state,'no-activity');
  assert.equal(projectQoderCheckin({campaigns:[{...daily('CLAIMED'),placements:[{title:'Ultimate Trial Pack'}]}]}).state,'no-activity');
  assert.equal(projectQoderCheckin({campaigns:[daily('CLAIMED')]}).state,'claimed');
  assert.equal(projectQoderCheckin({campaigns:[daily('NOT_ELIGIBLE')]}).state,'not-eligible');
  assert.throws(()=>projectQoderCheckin({campaigns:[daily('CLAIMABLE'),daily('CLAIMED')]}),/不唯一/);
});
test('Qoder only claims the explicitly identified daily campaign, coalesces clicks and never refreshes tokens',async()=>{
  let claimed=false,posts=0;const urls=[];
  const options={claim:true,readToken:async()=> 'fixture-only-token',fetchImpl:async(url,request)=>{
    urls.push(url);assert.equal(request.redirect,'error');assert.equal(request.headers.Authorization,'Bearer fixture-only-token');
    if(request.method==='POST'){posts++;assert.ok(url.endsWith('/daily-fixture/claim'));await new Promise(r=>setTimeout(r,5));claimed=true;return response({success:true})}
    return response({campaigns:[daily(claimed?'CLAIMED':'CLAIMABLE'),{...daily('CLAIMABLE'),campaignId:'other-gift',placements:[{title:'Ultimate Trial Pack'}]}]});
  }};
  const values=await Promise.all([qoderCheckin(options),qoderCheckin(options)]);assert.equal(posts,1);assert.ok(values.every(value=>value.state==='claimed'));assert.ok(urls.every(url=>url.startsWith('https://openapi.qoder.sh/sash/api/v1/me/campaigns')));
  assert.equal(JSON.stringify(values).includes('fixture-only-token'),false);
  await qoderCheckin(options);assert.equal(posts,1,'already claimed is not sent again');
});
test('queries never claim; failed mutations are uncertain without retry and rejected eligibility stays visible',async()=>{
  let posts=0;
  const options={readToken:async()=> 'fixture-readonly',fetchImpl:async(_url,request)=>{if(request.method==='POST'){posts++;throw Error('network raw secret')}return response({campaigns:[daily('CLAIMABLE')]})}};
  assert.equal((await qoderCheckin(options)).state,'claimable');assert.equal(posts,0);
  await assert.rejects(qoderCheckin({...options,claim:true}),error=>error.code==='CLAIM_UNCERTAIN');assert.equal(posts,1);
  await assert.rejects(qoderCheckin({...options,claim:true,fetchImpl:async(_url,request)=>request.method==='GET'?response({campaigns:[daily('CLAIMABLE')]}):{ok:false,status:403}}),error=>error.code==='CLAIM_REJECTED');
  assert.equal(JSON.stringify(rewardError(Error('Bearer sensitive'))).includes('sensitive'),false);
});
test('CodeBuddy status and explicit claim keep the account and coalesce mutations',async()=>{
  // Uses a synthetic local auth fixture, never a real credential.
  const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {tmpdir}=await import('node:os');
  const root=await mkdtemp(join(tmpdir(),'dkn-checkin-'));
  const auth=join(root,'AppData','Local','CodeBuddyExtension','Data','Public','auth');
  const token='fixture.'+Buffer.from(JSON.stringify({iss:'https://www.codebuddy.cn',sub:'fixture',exp:Date.now()/1000+3600})).toString('base64url')+'.signature';
  try{
    await mkdir(auth,{recursive:true});await writeFile(join(auth,'Tencent-Cloud.coding-copilot.info'),JSON.stringify({auth:{accessToken:token}}));
    let claimed=false,posts=0;const options={fetchImpl:async(url,request)=>{assert.equal(request.headers.Authorization,'Bearer '+token);assert.ok(url.startsWith('https://www.codebuddy.cn/'));if(url.endsWith('/daily-checkin')){posts++;await new Promise(r=>setTimeout(r,5));claimed=true;return response({code:0})}return response({code:0,data:{today_checked_in:claimed,active:true,daily_credit:100}})}};
    assert.equal((await codebuddyCheckin({accountHome:root},options)).state,'claimable');assert.equal(posts,0);
    const values=await Promise.all([codebuddyCheckin({accountHome:root},{...options,claim:true}),codebuddyCheckin({accountHome:root},{...options,claim:true})]);assert.equal(posts,1);assert.ok(values.every(value=>value.state==='claimed'));
  }finally{await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
});
