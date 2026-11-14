import test from 'node:test';
import assert from 'node:assert/strict';
import {compareVersions,createUpdateChecker} from '../lib/update-check.js';
import {probeAdapter} from '../lib/shared/adapter-probe.js';

test('updates compare numeric stable versions and query only one fixed official release per lifecycle',async()=>{
  assert.equal(compareVersions('v2.10.0','2.9.9'),1);
  assert.equal(compareVersions('2.1.2','v2.1.2'),0);
  assert.equal(compareVersions('2.1.1','2.1.2'),-1);
  assert.equal(compareVersions('2.1.3-beta','2.1.2'),null);
  let requests=0;
  const checker=createUpdateChecker({currentVersion:'2.1.2',fetchImpl:async(url,options)=>{requests++;assert.equal(url,'https://api.github.com/repos/1924225725-collab/dsh-DKN-Workbench/releases/latest');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);return {ok:true,json:async()=>({tag_name:'v2.2.0',html_url:'https://evil.example'})}}});
  const [a,b]=await Promise.all([checker.check(),checker.check()]);assert.equal(requests,1);assert.equal(a,b);assert.equal(a.updateAvailable,true);assert.equal(a.releaseUrl,'https://github.com/1924225725-collab/dsh-DKN-Workbench/releases/latest');
  for(const value of [{tag_name:'v2.1.1'},{tag_name:'v2.1.2'},{tag_name:'v2.2.0-beta'},{tag_name:'v2.2.0',draft:true}]){
    const result=await createUpdateChecker({currentVersion:'2.1.2',fetchImpl:async()=>({ok:true,json:async()=>value})}).check();assert.equal(result.updateAvailable,false);
  }
  const failed=await createUpdateChecker({fetchImpl:async()=>{throw Error('network')}}).check();assert.equal(failed.state,'unavailable');assert.equal(failed.updateAvailable,false);
});

test('explicit adapter probe requires real final text, sends no history or tools, and keeps account-labelled model',async()=>{
  const adapter={listModels:async()=>[{id:'account:fixture/model'}],async *stream(options){assert.equal(options.model,'account:fixture/model');assert.equal(options.messages.length,1);assert.deepEqual(options.tools,[]);assert.match(options.messages[0].content[0].text,/exactly OK/);yield {type:'block-end',block:{type:'text',text:'OK'}}}};
  assert.equal((await probeAdapter(adapter,'fixture')).reply,'OK');
  await assert.rejects(probeAdapter({...adapter,async *stream(){yield {type:'finish'}}},'fixture'),/没有返回/);
  await assert.rejects(probeAdapter({...adapter,async *stream(){yield {type:'block-end',block:{type:'text',text:'partial'}};yield {type:'finish',reason:{kind:'error',failure:{message:'failed'}}}}},'fixture'),/failed/);
  await assert.rejects(probeAdapter({...adapter,listModels:async()=>[]},'fixture'),/没有可验证/);
  await assert.rejects(probeAdapter({...adapter,async *stream(){throw Error('offline')}},'fixture'),/offline/);
});
