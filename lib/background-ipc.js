import {request} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function backgroundControl(directory){
 await mkdir(directory,{recursive:true});const file=join(directory,'background-control.json');
 const pipe=process.platform==='win32'?'\\\\.\\pipe\\dkn-workbench-'+createHash('sha256').update(directory.toLowerCase()).digest('hex').slice(0,24):join(directory,'background.sock');
 try{await writeFile(file,JSON.stringify({pipe,token:randomBytes(32).toString('hex')}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
 let control;
 for(let i=0;i<8;i++)try{control=JSON.parse(await readFile(file,'utf8'));break;}catch(e){if(i===7)throw Error('后台控制文件读取失败。');await new Promise(r=>setTimeout(r,25));}
 if(control.pipe!==pipe||!/^[a-f0-9]{64}$/.test(control.token))throw Error('后台控制文件无效。');return control;
}
export function backgroundCall(control,action,input={},timeout=90000){return new Promise((resolve,reject)=>{
 const body=JSON.stringify({action,input});const req=request({socketPath:control.pipe,path:'/',method:'POST',headers:{Authorization:'Bearer '+control.token,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
  let data='',size=0;res.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){req.destroy();reject(Error('后台响应过大'));}else data+=chunk;});res.on('end',()=>{try{const value=JSON.parse(data);if(res.statusCode!==200)throw Error(value.error||'后台操作失败');resolve(value);}catch(e){reject(e);}});
 });req.setTimeout(timeout,()=>req.destroy(Error('后台操作超时')));req.on('error',reject);req.end(body);
});}
