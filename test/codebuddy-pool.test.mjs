import test from 'node:test';
import assert from 'node:assert/strict';
import {readAccountPoolQuotas,readAccountPoolQuota} from '../lib/shared/codebuddy-pool.js';
import {supportedAccountVersion,probeAccountCompatibility} from '../lib/shared/codebuddy-compatibility.js';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {registerHooks} from 'node:module';
registerHooks({resolve(spec,ctx,next){if(spec==='@deepseek-ai/dsh-llm')return {url:'data:text/javascript,export class LlmAdapter{}',shortCircuit:true};return next(spec,ctx)}});

test('account pool reads every isolated profile without switching and keeps individual failures',async()=>{
 let active=0,max=0;const profiles=[];
 const accounts={snapshot:async()=>({selectedId:'b',accounts:[{id:'a',label:'A'},{id:'b',label:'B'}]}),profile:async(base,id)=>{profiles.push(id);return {...base,id}}};
 const readQuota=async(config,region)=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,5));active--;if(config.id==='a')throw new Error('A login missing');return {state:'available',region,remaining:config.id==='b'?9:0}};
 const result=await readAccountPoolQuotas(accounts,{fixed:true},'cn',{readQuota});assert.deepEqual(profiles,[null,'a','b']);assert.ok(max<=3);assert.equal(result.rows[0].remaining,0);assert.equal(result.rows[1].state,'error');assert.equal(result.rows[2].remaining,9);
 const one=await readAccountPoolQuota(accounts,{},'cn','a',{readQuota});assert.equal(one.id,'a');assert.match(one.error,/login/);
});
test('new stable CodeBuddy 2.x versions require the isolation flags; prereleases and other majors do not pass',async()=>{
 for(const version of ['2.174.0','2.175.1','2.178.0','2.181.0','2.200.3'])assert.equal(supportedAccountVersion(version),true);
 for(const version of ['2.173.9','3.0.0','2.181.0-beta.1','junk'])assert.equal(supportedAccountVersion(version),false);
 let calls=0;
 const invocation={command:'node.exe',args:['official.js']},env={HOME:'isolated'};
 const cli={version:'2.181.0'};
 const options={run:async(command,args,opts)=>{calls++;assert.equal(command,'node.exe');assert.deepEqual(args,['official.js','--help']);assert.equal(opts.env,env);return {stdout:'--tools --setting-sources --strict-mcp-config --mcp-config --no-session-persistence'}}};
 assert.equal((await probeAccountCompatibility(cli,invocation,env,options)).mode,'capability-checked');await probeAccountCompatibility(cli,invocation,env,options);assert.equal(calls,1);
 await assert.rejects(probeAccountCompatibility({version:'2.182.0'},invocation,env,{run:async()=>({stdout:'--tools'})}),/缺少/);
});
for(const region of ['cn','intl'])test(region+' account store accepts a newer capability-checked CLI while keeping its bound home',async()=>{
 const {createAccountStore}=await import('../lib/'+region+'/accounts.js');
 const directory=await mkdtemp(join(tmpdir(),'dkn-compat-'+region+'-'));let probed;
 const store=createAccountStore({directory,platform:'win32',resolveInvocation:async()=>({command:'C:\\official\\node.exe',args:['C:\\official\\node_modules\\@tencent-ai\\codebuddy-code\\bin\\codebuddy']}),probeCompatibility:async(cli,_invocation,env)=>{probed={cli,env}}});
 try{const account=await store.add('newer');const config=await store.profile({},account.id),auth=join(config.accountHome,'AppData','Local','CodeBuddyExtension','Data','Public','auth');await mkdir(auth,{recursive:true});await writeFile(join(auth,'fixture.info'),'fixture');await store.assertReady(config,async()=>({version:'2.181.0',path:'C:\\official\\codebuddy.cmd'}));assert.equal(probed.cli.version,'2.181.0');assert.equal(probed.env.HOME,config.accountHome);assert.equal((await store.snapshot()).selectedId,null)}finally{await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
});
