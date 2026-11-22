    const ORCATERM_PANEL = 'dkn-agent-orcaterm';
    function OrcaTermSettingsPage({ctx}) {
      const form = ctx.configForms.get('dkn-agent-codex');
      const [snapshot,setSnapshot] = React.useState(()=>form?.getSnapshot()||{value:{}});
      const [status,setStatus] = React.useState(null),[error,setError] = React.useState(''),[busy,setBusy] = React.useState(false);
      const [loginUrl,setLoginUrl] = React.useState(''),[reply,setReply] = React.useState(''),[quota,setQuota] = React.useState(null);
      const refresh = async()=>{const value=await codexApi('orcaterm/status');setStatus(value);return value;};
      React.useEffect(()=>{if(!form)return;return form.subscribe(()=>setSnapshot(form.getSnapshot()));},[form]);
      React.useEffect(()=>{let active=true;const update=()=>codexApi('orcaterm/status').then(value=>{if(active)setStatus(value)}).catch(()=>{if(active)setError('OrcaTerm 状态读取失败')});update();const timer=setInterval(update,3000);return()=>{active=false;clearInterval(timer)};},[]);
      const save=async(key,value)=>{setError('');try{await form.set(key,value);await refresh()}catch(error){setError(error.message)}};
      const run=async(action)=>{setBusy(true);setError('');try{const result=await codexApi('orcaterm/'+action,{});if(action==='login'){setLoginUrl(result.url);window.open(result.url,'_blank','noopener');}if(action==='test')setReply(result.text);await refresh();}catch(error){setError(error.message)}finally{setBusy(false)}};
      const readQuota=async()=>{setBusy(true);try{setQuota(await codexApi('orcaterm/quota'));}catch(error){setError(error.message)}finally{setBusy(false)}};
      return h(ProviderSettingsLayout,{ctx,provider:'orcaterm'},
        h(SettingsCard,{title:'连接与登录'},h('strong',{role:'status'},status?.authenticated?'已登录':status?.login==='waiting'?'等待扫码授权':'请扫码登录'),h('p',null,'使用 OrcaTerm 专用微信授权，登录状态在本机按当前 Windows 用户加密保存。'),settingsControl('button',{disabled:busy,onClick:()=>run('login')},'扫码登录'),settingsControl('button',{disabled:busy,onClick:()=>refresh().catch(error=>setError(error.message))},'刷新状态'),loginUrl&&!status?.authenticated?h('p',null,h('a',{href:loginUrl,target:'_blank',rel:'noopener noreferrer'},'打开扫码登录页')):null),
        h(SettingsCard,{title:'模型配置'},h('label',null,h('input',{type:'checkbox',checked:String(snapshot.value?.orcatermEnabled??'true')==='true',disabled:!snapshot.writable,onChange:event=>save('orcatermEnabled',String(event.target.checked))}),'启用 OrcaTerm'),h('label',null,'默认模型',settingsControl('select',{'aria-label':'OrcaTerm 默认模型',disabled:!snapshot.writable,value:snapshot.value?.orcatermModel||'TokenHub/deepseek-v4.1-flash',onChange:event=>save('orcatermModel',event.target.value)},...(status?.models||[]).map(model=>h('option',{key:model.id,value:model.id},model.name)))),h('p',null,'模型来自 OrcaTerm 选择器对应目录。当前验证通道支持文字，图片与工具调用尚未开放。')),
        h(SettingsCard,{title:'真实回复验证'},settingsControl('button',{disabled:busy||!status?.authenticated,onClick:()=>run('test')},busy?'正在处理…':'发送测试'),reply?h('pre',{role:'status'},reply):null),
        h(SettingsCard,{title:'账号额度'},settingsControl('button',{disabled:busy||!status?.authenticated,onClick:readQuota},'刷新额度'),quota?h('p',{role:'status'},compactQuota(quota)):null,h('p',null,'读取 AI 问答实际剩余次数。当前未发现每日签到活动，自动签到不包含此平台。')),
        h(SettingsCard,{title:'高级配置'},h('label',null,'请求超时（毫秒）',settingsControl('input',{'aria-label':'OrcaTerm 请求超时',type:'number',value:snapshot.value?.orcatermTimeoutMs||'90000',disabled:!snapshot.writable,onChange:event=>save('orcatermTimeoutMs',event.target.value)}))),
        error?h('p',{role:'alert'},error):null);
    }
