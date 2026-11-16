import test from 'node:test';
import assert from 'node:assert/strict';
import {guardedHostRoute,hostAccessRejected} from '../lib/shared/host-access.js';
test('host admission blocks unauthorized requests and fails closed without the DSH connection service',()=>{
 let ran=0;for(const code of [401,403,undefined]){let status;const ctx={connection:{requestRejection:()=>code}},res={writeHead(value){status=value},end(){}};guardedHostRoute(ctx,()=>ran++)({},res);assert.equal(status,code);}
 assert.equal(ran,1);let status;assert.equal(hostAccessRejected({}, {},{writeHead(code){status=code},end(){}}),true);assert.equal(status,503);
});
