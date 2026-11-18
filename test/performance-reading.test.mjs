import test from 'node:test';
import assert from 'node:assert/strict';
import {pluginPerformanceReading} from '../lib/shared/performance-reading.js';
const node={kind:'assistant',requestConfig:{provider:'codebuddy-cli-cn'},usage:{outputTokens:120},timing:{stepStartTime:1000,firstTokenTime:null,completedTime:5000}};
test('buffered real usage gets clearly labelled whole-call average without inventing token timestamps',()=>{
  assert.equal(pluginPerformanceReading(node).text,'平均 30.0 tok/s');
  assert.match(pluginPerformanceReading(node).title,/完整调用耗时/);
  assert.equal(node.timing.firstTokenTime,null);
});
test('native measured decoding, unrelated providers and non-assistant nodes remain untouched',()=>{
  assert.equal(pluginPerformanceReading({...node,timing:{...node.timing,firstTokenTime:2000}}),null);
  assert.equal(pluginPerformanceReading({...node,requestConfig:{provider:'deepseek'}}),null);
  assert.equal(pluginPerformanceReading({...node,kind:'user'}),null);
});
test('missing, invalid usage or time never produces NaN, Infinity or estimated speed',()=>{
  for(const outputTokens of [undefined,NaN,-1,Infinity,'120'])assert.equal(pluginPerformanceReading({...node,usage:{outputTokens}}).text,'速度未提供');
  for(const completedTime of [null,1000,500,NaN])assert.equal(pluginPerformanceReading({...node,timing:{...node.timing,completedTime}}).text,'速度暂无数据');
  assert.equal(pluginPerformanceReading({...node,timing:{...node.timing,firstTokenTime:5000}}).text,'平均 30.0 tok/s');
});
