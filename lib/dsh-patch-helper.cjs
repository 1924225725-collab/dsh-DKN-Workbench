// Standalone: copied outside app.asar before launch; no plugin or model imports.
const fs = require(process.versions.electron ? 'original-fs' : 'node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {setTimeout: delay} = require('node:timers/promises');
const io = fs.promises;
async function hash(file) {
  const digest=crypto.createHash('sha256');
  for await(const part of fs.createReadStream(file)) digest.update(part);
  return digest.digest('hex');
}
function validate(job) {
  if(!path.isAbsolute(job.archive)||path.basename(job.archive)!=='app.asar') throw new Error('Invalid archive path');
  if(path.dirname(job.staged)!==path.dirname(job.archive)||!job.staged.startsWith(job.archive+'.dkn-agent-')||!job.staged.endsWith('.tmp')) throw new Error('Invalid staged path');
  if(job.backup!==job.archive+'.dkn-agent-'+job.sourceHash.slice(0,16)+'.bak') throw new Error('Invalid backup path');
}
async function commit(job) {
  validate(job);
  if(await hash(job.archive)!==job.sourceHash) throw new Error('DSH 程序已更新，取消旧补丁；请更新插件后重试');
  if(await hash(job.staged)!==job.stagedHash) throw new Error('待安装补丁校验失败，原文件未修改');
  try {await io.lstat(job.backup); throw new Error('备份已存在，未覆盖');} catch(e) {if(e.code!=='ENOENT')throw e;}
  await io.rename(job.archive,job.backup);
  try { await io.rename(job.staged,job.archive); }
  catch(error) { await io.rename(job.backup,job.archive); throw error; }
  // All unpacked resources are unchanged; retain the original directory in place.
  await io.rm(job.staged+'.unpacked',{recursive:true,force:true}).catch(()=>{});
}
function alive(pid) {try {process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
async function run(jobPath,{isAlive=alive,sleep=delay,deadlineMs=15*60*1000}={}) {
  const job=JSON.parse(await io.readFile(jobPath,'utf8'));
  validate(job);
  const started=Date.now();
  try {
    while(isAlive(job.parentPid)) {
      if(Date.now()-started>deadlineMs)throw new Error('等待退出 DSH 超时，请重新启用插件后再退出 DSH');
      await sleep(1000);
    }
    while(true) {
      try {await commit(job);break;}
      catch(e) {
        if(!['EBUSY','EPERM','EACCES'].includes(e.code)||Date.now()-started>deadlineMs)throw e;
        await sleep(1000);
      }
    }
    job.status='complete';
  } catch(e) {job.status='failed';job.reason=e.message;}
  await io.writeFile(jobPath,JSON.stringify(job));
  if(job.status==='failed') {
    // Keep all recovery bytes if restoration failed and app.asar is missing.
    try {
      await io.access(job.archive);
      await io.rm(job.staged,{force:true});
      await io.rm(job.staged+'.unpacked',{recursive:true,force:true});
    } catch {}
  }
  if(__filename===job.staged+'.helper.cjs') await io.rm(__filename,{force:true}).catch(()=>{});
  return job;
}
module.exports={hash,commit,run};
if(require.main===module)run(process.argv[2]).catch(()=>{process.exitCode=1;});
