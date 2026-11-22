import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const [react,dom,client]=await Promise.all(['node_modules/react/umd/react.development.js','node_modules/react-dom/umd/react-dom.development.js','lib/client.js'].map(p=>readFile(p,'utf8')));
const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body,#app{height:100%;margin:0}body{font:14px Segoe UI,sans-serif;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);--dsw-alias-bg-layer-1:#17191e;--dsw-alias-bg-layer-2:#202228;--dsw-alias-bg-layer-3:#292b31;--dsw-alias-label-primary:#e7e9ee;--dsw-alias-label-secondary:#a0a6b2;--dsw-alias-border-l4:#454850}body.light{--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f5f6f8;--dsw-alias-bg-layer-3:#e9edf3;--dsw-alias-label-primary:#202329;--dsw-alias-label-secondary:#595f6a;--dsw-alias-border-l4:#d4d8df}button,input,select,textarea{font:inherit}button{width:fit-content}</style><div id="app"></div><script>${react}</script><script>${dom}</script><script>let api;window.__ModuleLoader__={load(m){api=m.factory(()=>React)}};</script><script>${client.replaceAll('</script','<\\/script')}</script><script>
const listeners=new Set();let value={showOrcatermQuota:'true',showTraeQuota:'true',showCodeBuddyQuota:'true',showCodexQuota:'true',showDeepSeekQuota:'true',showQoderQuota:'true',showZcodeQuota:'true'};
let snapshot={status:'ready',writable:true,value,revision:1};const form={getSnapshot:()=>snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},async set(key,v){value={...value,[key]:v};snapshot={...snapshot,value,revision:snapshot.revision+1};for(const fn of listeners)fn();return true}};
const root=ReactDOM.createRoot(document.getElementById('app'));
const pages={'dkn-agent-orcaterm':api.OrcaTermSettingsPage,'dkn-agent-trae':api.TraeSettingsPage,'dkn-agent-settings':api.DknSettingsPage,'dkn-api-service':api.ApiServicePage,'dkn-agent-models':api.DknModelsPage,'dkn-agent-cli':api.CodexCliSettingsPage,'dkn-agent-zcode':api.ZcodeSettingsPage,'dkn-agent-antigravity':api.AntigravitySettingsPage,'dkn-agent-qoder':api.QoderSettingsPage,'dkn-agent-codex':api.CodexSettingsPage,'dkn-agent-quota':api.QuotaSettingsPage};
const ctx=Object.create({emit(){},configForms:{get(){if(window.failForm)throw Error('Fixture configuration unavailable');return form}},layout:{selectPanel(id){window.openedPanel=id;render(id)}}});
const t=key=>({cn:'国内版',intl:'国际版',regionPicker:'配置区域',quickSetup:'CLI 安装与检测',navconnection:'连接',navmodels:'模型',navusage:'用量'}[key]||key);
const regions=['cn','intl'].map(id=>({id,props:{t,region:id,legacyForm:form,statusUrl:'/plugins/dsh-codebuddy-cli-'+id+'/status'}}));
function render(id){root.render(React.createElement(id==='codebuddy-cli'?api.UnifiedSettingsPage:pages[id],id==='codebuddy-cli'?{ctx,t,regions}:{ctx}));}
window.renderPerformance=node=>root.render(React.createElement(api.PluginPerformancePill,{useChat:selector=>selector({legacy:{nodes:node?[node]:[]}})}));window.render=render;window.setAllFlags=async()=>{for(const key of Object.keys(value))await form.set(key,'false')};window.renderFooter=()=>root.render(React.createElement(api.QuotaFooterAction,{ctx,wide:true}));render('dkn-agent-models');</script>`;
const probes=[];let updateQueries=0;const claimedRewards=new Set();let rewardClaims=0;let failedRewardQuery='';let autoEnabled=false;let backgroundPrefs={running:true,keepAlive:false,autoStart:false,version:'fixture'};
const server=createServer((req,res)=>{
 if(req.url.endsWith('/background/state')){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(backgroundPrefs));}
 if(req.url.endsWith('/background/action')){let body='';req.on('data',part=>body+=part);req.on('end',()=>{const value=JSON.parse(body);backgroundPrefs={...backgroundPrefs,...value};res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(backgroundPrefs));});return;}
 if(req.url.endsWith('/auto-checkin')){const reply=()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({enabled:autoEnabled,scheduledAt:Date.now()+86400000,lastRun:null}));};if(req.method==='POST'){let body='';req.on('data',part=>body+=part);req.on('end',()=>{autoEnabled=JSON.parse(body).enabled;reply();});return;}return reply();}
 if(req.url.includes('/checkin')){if(req.url.includes('provider=trae')){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({state:'no-activity'}));}const key=req.url.includes('codebuddy')?'codebuddy':'qoder';if(req.method==='POST'){rewardClaims++;claimedRewards.add(key)}res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({state:req.method==='GET'&&failedRewardQuery===key?'error':claimedRewards.has(key)?'claimed':'claimable',amount:100,resetAt:Date.now()+3600000,mutationAccepted:req.method==='POST'}));}
 if(req.url.endsWith('/update')){updateQueries++;res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({currentVersion:'2.1.2',latestVersion:'2.2.0',updateAvailable:true}));}
 if(req.method==='POST'&&(req.url.endsWith('/test')||req.url.endsWith('/actions'))){probes.push(req.url);res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({state:'ready',text:'OK'}));}
 if(req.url.startsWith('/plugins/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(req.url.split('?')[0].endsWith('/quota')?{orcaterm:{state:'available',buckets:[{label:'AI 问答',unit:'次',remaining:97,total:100}]},trae:{state:'available',buckets:[{label:'可用积分',unit:'积分',remaining:2900,total:2900}]},codex:{state:'available',rateLimits:{rateLimits:{primary:{usedPercent:81,windowDurationMins:300,resetsAt:Date.now()/1000+1800}}}},deepseek:{state:'available',source:'dsh-account',wallets:[{currency:'CNY',kind:'充值',balance:'12.345'},{currency:'CNY',kind:'赠金',balance:'0'}]},qoder:{state:'available',buckets:[{label:'套餐',unit:'Credits',remaining:300,total:300}]},zcode:{state:'available',source:'zcode-start-plan',activePlans:0},updatedAt:Date.now()}:req.url.endsWith('/state')?{connected:false}:{loginFound:req.url.includes('/trae/'),installPath:'C:/synthetic/Trae CN',state:req.url.includes('/cli/')?'ready':'found',path:'C:/synthetic/provider.exe',enabled:true,registered:true,models:[],usage:{calls:0,credits:0},quota:{state:'available',region:req.url.includes('-cn/')?'cn':'intl',remaining:88.5}}));}
 res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});page.setDefaultTimeout(5000);
try{
 await page.addInitScript(()=>{if(!localStorage.getItem('fixture-initialized')){localStorage.setItem('dkn-workbench:visual-style','illustrated');localStorage.setItem('fixture-initialized','1')}});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('dialog',{name:'感谢使用 DKN Workbench'}).waitFor();
 const thanks=page.getByRole('dialog',{name:'感谢使用 DKN Workbench'});
 assert.equal(await thanks.evaluate(node=>getComputedStyle(node).animationName),'dkn-dialog-enter');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await thanks.evaluate(node=>getComputedStyle(node).animationName),'none');
 assert.equal(await page.locator('main').evaluate(node=>getComputedStyle(node).animationName),'none');
 assert.equal(await thanks.locator('button').first().evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
 await page.emulateMedia({reducedMotion:'no-preference'});
 assert.equal(await page.getByRole('link',{name:'☆ 前往 GitHub',exact:true}).getAttribute('href'),'https://github.com/1924225725-collab/dsh-DKN-Workbench');
 await page.getByRole('button',{name:'继续使用',exact:true}).click();
 await page.getByRole('button',{name:'插件总设置',exact:true}).click();
 const general=page.getByRole('dialog',{name:'插件总设置',exact:true});await general.waitFor();assert.equal(await general.getByRole('checkbox').count(),7);
 await general.getByLabel('CodeBuddy 用量',{exact:true}).uncheck();await page.waitForFunction(()=>value.showCodeBuddyQuota==='false');assert.equal(await general.getByLabel('CodeBuddy 用量',{exact:true}).isChecked(),false);
 await general.getByLabel('CodeBuddy 用量',{exact:true}).check();await page.waitForFunction(()=>value.showCodeBuddyQuota==='true');
 await page.setViewportSize({width:390,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'research/ui/plugin-general-settings-narrow.png'});await page.getByRole('button',{name:'关闭插件总设置',exact:true}).click();await page.setViewportSize({width:1100,height:800});
 assert.equal(probes.length,0);
 assert.equal(await page.getByLabel('DeepSeek 剩余额度',{exact:true}).count(),0);
 for(const provider of ['CodeBuddy','Codex','Qoder','ZCode','Antigravity','TRAE CN','OrcaTerm']){
  await page.getByRole('button',{name:'验证 '+provider,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'验证 '+provider,exact:true});
  await dialog.getByRole('button',{name:'开始验证',exact:true}).click();
  await dialog.getByText('验证成功 · 实际回复',{exact:true}).waitFor();
  assert.equal(await dialog.locator('pre').textContent(),'OK');
  await dialog.getByRole('button',{name:'关闭验证 '+provider,exact:true}).click();
 }
 assert.equal(probes.length,7);
 assert.equal(await page.getByRole('region',{name:'签到状态',exact:true}).getByLabel('自动签到',{exact:true}).count(),0);
 await page.evaluate(()=>window.render('dkn-agent-settings'));await page.getByRole('navigation',{name:'工作台导航'}).getByRole('button',{name:'后台与自动化',exact:true}).click();
 const summary=page.locator('.wb-background-page');
 assert.equal(await summary.getByLabel('退出 DSH 后继续运行',{exact:true}).evaluate(node=>getComputedStyle(node).appearance),'none');
 const keep=summary.getByLabel('退出 DSH 后继续运行',{exact:true});await keep.waitFor();await keep.click();await page.waitForFunction(()=>document.querySelector('input[aria-label=\"退出 DSH 后继续运行\"]').checked);assert.equal(backgroundPrefs.keepAlive,true);
 const auto=summary.getByLabel('自动签到',{exact:true});await auto.waitFor();await page.waitForFunction(()=>!document.querySelector('input[aria-label="自动签到"]').disabled);assert.equal(await auto.isChecked(),false);await auto.check();await summary.getByText(/下次计划：/).waitFor();assert.equal(autoEnabled,true);assert.equal(rewardClaims,0);await auto.uncheck();await page.waitForFunction(()=>!document.querySelector('input[aria-label="自动签到"]').disabled);assert.equal(autoEnabled,false);
 await page.evaluate(()=>window.render('dkn-agent-models'));
 const checkin=page.getByRole('region',{name:'签到状态',exact:true});
 await checkin.getByText('CodeBuddy 国内：可签到',{exact:true}).waitFor();assert.equal(rewardClaims,0);
 await checkin.getByRole('button',{name:'一键签到',exact:true}).click();
 await checkin.getByText('处理完成：已领取 2，跳过 1，待处理 0。',{exact:true}).waitFor();
 assert.equal(rewardClaims,2);await checkin.getByText('Qoder 国际：当前周期已领取',{exact:true}).waitFor();
 assert.equal(await checkin.getByRole('button',{name:'一键签到',exact:true}).isDisabled(),true);
 claimedRewards.clear();rewardClaims=0;failedRewardQuery='codebuddy';
 await page.evaluate(()=>{window.render('dkn-agent-cli')});await page.locator('[data-provider-settings="codex"]').waitFor();await page.evaluate(()=>window.render('dkn-agent-models'));
 await checkin.getByText('CodeBuddy 国内：查询失败',{exact:true}).waitFor();await checkin.getByText('Qoder 国际：可签到',{exact:true}).waitFor();
 await checkin.getByRole('button',{name:'一键签到',exact:true}).click();await checkin.getByText('处理完成：已领取 1，跳过 1，待处理 1。',{exact:true}).waitFor();assert.equal(rewardClaims,1);
 failedRewardQuery='';claimedRewards.clear();rewardClaims=0;
 assert.equal(await page.getByRole('button',{name:'Codex',exact:true}).count(),1);
 assert.equal(await page.getByText('Codex Agent',{exact:false}).count(),0);
 await mkdir('research/ui',{recursive:true});await page.waitForTimeout(220);await page.screenshot({path:'research/ui/settings-models-dark.png'});
 for(const [label,id,provider] of [['OrcaTerm','dkn-agent-orcaterm','orcaterm'],['CodeBuddy','codebuddy-cli','codebuddy'],['Codex','dkn-agent-cli','codex'],['Qoder','dkn-agent-qoder','qoder'],['Antigravity','dkn-agent-antigravity','antigravity'],['ZCode','dkn-agent-zcode','zcode'],['TRAE CN','dkn-agent-trae','trae']]){
  await page.evaluate(()=>window.render('dkn-agent-models'));
  await page.getByRole('button',{name:label,exact:true}).click();
  await page.locator('[data-provider-settings="'+provider+'"]').waitFor();
  assert.equal(await page.getByRole('region',{name:'签到状态',exact:true}).count(),0);
  if(provider==='antigravity'){await page.getByRole('navigation',{name:'配置内容'}).getByRole('button',{name:'高级',exact:true}).click();await page.getByText('使用 Windows 系统代理',{exact:false}).waitFor();await page.getByRole('navigation',{name:'配置内容'}).getByRole('button',{name:'连接',exact:true}).click();await page.getByRole('button',{name:'发送测试',exact:true}).click();await page.getByRole('status').filter({hasText:'OK'}).waitFor();await page.screenshot({path:'research/ui/settings-antigravity-dark.png',fullPage:true});continue;}
  if(provider==='codebuddy'){
   await page.getByRole('button',{name:'国际版',exact:true}).click();
   assert.equal(await page.locator('[data-region="intl"]').isVisible(),true);
   assert.equal(await page.locator('[data-region="cn"]').isVisible(),false);
  }
  if(provider==='qoder'){
   await page.getByRole('navigation',{name:'配置内容',exact:true}).getByRole('button',{name:'连接',exact:true}).click();await page.getByText('CLI 完整路径',{exact:true}).waitFor();
   await page.getByRole('navigation',{name:'配置内容',exact:true}).getByRole('button',{name:'模型',exact:true}).click();assert.equal(await page.getByText('CLI 完整路径',{exact:true}).count(),0);
   await page.getByRole('navigation',{name:'配置内容',exact:true}).getByRole('button',{name:'连接',exact:true}).click();
   await page.route('**/plugins/dkn-agent/qoder/connect',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.fulfill({json:{state:'found',path:'C:/synthetic/provider.exe',connection:{state:'connected'}}})});
   await page.getByRole('button',{name:'检测 ACP 连接',exact:true}).click();await page.locator('.wp-companion[data-active=true]').waitFor();await page.getByRole('button',{name:'检测 ACP 连接',exact:true}).waitFor();await page.unroute('**/plugins/dkn-agent/qoder/connect');
  }
  await page.getByRole('button',{name:'额度与用量',exact:true}).click();
  await page.getByRole('navigation',{name:'额度平台'}).waitFor();
  assert.equal(await page.locator('article').count(),1);
  assert.equal(await page.locator('article strong').first().textContent(),label);
  await page.getByText('明细与来源',{exact:true}).click();
  if(label==='CodeBuddy')await page.getByText('国内版：剩余 88.5 积分；国际版：剩余 88.5 积分',{exact:true}).waitFor();
  if(label==='Qoder')await page.getByText('套餐 剩余 300 Credits / 300',{exact:true}).waitFor();
  if(label==='ZCode')await page.getByText('Start Plan：无有效套餐',{exact:true}).waitFor();
  await page.getByRole('button',{name:'刷新额度',exact:true}).click();await page.getByRole('button',{name:'刷新额度',exact:true}).waitFor();
  await page.getByRole('button',{name:'全部',exact:true}).click();assert.equal(await page.locator('article').count(),7);await page.locator('.wp-quota-card').filter({has:page.getByText('DeepSeek',{exact:true})}).getByText('明细与来源',{exact:true}).click();await page.getByText('充值 CNY 12.35 · 赠金 CNY 0.00',{exact:true}).waitFor();
  if(label==='ZCode')await page.screenshot({path:'research/ui/quota-2.1.0-dark.png',fullPage:true});
  await page.evaluate(id=>window.render(id),id);
  await page.waitForTimeout(220);await page.screenshot({path:'research/ui/settings-'+provider+'-dark.png',fullPage:true});
 }
 for(const mode of ['dark','light']){
  await page.evaluate(mode=>document.body.classList.toggle('light',mode==='light'),mode);
  await page.setViewportSize({width:390,height:800});
  for(const id of ['dkn-agent-trae','dkn-agent-models','codebuddy-cli','dkn-agent-cli','dkn-agent-qoder','dkn-agent-antigravity','dkn-agent-zcode','dkn-agent-quota','dkn-agent-codex']){
   await page.evaluate(id=>window.render(id),id);await page.waitForTimeout(80);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,id+' must fit mobile width');
  }
  await page.screenshot({path:'research/ui/settings-project-'+mode+'-narrow.png',fullPage:true});
 }
   const sceneState={running:true,active:0,queued:0,publicModel:'dkn',models:['qoder-acp/test-model'],catalog:[],records:[]};
  await page.route('**/plugins/dkn-agent/api-export/state',route=>route.fulfill({json:sceneState}));
  await page.setViewportSize({width:1500,height:1000});await page.evaluate(()=>{document.body.classList.remove('light');window.render('dkn-agent-settings')});
  const scene=page.getByRole('region',{name:'模型调度场景'}),worknav=page.getByRole('navigation',{name:'工作台导航'});
  await scene.waitFor();assert.equal(await page.getByRole('combobox',{name:'界面风格',exact:true}).inputValue(),'simple','old illustrated preference migrates once');assert.equal(await scene.locator('img').count(),0);assert.equal(await scene.locator('.wb-platform').count(),7);
  assert.equal(await page.getByRole('button',{name:'项目协作',exact:true}).count(),0);
  const qoderWire=scene.locator('[data-wire=qoder]'),codexWire=scene.locator('[data-wire=codex]');
  await page.waitForFunction(()=>document.querySelector('[data-wire=qoder]')?.getAttribute('data-active')==='true');
  assert.ok(Number(await codexWire.evaluate(node=>getComputedStyle(node).opacity))<.1,'inactive connections stay subdued');
  await page.getByRole('button',{name:'配置 Codex',exact:true}).hover();await page.waitForFunction(()=>document.querySelector('[data-wire=codex]')?.getAttribute('data-emphasized')==='true');await page.waitForTimeout(700);assert.equal(await codexWire.locator('.wb-wire-light').evaluate(node=>getComputedStyle(node).strokeDashoffset),'0px');
  const alignment=await page.evaluate(()=>{const scene=document.querySelector('.wb-scene').getBoundingClientRect(),node=document.querySelector('[data-platform=codex]').getBoundingClientRect(),port=document.querySelector('[data-wire=codex] circle:last-child');return Math.abs(Number(port.getAttribute('cx'))-(node.left-scene.left-7))+Math.abs(Number(port.getAttribute('cy'))-(node.top-scene.top+node.height/2));});assert.ok(alignment<1,'ports follow the raised card');await page.screenshot({path:'research/ui/workbench-refined-hover.png',fullPage:true});
  await page.getByRole('button',{name:'配置 TRAE CN',exact:true}).focus();await page.waitForFunction(()=>document.querySelector('[data-wire=trae]')?.getAttribute('data-emphasized')==='true');
  await page.locator('.wb-header h2').click();await page.locator('.wb-header h2').hover();await page.waitForTimeout(300);assert.equal(await codexWire.getAttribute('data-emphasized'),'false');
  sceneState.active=1;await page.waitForFunction(()=>document.querySelector('.wb-courier')?.getAttribute('data-working')==='true',{},{timeout:8000});assert.equal(await scene.locator('.wb-courier').evaluate(node=>getComputedStyle(node).animationName),'sw-deliver');
  sceneState.active=0;await page.waitForFunction(()=>document.querySelector('[data-wire=qoder]')?.getAttribute('data-settled')==='true',{},{timeout:8000});assert.equal(await scene.locator('.wb-courier').evaluate(node=>getComputedStyle(node).display),'none');
  sceneState.models=['codex-cli/test-model'];await page.waitForFunction(()=>document.querySelector('[data-wire=codex]')?.getAttribute('data-active')==='true',{},{timeout:8000});await page.waitForTimeout(700);assert.equal(await qoderWire.locator('.wb-wire-light').evaluate(node=>getComputedStyle(node).strokeDashoffset),'1px');
  sceneState.models=['qoder-acp/test-model'];await page.waitForFunction(()=>document.querySelector('[data-wire=qoder]')?.getAttribute('data-active')==='true',{},{timeout:8000});

  await page.getByRole('button',{name:'配置 Qoder',exact:true}).click();
  const qoder=page.getByRole('complementary',{name:'Qoder配置抽屉'});await qoder.waitFor();await qoder.getByText('CLI 完整路径',{exact:true}).waitFor();
  // Inherited configForms/layout model the host service context; spreading it loses services.
  await qoder.getByLabel('CLI 完整路径',{exact:true}).fill('C:/fixture/qoder.exe');await qoder.getByLabel('CLI 完整路径',{exact:true}).press('Tab');await page.waitForFunction(()=>value.qoderPath==='C:/fixture/qoder.exe');
  await qoder.getByRole('navigation',{name:'配置内容'}).getByRole('button',{name:'高级',exact:true}).click();await qoder.getByText('默认工作目录',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'界面风格',exact:true}).selectOption('illustrated');assert.equal(await qoder.isVisible(),true,'style changes preserve open detail');await page.waitForFunction(()=>document.querySelector('.wb-desk img')?.naturalWidth>0);
  await page.getByRole('combobox',{name:'界面风格',exact:true}).selectOption('simple');assert.equal(await scene.locator('img').count(),0);
  await qoder.getByRole('button',{name:'关闭配置抽屉'}).click();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='配置 Qoder');
  // Malformed or failed status responses must keep the page and controls visible.
  await page.route('**/plugins/dkn-agent/qoder/status',route=>route.fulfill({json:{state:'found',models:{unexpected:true},path:'C:/fixture/qoder.exe'}}));
  await page.getByRole('button',{name:'配置 Qoder',exact:true}).click();await qoder.getByText('已找到 CLI',{exact:true}).waitFor();await qoder.getByRole('navigation',{name:'配置内容'}).getByRole('button',{name:'模型',exact:true}).click();await qoder.getByRole('combobox',{name:'默认模型',exact:true}).waitFor();await page.keyboard.press('Escape');await page.unroute('**/plugins/dkn-agent/qoder/status');
  await page.route('**/plugins/dkn-agent/qoder/status',route=>route.fulfill({status:500,json:{error:'Fixture Qoder status offline'}}));await page.getByRole('button',{name:'配置 Qoder',exact:true}).click();await qoder.getByRole('alert').filter({hasText:'Fixture Qoder status offline'}).waitFor();await page.keyboard.press('Escape');await page.unroute('**/plugins/dkn-agent/qoder/status');
  await page.evaluate(()=>window.failForm=true);await page.getByRole('button',{name:'配置 Qoder',exact:true}).click();await qoder.getByText('配置页面加载失败',{exact:true}).waitFor();await page.evaluate(()=>window.failForm=false);await qoder.getByRole('button',{name:'重试加载',exact:true}).click();await qoder.getByText('CLI 完整路径',{exact:true}).waitFor();assert.ok(errors.length>0);assert.ok(errors.every(error=>error==='Fixture configuration unavailable'));errors.length=0;await page.keyboard.press('Escape');
  for(const provider of ['OrcaTerm','Codex','Antigravity','ZCode','TRAE CN']){await page.getByRole('button',{name:'配置 '+provider,exact:true}).click();await page.getByRole('complementary',{name:provider+'配置抽屉'}).locator('[data-provider-settings]').waitFor();await page.keyboard.press('Escape');}
  await worknav.getByRole('button',{name:'后台与自动化',exact:true}).click();await page.locator('.wb-background-page').getByLabel('自动签到',{exact:true}).waitFor();
  await worknav.getByRole('button',{name:'API 服务',exact:true}).click();await page.getByRole('complementary',{name:'API 服务配置抽屉'}).locator('.dkn-api-page').waitFor();
  await worknav.getByRole('button',{name:'工作台',exact:true}).click();assert.equal(await page.getByRole('complementary').count(),0);
  for(const mode of ['dark','light']){await page.evaluate(mode=>document.body.classList.toggle('light',mode==='light'),mode);await page.waitForTimeout(220);await page.screenshot({path:'research/ui/workbench-refined-simple-'+mode+'.png',fullPage:true});}
  await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'research/ui/workbench-refined-simple-narrow.png',fullPage:true});await page.getByRole('button',{name:'配置 Qoder',exact:true}).click();await qoder.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.waitForTimeout(220);await page.screenshot({path:'research/ui/workbench-refined-simple-qoder-narrow.png',fullPage:true});
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await scene.locator('.wb-router .sw-orb').evaluate(node=>getComputedStyle(node,'::before').animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});await page.keyboard.press('Escape');
  await page.setViewportSize({width:1500,height:1000});await page.evaluate(()=>document.body.classList.remove('light'));await page.getByRole('combobox',{name:'界面风格',exact:true}).selectOption('illustrated');await page.waitForFunction(()=>document.querySelector('.wb-desk img')?.naturalWidth>0);
  const idle=page.locator('.wb-courier .wp-idle');await idle.waitFor();const positions=await idle.evaluate(node=>{const animation=node.getAnimations()[0];animation.pause();animation.currentTime=0;const first=getComputedStyle(node).backgroundPosition;animation.currentTime=3200;const second=getComputedStyle(node).backgroundPosition;animation.play();return[first,second]});assert.notEqual(positions[0],positions[1]);await page.screenshot({path:'research/ui/workbench-scene-illustrated-dark.png',fullPage:true});
  await page.reload();await page.getByRole('combobox',{name:'界面风格',exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:'界面风格',exact:true}).inputValue(),'illustrated','new explicit choice persists');
  const resumedThanks=page.getByRole('dialog',{name:'感谢使用 DKN Workbench'});if(await resumedThanks.count())await resumedThanks.getByRole('button',{name:'继续使用',exact:true}).click();await page.getByRole('combobox',{name:'界面风格',exact:true}).selectOption('simple');
await page.evaluate(()=>window.renderFooter());
 await page.getByRole('dialog',{name:'发现插件新版本'}).waitFor();
 assert.equal(updateQueries,1);
 assert.equal(await page.getByRole('link',{name:'GitHub 下载更新'}).getAttribute('href'),'https://github.com/1924225725-collab/dsh-DKN-Workbench/releases/latest');
 await page.getByRole('button',{name:'稍后更新',exact:true}).click();
 const footer=page.getByRole('button',{name:'额度与用量',exact:true});await footer.waitFor();assert.equal(await footer.locator('svg').count(),1);assert.equal(await footer.textContent(),'');
 await footer.click();await page.getByRole('navigation',{name:'额度平台'}).waitFor();
 await page.evaluate(async()=>{await window.setAllFlags();window.renderFooter()});await page.waitForTimeout(80);assert.equal(await page.getByRole('button').count(),0);assert.equal(updateQueries,1);assert.equal(await page.getByRole('dialog').count(),0);
 const buffered={kind:'assistant',requestConfig:{provider:'codebuddy-cli-cn'},usage:{outputTokens:120},timing:{stepStartTime:1000,firstTokenTime:null,completedTime:5000}};
 await page.evaluate(node=>window.renderPerformance(node),buffered);await page.getByText('平均 30.0 tok/s',{exact:true}).waitFor();assert.match(await page.locator('[data-dkn-performance]').getAttribute('title'),/并非/);
 await page.evaluate(node=>window.renderPerformance({...node,usage:undefined}),buffered);await page.getByText('速度未提供',{exact:true}).waitFor();
 await page.evaluate(node=>window.renderPerformance({...node,timing:{...node.timing,firstTokenTime:2000}}),buffered);await page.waitForFunction(()=>!document.querySelector('[data-dkn-performance]'));
 assert.deepEqual(errors,[]);console.log('Settings fixture passed: all provider routes, scoped usage, footer navigation/visibility, light/dark and narrow layouts. No live model requests.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
