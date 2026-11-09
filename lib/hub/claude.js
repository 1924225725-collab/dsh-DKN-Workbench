import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,access} from 'node:fs/promises';
import {join,dirname,delimiter,basename,resolve} from 'node:path';
import {homedir} from 'node:os';
import {normalizePathSetting} from '../codex-runtime.js';
import {StringDecoder} from 'node:string_decoder';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export class ClaudeCliAdapter {
  constructor(directory,{executable='',spawn:spawnProcess=spawn,command}={}){
    this.software='Claude';this.mode='new-session';this.directory=directory;this.executable=normalizePathSetting(executable,'Claude CLI').replace(/^"(.*)"$/,'$1');this.spawnProcess=spawnProcess;this.command=command;this.sessions=new Map();this.children=new Map();this.serial=Promise.resolve();this.ready=this.load();
  }
  async load(){try{const value=JSON.parse(await readFile(join(this.directory,'sessions.json'),'utf8'));for(const row of value.sessions||[]){if(row.status==='running'){row.status='unknown';row.uncertain=true;}this.sessions.set(row.id,row);}}catch(e){if(e.code!=='ENOENT')throw new Error('Claude 会话登记无法读取，原文件已保留');}}
  async save(){const work=this.serial.then(async()=>{await mkdir(this.directory,{recursive:true});const file=join(this.directory,'sessions.json'),temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify({sessions:[...this.sessions.values()]}),{mode:0o600});await rename(temp,file);});this.serial=work.catch(()=>{});return work;}
  async invocation(){
    if(this.command)return this.command;
    const names=process.platform==='win32'?['claude.exe','claude.cmd']:['claude'];
    const candidates=this.executable?[this.executable]:[join(homedir(),'.local','bin',names[0]),...((process.env.PATH||process.env.Path||'').split(delimiter)).flatMap(dir=>names.map(name=>join(dir,name)))];
    for(const file of candidates){try{await access(file);}catch{continue;}
      if(/\.cmd$/i.test(file)){const entry=join(dirname(file),'node_modules','@anthropic-ai','claude-code','cli.js');try{await access(entry);return{command:process.execPath,args:[entry]};}catch{throw new Error('Claude npm 启动器不匹配，请配置官方 claude.exe 路径');}}
      return{command:file,args:[]};
    }
    throw new Error('未找到官方 Claude Code CLI，请安装并在其原生界面完成登录，再配置插件路径');
  }
  async health(){try{await this.invocation();return{available:true,mode:'official-cli',evidence:'仅确认 CLI 文件；未检查登录、未调用模型'};}catch(e){return{available:false,error:e.message};}}
  async models(){return['sonnet','opus','haiku'].map(id=>({id,label:'Claude 原生别名 · '+id,efforts:['low','medium','high']}));}
  async bind(id,{cwd,title}){await this.ready;if(!uuid(id))throw new Error('Claude 会话编号需要完整 UUID');const prior=this.sessions.get(id);if(prior&&resolve(prior.cwd)!==resolve(cwd))throw new Error('此 Claude 会话已绑定不同目录，请先核对原生会话');if(!prior){this.sessions.set(id,{id,cwd,title,initialized:true,status:'unknown',history:[]});await this.save();}}
  async create(input){await this.ready;await this.invocation();const id=randomUUID();this.sessions.set(id,{id,cwd:input.cwd,title:input.title,initialized:false,status:'idle',history:[]});await this.save();return{sessionId:id,mode:'new-session'};}
  async list(){await this.ready;return{sessions:[...this.sessions.values()].map(row=>({sessionId:row.id,title:row.title,cwd:row.cwd}))};}
  async inspect(id){await this.ready;const row=this.sessions.get(id);if(!row)throw new Error('请先在项目中登记此 Claude 会话及目录');return{cwd:row.cwd,status:row.status,history:row.history||[]};}
  async send(id,content,correlationId,options={}){
    await this.ready;const row=this.sessions.get(id);if(!row)throw new Error('Claude 会话未登记');if(row.status==='running'||row.uncertain)throw new Error('Claude 上次运行结果待核对，不会重新创建或自动重发');
    const invocation=await this.invocation(),readOnly=options.codexSandboxMode!=='workspace-write';
    const args=[...invocation.args,'--print','--verbose','--output-format','stream-json',row.initialized?'--resume':'--session-id',id,'--permission-mode',readOnly?'plan':'acceptEdits','--tools',readOnly?'Read,Glob,Grep':'Read,Glob,Grep,Edit,Write,Bash','--disallowedTools','mcp__*',...(options.model?['--model',options.model]:[]),...(options.effort?['--effort',options.effort]:[])];
    options.beforeSend?.();row.status='running';await this.save();try{options.beforeSend?.();}catch(error){row.status='idle';await this.save();throw error;}let sent=false,final,text='',buffer='',failed;
    const child=this.spawnProcess(invocation.command,args,{cwd:row.cwd,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',DSH_DESKTOP_NODE_EXECUTABLE:process.execPath},windowsHide:true,stdio:['pipe','pipe','pipe']});this.children.set(id,child);
    const started=Date.now(),decoder=new StringDecoder('utf8');
    const line=value=>{let event;try{event=JSON.parse(value);}catch{failed=new Error('Claude 返回了无法识别的协议数据');child.kill();return;}
      if(event.session_id&&event.session_id!==id){failed=new Error('Claude 返回的会话编号不匹配');child.kill();return;}
      if(event.type==='assistant'&&!event.parent_tool_use_id){text=(event.message?.content||[]).filter(block=>block.type==='text').map(block=>block.text).join('\n');try{options.onProgress?.({phase:'streaming',text,elapsedMs:Date.now()-started});}catch{}}
      if(event.type==='result')final=event;
    };
    const timer=setTimeout(()=>{failed=new Error('Claude 运行超时，结果待核对');child.kill();},options.timeoutMs||1800000);
    try{
      await new Promise((resolve,reject)=>{
        child.once('error',reject);child.stderr.on('data',()=>{});
        child.stdout.on('data',chunk=>{buffer+=decoder.write(chunk);if(Buffer.byteLength(buffer)>16*1024*1024){failed=new Error('Claude 协议输出超过限制');child.kill();return;}let end;while((end=buffer.indexOf('\n'))>=0){const value=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(value)line(value);}});
        child.once('close',code=>{buffer+=decoder.end();if(buffer.trim())line(buffer.trim());if(failed)return reject(failed);if(code!==0||!final||final.is_error)return reject(new Error('Claude 未返回可确认的成功结果'+(final?.subtype?'：'+final.subtype:'')));resolve();});
        child.stdin.end(content,error=>{if(error)reject(error);else sent=true;});
      });
      row.initialized=true;row.status='idle';row.uncertain=false;const reply=typeof final.result==='string'?final.result:text;
      row.history=[...(row.history||[]),{eventId:correlationId+'-user',requestId:correlationId,role:'user',text:content},{eventId:correlationId,requestId:correlationId,role:'assistant',text:reply}].slice(-100);await this.save();
      return{reply,eventId:correlationId,messageSent:true,turnEnded:true,tokenUsage:final.usage};
    }catch(error){row.status='unknown';row.uncertain=true;await this.save();throw Object.assign(error,{messageSent:sent,submissionUncertain:sent});}
    finally{clearTimeout(timer);this.children.delete(id);}
  }
  async reconcile(id,evidence){await this.ready;const row=this.sessions.get(id);if(!row||!evidence?.trim())throw new Error('请填写原生会话的实际核对结果');row.uncertain=false;row.initialized=true;row.status='idle';row.reconciliation={evidence:evidence.slice(0,4000),at:Date.now()};await this.save();return{ok:true};}
  async interrupt(id){const child=this.children.get(id);if(!child)throw new Error('此插件没有正在观察的 Claude 进程');if(child.kill('SIGINT')===false)throw new Error('Claude 进程未确认接受中断，请核对原生状态');}
  close(){for(const child of this.children.values())child.kill();}
}
