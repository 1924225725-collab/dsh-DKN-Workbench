import {readFile,readdir,stat} from 'node:fs/promises';
import {join,dirname,isAbsolute,extname} from 'node:path';
import {homedir,hostname} from 'node:os';
import {spawn,execFile} from 'node:child_process';
import {rewardFailure} from './checkin.js';

const identityCache=new Map();let discovery;
function powershell(script,input){return new Promise((resolve,reject)=>{
  const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:65536,encoding:'utf8',env:{...process.env,PSModulePath:join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','Modules')}},(error,stdout)=>error?reject(rewardFailure('DESKTOP_IDENTITY_REQUIRED')):resolve(stdout.trim()));
  child.stdin.on('error',()=>{});child.stdin.end(input?JSON.stringify(input):'');
})}
async function installationRoots(){
  const local=process.env.LOCALAPPDATA||join(homedir(),'AppData','Local');
  const roots=[join(local,'Programs','Qoder'),join(process.env.ProgramFiles||'C:\\Program Files','Qoder')];
  try{
    const script="$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^Qoder( App| Desktop)?( v?\\d[\\d.]*)?$' } | Select-Object InstallLocation,DisplayIcon,UninstallString | ConvertTo-Json -Compress";
    const output=await powershell(script);for(const row of output?[].concat(JSON.parse(output)):[]){
      if(typeof row.InstallLocation==='string'&&row.InstallLocation.trim())roots.push(row.InstallLocation.trim());
      else for(const source of [row.DisplayIcon,row.UninstallString]){const match=String(source||'').match(/^\s*"([^"]+)"|^\s*([^,]+?\.(?:exe|ico))/i);if(match){roots.push(dirname(match[1]||match[2]));break}}
    }
  }catch{}
  return [...new Set(roots.filter(isAbsolute))];
}
export async function locateQoderDesktop(configured=''){
  if(process.platform!=='win32')throw rewardFailure('DESKTOP_IDENTITY_REQUIRED');
  const key=configured.trim();if(discovery?.key===key&&Date.now()-discovery.at<60000)return discovery.promise;
  const promise=(async()=>{
    let roots;
    if(key){if(!isAbsolute(key))throw rewardFailure('DESKTOP_IDENTITY_REQUIRED');roots=[extname(key).toLowerCase()==='.exe'?dirname(key):key]}
    else roots=await installationRoots();
    for(const root of roots){
      let versions=[];try{versions=(await readdir(join(root,'.qoder-versions'),{withFileTypes:true})).filter(row=>row.isDirectory()&&/^\d+\.\d+\.\d+$/.test(row.name)).map(row=>row.name).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))}catch{}
      const candidates=[...versions.map(version=>join(root,'.qoder-versions',version,'resources')),join(root,'resources'),root];
      for(const resources of candidates)try{
        const manifest=JSON.parse(await readFile(join(resources,'build-manifest.json'),'utf8'));
        if(manifest.productId!=='qoder'||!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(manifest.productVersion))continue;
        const executable=join(resources,'umid','runtime-info.exe'),dll=join(resources,'umid','sgsdk.dll');
        if(!(await stat(executable)).isFile()||!(await stat(dll)).isFile())continue;
        // Official packages sign native files after writing their content manifests;
        // validate Authenticode publisher rather than rejecting their pre-sign hashes.
        const script="$v=ConvertFrom-Json([Console]::In.ReadToEnd());$ok=$true;foreach($p in $v.paths){$s=Get-AuthenticodeSignature -LiteralPath $p;if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'O=BRIGHT ZENITH PRIVATE LIMITED'){$ok=$false}};[Console]::Write($ok.ToString().ToLowerInvariant())";
        if(await powershell(script,{paths:[executable,dll]})!=='true')continue;
        return {executable,version:manifest.productVersion};
      }catch{}
    }
    throw rewardFailure('DESKTOP_IDENTITY_REQUIRED');
  })();discovery={key,at:Date.now(),promise};return promise;
}
export function runQoderNativeIdentity(executable,uid,{spawnImpl=spawn,timeoutMs=15000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawnImpl(executable,['3','--account-stdin'],{windowsHide:true,cwd:dirname(executable),stdio:['pipe','pipe','pipe']});let buffer='',settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);child.stdin.end();child.kill();error?reject(error):resolve(value)};
    const timer=setTimeout(()=>finish(rewardFailure('DESKTOP_IDENTITY_REQUIRED')),timeoutMs);
    const parse=()=>{const at=buffer.indexOf('\n');if(at<0)return;try{
      const value=JSON.parse(buffer.slice(0,at)),result={};for(const key of ['machineToken','machineCode','machineType']){if(typeof value[key]!=='string'||!value[key]||value[key].length>4096||/[\r\n]/.test(value[key]))throw Error();result[key]=value[key]}finish(null,result);
    }catch{finish(rewardFailure('DESKTOP_IDENTITY_REQUIRED'))}};
    child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(Buffer.byteLength(buffer)>65536)return finish(rewardFailure('DESKTOP_IDENTITY_REQUIRED'));parse()});
    child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});child.once('error',()=>finish(rewardFailure('DESKTOP_IDENTITY_REQUIRED')));child.once('close',()=>{parse();if(!settled)finish(rewardFailure('DESKTOP_IDENTITY_REQUIRED'))});
    child.stdin.end(JSON.stringify({account:uid})+'\n');
  });
}
export async function qoderDesktopIdentityHeaders({uid,desktopPath='',locate=locateQoderDesktop,run=runQoderNativeIdentity,readMachineId}={}){
  if(typeof uid!=='string'||!uid||uid.length>200||/[\r\n]/.test(uid))throw rewardFailure('DESKTOP_IDENTITY_REQUIRED');
  const app=await locate(desktopPath);
  let machineId;try{machineId=(readMachineId?await readMachineId():await readFile(join(process.env.APPDATA||join(homedir(),'AppData','Roaming'),'com.qoder.app.stable','auth.machine-id'),'utf8')).trim()}catch{throw rewardFailure('DESKTOP_IDENTITY_REQUIRED')}
  if(!/^[A-Za-z0-9-]{16,100}$/.test(machineId))throw rewardFailure('DESKTOP_IDENTITY_REQUIRED');
  const key=JSON.stringify([app.executable,app.version,machineId,uid]),hit=identityCache.get(key);
  if(hit&&Date.now()-hit.at<40*60000)return hit.promise;
  const promise=(async()=>{
    const identity=await run(app.executable,uid);
    const headers={'Cosy-Version':app.version,'Cosy-MachineOS':process.arch==='arm64'?'aarch64_win32':'x86_64_win32','Cosy-MachineId':machineId,'Cosy-MachineToken':identity.machineToken,'Cosy-MachineCode':identity.machineCode,'Cosy-MachineType':identity.machineType};
    const host=hostname();if(/^[\x21-\x7e][\x20-\x7e]{0,95}$/.test(host))headers['Cosy-MachineHostname']=host;
    return headers;
  })();identityCache.set(key,{at:Date.now(),promise});
  try{return await promise}catch(error){identityCache.delete(key);throw error}
}
