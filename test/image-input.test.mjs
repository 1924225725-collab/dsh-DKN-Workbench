import test from 'node:test';import assert from 'node:assert/strict';
import {stat,readFile} from 'node:fs/promises';
import {validateApiRequest} from '../lib/api-export-service.js';
import {imageInput,imageFiles,acpImagePrompt} from '../lib/shared/image-input.js';
import {qoderPromptText} from '../lib/qoder-acp.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=','base64');
const body=url=>({model:'dkn',messages:[{role:'user',content:[{type:'image_url',image_url:{url}}]}]});
const url='data:image/png;base64,'+png.toString('base64');
test('API image-only input becomes a bounded per-request attachment; URLs and paths never fetched',async()=>{
  const a=validateApiRequest(body(url)),b=validateApiRequest(body(url));
  const prepared=await imageInput({...a,signal:new AbortController().signal});assert.equal(prepared.nativeImages[0].source.data,png.toString('base64'));
  await assert.rejects(b.imageAttachments.readImageRequest(a.messages[0].content[0].attachment));
  for(const value of ['https://example.com/a.png','file:///private.png','data:image/png;base64,invalid',url+'!'])assert.throws(()=>validateApiRequest(body(value)));
  assert.throws(()=>validateApiRequest({...body(url),messages:[{role:'assistant',content:body(url).messages[0].content}]}));
  assert.throws(()=>validateApiRequest({...body(url),messages:[{role:'user',content:Array.from({length:6},()=>body(url).messages[0].content[0])}]}));
});
test('ACP sends actual image bytes, preserves history provenance and rejects unadvertised capabilities',async()=>{
  const request=validateApiRequest(body(url));const prompt=await acpImagePrompt(request,undefined,true,qoderPromptText);
  assert.equal(prompt[1].type,'image');assert.equal(prompt[1].mimeType,'image/png');assert.equal(prompt[1].data,png.toString('base64'));assert.match(prompt[0].text,/user/);
  await assert.rejects(acpImagePrompt(request,undefined,false,qoderPromptText),/未声明支持图片/);
});
test('CLI images are materialized privately and cleaned after use',async()=>{
  const prepared=await imageInput(validateApiRequest(body(url)));const files=await imageFiles(prepared.nativeImages);assert.deepEqual(await readFile(files.paths[0]),png);await files.close();await assert.rejects(stat(files.paths[0]));
});
test('new native Codex thread accepts its first turn before a rollout exists',async()=>{
  const {CodexService}=await import('../lib/codex-service.js');const service=new CodexService();const calls=[];
  service.runtime={connected:true,async call(method){calls.push(method);if(method==='thread/start')return{thread:{id:'fresh-thread'}};if(method==='turn/start')return{turn:{id:'fresh-turn'}};throw Error('no rollout found');}};
  await service.ready;const threadId=await service.nativeThreadForSession('synthetic-session',process.cwd());
  const result=await service.operate({action:'thread.send',threadId,content:'synthetic first input',operationId:'synthetic-operation'});
  assert.equal(result.turnId,'fresh-turn');assert.deepEqual(calls,['thread/start','turn/start']);assert.equal(service.freshNativeThreads.size,0);
});
