const readline=require('node:readline');
const write=value=>process.stdout.write(JSON.stringify(value)+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
  const m=JSON.parse(line);if(m.id===undefined||!m.method)return;
  const reply=result=>write({jsonrpc:'2.0',id:m.id,result});
  if(m.method==='initialize')reply({protocolVersion:1,agentInfo:{name:'test-agent',version:'fixture'}});
  else if(m.method==='session/new')reply({sessionId:'fixture-session',models:{currentModelId:'fixture-model',availableModels:[{modelId:'fixture-model',name:'Fixture model'}]}});
  else if(m.method==='session/set_model')reply({});
  else if(m.method==='session/prompt'){
    const text=m.params.prompt[0].text;
    if(text.includes('WAIT_FOREVER'))return;
    if(text.includes('BAD_JSON')){process.stdout.write('bad-json\n');return;}
    if(text.includes('PERMISSION')){
      write({jsonrpc:'2.0',id:999,method:'session/request_permission',params:{options:[{kind:'allow_once',optionId:'allow'},{kind:'reject_once',optionId:'deny'}]}});
      return;
    }
    for(const text of ['你','好'])write({jsonrpc:'2.0',method:'session/update',params:{sessionId:'fixture-session',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}}});
    reply({stopReason:'end_turn'});
  }
});
