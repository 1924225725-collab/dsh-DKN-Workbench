import {traeCheckin} from './trae-cn.js';
import {createServer} from 'node:http';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {backgroundControl} from './background-ipc.js';
import {createBackgroundBridge} from './background-bridge.js';
import {ApiExportService} from './api-export-service.js';
import {AutoCheckin} from './auto-checkin.js';
import {qoderCheckin} from './qoder-checkin.js';
import {rewardError} from './checkin.js';
import {pluginVersion} from './version.js';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export async function startBackground(directory){
 const control=await backgroundControl(directory),config={main:{},providers:{},zcode:{enabled:false}};
 try{Object.assign(config,JSON.parse(await readFile(join(directory,'background-providers.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw Error('后台平台配置读取失败');}
 let api,auto,bridge,ready,closing=false;
 const traeTarget={id:'trae',run:options=>traeCheckin(config.main,options)};
 const syncTraeTarget=()=>{if(auto)auto.targets=[...auto.targets.filter(target=>target.id!=='trae'),...(String(config.main.traeAutoCheckin)==='true'&&String(config.main.traeEnabled)!=='false'?[traeTarget]:[])];};
 const server=createServer(async(req,res)=>{
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const token=req.headers.authorization?.slice(7)||'';
  if(req.method!=='POST'||!/^Bearer /.test(req.headers.authorization||'')||!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(Buffer.from(token),Buffer.from(control.token)))return json(403,{error:'后台认证失败'});
  try{
   let size=0;const parts=[];for await(const part of req.iterator({destroyOnReturn:false})){size+=part.length;if(size>256*1024){req.resume();throw Error('后台请求过大');}parts.push(part);}
   const {action,input={}}=JSON.parse(Buffer.concat(parts).toString());await ready;
   if(closing&&action!=='status')throw Error('后台正在停止');
   let result;
   if(action==='status')result={running:true,pid:process.pid,version:pluginVersion,apiRunning:!!api.server,autoEnabled:auto.snapshot().enabled};
   else if(action==='sync'){
    if(!input.main||!input.providers||!input.zcode)throw Error('平台配置无效');
    input.providers={...config.providers,...input.providers};
    if(JSON.stringify(config)!==JSON.stringify(input)){const file=join(directory,'background-providers.json'),temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(input),{mode:0o600});await rename(temp,file);Object.assign(config,input);bridge.reset();syncTraeTarget();}
    result={ok:true};
   }else if(action==='api/state')result=api.snapshot();
   else if(action==='api/verify')result=await api.verify(input.model);
   else if(action==='api/control')result=await api.control(input.action,input.settings||{});
   else if(action==='checkin/state')result=auto.snapshot();
   else if(action==='checkin/enabled')result=await auto.setEnabled(input.enabled);
   else if(action==='checkin/manual'){
    try{result=await(input.provider==='codebuddy'?bridge.checkin({claim:input.claim===true}):input.provider==='trae'?traeCheckin(config.main,{claim:input.claim===true}):input.provider==='qoder'?qoderCheckin({claim:input.claim===true,desktopPath:config.main.qoderDesktopPath||''}):Promise.resolve({state:'unavailable'}));}catch(e){result=rewardError(e);}
   }else if(action==='stop'){json(200,{ok:true});void close();return;}
   else throw Error('未知后台操作');
   json(200,result);
  }catch(e){json(400,{error:e.apiExportFault?e.message:/后台|平台配置|自动签到|设置保存/.test(e.message)?e.message:'后台操作失败，请检查平台配置。'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(control.pipe,()=>{server.removeListener('error',reject);resolve();});});
 ready=(async()=>{bridge=createBackgroundBridge(config);api=new ApiExportService({directory:join(directory,'api-export'),llm:bridge});auto=new AutoCheckin({directory,targets:[{id:'codebuddy',run:options=>bridge.checkin(options)},{id:'qoder',run:options=>String(config.main.qoderEnabled??'true')==='false'?Promise.resolve({state:'unavailable'}):qoderCheckin({...options,desktopPath:config.main.qoderDesktopPath||''})}]});syncTraeTarget();await Promise.all([api.ready,auto.ready]);})();
 async function close(){if(closing)return;closing=true;await ready.catch(()=>{});await Promise.all([auto?.close(),api?.close()]);bridge?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 process.once('SIGTERM',()=>{void close();});process.once('SIGINT',()=>{void close();});
 return{close,server,api:()=>api,auto:()=>auto};
}
if(process.argv[1]&&resolve(fileURLToPath(import.meta.url)).toLowerCase()===resolve(process.argv[1]).toLowerCase()){
 startBackground(process.argv[2]).catch(e=>{console.error(e.code==='EADDRINUSE'?'后台已运行':'后台启动失败');process.exitCode=e.code==='EADDRINUSE'?0:1;});
}
