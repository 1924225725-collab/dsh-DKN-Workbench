import {spawn} from 'node:child_process';
import {extname} from 'node:path';
import {tmpdir} from 'node:os';

// Account-only subset of the official SDK daemon v2 protocol. No session or prompt.
export function readQoderQuota(path,{spawnImpl=spawn,timeoutMs=20000}={}){
  return new Promise((resolve,reject)=>{
    const js=/\.[cm]?js$/i.test(extname(path));
    const child=spawnImpl(js?process.execPath:path,[...(js?[path]:[]),'--sdk'],{cwd:tmpdir(),windowsHide:true,env:{...process.env,QODER_AGENT_SDK_DAEMON:'1',ELECTRON_RUN_AS_NODE:'1'},stdio:['pipe','pipe','pipe']});
    child.stdout.setEncoding('utf8');
    let buffer='',settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);child.stdin.end();child.kill();error?reject(error):resolve(value)};
    const timer=setTimeout(()=>finish(new Error('Qoder 账号额度查询超时')),timeoutMs);
    const send=(id,type,params={})=>child.stdin.write(JSON.stringify({type:'control_request',request_id:id,request:{type:'daemon.'+type,...params}})+'\n');
    child.stderr.on('data',()=>{});child.stdin.on('error',()=>finish(new Error('Qoder 额度查询通道关闭')));
    child.once('error',()=>finish(new Error('Qoder CLI 无法启动')));child.once('close',()=>finish(new Error('Qoder 额度查询进程已退出，请检查 CLI 版本和登录')));
    child.stdout.on('data',chunk=>{
      buffer+=chunk;if(Buffer.byteLength(buffer)>1024*1024)return finish(new Error('Qoder 额度响应超出限制'));
      let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.trim())continue;
        let message;try{message=JSON.parse(line)}catch{return finish(new Error('Qoder 额度响应格式无效'))}
        if(message.type!=='control_response')continue;
        const response=message.response;if(!['init','quota'].includes(response?.request_id))continue;
        if(response.subtype!=='success')return finish(new Error('Qoder 额度查询失败：'+String(response.code||'请检查登录状态')));
        if(response.request_id==='init'){
          if(!response.response?.capabilities?.includes('daemon_queries_v1'))return finish(new Error('当前 Qoder CLI 不支持账号额度查询，请升级 CLI'));
          send('quota','get_usage_info');
        }else{
          const usage=response.response?.usage;
          if(!usage)return finish(new Error('Qoder 暂未返回账号额度，请检查 CLI 登录状态'));
          // Project only quota fields, never account IDs, tokens or session details.
          const buckets=[];
          for(const [key,label] of [['userQuota','套餐'],['addOnQuota','加量包'],['orgResourcePackage','组织额度']]){
            const bucket=usage[key];if(!bucket)continue;
            const row={label,unit:typeof bucket.unit==='string'?bucket.unit:'Credits'};
            for(const field of ['remaining','used','total','cap'])if(typeof bucket[field]==='number'&&Number.isFinite(bucket[field]))row[field]=bucket[field];
            if(Object.hasOwn(row,'remaining')||Object.hasOwn(row,'used'))buckets.push(row);
          }
          if(!buckets.length)return finish(new Error('Qoder 已登录，但服务未返回额度明细'));
          finish(null,{state:'available',source:'qoder-cli',buckets});
        }
      }
    });
    send('init','initialize',{daemon_protocol_version:2,sdk_version:'1.0.59',capabilities:['multi_session_v2'],auth:{type:'qodercli'}});
  });
}
