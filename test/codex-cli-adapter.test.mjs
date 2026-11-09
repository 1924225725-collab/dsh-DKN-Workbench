import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

test('Codex CLI adapter uses official exec JSONL shape without sending DSH tools',async()=>{
  const {CodexCliAdapter}=await import('../lib/codex-cli-adapter.js');const root=await mkdtemp(join(tmpdir(),'dkn-codex-cli-'));const fake=join(root,'fake-codex.mjs');await writeFile(fake,"process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'synthetic codex answer'}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:3,output_tokens:4}}))})");
  try{const adapter=new CodexCliAdapter({agents:{get:()=>({session:{header:{cwd:root}}})}},{codexCliPath:fake,codexCliModel:'fixture-model'});const chunks=[];for await(const chunk of adapter.stream({sessionId:'s',model:'fixture-model',tools:[{name:'dsh_tool'}],messages:[{role:'user',content:'hello'}]}))chunks.push(chunk);assert.equal(chunks.find(v=>v.type==='block-end').block.text,'synthetic codex answer');assert.deepEqual(chunks.find(v=>v.type==='usage').usage,{inputTokens:3,outputTokens:4,cacheReadTokens:0});assert.equal(chunks.at(-1).reason.kind,'stop')}finally{await rm(root,{recursive:true,force:true})}
})

test('Codex CLI diagnostics can inspect the executable and run an explicit probe',async()=>{
  const {inspectCodexCli,runCodexCliPrompt}=await import('../lib/codex-cli-adapter.js');const root=await mkdtemp(join(tmpdir(),'dkn-codex-cli-diagnostics-'));const fake=join(root,'fake-codex.mjs');await writeFile(fake,"if(process.argv.includes('--version')){console.log('codex-cli fixture 1.2.3');process.exit(0)}process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'probe ok'}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:2}}))})");
  try{const status=await inspectCodexCli({codexCliPath:fake,codexCliCwd:root});assert.equal(status.version,'codex-cli fixture 1.2.3');const result=await runCodexCliPrompt({codexCliPath:fake,codexCliCwd:root},'health check');assert.equal(result.text,'probe ok');assert.equal(result.usage.output_tokens,2)}finally{await rm(root,{recursive:true,force:true})}
})
