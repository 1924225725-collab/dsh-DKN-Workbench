import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePathSetting} from '../lib/codex-runtime.js';

test('Codex path configuration accepts text and common DSH field wrappers, and rejects other objects clearly',()=>{
 assert.equal(normalizePathSetting('', 'path'),'');
 assert.equal(normalizePathSetting({}, 'path'),'');
 assert.equal(normalizePathSetting({get:()=>''},'path'),'');
 assert.equal(normalizePathSetting({get:()=> 'C:\\Codex\\codex.exe'},'path'),'C:\\Codex\\codex.exe');
 assert.equal(normalizePathSetting({value:' C:\\Codex\\codex.exe '},'path'),'C:\\Codex\\codex.exe');
 assert.equal(normalizePathSetting({path:'C:\\Codex\\codex.exe'},'path'),'C:\\Codex\\codex.exe');
 assert.throws(()=>normalizePathSetting({value:{selected:true}},'Codex 可执行文件'),/必须是文本路径/);
});
