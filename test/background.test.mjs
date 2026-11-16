import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {BackgroundManager} from '../lib/background-manager.js';
import {backgroundCall} from '../lib/background-ipc.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}

test('standalone worker survives its manager, serves API without DSH, preserves key and schedule, authenticates IPC, and never double-starts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dkn-background-')),fake=join(root,'fake.mjs');
 await writeFile(fake,"process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'synthetic standalone reply'}}));console.log(JSON.stringify({type:'turn.completed'}))})");
 const config={main:{qoderEnabled:'false',codexHome:root,codexCliPath:fake,codexCliModels:'fixture'},providers:{},zcode:{enabled:false}};
 const manager=new BackgroundManager({directory:root,readConfig:()=>config,autoStartHandler:async()=>{}});let second;
 try{
  await manager.ensure();const first=await manager.status();assert.equal(first.running,true);assert.notEqual(first.pid,process.pid);
  await assert.rejects(backgroundCall({...manager.control,token:'0'.repeat(64)},'status'));
  const catalog=await manager.call('api/control',{action:'refresh'});assert.ok(catalog.catalog.some(m=>m.id==='codex-cli/fixture'));
  const {secret}=await manager.call('api/control',{action:'rotate'});const port=await freePort();await manager.call('api/control',{action:'save',settings:{port,models:['codex-cli/fixture']}});await manager.call('api/control',{action:'start'});
  await manager.call('checkin/enabled',{enabled:true});const scheduled=(await manager.call('checkin/state')).scheduledAt;
  // Opt-in persistence without touching the actual Windows Run key in this fixture.
  await manager.configure({keepAlive:true,autoStart:false});await manager.close();
  const response=await fetch('http://127.0.0.1:'+port+'/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({model:'dkn',messages:[{role:'user',content:'synthetic fixture'}]})});assert.equal(response.status,200);assert.equal((await response.json()).choices[0].message.content,'synthetic standalone reply');
  second=new BackgroundManager({directory:root,readConfig:()=>config,autoStartHandler:async()=>{}});await Promise.all([second.ensure(),second.ensure()]);assert.equal((await second.status()).pid,first.pid);assert.equal((await second.call('checkin/state')).scheduledAt,scheduled);
  assert.equal((await second.call('api/state')).hasKey,true);assert.equal((await readFile(join(root,'background-providers.json'),'utf8')).includes(secret),false);
  await second.action({action:'stop'});await second.call('api/state');await second.call('checkin/state');for(let i=0;i<100&&(await second.status()).running;i++)await wait(50);assert.equal((await second.status()).running,false);
 }finally{
  if(second){second.preferences.keepAlive=false;await second.close();}else{manager.preferences.keepAlive=false;manager.closed=false;await manager.close();}
  for(let i=0;i<100;i++){try{await rm(root,{recursive:true,force:true});break;}catch(e){if(i===99)throw e;await wait(50);}}
 }
});

test('worker remains callable after its launching host process has actually exited',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dkn-exit-后台-')),fake=join(root,'fake.mjs'),host=join(root,'host.mjs');
 await writeFile(fake,"process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'host-exited-ok'}}));console.log(JSON.stringify({type:'turn.completed'}))})");
 const config={main:{qoderEnabled:'false',codexHome:root,codexCliPath:fake,codexCliModels:'fixture'},providers:{},zcode:{enabled:false}},port=await freePort();
 await writeFile(host,`import {BackgroundManager} from ${JSON.stringify(new URL('../lib/background-manager.js',import.meta.url).href)};const m=new BackgroundManager({directory:process.argv[2],readConfig:()=>(${JSON.stringify(config)}),autoStartHandler:async()=>{}});await m.ensure();await m.call('api/control',{action:'refresh'});const {secret}=await m.call('api/control',{action:'rotate'});await m.call('api/control',{action:'save',settings:{port:${port},models:['codex-cli/fixture']}});await m.call('api/control',{action:'start'});await m.configure({keepAlive:true,autoStart:false});await m.close();console.log(JSON.stringify({secret}));process.exit(0);`);
 const manager=new BackgroundManager({directory:root,readConfig:()=>config,autoStartHandler:async()=>{}});
 try{
  const {stdout}=await promisify(execFile)(process.execPath,[host,root],{windowsHide:true});const {secret}=JSON.parse(stdout);
  const response=await fetch('http://127.0.0.1:'+port+'/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({model:'dkn',messages:[{role:'user',content:'synthetic'}]})});assert.equal(response.status,200);assert.equal((await response.json()).choices[0].message.content,'host-exited-ok');
  const runtime=await manager.install();if(process.platform==='win32'){const bytes=await readFile(runtime.launcher);assert.equal(bytes.subarray(0,2).toString('hex'),'fffe');assert.match(bytes.subarray(2).toString('utf16le'),/后台/);}
 }finally{await manager.ready;manager.preferences.keepAlive=false;await manager.close();for(let i=0;i<100;i++){try{await rm(root,{recursive:true,force:true});break;}catch(e){if(i===99)throw e;await wait(50);}}}
});
