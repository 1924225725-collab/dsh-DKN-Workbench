import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const [react,dom,client]=await Promise.all(['node_modules/react/umd/react.development.js','node_modules/react-dom/umd/react-dom.development.js','lib/client.js'].map(p=>readFile(p,'utf8')));
const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body,#app{height:100%;margin:0}body{font:14px Segoe UI,sans-serif;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);--dsw-alias-bg-layer-1:#17191e;--dsw-alias-bg-layer-2:#202228;--dsw-alias-bg-layer-3:#292b31;--dsw-alias-label-primary:#e7e9ee;--dsw-alias-label-secondary:#a0a6b2;--dsw-alias-border-l4:#454850}body.light{--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f5f6f8;--dsw-alias-bg-layer-3:#e9edf3;--dsw-alias-label-primary:#202329;--dsw-alias-label-secondary:#595f6a;--dsw-alias-border-l4:#d4d8df}button,input,select,textarea{font:inherit}button{width:fit-content}</style><div id="app"></div><script>${react}</script><script>${dom}</script><script>let api;window.__ModuleLoader__={load(m){api=m.factory(()=>React)}};</script><script>${client.replaceAll('</script','<\\/script')}</script><script>
const listeners=new Set();let value={showCodeBuddyQuota:'true',showCodexQuota:'true',showDeepSeekQuota:'true',showQoderQuota:'true',showZcodeQuota:'true'};
let snapshot={status:'ready',writable:true,value,revision:1};const form={getSnapshot:()=>snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},async set(key,v){value={...value,[key]:v};snapshot={...snapshot,value,revision:snapshot.revision+1};for(const fn of listeners)fn();return true}};
const root=ReactDOM.createRoot(document.getElementById('app'));
const pages={'dkn-agent-models':api.DknModelsPage,'dkn-agent-cli':api.CodexCliSettingsPage,'dkn-agent-zcode':api.ZcodeSettingsPage,'dkn-agent-qoder':api.QoderSettingsPage,'dkn-agent-codex':api.CodexSettingsPage,'dkn-agent-quota':api.QuotaSettingsPage};
const ctx={emit(){},configForms:{get:()=>form},layout:{selectPanel(id){window.openedPanel=id;render(id)}}};
const t=key=>({cn:'国内版',intl:'国际版',regionPicker:'配置区域',quickSetup:'CLI 安装与检测',navconnection:'连接',navmodels:'模型',navusage:'用量'}[key]||key);
const regions=['cn','intl'].map(id=>({id,props:{t,region:id,legacyForm:form,statusUrl:'/plugins/dsh-codebuddy-cli-'+id+'/status'}}));
function render(id){root.render(React.createElement(id==='codebuddy-cli'?api.UnifiedSettingsPage:pages[id],id==='codebuddy-cli'?{ctx,t,regions}:{ctx}));}
window.render=render;window.setAllFlags=async()=>{for(const key of Object.keys(value))await form.set(key,'false')};window.renderFooter=()=>root.render(React.createElement(api.QuotaFooterAction,{ctx,wide:true}));render('dkn-agent-models');</script>`;
const probes=[];let updateQueries=0;const claimedRewards=new Set();let rewardClaims=0;let failedRewardQuery='';
const server=createServer((req,res)=>{
 if(req.url.includes('/checkin')){const key=req.url.includes('codebuddy')?'codebuddy':'qoder';if(req.method==='POST'){rewardClaims++;claimedRewards.add(key)}res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({state:req.method==='GET'&&failedRewardQuery===key?'error':claimedRewards.has(key)?'claimed':'claimable',amount:100,resetAt:Date.now()+3600000,mutationAccepted:req.method==='POST'}));}
 if(req.url.endsWith('/update')){updateQueries++;res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({currentVersion:'2.1.2',latestVersion:'2.2.0',updateAvailable:true}));}
 if(req.method==='POST'&&(req.url.endsWith('/test')||req.url.endsWith('/actions'))){probes.push(req.url);res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({state:'ready',text:'OK'}));}
 if(req.url.startsWith('/plugins/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(req.url.split('?')[0].endsWith('/quota')?{codex:{state:'available',rateLimits:{rateLimits:{primary:{usedPercent:81,windowDurationMins:300,resetsAt:Date.now()/1000+1800}}}},deepseek:{state:'available',source:'dsh-account',wallets:[{currency:'CNY',kind:'充值',balance:'12.345'},{currency:'CNY',kind:'赠金',balance:'0'}]},qoder:{state:'available',buckets:[{label:'套餐',unit:'Credits',remaining:300,total:300}]},zcode:{state:'available',source:'zcode-start-plan',activePlans:0},updatedAt:Date.now()}:req.url.endsWith('/state')?{connected:false}:{state:req.url.includes('/cli/')?'ready':'found',path:'C:/synthetic/provider.exe',enabled:true,registered:true,models:[],usage:{calls:0,credits:0},quota:{state:'available',region:req.url.includes('-cn/')?'cn':'intl',remaining:88.5}}));}
 res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});page.setDefaultTimeout(5000);
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('dialog',{name:'感谢使用 DKN Workbench'}).waitFor();
 assert.equal(await page.getByRole('link',{name:'☆ 前往 GitHub',exact:true}).getAttribute('href'),'https://github.com/1924225725-collab/dsh-DKN-Workbench');
 await page.getByRole('button',{name:'继续使用',exact:true}).click();
 assert.equal(probes.length,0);
 assert.equal(await page.getByLabel('DeepSeek 剩余额度',{exact:true}).count(),0);
 for(const provider of ['CodeBuddy','Codex','Qoder','ZCode']){
  await page.getByRole('button',{name:'验证 '+provider,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'验证 '+provider,exact:true});
  await dialog.getByRole('button',{name:'开始验证',exact:true}).click();
  await dialog.getByText('验证成功 · 实际回复',{exact:true}).waitFor();
  assert.equal(await dialog.locator('pre').textContent(),'OK');
  await dialog.getByRole('button',{name:'关闭验证 '+provider,exact:true}).click();
 }
 assert.equal(probes.length,4);
 const summary=page.getByRole('region',{name:'签到状态',exact:true});
 await summary.getByText('CodeBuddy 国内：可签到',{exact:true}).waitFor();assert.equal(rewardClaims,0);
 await summary.getByRole('button',{name:'一键签到',exact:true}).click();
 await summary.getByText('处理完成：已领取 2，跳过 0，待处理 0。',{exact:true}).waitFor();
 assert.equal(rewardClaims,2);await summary.getByText('Qoder 国际：当前周期已领取',{exact:true}).waitFor();
 assert.equal(await summary.getByRole('button',{name:'一键签到',exact:true}).isDisabled(),true);
 claimedRewards.clear();rewardClaims=0;failedRewardQuery='codebuddy';
 await page.evaluate(()=>{window.render('dkn-agent-cli')});await page.locator('[data-provider-settings="codex"]').waitFor();await page.evaluate(()=>window.render('dkn-agent-models'));
 await summary.getByText('CodeBuddy 国内：查询失败',{exact:true}).waitFor();await summary.getByText('Qoder 国际：可签到',{exact:true}).waitFor();
 await summary.getByRole('button',{name:'一键签到',exact:true}).click();await summary.getByText('处理完成：已领取 1，跳过 0，待处理 1。',{exact:true}).waitFor();assert.equal(rewardClaims,1);
 failedRewardQuery='';claimedRewards.clear();rewardClaims=0;
 assert.equal(await page.getByRole('button',{name:'Codex',exact:true}).count(),1);
 assert.equal(await page.getByText('Codex Agent',{exact:false}).count(),0);
 await mkdir('research/ui',{recursive:true});await page.screenshot({path:'research/ui/settings-models-dark.png'});
 for(const [label,id,provider] of [['CodeBuddy','codebuddy-cli','codebuddy'],['Codex','dkn-agent-cli','codex'],['Qoder','dkn-agent-qoder','qoder'],['ZCode','dkn-agent-zcode','zcode']]){
  await page.evaluate(()=>window.render('dkn-agent-models'));
  await page.getByRole('button',{name:label,exact:true}).click();
  await page.locator('[data-provider-settings="'+provider+'"]').waitFor();
  if(['codebuddy','qoder'].includes(provider)){
   const rewards=page.getByRole('region',{name:'每日奖励 '+provider,exact:true});await rewards.getByRole('button',{name:'一键签到',exact:true}).waitFor();
   assert.equal(rewardClaims,provider==='codebuddy'?0:1);
   await rewards.getByRole('button',{name:'一键签到',exact:true}).click();
   await rewards.getByText('当前周期已领取',{exact:true}).waitFor();assert.equal(await rewards.getByRole('button',{name:'一键签到',exact:true}).isDisabled(),true);
  }
  if(provider==='codebuddy'){
   await page.getByRole('button',{name:'国际版',exact:true}).click();
   assert.equal(await page.locator('[data-region="intl"]').isVisible(),true);
   assert.equal(await page.locator('[data-region="cn"]').isVisible(),false);
  }
  await page.getByRole('button',{name:'额度与用量',exact:true}).click();
  await page.getByRole('navigation',{name:'额度平台'}).waitFor();
  assert.equal(await page.locator('article').count(),1);
  assert.equal(await page.locator('article strong').first().textContent(),label);
  if(label==='CodeBuddy')await page.getByText('国内版：剩余 88.5 积分；国际版：剩余 88.5 积分',{exact:true}).waitFor();
  if(label==='Qoder')await page.getByText('套餐 剩余 300 Credits / 300',{exact:true}).waitFor();
  if(label==='ZCode')await page.getByText('Start Plan：无有效套餐',{exact:true}).waitFor();
  await page.getByRole('button',{name:'刷新额度',exact:true}).click();await page.getByRole('button',{name:'刷新额度',exact:true}).waitFor();
  await page.getByRole('button',{name:'全部',exact:true}).click();assert.equal(await page.locator('article').count(),5);await page.getByText('充值 CNY 12.35 · 赠金 CNY 0.00',{exact:true}).waitFor();
  if(label==='ZCode')await page.screenshot({path:'research/ui/quota-2.1.0-dark.png',fullPage:true});
  await page.evaluate(id=>window.render(id),id);
  await page.screenshot({path:'research/ui/settings-'+provider+'-dark.png',fullPage:true});
 }
 for(const mode of ['dark','light']){
  await page.evaluate(mode=>document.body.classList.toggle('light',mode==='light'),mode);
  await page.setViewportSize({width:390,height:800});
  for(const id of ['dkn-agent-models','codebuddy-cli','dkn-agent-cli','dkn-agent-qoder','dkn-agent-zcode','dkn-agent-quota','dkn-agent-codex']){
   await page.evaluate(id=>window.render(id),id);await page.waitForTimeout(80);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,id+' must fit mobile width');
  }
  await page.screenshot({path:'research/ui/settings-project-'+mode+'-narrow.png',fullPage:true});
 }
 await page.evaluate(()=>window.renderFooter());
 await page.getByRole('dialog',{name:'发现插件新版本'}).waitFor();
 assert.equal(updateQueries,1);
 assert.equal(await page.getByRole('link',{name:'GitHub 下载更新'}).getAttribute('href'),'https://github.com/1924225725-collab/dsh-DKN-Workbench/releases/latest');
 await page.getByRole('button',{name:'稍后更新',exact:true}).click();
 const footer=page.getByRole('button',{name:'额度与用量',exact:true});await footer.waitFor();assert.equal(await footer.locator('svg').count(),1);assert.equal(await footer.textContent(),'');
 await footer.click();await page.getByRole('navigation',{name:'额度平台'}).waitFor();
 await page.evaluate(async()=>{await window.setAllFlags();window.renderFooter()});await page.waitForTimeout(80);assert.equal(await page.getByRole('button').count(),0);assert.equal(updateQueries,1);assert.equal(await page.getByRole('dialog').count(),0);
 assert.deepEqual(errors,[]);console.log('Settings fixture passed: all provider routes, scoped usage, footer navigation/visibility, light/dark and narrow layouts. No live model requests.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
