import {CodexCliAdapter} from './codex-cli-adapter.js';
import {QoderAdapter} from './qoder-acp.js';
import {ZcodeAppServerAdapter} from './zcode/app-server.js';
export function createApiExportBridge(ctx,config,resolveZcodeOptions){
  return{
    listProviders:()=>ctx.llm.listProviders?.()||[],
    listModels:provider=>ctx.llm.listModels(provider),
    async *stream(options){
      const cwd=options.apiExportCwd;let adapter;
      if(options.provider==='codex-cli')adapter=new CodexCliAdapter({}, {...config,codexCliCwd:cwd});
      else if(options.provider==='qoder-acp')adapter=new QoderAdapter({emit(){}},{...config,qoderCwd:cwd});
      else if(options.provider==='zcode-cli')adapter=new ZcodeAppServerAdapter({options:()=>({...resolveZcodeOptions(),cliCwd:cwd,authorizationPolicy:'deny'}),logger:{warn(){},info(){},debug(){}}});
      try{yield* (adapter?adapter.stream(options):ctx.llm.stream(options));}
      finally{adapter?.dispose?.();}
    },
  };
}
