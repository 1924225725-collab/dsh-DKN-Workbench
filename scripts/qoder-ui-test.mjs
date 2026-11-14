import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const [react,dom,client]=await Promise.all(['node_modules/react/umd/react.development.js','node_modules/react-dom/umd/react-dom.development.js','lib/client.js'].map(p=>readFile(p,'utf8')));
let connection=null;
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#15171b;color:#e7e9ee;font-family:Segoe UI,sans-serif;--dsw-alias-bg-layer-1:#15171b;--dsw-alias-bg-layer-2:#202329;--dsw-alias-label-primary:#e7e9ee;--dsw-alias-label-secondary:#a0a6b2;--dsw-alias-border-l4:#343842;--dsw-alias-border-primary:#343842}input,textarea,select{font:inherit}section{display:grid;gap:12px}button{width:fit-content}</style><div id="app"></div><script>${react}</script><script>${dom}</script><script>let api;window.__ModuleLoader__={load(m){api=m.factory(()=>React)}};</script><script>${client.replaceAll('</script','<\\/script')}</script><script>
const listeners=new Set();let value={qoderEnabled:'true',qoderPath:'C:/synthetic/qoder.exe',qoderTimeoutMs:'180000'};
const form={getSnapshot:()=>({status:'ready',writable:true,value}),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},async set(key,v){value={...value,[key]:v};window.saved=value;for(const fn of listeners)fn()}};
ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(api.QoderSettingsPage,{ctx:{configForms:{get:()=>form},layout:{selectPanel(){}}}}));</script>`;
const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/plugins/dkn-agent/qoder/')){
    if(req.url.endsWith('/connect'))connection={state:'connected'};
    if(req.url.endsWith('/test'))connection={state:'ready'};
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify(req.url.endsWith('/test')?{state:'ready',text:'Fixture OK'}:{state:'found',path:'C:/synthetic/qoder.exe',connection,models:[{id:'fixture',name:'Fixture model'}]}));
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'继续使用',exact:true}).click();
  await page.getByText('已找到 CLI',{exact:true}).waitFor();
  await page.getByRole('button',{name:'检测 ACP 连接',exact:true}).click();
  await page.getByText('ACP 连接：已握手并创建会话，尚未测试回复',{exact:true}).waitFor();
  await page.getByLabel('默认模型',{exact:true}).selectOption('fixture');assert.equal(await page.evaluate(()=>window.saved.qoderModel),'fixture');
  await page.getByRole('button',{name:'发送测试',exact:true}).click();await page.getByText('Fixture OK',{exact:true}).waitFor();
  await page.getByText('ACP 连接：已收到真实回复',{exact:true}).waitFor();
  await mkdir('research/ui',{recursive:true});await page.screenshot({path:'research/ui/qoder-acp.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('Qoder settings UI fixture: status, ACP detection, model saving and reply display passed.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
