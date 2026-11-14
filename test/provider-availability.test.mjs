import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/provider-status-client.js',import.meta.url),'utf8');
const {providerAvailability}=vm.runInNewContext(source+'\n({providerAvailability})');
test('provider entry availability distinguishes found CLI, verified replies, disabled state and account switches',()=>{
 assert.equal(providerAvailability('qoder',{state:'found'}).text,'待验证');
 assert.equal(providerAvailability('qoder',{state:'found',connection:{state:'ready'}}).text,'可用');
 assert.equal(providerAvailability('qoder',{enabled:false,state:'found',connection:{state:'ready'}}).text,'已关闭');
 assert.equal(providerAvailability('codex',{state:'ready',connection:{state:'error'}}).text,'不可用');
 assert.equal(providerAvailability('zcode',{state:'missing'}).text,'不可用');
 assert.equal(providerAvailability('project',{connected:false}).text,'未连接');
 assert.equal(providerAvailability('codebuddy',{cliCheck:{state:'available'},accounts:{selectedId:'new'},usage:{lastCall:{state:'success',accountId:'old'}}}).text,'待验证');
 assert.equal(providerAvailability('codebuddy',{cliCheck:{state:'available'},accounts:{selectedId:'new'},usage:{lastCall:{state:'success',accountId:'new'}}}).text,'可用');
 assert.equal(providerAvailability('codebuddy',{cliCheck:{state:'available'},accounts:{selectedId:'new'},usage:{lastCall:{state:'error',accountId:'new'}}}).text,'不可用');
 assert.equal(providerAvailability('codebuddy',{cliCheck:{state:'available'},accounts:{selectedId:'new'},usage:{lastCall:{state:'error',accountId:'old'}}}).text,'待验证');
});
