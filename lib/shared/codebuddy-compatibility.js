const required=['--tools','--setting-sources','--strict-mcp-config','--mcp-config','--no-session-persistence'];
const verified=new Map();
export function supportedAccountVersion(version){const match=/^2\.(\d+)\.(\d+)$/.exec(version||'');return !!match&&Number(match[1])>=174}
export async function probeAccountCompatibility(cli,invocation,env,{run,signal}={}){
  if(!supportedAccountVersion(cli.version))throw new Error('号池支持稳定版 CodeBuddy CLI 2.174 及以上的 2.x 版本');
  const key=JSON.stringify([invocation.command,invocation.args,cli.version]);
  if(verified.has(key))return verified.get(key);
  const {stdout}=await run(invocation.command,[...invocation.args,'--help'],{env,signal,timeoutMs:10000,maxStdoutBytes:262144});
  const missing=required.filter(flag=>!stdout.includes(flag));
  if(missing.length)throw new Error('CLI 缺少号池所需参数：'+missing.join('、'));
  const result={version:cli.version,mode:'capability-checked',checkedAt:Date.now()};verified.set(key,result);return result;
}
