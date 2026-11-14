import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json'),{chromium}=require('playwright');
const [react,dom,client]=await Promise.all(['node_modules/react/umd/react.development.js','node_modules/react-dom/umd/react-dom.development.js','lib/client.js'].map(path=>readFile(path,'utf8')));
const requests=[];
const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:24px;font:14px Segoe UI,sans-serif;background:#17191e;color:#e7e9ee;--dsw-alias-bg-layer-1:#17191e;--dsw-alias-bg-layer-2:#202228;--dsw-alias-bg-layer-3:#292b31;--dsw-alias-label-primary:#e7e9ee;--dsw-alias-label-secondary:#a0a6b2;--dsw-alias-border-l4:#454850}button,input{font:inherit}#app{max-width:850px;margin:auto}summary{padding:8px 0}</style><div id="app"></div><script>${react}</script><script>${dom}</script><script>let api;window.__ModuleLoader__={load(m){api=m.factory(()=>React)}};</script><script>${client.replaceAll('</script','<\\/script')}</script><script>
function Demo(){const [selectedId,select]=React.useState(null),[label,setLabel]=React.useState(''),[confirmRemoval,setConfirmRemoval]=React.useState('');const rows=[{id:'a',label:'常用账号',credentialsPresent:true},{id:'b',label:'免费模型账号',credentialsPresent:true},{id:'c',label:'未登录账号',credentialsPresent:false}];return React.createElement(api.AccountPool,{status:{accounts:{supported:true,selectedId,accounts:rows}},statusUrl:'/cn/status',active:true,disabled:false,label,setLabel,confirmRemoval,setConfirmRemoval,action:async(kind,id)=>{await fetch('/accounts',{method:'POST',body:JSON.stringify({kind,id})});if(kind==='select')select(id)}})}ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(Demo));</script>`;
const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/cn/status')){const id=new URL(req.url,'http://localhost').searchParams.get('accountQuotaId');requests.push({kind:'quota',id});res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({accountQuota:id==='c'?{state:'error',error:'尚未登录此账号'}:{state:'available',remaining:id==='a'?612.5:id==='b'?0:50}}))}
 if(req.url==='/accounts'){let raw='';for await(const chunk of req)raw+=chunk;requests.push(JSON.parse(raw));res.writeHead(200,{'Content-Type':'application/json'});return res.end('{}')}
 res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(7000);
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 const card=name=>page.getByRole('article').filter({has:page.getByText(name,{exact:true})});
 await card('常用账号').getByText('612.5 积分',{exact:true}).waitFor();await card('免费模型账号').getByText('0 积分',{exact:true}).waitFor();
 assert.deepEqual(requests.filter(row=>row.kind==='quota').map(row=>row.id).sort(),['a','b','c','default']);assert.equal(requests.some(row=>row.kind==='select'),false);
 await card('常用账号').getByRole('button',{name:'设为默认',exact:true}).click();await card('常用账号').getByText('当前默认',{exact:true}).waitFor();assert.ok(requests.some(row=>row.kind==='select'&&row.id==='a'));
 assert.equal(await card('未登录账号').getByRole('button',{name:'设为默认',exact:true}).isDisabled(),true);
 await card('未登录账号').locator('summary').click();await card('未登录账号').getByText('尚未登录此账号',{exact:true}).waitFor();
 await page.getByLabel('搜索账号').fill('免费');assert.equal(await page.getByRole('article').count(),1);await page.getByLabel('搜索账号').fill('');
 await page.getByRole('button',{name:'添加账号',exact:true}).click();await page.getByLabel('账号备注').fill('备用账号');assert.equal(await page.getByRole('button',{name:'创建账号',exact:true}).isEnabled(),true);
 await mkdir('research/ui',{recursive:true});await page.screenshot({path:'research/ui/account-pool-dark.png',fullPage:true});await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('Account pool UI fixture: per-account balances, zero balance, independent errors, one-click selection, search and narrow layout passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
