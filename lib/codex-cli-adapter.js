import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {readFileSync,statSync} from 'node:fs'
import {homedir} from 'node:os'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {locateCodex} from './codex-runtime.js'

const PROVIDER='codex-cli'
const DEFAULT_MODEL='codex-cli-default'

function currentValue(value,fallback=''){
  if(value!==null&&typeof value==='object'&&typeof value.get==='function')return currentValue(value.get(),fallback)
  return value===undefined||value===null?fallback:value
}
function textValue(value,fallback=''){
  const current=currentValue(value,fallback)
  return typeof current==='string'?current:fallback
}

function configuredModel(config={}){
  const explicit=textValue(config.codexCliModel).trim()
  if(explicit)return explicit
  const root=textValue(config.codexHome).trim()||join(homedir(),'.codex')
  try{const text=readFileSync(join(root,'config.toml'),'utf8');const match=text.match(/^\s*model\s*=\s*["']([^"']+)["']/mu);return match?.[1]?.trim()||''}catch{return''}
}

export function configuredModels(config={}){
  const explicit=textValue(config.codexCliModels).split(/[\r\n,;]+/u).map(value=>value.trim()).filter(Boolean)
  const root=textValue(config.codexHome).trim()||join(homedir(),'.codex')
  try{
    const cache=JSON.parse(readFileSync(join(root,'models_cache.json'),'utf8'))
    const cached=(Array.isArray(cache?.models)?cache.models:[]).filter(model=>model?.supported_in_api!==false&&typeof model?.slug==='string').map(model=>model.slug)
    return [...new Set([...explicit,...cached,configuredModel(config)].filter(Boolean))]
  }catch{return [...new Set([...explicit,configuredModel(config)].filter(Boolean))]}
}

let threadModelCache={key:'',models:[]}

/**
 * 项目模式可选的 Codex 模型：本机模型缓存里对菜单可见的条目，含展示名、描述和推理档位。
 * 按 mtime 和大小缓存解析结果，避免每次刷新模型目录都重新读整份缓存。
 *
 * @param {object} [config] 插件配置（只读 codexHome）。
 * @returns {{id: string, name: string, description?: string, reasoning?: {efforts: {id: string, name: string, description?: string}[], defaultEffort?: string}}[]} 按缓存顺序的模型条目。
 */
export function codexThreadModels(config={}){
  const root=textValue(config?.codexHome).trim()||join(homedir(),'.codex')
  const file=join(root,'models_cache.json')
  try{
    const stats=statSync(file)
    const key=`${stats.mtimeMs}:${stats.size}`
    if(threadModelCache.key===key)return threadModelCache.models
    const cache=JSON.parse(readFileSync(file,'utf8'))
    const models=(Array.isArray(cache?.models)?cache.models:[]).filter(model=>model&&model.supported_in_api!==false&&model.visibility!=='hide'&&typeof model.slug==='string'&&model.slug).map(model=>{
      const efforts=[]
      for(const level of Array.isArray(model.supported_reasoning_levels)?model.supported_reasoning_levels:[]){
        if(level&&typeof level.effort==='string'&&!efforts.some(item=>item.id===level.effort))efforts.push({id:level.effort,name:level.effort,...(typeof level.description==='string'&&level.description?{description:level.description}:{})})
      }
      const defaultEffort=typeof model.default_reasoning_level==='string'&&efforts.some(item=>item.id===model.default_reasoning_level)?model.default_reasoning_level:undefined
      return {id:model.slug,name:String(model.display_name||model.slug),...(typeof model.description==='string'&&model.description?{description:model.description}:{}),...(efforts.length?{reasoning:{efforts,...(defaultEffort?{defaultEffort}:{})}}:{})}
    })
    threadModelCache={key,models}
    return models
  }catch{
    threadModelCache={key:'',models:[]}
    return []
  }
}

function textFromMessages(messages=[]){const last=messages.findLastIndex(item=>item?.role==='assistant');const pending=messages.slice(last+1).filter(item=>item?.role==='user');const text=pending.map(item=>typeof item.content==='string'?item.content:(item.content||[]).filter(block=>block?.type==='text').map(block=>block.text||'').join('')).filter(Boolean).join('\n\n');if(!text.trim())throw new Error('Codex CLI 没有可发送的文本消息');return text}

function parseJsonl(stdout){const events=[];for(const line of String(stdout||'').split(/\r?\n/)){const value=line.trim();if(!value)continue;try{events.push(JSON.parse(value))}catch{}}
  let text='',usage;for(const event of events){const item=event.item||event.data?.item;if(event.type==='item.completed'&&item?.type==='agent_message')text=item.text||item.content?.map?.(v=>v.text||'').join('')||text;if(event.type==='item.delta'&&event.item?.type==='agent_message')text+=event.item.delta||'';if(event.type==='turn.completed')usage=event.usage||event.turn?.usage||usage;if(event.type==='error'||event.type==='turn.failed')throw new Error(event.message||event.error?.message||'Codex CLI 回合失败')}if(!text.trim())throw new Error('Codex CLI 没有返回最终文本');return{text,usage}
}

export function codexUsageForDsh(usage) {
  const input=usage?.input_tokens, output=usage?.output_tokens;
  if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0)return undefined;
  const cache=usage.cached_input_tokens;
  const cacheRead=Number.isSafeInteger(cache)&&cache>=0&&cache<=input?cache:0;
  return {inputTokens:input-cacheRead,outputTokens:output,cacheReadTokens:cacheRead};
}

function run(command,args,input,{timeoutMs=180000,signal,cwd,codexHome}={}){return new Promise((resolvePromise,reject)=>{if(signal?.aborted)return reject(new Error('Codex CLI 请求已取消'));const home=process.env.HOME||process.env.USERPROFILE||homedir();const configuredHome=codexHome||process.env.CODEX_HOME||join(home,'.codex');const child=spawn(command,args,{cwd:cwd||tmpdir(),windowsHide:true,env:{...process.env,HOME:home,USERPROFILE:process.env.USERPROFILE||home,CODEX_HOME:configuredHome},stdio:['pipe','pipe','pipe']});let stdout='',stderr='',done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){try{child.kill()}catch{};reject(error)}else resolvePromise(value)};const abort=()=>finish(new Error('Codex CLI 请求已取消'));signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>finish(new Error('Codex CLI 请求超时')),timeoutMs);timer.unref?.();child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',v=>{stdout+=v;if(Buffer.byteLength(stdout)>20*1024*1024)finish(new Error('Codex CLI 输出超过限制'))});child.stderr.on('data',v=>{stderr=(stderr+v).slice(-8192)});child.once('error',e=>finish(new Error(e.code==='ENOENT'?'找不到 Codex CLI':`无法启动 Codex CLI：${e.message}`)));child.once('close',(code)=>{if(code!==0)finish(new Error(`Codex CLI 退出，代码 ${code??'未知'}${stderr.trim()?`：${stderr.trim().slice(-500)}`:''}`));else finish(null,{stdout,stderr})});child.stdin.end(input)})}

function invocationFor(executable){return/\.mjs$/iu.test(executable)?{command:process.execPath,args:[executable]}:{command:executable,args:[]}}

export async function inspectCodexCli(config={}){
  const executable=await locateCodex(textValue(config.codexCliPath)||textValue(config.codexPath))
  const invocation=invocationFor(executable)
  const result=await run(invocation.command,[...invocation.args,'--version'],'',{timeoutMs:10000,cwd:textValue(config.codexCliCwd)||undefined,codexHome:textValue(config.codexHome)||undefined})
  const version=String(result.stdout||'').trim().split(/\r?\n/u).find(Boolean)||''
  return {path:executable,version,models:configuredModels(config),checkedAt:Date.now()}
}

export async function runCodexCliPrompt(config={},prompt='Reply with OK.'){
  const executable=await locateCodex(textValue(config.codexCliPath)||textValue(config.codexPath))
  const invocation=invocationFor(executable)
  const model=configuredModel(config)
  const effort=textValue(config.codexCliReasoningEffort).trim()
  const args=['exec','--json','--sandbox','read-only','--skip-git-repo-check',...(model?['--model',model]:[]),...(effort?['--config',`model_reasoning_effort=${effort}`]:[]),'-']
  const result=await run(invocation.command,[...invocation.args,...args],String(prompt),{timeoutMs:Number(currentValue(config.codexCliTimeoutMs,180000))||180000,cwd:textValue(config.codexCliCwd)||undefined,codexHome:textValue(config.codexHome)||undefined})
  return {path:executable,...parseJsonl(result.stdout),testedAt:Date.now()}
}

export class CodexCliAdapter {
  constructor(ctx,config){this.ctx=ctx;this.config=config}
  async prepareCall(provider,model,signal){return{model:await this.resolveModel(provider,model,signal),stream:options=>this.stream(options)}}
  providerInfo(provider){return{id:provider,name:'Codex CLI（命令模式）'}}
  providerRetryPolicy(){return undefined}
  imageRequestPricing(){return undefined}
  imageRequestTarget(_provider,_model,image){return{width:Number(image?.width)||0,height:Number(image?.height)||0,maxBytes:Number(image?.bytes)||0}}
  modelIds(){return configuredModels(this.config)}
  async listModels(provider){const models=this.modelIds();return[...(!models.length?[{provider,id:DEFAULT_MODEL,name:'Codex CLI 默认模型',inputModalities:['text'],context:{contextWindow:200000}}]:models.map(model=>({provider,id:model,name:model,inputModalities:['text'],context:{contextWindow:200000}})))]}
  async resolveModel(provider,model){const id=textValue(model||configuredModel(this.config),DEFAULT_MODEL).trim()||DEFAULT_MODEL;return{provider,id,name:id===DEFAULT_MODEL?'Codex CLI 默认模型':id,inputModalities:['text'],context:{contextWindow:200000}}}
  async *stream(options){const agent=this.ctx.agents?.get?.(options.sessionId);const configuredCwd=textValue(this.config.codexCliCwd).trim();const cwd=agent?.session?.header?.cwd||configuredCwd;const content=textFromMessages(options.messages);const executable=await locateCodex(textValue(this.config.codexCliPath)||textValue(this.config.codexPath));const model=options.model&&options.model!==DEFAULT_MODEL?options.model:configuredModel(this.config);const effort=options.reasoningEffort||textValue(this.config.codexCliReasoningEffort).trim();const args=['exec','--json','--sandbox','read-only','--skip-git-repo-check',...(model?['--model',model]:[]),...(effort?['--config',`model_reasoning_effort=${effort}`]:[]),'-'];const invocation=invocationFor(executable);const result=await run(invocation.command,[...invocation.args,...args],content,{timeoutMs:Number(currentValue(this.config.codexCliTimeoutMs,180000))||180000,signal:options.signal,cwd:cwd&&resolve(cwd),codexHome:textValue(this.config.codexHome)||undefined});const parsed=parseJsonl(result.stdout);yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:parsed.text}};const usage=codexUsageForDsh(parsed.usage);if(usage)yield{type:'usage',usage};yield{type:'finish',reason:{kind:'stop'}}}
}

export const codexCliProvider=PROVIDER
