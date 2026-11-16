import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AutoCheckin,checkinWindow} from '../lib/auto-checkin.js';
import {registerCheckinTarget,runCheckinTarget} from '../lib/shared/checkin-targets.js';

const at=time=>Date.parse('2026-11-15T'+time+':00+08:00');
async function fixture(run){
  const directory=await mkdtemp(join(tmpdir(),'dkn-auto-checkin-'));let now=at('09:00');const calls=[];
  const targets=[{id:'codebuddy',run:async({claim})=>{calls.push(['codebuddy',claim]);return{state:claim?'claimed':'claimable'};}},{id:'qoder',run:async({claim})=>{calls.push(['qoder',claim]);return{state:'claimed'};}}];
  const service=new AutoCheckin({directory,targets,now:()=>now,random:()=>0,intervalMs:0});
  try{await service.ready;await service.serial;await run({service,directory,calls,targets,setTime:value=>{now=value;},now:()=>now});}finally{await service.close();await rm(directory,{recursive:true,force:true});}
}

test('fixed Shanghai window, opt-in only, stable randomized schedule and no duplicate daily execution after restart',async()=>fixture(async({service,setTime,calls,directory,targets,now})=>{
  assert.deepEqual(checkinWindow(at('12:00')),{day:'2026-11-15',start:at('11:00'),end:at('13:00')});
  await service.tick();assert.equal(service.snapshot().enabled,false);assert.equal(calls.length,0);
  await service.setEnabled(true);assert.equal(service.snapshot().scheduledAt,at('11:00'));await service.tick();assert.equal(calls.length,0);
  setTime(at('11:01'));await service.tick();assert.deepEqual(calls,[['codebuddy',false],['codebuddy',true],['qoder',false]]);
  assert.equal(service.snapshot().lastRun.results.qoder,'claimed');await service.tick();await service.tick();assert.equal(calls.length,3);assert.equal(service.snapshot().scheduledAt,at('11:00')+86400000);
  const reopened=new AutoCheckin({directory,targets,now,random:()=>0,intervalMs:0});try{await reopened.ready;await reopened.tick();assert.equal(calls.length,3);assert.equal(reopened.snapshot().scheduledAt,service.snapshot().scheduledAt);}finally{await reopened.close();}
  await service.setEnabled(false);await service.setEnabled(true);await service.tick();assert.equal(calls.length,3);
  setTime(at('11:01')+86400000);await service.tick();assert.equal(calls.length,6);
}));

test('enabling during the window randomizes within remaining time, after 13:00 skips to tomorrow, disabling persists',async()=>fixture(async({service,setTime,directory})=>{
  service.random=max=>max-1;setTime(at('12:00'));await service.setEnabled(true);assert.equal(service.snapshot().scheduledAt,at('13:00')-1);
  const saved=service.snapshot().scheduledAt;await service.tick();assert.equal(service.snapshot().scheduledAt,saved);
  setTime(at('13:00'));await service.tick();assert.equal(service.snapshot().day,'2026-11-16');
  await service.setEnabled(false);assert.equal(JSON.parse(await readFile(join(directory,'auto-checkin.json'),'utf8')).enabled,false);
  await assert.rejects(service.setEnabled('true'));
}));

test('persist attempt before claims, sanitize failures and do not retry uncertain mutations',async()=>fixture(async({service,setTime,targets,directory,calls})=>{
  const original=targets[0].run;targets[0].run=async options=>{const saved=JSON.parse(await readFile(join(directory,'auto-checkin.json'),'utf8'));assert.equal(saved.attempted,true);if(options.claim)throw Object.assign(Error('private-account-secret'),{code:'CLAIM_UNCERTAIN'});return original(options);};
  targets[1].run=async()=>({state:'no-activity'});await service.setEnabled(true);setTime(at('12:00'));await service.tick();await service.tick();
  assert.equal(service.snapshot().lastRun.results.codebuddy,'unknown');assert.equal(service.snapshot().lastRun.results.qoder,'no-activity');assert.equal(calls.length,1);assert.equal((await readFile(join(directory,'auto-checkin.json'),'utf8')).includes('private-account-secret'),false);
}));

test('failed durable write prevents network work and corrupt config fails closed',async()=>fixture(async({service,setTime,calls,directory,targets})=>{
  await service.setEnabled(true);setTime(at('12:00'));service.persist=async()=>{throw Error('disk full')};await service.tick();assert.equal(calls.length,0);assert.ok(service.snapshot().error);
  await writeFile(join(directory,'auto-checkin.json'),'{bad');const broken=new AutoCheckin({directory,targets,intervalMs:0});try{await broken.ready;await broken.tick();assert.equal(broken.snapshot().enabled,false);assert.ok(broken.snapshot().error);}finally{await broken.close();}
}));

test('switching off during a query prevents the claim and subsequent platforms',async()=>fixture(async({service,targets,setTime,calls})=>{
  let release,started;const queried=new Promise(r=>{started=r});targets[0].run=async()=>{started();await new Promise(r=>{release=r});return{state:'claimable'};};
  await service.setEnabled(true);setTime(at('12:00'));const pending=service.tick();await queried;const off=service.setEnabled(false);release();await pending;await off;assert.equal(calls.length,0);assert.equal(service.snapshot().enabled,false);
}));

test('shared targets preserve latest registration and report missing integration',async()=>{
  const first=registerCheckinTarget('test',async()=>({state:'claimed'}));const second=registerCheckinTarget('test',async()=>({state:'no-activity'}));first();assert.equal((await runCheckinTarget('test',{})).state,'no-activity');second();assert.equal((await runCheckinTarget('test',{})).state,'unavailable');
});
