import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
const exec=promisify(execFile);
export function validNode(version){const match=/^(\d+)\.(\d+)\.\d+$/.exec(version||'');return !!match&&(Number(match[1])>24||Number(match[1])===24&&Number(match[2])>=9);}
export async function inspectNode(path){
 try{if(!(await stat(path)).isFile())return null;const env={...process.env};delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;
 const {stdout}=await exec(path,['-p','JSON.stringify({version:process.versions.node,electron:!!process.versions.electron})'],{env,windowsHide:true,timeout:4000,maxBuffer:8192});const value=JSON.parse(stdout.trim());return !value.electron&&validNode(value.version)?{state:'ready',path,version:value.version}:null;}catch{return null;}
}
export async function findBackgroundNode(directory,{electron=!!process.versions.electron,hostExecPath=process.execPath,candidates,probe=inspectNode}={}){
 let selected='';try{selected=JSON.parse(await readFile(join(directory,'background-node.json'),'utf8')).path||'';}catch{}
 let installed=[];try{installed=(await readdir(join(directory,'background-runtime'))).filter(n=>/^node-\d+\.\d+\.\d+(?:\.exe)?$/.test(n)).map(n=>join(directory,'background-runtime',n));}catch{}
 const local=process.env.LOCALAPPDATA||join(homedir(),'AppData','Local');const dirs=[join(local,'Programs','dkn-node'),join(local,'Programs','nodejs'),join(process.env.ProgramFiles||'C:/Program Files','nodejs'),...(process.env.PATH||'').split(process.platform==='win32'?';':':')];
 const paths=candidates||[selected,...installed,...(!electron?[hostExecPath]:[]),...dirs.filter(Boolean).map(d=>join(d.replace(/^"|"$/g,''),process.platform==='win32'?'node.exe':'node'))];
 for(const path of [...new Set(paths.filter(p=>typeof p==='string'&&p))]){if(electron&&path.toLowerCase()===hostExecPath.toLowerCase())continue;const found=await probe(path);if(found)return found;}
 return{state:'missing',message:'未检测到独立 Node.js 24.9+。复制下方部署提示词给自己的 AI，完成后点击重新检测。'};
}
export function backgroundDeploymentPrompt(directory){return `请为我部署 DKN Workbench 插件的独立后台运行环境。当前平台：${process.platform} / ${process.arch}。\n\n1. 先查找已安装的独立 Node.js（PATH、用户 Programs/dkn-node、Programs/nodejs 等），执行 node -p 'JSON.stringify({version:process.versions.node,electron:!!process.versions.electron})'，要求版本至少 24.9 且 electron 为 false。DSH.exe/Electron 不能作为 Node。\n2. 没有合适版本时，从 https://nodejs.org/ 官方源部署适配当前架构的 Node.js 24 LTS 便携运行时，验证官方 SHA-256；安装到当前用户的私有目录，无需管理员权限，不改系统 PATH，不覆盖已有 Node。\n3. 验证可执行文件后，将其绝对路径写入 ${join(directory,'background-node.json')}，JSON 格式为 {"path":"<独立 Node 可执行文件的绝对路径，反斜杠需按 JSON 转义>"}。已有该文件时先备份，使用 UTF-8。\n4. 不要修改或输出 API Key、官方登录凭据、模型路由及签到记录；不要退出 DSH/Codex、替换 DSH 文件、自动领取奖励或擅自开启登录自启。\n5. 完成后告诉我实际 Node 路径和版本，让我回到插件页点击“重新检测环境”，再“启动后台”。若网络受限，说明具体失败原因，不使用来历不明的镜像。`;}
