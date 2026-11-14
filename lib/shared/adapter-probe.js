// Explicit user-triggered probe only. Uses the same adapter/account routing as chat.
export async function probeAdapter(adapter,provider,{signal=AbortSignal.timeout(60000)}={}){
  const models=await adapter.listModels(provider);
  const model=models[0]?.id;if(!model)throw new Error('没有可验证的模型，请先配置 CLI 并登录');
  let reply='';
  for await(const chunk of adapter.stream({provider,model,sessionId:crypto.randomUUID(),messages:[{role:'user',content:[{type:'text',text:'Reply with exactly OK. Do not use any tools.'}]}],tools:[],signal})){
    if(chunk.type==='finish'&&chunk.reason?.kind&&chunk.reason.kind!=='stop')throw new Error(chunk.reason.failure?.message||'验证回合未正常结束');
    if(chunk.type==='block-end'&&chunk.block?.type==='text')reply+=chunk.block.text||'';
  }
  if(!reply.trim())throw new Error('模型没有返回文字回复');
  return {state:'ready',model,reply:reply.slice(0,8192),testedAt:Date.now()};
}
