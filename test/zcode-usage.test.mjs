import {registerHooks} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
registerHooks({resolve(spec,ctx,next){if(spec==='@deepseek-ai/schemastery')return{url:'data:text/javascript,export default {object:x=>x,string:()=>({description(){return this},default(){return this},volatile(){return this}})}',shortCircuit:true};if(spec==='@deepseek-ai/dsh-llm')return{url:'data:text/javascript,export class LlmAdapter {}',shortCircuit:true};return next(spec,ctx);}});
const {normalizeTurnUsage}=await import('../lib/zcode/app-server.js');

// Measured rows of ZCode's own model_usage table: provider_total_tokens equals
// input_tokens + output_tokens and cache_read_input_tokens stays below input_tokens,
// so ZCode reports the whole prompt as inputTokens with the cache inside it.
test('ZCode turn usage counts cached input once',()=>{
  const row=normalizeTurnUsage({inputTokens:120337,cacheReadTokens:119936,outputTokens:1021});
  assert.deepEqual(row,{inputTokens:401,outputTokens:1021,cacheReadTokens:119936});
  assert.equal(row.inputTokens+(row.cacheReadTokens??0)+(row.cacheWriteTokens??0)+row.outputTokens,121358);
  const firstTurn=normalizeTurnUsage({inputTokens:22442,cacheReadTokens:320,outputTokens:127});
  assert.deepEqual(firstTurn,{inputTokens:22122,outputTokens:127,cacheReadTokens:320});
  assert.equal(firstTurn.inputTokens+(firstTurn.cacheReadTokens??0)+firstTurn.outputTokens,22569);
});

test('ZCode turn usage clamps cache buckets to the reported prompt and drops unusable counts',()=>{
  assert.deepEqual(normalizeTurnUsage({inputTokens:10,cacheReadTokens:99,cacheWriteTokens:5,outputTokens:1}),{inputTokens:0,outputTokens:1,cacheReadTokens:99,cacheWriteTokens:5});
  assert.deepEqual(normalizeTurnUsage({inputTokens:100,cacheReadTokens:50,cacheWriteTokens:30,outputTokens:5}),{inputTokens:20,outputTokens:5,cacheReadTokens:50,cacheWriteTokens:30});
  assert.deepEqual(normalizeTurnUsage({}),{inputTokens:0,outputTokens:0});
  assert.deepEqual(normalizeTurnUsage({inputTokens:-5,cacheReadTokens:2.5,outputTokens:'x'}),{inputTokens:0,outputTokens:0});
});
