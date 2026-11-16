import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validNode,inspectNode,findBackgroundNode,backgroundDeploymentPrompt} from '../lib/background-node.js';
import {BackgroundManager} from '../lib/background-manager.js';

test('standalone Node version checks and Electron host discovery use a real independent binary',async()=>{
 for(const version of ['24.9.0','24.21.0','25.0.0'])assert.equal(validNode(version),true);
 for(const version of ['22.20.0','24.8.9','24.x.0',''])assert.equal(validNode(version),false);
 const found=await findBackgroundNode(tmpdir(),{electron:true,hostExecPath:join(tmpdir(),'DSH.exe'),candidates:[process.execPath]});assert.equal(found.state,'ready');assert.equal(found.path,process.execPath);assert.ok(validNode(found.version));
 const missing=await findBackgroundNode(tmpdir(),{electron:true,hostExecPath:process.execPath,candidates:[process.execPath]});assert.equal(missing.state,'missing');assert.equal(await inspectNode(join(tmpdir(),'not-installed.exe')),null);
});

test('missing runtime returns persisted API configuration and meaningful reward state without spawning or exposing key hashes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dkn-env-missing-'));await mkdir(join(root,'api-export'));const original=JSON.stringify({port:18798,publicModel:'my-dkn',models:['codex-cli/test'],concurrency:2,timeoutMs:30000,keyHash:'a'.repeat(64),keyHint:'synthetic-hint'});await writeFile(join(root,'api-export','settings.json'),original);
 const manager=new BackgroundManager({directory:root,readConfig:()=>({main:{},providers:{},zcode:{}}),nodeOptions:{electron:true,candidates:[]}});
 try{
  const state=await manager.call('api/state');assert.equal(state.port,18798);assert.equal(state.publicModel,'my-dkn');assert.equal(state.hasKey,true);assert.equal(state.runtimeUnavailable,true);assert.deepEqual(state.models,['codex-cli/test']);assert.equal(JSON.stringify(state).includes('a'.repeat(64)),false);assert.equal(state.keyHash,undefined);
  const reward=await manager.call('checkin/manual',{provider:'codebuddy'});assert.equal(reward.state,'background-required');assert.equal((await manager.call('checkin/state')).backgroundReady,false);
  const status=await manager.status();assert.equal(status.runtime.state,'missing');assert.match(status.deploymentPrompt,/nodejs.org/);assert.match(status.deploymentPrompt,/background-node.json/);assert.equal((await manager.action({action:'detect'})).runtime.state,'missing');assert.equal(await readFile(join(root,'api-export','settings.json'),'utf8'),original);
 }finally{await manager.close();await rm(root,{recursive:true,force:true});}
});

test('AI deployment prompt provides an exact per-user config location without credentials or automatic mutations',()=>{
 const prompt=backgroundDeploymentPrompt('C:/synthetic/user-data');assert.ok(prompt.includes(join('C:/synthetic/user-data','background-node.json')));assert.match(prompt,/不要.*API Key/);assert.match(prompt,/重新检测环境/);assert.match(prompt,/不使用来历不明的镜像/);
});
