import {findBackgroundNode,backgroundDeploymentPrompt} from './background-node.js';
import {offlineApiState,offlineCheckinState} from './background-offline.js';
import {mkdir,readFile,writeFile,cp,copyFile,stat,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {backgroundControl,backgroundCall} from './background-ipc.js';
import {pluginVersion} from './version.js';

const exec=promisify(execFile),wait=ms=>new Promise(r=>setTimeout(r,ms));
const RUN_KEY='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',RUN_NAME='DKNWorkbenchBackground';
export class BackgroundManager{
 constructor({directory,readConfig,autoStartHandler,nodeOptions}){this.nodeOptions=nodeOptions;this.directory=directory;this.readConfig=readConfig;this.autoStartHandler=autoStartHandler;this.preferences={keepAlive:false,autoStart:false};this.closed=false;this.paused=false;this.cached={};this.ready=this.load();}
 async load(){
  this.control=await backgroundControl(this.directory);
  try{const p=JSON.parse(await readFile(join(this.directory,'background-settings.json'),'utf8'));this.preferences={keepAlive:p.keepAlive===true,autoStart:p.keepAlive===true&&p.autoStart===true};}catch(e){if(e.code!=='ENOENT')throw Error('后台设置读取失败');}
 }
 async raw(action,input,timeout){return backgroundCall(this.control,action,input,timeout);}
 async runtimeInfo(force=false){if(!force&&this.nodeInfo&&Date.now()-this.nodeCheckedAt<30000)return this.nodeInfo;this.nodeInfo=await findBackgroundNode(this.directory,this.nodeOptions);this.nodeCheckedAt=Date.now();return this.nodeInfo;}
 async status(){await this.ready;let live;try{live=await this.raw('status',{},3000);}catch{}return{running:false,...live,...this.preferences,runtime:await this.runtimeInfo(),deploymentPrompt:backgroundDeploymentPrompt(this.directory)};}
 async install(){
  const info=await this.runtimeInfo();if(info.state!=='ready')throw Object.assign(Error(info.message),{code:'NODE_RUNTIME_MISSING'});
  const source=dirname(fileURLToPath(import.meta.url)),runtime=join(this.directory,'background-runtime',pluginVersion),entry=join(runtime,'lib','background-worker.js');
  try{await stat(join(runtime,'complete'));}catch{
   const stage=runtime+'.'+randomUUID()+'.tmp';await mkdir(stage,{recursive:true});
   try{await cp(source,join(stage,'lib'),{recursive:true});await copyFile(join(source,'..','package.json'),join(stage,'package.json'));await writeFile(join(stage,'complete'),pluginVersion);
    try{await rename(stage,runtime);}catch(e){if(!await stat(join(runtime,'complete')).catch(()=>null))throw e;}
   }finally{if(dirname(stage)===join(this.directory,'background-runtime'))await rm(stage,{recursive:true,force:true});}
  }
  const node=join(this.directory,'background-runtime','node-'+info.version+(process.platform==='win32'?'.exe':''));
  try{await stat(node);}catch{
   const stage=node+'.'+randomUUID()+'.tmp';
   try{await copyFile(info.path,stage);try{await rename(stage,node);}catch(e){if(!await stat(node).catch(()=>null))throw e;}}
   finally{await rm(stage,{force:true});}
  }
  this.runtime={node,entry};
  const launcher=join(this.directory,'background-launch.vbs');
  if(process.platform==='win32'){
   const command='"'+node+'" "'+entry+'" "'+this.directory+'"';
   await writeFile(launcher,Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('CreateObject("WScript.Shell").Run "'+command.replaceAll('"','""')+'", 0, False\r\n','utf16le')]));
  }
  return{node,entry,launcher};
 }
 async ensure(){
  await this.ready;if(this.closed)throw Error('后台控制入口已关闭');if(this.starting)return this.starting;
  const work=(async()=>{
   let live=await this.status();
   if(live.running&&live.version!==pluginVersion){await this.raw('stop');for(let i=0;i<150;i++){await wait(100);if(!(await this.status()).running)break;}live=await this.status();if(live.running)throw Error('旧后台仍在处理任务，请稍后重试升级。');}
   if(!live.running){
    const runtime=await this.install();
    // Persist CLI paths/settings only. Official authentication remains in each client's own store.
    await writeFile(join(this.directory,'background-providers.json'),JSON.stringify(this.readConfig()),{mode:0o600});
    const env={...process.env};delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(runtime.node,[runtime.entry,this.directory],{detached:true,windowsHide:true,stdio:'ignore',env});let spawnError;child.on('error',e=>{spawnError=e;});child.unref();
    for(let i=0;i<150;i++){if(spawnError)throw Error('后台进程无法启动');await wait(100);if((await this.status()).running)break;}
    if(!(await this.status()).running)throw Error('后台启动超时，请检查 Node.js 与 CLI 配置。');
   }
   await this.raw('sync',this.readConfig());
  })();this.starting=work;try{return await work;}finally{this.starting=null;}
 }
 async call(action,input={}){
  await this.ready;
  if(this.paused){
   if(action==='checkin/manual')return{state:'unavailable',message:'后台已停止，请先启动后台。'};
   if(action==='api/state')return{port:18789,baseUrl:'http://127.0.0.1:18789/v1',publicModel:'dkn',models:[],catalog:[],records:[],...this.cached['api/state'],running:false,active:0,queued:0};
   if(action==='checkin/state')return{enabled:false,...this.cached['checkin/state'],running:false};
  }
  this.paused=false;let value;try{await this.ensure();value=await this.raw(action,input);}catch(error){
   const message=error.message||'后台未就绪';
   if(action==='api/state'||action==='api/control'&&input.action==='refresh')return offlineApiState(this.directory,message,this.cached['api/state']);
   if(action==='checkin/state')return offlineCheckinState(this.directory,message);
   if(action==='checkin/manual')return{state:'background-required',message};
   throw error;
  }
  if(action.startsWith('api/')&&action!=='api/verify'){const {secret,...safe}=value;this.cached['api/state']=safe;}
  if(action.startsWith('checkin/')&&action!=='checkin/manual')this.cached['checkin/state']=value;
  return value;
 }
 async configure(input){
  await this.ready;if(typeof input.keepAlive!=='boolean'||typeof input.autoStart!=='boolean')throw Error('后台开关必须为布尔值。');
  if(input.autoStart&&!input.keepAlive)throw Error('请先开启退出 DSH 后继续运行。');
  if(input.autoStart&&process.platform!=='win32')throw Error('自动登录启动目前仅支持 Windows。');
  const runtime=input.keepAlive||input.autoStart?await this.install():{launcher:join(this.directory,'background-launch.vbs')};
  if(this.autoStartHandler)await this.autoStartHandler(input.autoStart,runtime);
  else if(process.platform==='win32'){
   if(input.autoStart)await exec('reg.exe',['add',RUN_KEY,'/v',RUN_NAME,'/t','REG_SZ','/d','wscript.exe "'+runtime.launcher+'"','/f'],{windowsHide:true});
   else try{await exec('reg.exe',['delete',RUN_KEY,'/v',RUN_NAME,'/f'],{windowsHide:true});}catch(e){if(e.code!==1)throw e;}
  }
  this.preferences={keepAlive:input.keepAlive,autoStart:input.autoStart};await writeFile(join(this.directory,'background-settings.json'),JSON.stringify(this.preferences),{mode:0o600});
  if(input.keepAlive)await this.ensure();return this.status();
 }
 async action(input){
  if(input.action==='detect'){await this.runtimeInfo(true);return this.status();}
  if(input.action==='save')return this.configure(input);
  if(input.action==='start'){this.paused=false;await this.ensure();return this.status();}
  if(input.action==='stop'){this.paused=true;await this.ready;try{await this.raw('stop');}catch{if((await this.status()).running)throw Error('后台停止失败');}return{...await this.status(),running:false};}
  throw Error('未知后台操作');
 }
 async resume(){await this.ready;const live=await this.status();let needed=this.preferences.keepAlive;
  if(!needed)for(const [file,key]of [['auto-checkin.json','enabled'],['api-export/settings.json','autoStart']])try{needed||=JSON.parse(await readFile(join(this.directory,file),'utf8'))[key]===true;}catch{}
  if(live.running||needed)await this.ensure();
 }
 async close(){await this.ready;await this.starting?.catch(()=>{});if(!this.preferences.keepAlive){try{await this.raw('stop');}catch{}}this.closed=true;}
}
export function backgroundProxies(manager){return{
 api:{ready:manager.ready,snapshot:()=>manager.call('api/state'),control:(action,settings)=>manager.call('api/control',{action,settings}),verify:model=>manager.call('api/verify',{model}),close:async()=>{}},
 auto:{ready:manager.ready,snapshot:()=>manager.call('checkin/state'),setEnabled:enabled=>manager.call('checkin/enabled',{enabled}),close:async()=>{}}
};}
