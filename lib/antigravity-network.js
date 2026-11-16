import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function antigravityEnv(config={}){
 const value=key=>typeof config[key]?.get==='function'?config[key].get():config[key];const env={...process.env};let proxy=String(value('antigravityProxy')||'').trim();
 if(!proxy&&process.platform==='win32'&&String(value('antigravitySystemProxy')??'true')==='true'&&!env.HTTPS_PROXY&&!env.https_proxy){
  try{const {stdout}=await exec('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],{windowsHide:true,timeout:3000,maxBuffer:65536});if(/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(stdout)){const server=stdout.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim();proxy=server?.includes('=')?(server.match(/(?:^|;)https=([^;]+)/i)?.[1]||server.match(/(?:^|;)http=([^;]+)/i)?.[1]||''):server||'';if(proxy&&!proxy.includes('://'))proxy='http://'+proxy;}}catch{}
 }
 if(proxy){let url;try{url=new URL(proxy)}catch{throw Error('Antigravity 代理地址格式无效');}if(!['http:','https:','socks5:','socks5h:'].includes(url.protocol)||url.username||url.password)throw Error('代理需为 HTTP/HTTPS/SOCKS5 地址；认证代理请在运行环境中配置。');env.HTTP_PROXY=proxy;env.HTTPS_PROXY=proxy;env.http_proxy=proxy;env.https_proxy=proxy;}
 return env;
}
