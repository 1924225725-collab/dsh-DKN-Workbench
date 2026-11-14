    const QODER_PANEL='dkn-agent-qoder';
    function QoderSettingsPage({ctx}){
      const form=ctx.configForms.get('dkn-agent-codex');
      const [snapshot,setSnapshot]=React.useState(()=>form?.getSnapshot?.()||{value:{}}),[draft,setDraft]=React.useState({});
      const [status,setStatus]=React.useState({state:'checking'}),[busy,setBusy]=React.useState(''),[error,setError]=React.useState(''),[result,setResult]=React.useState(null);
      const [prompt,setPrompt]=React.useState('Reply with exactly OK. Do not use tools.');
      React.useEffect(()=>{if(!form)return;const sync=()=>setSnapshot(form.getSnapshot());sync();return form.subscribe(sync);},[form]);
      const refresh=()=>codexApi('qoder/status').then(setStatus);
      React.useEffect(()=>{let active=true;codexApi('qoder/status').then(s=>{if(active)setStatus(s)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false};},[]);
      const value=key=>draft[key]??snapshot.value?.[key]??'';
      const save=async(key,v)=>{setDraft(d=>({...d,[key]:v}));try{if(!snapshot.writable)throw new Error('当前配置不可写');await form.set(key,v);await refresh();}catch(e){setError(e.message)}};
      const field=(label,key,placeholder='')=>h('label',{style:{display:'grid',gap:6}},h('span',null,label),settingsControl('input',{placeholder,value:value(key),disabled:!snapshot.writable,onChange:e=>setDraft(d=>({...d,[key]:e.target.value})),onBlur:e=>save(key,e.target.value)}));
      const run=async(kind)=>{setBusy(kind);setError('');setResult(null);try{const r=await codexApi('qoder/'+kind,kind==='test'?{prompt}:{});if(kind==='connect')setStatus(r);else setResult(r);await refresh();}catch(e){setError(e.message);await refresh().catch(()=>{});}finally{setBusy('')}};
      const connection=status.connection;
      return h(ProviderSettingsLayout,{ctx,provider:'qoder'},
        h(SettingsCard,{title:'运行状态'},h('strong',{role:'status'},status.state==='found'?'已找到 CLI':status.state==='checking'?'检测中':'未找到 CLI'),status.path?h('code',{style:{overflowWrap:'anywhere'}},status.path):null,h('p',null,'ACP 连接：'+(connection?.state==='ready'?'已收到真实回复':connection?.state==='connected'?'已握手并创建会话，尚未测试回复':connection?.state==='error'?'连接失败':'尚未连接')),settingsControl('button',{disabled:!!busy,onClick:()=>run('connect')},busy==='connect'?'检测中…':'检测 ACP 连接'),status.error||connection?.error?h(Notice,null,status.error||connection.error):null),
        h(SettingsCard,{title:'登录与授权'},h(LoginInstructions,{command:status.loginCommand||'qoder login'},'复用官方 CLI 的登录状态。安装 CLI 后完成登录，再检测连接。'),h(Notice,null,'此入口通过 Qoder Agent 处理对话，使用 CLI 原生工具；插件拒绝新的工具授权请求，不代为授予权限。当前支持文本，每次请求创建独立 ACP 会话并附带 DSH 文本历史。')),
        h(SettingsCard,{title:'基础配置'},h('label',null,h('input',{type:'checkbox',disabled:!snapshot.writable,checked:String(value('qoderEnabled')||'true')==='true',onChange:e=>save('qoderEnabled',e.target.checked?'true':'false')}),' 启用 Qoder ACP'),field('CLI 完整路径','qoderPath','留空自动发现；支持 EXE 或 JS 入口'),field('每日奖励：桌面安装路径','qoderDesktopPath','留空自动发现；可填 Qoder.exe 或桌面安装目录'),field('默认工作目录','qoderCwd','留空跟随 DSH 会话目录'),field('调用超时（毫秒）','qoderTimeoutMs','180000'),h('label',{style:{display:'grid',gap:6}},'默认模型',settingsControl('select',{'aria-label':'默认模型',disabled:!snapshot.writable,value:value('qoderModel'),onChange:e=>save('qoderModel',e.target.value)},h('option',{value:''},'沿用账号默认'),...(status.models||[]).filter(m=>m.id!=='qoder-default').map(m=>h('option',{key:m.id,value:m.id},m.name)))),h(Notice,null,'模型清单由 ACP 会话返回；CLI 不提供清单时只显示默认模型。')),
        h(SettingsCard,{title:'真实回复测试'},settingsControl('textarea',{value:prompt,onChange:e=>setPrompt(e.target.value),rows:3}),settingsControl('button',{disabled:!!busy||status.state!=='found',onClick:()=>run('test')},busy==='test'?'等待真实回复…':'发送测试'),result?h('pre',{style:{whiteSpace:'pre-wrap'},role:'status'},result.text):null),
        error?h('p',{role:'alert'},error):null);
    }
