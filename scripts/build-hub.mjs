import {stripTypeScriptTypes} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
const files=['server/hub-service.ts','server/workflows.ts','server/review-report.ts','server/library-management.ts','server/codex-permissions.ts','server/agent-transport.ts','server/codex-open.ts','server/setup.ts','src/domain/task-machine.ts','src/prompt-assistant.ts'];
for(const file of files){
  const source=await readFile('vendor/agent-hub/'+file,'utf8');
  const compiled=stripTypeScriptTypes(source,{mode:'transform'}).replace(/(from\s*['"][.][^'"]*)\.ts(['"])/g,'$1.js$2');
  const output='lib/hub/vendor/'+file.replace(/\.ts$/,'.js');await mkdir(dirname(output),{recursive:true});await writeFile(output,compiled);
}
await writeFile('lib/hub/core.js',"export {HubService} from './vendor/server/hub-service.js';\n");
await writeFile('lib/hub/dsh-session-core.js',await readFile('vendor/agent-hub/server/dsh-session-core.js'));
console.log('Built embedded Agent Hub core');
