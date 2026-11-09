import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {readdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {StringDecoder} from 'node:string_decoder';

export function normalizePathSetting(value,name){
  if(value==null||value==='')return'';
  if(typeof value==='object'&&typeof value.get==='function')return normalizePathSetting(value.get(),name);
  if(typeof value==='string')return value.trim();
  if(typeof value==='object'&&!Array.isArray(value)){
    for(const key of ['value','path','executablePath'])if(typeof value[key]==='string')return value[key].trim();
    if(Object.keys(value).length===0)return'';
  }
  throw new Error(`${name} 配置必须是文本路径；请在 DSH 插件设置中清空该项或重新填写路径`);
}
export async function locateCodex(explicit) {
  explicit=normalizePathSetting(explicit,'Codex 可执行文件');
  if(explicit) {const path=resolve(explicit);if(!(await stat(path)).isFile())throw new Error('Codex 路径不是文件');return path;}
  const directory=join(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'),'OpenAI','Codex','bin');
  const found=await Promise.all((await readdir(directory).catch(()=>[])).map(async name=>{const path=join(directory,name,'codex.exe');return{path,time:await stat(path).then(s=>s.mtimeMs).catch(()=>0)};}));
  return found.filter(x=>x.time).sort((a,b)=>b.time-a.time)[0]?.path||'codex';
}
export class CodexRuntime extends EventEmitter {
  constructor(options={}){super();this.options=options;this.sequence=0;this.pending=new Map();this.interactions=new Map();this.connected=false;this.closed=false;this.starting=null;}
  async connect(){if(this.connected)return;if(this.starting)return this.starting;this.starting=this.start().finally(()=>{this.starting=null;});return this.starting;}
  async start(){
    if(this.closed)throw new Error('运行时已关闭');
    const exe=await locateCodex(this.options.codexPath);
    const childEnv=this.options.env?{...this.options.env}:{...process.env};
    const codexHome=normalizePathSetting(this.options.codexHome,'Codex 数据目录');if(codexHome)childEnv.CODEX_HOME=resolve(codexHome);
    const args=['app-server','--listen','stdio://','-c','analytics.enabled=false',...(this.options.args||[])];
    const child=(this.options.spawn||spawn)(exe,args,{cwd:this.options.cwd,env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;this.connected=true;this.buffer='';const decoder=new StringDecoder('utf8');
    child.once('error',error=>this.lost(error));child.once('exit',()=>this.lost(new Error('Codex 协议服务已断开；已提交工作可能仍需核对')));
    child.stderr.on('data',()=>{}); // Never persist native stderr or credentials.
    child.stdout.on('data',chunk=>{this.buffer+=decoder.write(chunk);if(Buffer.byteLength(this.buffer)>64*1024*1024){this.lost(new Error('Codex 协议数据超过限制'));child.kill();return;}let at;while((at=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,at);this.buffer=this.buffer.slice(at+1);if(!line.trim())continue;try{this.receive(JSON.parse(line));}catch{this.lost(new Error('Codex 返回了无效协议数据'));child.kill();break;}}});
    this.initializeResult=await this.call('initialize',{clientInfo:{name:'dkn_agent',title:'DKN Agent',version:'1.1.0'},capabilities:{experimentalApi:true}});
    child.stdin.write(JSON.stringify({method:'initialized'})+'\n');this.emit('connected',this.initializeResult);
  }
  call(method,params={},options={}){
    if(!this.connected||!this.child?.stdin.writable)return Promise.reject(new Error('请先连接 Codex'));
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Object.assign(new Error(`Codex 请求超时：${method}；请同步核对，不会自动重发`),{submissionUncertain:options.mutation===true}));},options.timeout||30000);
      this.pending.set(id,{resolve,reject,timer,mutation:options.mutation===true});
      this.child.stdin.write(JSON.stringify({id,method,params})+'\n',error=>{if(error){const p=this.pending.get(id);if(p){clearTimeout(timer);this.pending.delete(id);reject(Object.assign(error,{submissionUncertain:options.mutation===true}));}}});
    });
  }
  receive(message){
    if(message.id!==undefined&&!message.method){const p=this.pending.get(message.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(message.id);if(message.error)p.reject(Object.assign(new Error(message.error.message||'Codex 请求失败'),{rpcError:message.error}));else p.resolve(message.result);return;}
    if(message.id!==undefined&&message.method){
      const key=String(message.id);this.interactions.set(key,{id:message.id,method:message.method,params:message.params,createdAt:Date.now()});this.emit('interaction',key);return;
    }
    if(message.method==='serverRequest/resolved'){for(const [key,x] of this.interactions)if(String(message.params?.requestId)===String(x.id))this.interactions.delete(key);}
    if(message.method)this.emit('notification',message);
  }
  answer(key,result){const item=this.interactions.get(String(key));if(!item)throw new Error('该审批或问题已失效');if(!this.connected)throw new Error('运行时已断开');this.child.stdin.write(JSON.stringify({id:item.id,result})+'\n');this.interactions.delete(String(key));return{answered:true};}
  lost(error){if(!this.connected)return;this.connected=false;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Object.assign(new Error(error.message),{submissionUncertain:p.mutation}));}this.pending.clear();this.interactions.clear();this.emit('disconnected',error.message);}
  async close(){this.closed=true;const child=this.child;if(!child)return;this.lost(new Error('连接已关闭；正在执行的回合需要核对'));child.stdin.end();if(child.exitCode===null&&child.signalCode===null){await new Promise(r=>{const timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();r();},700);child.once('exit',()=>{clearTimeout(timer);r();});});}if(child.exitCode===null&&child.signalCode===null)child.kill();}
}
