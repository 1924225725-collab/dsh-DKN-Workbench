import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import {Script} from 'node:vm';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ensureDshSidebarPatch} from '../lib/dsh-sidebar-patcher.js';

function fakeAsar(){
  return{
    async createPackageFromStreams(path,entries){const files={};for(const entry of entries)if(entry.type==='file'){const parts=[];for await(const part of entry.streamGenerator())parts.push(Buffer.from(part));files[entry.path.replaceAll('\\','/')]=Buffer.concat(parts).toString('base64');}await writeFile(path,JSON.stringify({files}));},
    extractFile(path,name){const archive=JSON.parse(readFileSync(path,'utf8'));return Buffer.from(archive.files[name.replaceAll('\\','/')],'base64');},
    listPackage(path){return Object.keys(JSON.parse(readFileSync(path,'utf8')).files).map(name=>'/'+name);},
    statFile(path,name){const size=Buffer.from(JSON.parse(readFileSync(path,'utf8')).files[name.replaceAll('\\','/')],'base64').length;return{size,executable:false,unpacked:false};},
  };
}

const workspaceClient="({\n\t\t\t\t\t\"sidebar.workspaces.directoryFlow\": {kind:\"single\"}\n});\nfunction Fake(){return [jsx(\"div\",{\n\t\t\t\t\t\tclassName: WorkspaceBrowser_module_css_default.listArea,\n\t\t\t\t\t\tchildren: wide && (jsx(SessionTree,{\n\t\t\t\t\t\t\tt\n\t\t\t\t\t\t}))\n\t\t\t\t\t}),\n\t\t\t\t\tworkspaceActionRequest !== null && (0, react_jsx_runtime.jsx)(WorkspaceDialogs, {\n})]};";

test('real ASAR replacement locates the executable, refreshes cached headers and preserves unpacked files',{skip:!process.env.DKN_TEST_ASAR_MODULE},async()=>{
  const asar=createRequire(import.meta.url)(process.env.DKN_TEST_ASAR_MODULE);
  const root=await mkdtemp(join(tmpdir(),'dkn-real-asar-'));
  try{
    const resources=join(root,'resources');
    const manifest='dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/package.json',client='dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js';
    const referenceClient=process.env.DKN_TEST_DSH_CLIENT?await readFile(process.env.DKN_TEST_DSH_CLIENT,'utf8'):workspaceClient;
    const streams=[[manifest,'{"version":"0.2.2-rc.1"}'],[client,referenceClient],['native.bin','synthetic-native-bytes']].map(([path,text])=>({path,type:'file',unpacked:path==='native.bin',stat:{mode:0o644,size:Buffer.byteLength(text)},streamGenerator:()=>Readable.from([Buffer.from(text)])}));
    await asar.createPackageFromStreams(join(resources,'app.asar'),streams);
    const result=await ensureDshSidebarPatch({resourcesPath:undefined,argv:[],execPath:join(root,'DeepSeek Harness.exe'),asar});
    assert.equal(result.status,'restart-required',JSON.stringify(result));
    if(process.env.DKN_TEST_DSH_CLIENT)new Script(asar.extractFile(join(resources,'app.asar'),client.replaceAll('/',process.platform==='win32'?'\\':'/')).toString());
    assert.equal(await readFile(join(resources,'app.asar.unpacked','native.bin'),'utf8'),'synthetic-native-bytes');
    assert.equal((await ensureDshSidebarPatch({resourcesPath:resources,argv:[],asar})).status,'ready');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('automatically patches a matching DSH archive once and leaves a recoverable backup',async()=>{
  const root=await mkdtemp(join(tmpdir(),'dkn-asar-patch-')),resources=join(root,'resources');
  try{
    await import('node:fs/promises').then(fs=>fs.mkdir(resources,{recursive:true}));
    const appAsar=join(resources,'app.asar'),manifest='dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/package.json',client='dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js';
    const original={files:{[manifest]:Buffer.from(JSON.stringify({version:'0.2.2-rc.1'})).toString('base64'),[client]:Buffer.from(workspaceClient).toString('base64')}};
    const encoded=JSON.stringify(original);await writeFile(appAsar,encoded);
    const asar=fakeAsar();
    const result=await ensureDshSidebarPatch({resourcesPath:join(root,'wrong-resources'),argv:[join(appAsar,'dsh')],asar});
    assert.equal(result.status,'restart-required');
    const patched=asar.extractFile(appAsar,client).toString();
    assert.match(patched,/"sidebar\.workspaces\.after": \{/);
    assert.match(patched,/nativeAppearance: \{ browser:/);
    const backupName=(await readdir(resources)).find(name=>name.endsWith('.bak'));
    assert.ok(backupName);
    assert.equal(asar.extractFile(join(resources,backupName),client).toString(),workspaceClient);
    assert.equal((await ensureDshSidebarPatch({resourcesPath:resources,asar})).status,'ready');
  }
  finally{await rm(root,{recursive:true,force:true});}
});

test('refuses an unknown DSH version without altering its archive',async()=>{
  const root=await mkdtemp(join(tmpdir(),'dkn-asar-version-')),resources=join(root,'resources');
  try{
    await import('node:fs/promises').then(fs=>fs.mkdir(resources,{recursive:true}));
    const appAsar=join(resources,'app.asar'),manifest='dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/package.json',client='dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js';
    const encoded=JSON.stringify({files:{[manifest]:Buffer.from('{"version":"0.2.3"}').toString('base64'),[client]:Buffer.from(workspaceClient).toString('base64')}});
    await writeFile(appAsar,encoded);
    assert.equal((await ensureDshSidebarPatch({resourcesPath:resources,asar:fakeAsar()})).status,'unsupported-version');
    assert.equal(await readFile(appAsar,'utf8'),encoded);
  }
  finally{await rm(root,{recursive:true,force:true});}
});

test('locked archive prepares a deferred job and leaves the running DSH untouched',async()=>{
  const root=await mkdtemp(join(tmpdir(),'dkn-locked-'));
  try{
    const archive=join(root,'app.asar'),manifest='dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/package.json',client='dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js';
    const original=JSON.stringify({files:{[manifest]:Buffer.from('{"version":"0.2.2-rc.1"}').toString('base64'),[client]:Buffer.from(workspaceClient).toString('base64')}});
    await writeFile(archive,original);
    let captured;
    const result=await ensureDshSidebarPatch({resourcesPath:root,argv:[],asar:fakeAsar(),commitArchive:async()=>{throw Object.assign(new Error('locked'),{code:'EBUSY'});},schedulePatch:async job=>{captured=job;}});
    assert.equal(result.status,'exit-required');
    assert.equal(await readFile(archive,'utf8'),original);
    assert.ok(captured.stagedHash);
    assert.match(fakeAsar().extractFile(captured.staged,client).toString(),/sidebar.workspaces.after/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('upgrades the installed v1 slot to native appearance without duplicating its declaration',async()=>{
  const root=await mkdtemp(join(tmpdir(),'dkn-v1-upgrade-'));
  try{
    const archive=join(root,'app.asar'),manifest='dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/package.json',client='dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js';
    const old=workspaceClient.replace('\t\t\t\t\t"sidebar.workspaces.directoryFlow": {','\t\t\t\t\t"sidebar.workspaces.after": {kind:"list",scope:"root"},\n\t\t\t\t\t"sidebar.workspaces.directoryFlow": {').replace('\t\t\t\t\tworkspaceActionRequest', '\t\t\t\t\trenderSlot("sidebar.workspaces.after", { wide }),\n\t\t\t\t\tworkspaceActionRequest');
    await writeFile(archive,JSON.stringify({files:{[manifest]:Buffer.from('{"version":"0.2.2-rc.1"}').toString('base64'),[client]:Buffer.from(old).toString('base64')}}));
    const asar=fakeAsar(),result=await ensureDshSidebarPatch({resourcesPath:root,argv:[],asar});
    assert.equal(result.status,'restart-required');
    const updated=asar.extractFile(archive,client).toString();
    assert.match(updated,/nativeAppearance: \{ browser:/);
    assert.match(updated,/"data-dkn-workspace-scroll": true/);
    assert.equal(updated.split('"sidebar.workspaces.after": {').length-1,1);
    assert.equal((await ensureDshSidebarPatch({resourcesPath:root,argv:[],asar})).status,'ready');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('deferred helper waits for exit, commits with backup and rejects stale source',async()=>{
  const {hash,run}=createRequire(import.meta.url)('../lib/dsh-patch-helper.cjs');
  const root=await mkdtemp(join(tmpdir(),'dkn-helper-'));
  try{
    const archive=join(root,'app.asar'),staged=archive+'.dkn-agent-test.tmp',jobPath=join(root,'job.json');
    await writeFile(archive,'old-archive');await writeFile(staged,'patched-archive');
    const sourceHash=await hash(archive),job={archive,staged,sourceHash,stagedHash:await hash(staged),backup:archive+'.dkn-agent-'+sourceHash.slice(0,16)+'.bak',parentPid:123};
    await writeFile(jobPath,JSON.stringify(job));let waiting=true;
    const result=await run(jobPath,{isAlive:()=>waiting,sleep:async()=>{assert.equal(await readFile(archive,'utf8'),'old-archive');waiting=false;}});
    assert.equal(result.status,'complete');assert.equal(await readFile(archive,'utf8'),'patched-archive');assert.equal(await readFile(job.backup,'utf8'),'old-archive');
    await writeFile(staged,'another-patch');await writeFile(jobPath,JSON.stringify({...job,stagedHash:await hash(staged)}));
    assert.equal((await run(jobPath,{isAlive:()=>false})).status,'failed');
    assert.equal(await readFile(archive,'utf8'),'patched-archive');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('copied standalone helper runs independently of the plugin installation',async()=>{
  const {hash}=createRequire(import.meta.url)('../lib/dsh-patch-helper.cjs');
  const root=await mkdtemp(join(tmpdir(),'dkn-helper-child-'));
  try{
    const archive=join(root,'app.asar'),staged=archive+'.dkn-agent-standalone.tmp',script=staged+'.helper.cjs',jobPath=join(root,'job.json');
    await writeFile(archive,'old');await writeFile(staged,'new');
    await writeFile(script,await readFile(new URL('../lib/dsh-patch-helper.cjs',import.meta.url)));
    const sourceHash=await hash(archive);
    await writeFile(jobPath,JSON.stringify({archive,staged,sourceHash,stagedHash:await hash(staged),backup:archive+'.dkn-agent-'+sourceHash.slice(0,16)+'.bak',parentPid:2147483646}));
    await promisify(execFile)(process.execPath,[script,jobPath],{windowsHide:true,timeout:10000});
    assert.equal(JSON.parse(await readFile(jobPath,'utf8')).status,'complete');
    assert.equal(await readFile(archive,'utf8'),'new');
    assert.equal(await readFile(archive+'.dkn-agent-'+sourceHash.slice(0,16)+'.bak','utf8'),'old');
  }finally{await rm(root,{recursive:true,force:true});}
});
