import {createStandaloneCodebuddy as createCN} from './cn/standalone.js';
import {createStandaloneCodebuddy as createIntl} from './intl/standalone.js';
import {CodexCliAdapter} from './codex-cli-adapter.js';
import {AntigravityAdapter} from './antigravity-acp.js';
import {QoderAdapter} from './qoder-acp.js';
import {ZcodeAppServerAdapter} from './zcode/app-server.js';
export function createBackgroundBridge(config){
 const cn=createCN(()=>config.providers?.cn||{}),intl=createIntl(()=>config.providers?.intl||{});
 const names={'codebuddy-cli-cn':'CodeBuddy 国内','codebuddy-cli-intl':'CodeBuddy 国际','codex-cli':'Codex CLI','antigravity-acp':'Antigravity ACP','qoder-acp':'Qoder ACP','zcode-cli':'ZCode'};
 const cached={};
 const make=(id,cwd)=>id==='antigravity-acp'?new AntigravityAdapter({emit(){}},{...config.main,antigravityCwd:cwd}):id==='codex-cli'?new CodexCliAdapter({},{...config.main,codexCliCwd:cwd}):id==='qoder-acp'?new QoderAdapter({emit(){}},{...config.main,qoderCwd:cwd}):new ZcodeAppServerAdapter({options:()=>({...config.zcode,cliCwd:cwd,authorizationPolicy:'deny'}),logger:{warn(){},info(){},debug(){}}});
 return{checkin:options=>config.providers?.cn?cn.checkin(options):Promise.resolve({state:'unavailable'}),
  listProviders:()=>Object.entries(names).filter(([id])=>id==='codebuddy-cli-cn'?!!config.providers?.cn:id==='codebuddy-cli-intl'?!!config.providers?.intl:id==='zcode-cli'?config.zcode?.enabled:id==='antigravity-acp'?config.main?.antigravityEnabled==='true':id==='qoder-acp'?String(config.main?.qoderEnabled??'true')!=='false':true).map(([id,name])=>({id,name})),
  listModels:async id=>{if(id==='codebuddy-cli-cn'||id==='codebuddy-cli-intl')return (id.endsWith('-cn')?cn:intl).adapter.listModels(id);return (cached[id]??=make(id)).listModels(id);},
  async *stream(options){const buddy=options.provider==='codebuddy-cli-cn'?cn:options.provider==='codebuddy-cli-intl'?intl:null;const adapter=buddy?.adapter||make(options.provider,options.apiExportCwd);try{yield*adapter.stream(options)}finally{if(!buddy)adapter.dispose?.();}},
  reset(){for(const adapter of Object.values(cached))adapter.dispose?.();for(const id of Object.keys(cached))delete cached[id];},
  close(){this.reset();}
 };
}
