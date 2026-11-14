import {pluginVersion} from './version.js';

export const repositoryUrl='https://github.com/1924225725-collab/dsh-DKN-Workbench';
export function compareVersions(left,right){
  const parse=value=>/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value||'')?.slice(1).map(BigInt);
  const a=parse(left),b=parse(right);if(!a||!b)return null;
  for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;
  return 0;
}
export function createUpdateChecker({fetchImpl=fetch,currentVersion=pluginVersion}={}){
  let pending;
  return {check(){return pending??=Promise.resolve().then(async()=>{
    const response=await fetchImpl('https://api.github.com/repos/1924225725-collab/dsh-DKN-Workbench/releases/latest',{
      headers:{Accept:'application/vnd.github+json','User-Agent':'dsh-DKN-Workbench/'+currentVersion},signal:AbortSignal.timeout(10000),redirect:'error'
    });
    if(!response.ok)throw new Error('GitHub 暂时无法查询版本');
    const value=await response.json();
    if(value.draft||value.prerelease||compareVersions(value.tag_name,currentVersion)===null)throw new Error('没有有效的稳定版版本号');
    return {state:'checked',currentVersion,latestVersion:value.tag_name.replace(/^v/,''),updateAvailable:compareVersions(value.tag_name,currentVersion)>0,releaseUrl:repositoryUrl+'/releases/latest',repositoryUrl,checkedAt:Date.now()};
  }).catch(()=>({state:'unavailable',currentVersion,updateAvailable:false,error:'无法检查更新，可到 GitHub 查看',releaseUrl:repositoryUrl+'/releases/latest',checkedAt:Date.now()}))}};
}
