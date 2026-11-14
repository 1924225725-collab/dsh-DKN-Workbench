    const HUB_PANEL='dkn-agent-collaboration';
    let DKN_NATIVE_UI,DKN_HUB_PROJECT='',DKN_HUB_ERROR='';
    async function openHubProject(ctx,project){try{if(project&&!project.path)throw new Error('请先为此项目设置工作目录');if(project?.path){const value=await codexApi('hub/action',{operationId:crypto.randomUUID(),type:'project.ensure',data:project});DKN_HUB_PROJECT=value.id;}DKN_HUB_ERROR='';}catch(e){DKN_HUB_ERROR=e.message;}ctx.layout.selectPanel(HUB_PANEL);}
    const CODEX_PANEL='dkn-agent-codex';
    const CLI_PANEL='dkn-agent-cli';
    const ZCODE_PANEL='dkn-agent-zcode';
    const QUOTA_PANEL='dkn-agent-quota';
    const ROOT_PANEL='dkn-agent-settings';
    const MODEL_PANEL='dkn-agent-models';
    const apiRoot='/plugins/dkn-agent/';
    const entryButtonStyle={justifySelf:'start',padding:'8px 14px',borderRadius:8,border:'1px solid var(--dsw-alias-border-primary,rgba(127,127,127,.4))',background:'transparent',color:'var(--dsw-alias-label-primary)',fontSize:13,fontWeight:500,cursor:'pointer',lineHeight:1.3};
    const settingsFieldStyle = {
      width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:8, font:'inherit',
      border:'1px solid var(--dsw-alias-border-primary, rgba(127,127,127,.35))',
      background:'var(--dsw-alias-bg-layer-1, transparent)', color:'inherit'
    };
    function settingsControl(tag, props, ...children) {
      const base = tag==='button' ? {...entryButtonStyle,font:'inherit'} : settingsFieldStyle;
      const disabled = props.disabled && tag==='button' ? {cursor:'default',opacity:.55} : {};
      return h(tag,{...props,style:{...base,...props.style,...disabled}},...children);
    }
    async function codexApi(path,body){const signal=path.startsWith('hub/')?AbortSignal.timeout(body?60000:30000):undefined;const r=await fetch(apiRoot+path,body?{signal,method:'POST',headers:{'Content-Type':'application/json','x-dkn-action':'1'},body:JSON.stringify(body)}:{cache:'no-store',signal});const value=await r.json();if(!r.ok)throw Object.assign(new Error(value.error||'请求失败'),{submissionUncertain:value.submissionUncertain});return value;}
    async function quotaSnapshot(force=false){
      const value=await codexApi('quota'+(force?'?refresh=1':''));
      const statuses=await Promise.allSettled(['cn','intl'].map(region=>fetch('/plugins/dsh-codebuddy-cli-'+region+'/status?quota=1'+(force?'&refresh=1':''),{cache:'no-store',signal:AbortSignal.timeout(15000)}).then(response=>response.ok?response.json():null)));
      const regions=statuses.map((item,index)=>({region:['cn','intl'][index],...(item.status==='fulfilled'&&item.value?.quota?item.value.quota:{state:'error',error:'此区域插件未返回额度'})}));
      const available=regions.filter(row=>row.state==='available');
      value.codebuddy={state:available.length?'available':'error',source:'codebuddy-account',regions,error:regions.map(row=>row.error).filter(Boolean).join('；')};
      return value;
    }
    function DknSettingsPage({ctx}){const card=(title,text,button,panel)=>h('section',{style:{padding:20,border:'1px solid var(--dsw-alias-border-l4)',borderRadius:10,background:'var(--dsw-alias-bg-layer-2)',display:'grid',gap:10}},h('h3',{style:{margin:0,fontSize:18}},title),panel===CODEX_PANEL?h(ProviderStatus,{provider:'codex',project:true}):null,h('p',{style:{margin:0,color:'var(--dsw-alias-label-secondary)',lineHeight:1.6}},text),settingsControl('button',{type:'button',style:entryButtonStyle,onClick:()=>panel===QUOTA_PANEL?openProviderQuota(ctx):ctx.layout.selectPanel(panel)},button));return h('main',{style:{height:'100%',padding:'40px 48px',overflowY:'auto',color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-bg-layer-1)',maxWidth:900}},h('div',{style:{display:'grid',gap:8}},h('h2',{style:{margin:0,fontSize:28}},'DKN Agent'),h(WorkbenchSupport),h('p',{style:{margin:0,color:'var(--dsw-alias-label-secondary)'}},'统一管理模型提供方、额度显示、Codex 运行时与多 Agent 项目协作。')),h(CheckinOverview),h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16,marginTop:28}},card('项目协作','管理协作项目、成员、任务和工作流，配置各对话的职责与协作权限。','进入项目协作',HUB_PANEL),card('模型配置','配置 CodeBuddy、Codex CLI 和 ZCode CLI，它们会出现在 DSH 新建对话的模型选择器中。','进入模型配置',MODEL_PANEL),card('额度与用量','单独管理额度入口和显示项目。只展示有可靠来源的用量信息。','进入额度与用量',QUOTA_PANEL),card('Codex Agent 设置','连接完整 Codex Agent，管理项目对话、app-server 和本机运行时。','进入 Codex Agent 设置',CODEX_PANEL)));}
    function HubSettingsPage({ctx}){return h('main',{style:{padding:24,overflowY:'auto',height:'100%',color:'var(--dsw-alias-label-primary)'}},h('h2',null,'项目协作'),h(WorkbenchSupport),h('p',null,'多 Agent 项目协作：管理项目、独立会话、任务验收和工作流。'),h(SettingsCard,{title:'协作配置与测试'},h('p',null,'自动同步 DSH 工作区项目及项目内对话。选择项目，在「成员」中配置对话职责与协作权限，在「工作流」中配置协作流程。'),settingsControl('button',{type:'button',style:entryButtonStyle,onClick:()=>openHubProject(ctx)},'进入项目协作')),h('p',null,'请在 DSH 中管理项目和对话。模型沿用各对话当前选择；首次测试请为成员开启发送权限，再选择收件人发送。'));}
    const providerNames={codebuddy:'CodeBuddy',codex:'Codex',qoder:'Qoder',zcode:'ZCode',deepseek:'DeepSeek'};
    let DKN_QUOTA_PROVIDER='';
    function ProviderIcon({provider,size=24}){
      const paths={codebuddy:'M6 7h12v12H6zM9 11h.01M15 11h.01M9 15h6M12 3v4M3 10v6m18-6v6',codex:'m8 7-5 5 5 5m8-10 5 5-5 5m-5 2 2-14',qoder:'M19 11a7 7 0 1 1-7-7h7v7Zm-7 1 8 8',zcode:'M5 5h14L5 19h14',deepseek:'M3 9c4 1 6-4 10-2l5 3 3-2-1 6c-4 7-13 6-17-5Z'};
      return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:paths[provider]||paths.codex}));
    }
    function openProviderQuota(ctx,provider=''){DKN_QUOTA_PROVIDER=provider;ctx.layout.selectPanel(QUOTA_PANEL);}
    function ProviderSettingsLayout({ctx,provider,title,project=false,rewardRegion='cn',children}){
      return h('main',{'data-provider-settings':provider,style:{height:'100%',boxSizing:'border-box',overflowY:'auto',padding:'24px clamp(16px,4vw,40px)',color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-bg-layer-1)'}},
        h('style',null,'[data-provider-settings] button,[data-provider-settings] input,[data-provider-settings] textarea,[data-provider-settings] select{font:inherit;color:inherit;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}[data-provider-settings] button{padding:8px 12px;cursor:pointer}[data-provider-settings] button:disabled{cursor:default;opacity:.55}[data-provider-settings] button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2))}[data-provider-settings] input:not([type=checkbox]),[data-provider-settings] textarea,[data-provider-settings] select{padding:8px 10px;max-width:100%}[data-provider-settings] :focus-visible{outline:2px solid #6599e8;outline-offset:2px}'),
        h('div',{style:{maxWidth:960,margin:'0 auto'}},
          settingsControl('button',{type:'button',onClick:()=>ctx.layout.selectPanel(project?ROOT_PANEL:MODEL_PANEL)},project?'‹ 返回 DKN Agent':'‹ 返回模型配置'),h(WorkbenchSupport),
          h('header',{style:{display:'flex',alignItems:'center',gap:12,margin:'24px 0 20px'}},h(ProviderIcon,{provider,size:30}),h('h2',{style:{margin:0,fontSize:24}},title||providerNames[provider]),h(ProviderStatus,{provider,project}),!project?h(ProviderVerify,{provider}):null),
          !project?h(DailyRewards,{provider,region:rewardRegion}):null,
          h('nav',{'aria-label':'配置导航',style:{display:'flex',alignItems:'center',gap:8,paddingBottom:16,borderBottom:'1px solid var(--dsw-alias-border-l4)'}},h('span',{'aria-current':'page',style:{padding:'8px 12px',fontWeight:600}},'配置'),settingsControl('button',{type:'button',onClick:()=>openProviderQuota(ctx,provider),style:{display:'inline-flex',alignItems:'center',gap:6}},h(Icon,{kind:'usage',size:16}),'额度与用量')),
          h('div',{style:{paddingTop:4}},children)));
    }
    function DknModelsPage({ctx}){
      const providers=[['codebuddy','codebuddy-cli'],['codex',CLI_PANEL],['qoder',QODER_PANEL],['zcode',ZCODE_PANEL]];
      const [quota,setQuota]=React.useState(null);
      React.useEffect(()=>{let active=true;const refresh=(force=false)=>quotaSnapshot(force===true||force?.type==='dkn-rewards-changed').then(value=>{if(active)setQuota(value)}).catch(()=>{});refresh();const timer=setInterval(refresh,60000);window.addEventListener('dkn-rewards-changed',refresh);window.addEventListener('dkn-provider-verified',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('dkn-provider-verified',refresh);window.removeEventListener('dkn-rewards-changed',refresh)}},[]);
      return h('main',{style:{height:'100%',boxSizing:'border-box',padding:'24px clamp(16px,4vw,40px)',overflowY:'auto',color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-bg-layer-1)'}},
        settingsControl('button',{type:'button',onClick:()=>ctx.layout.selectPanel(ROOT_PANEL)},'‹ 返回 DKN Agent'),h(WorkbenchSupport),h('h2',{style:{margin:'24px 0',fontSize:26}},'模型配置'),h(CheckinOverview),
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12,maxWidth:960}},...providers.map(([provider,panel])=>h('section',{key:provider,style:{display:'grid',gap:12,padding:16,borderRadius:10,border:'1px solid var(--dsw-alias-border-l4)',background:'var(--dsw-alias-bg-layer-2)'}},
          settingsControl('button',{type:'button','aria-label':providerNames[provider],onClick:()=>ctx.layout.selectPanel(panel),style:{display:'flex',alignItems:'center',gap:12,border:0,padding:0,background:'transparent',fontSize:16}},h(ProviderIcon,{provider}),providerNames[provider]),
          h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}},h(ProviderStatus,{provider}),h(ProviderVerify,{provider})),
          h('span',{'aria-label':providerNames[provider]+' 剩余额度',title:'当前账号额度；多个窗口或区域依次显示。— 表示未读取，请进入额度页查看。',style:{fontSize:20,fontVariantNumeric:'tabular-nums'}},compactQuota(quota?.[provider]))))));
    }
    function CodexSettingsPage({ctx}){
      const form=ctx.configForms?.get?.('dkn-agent-codex'),[formSnapshot,setFormSnapshot]=React.useState(()=>form?.getSnapshot?.()||{status:'unavailable',value:{}}),[formDraft,setFormDraft]=React.useState({}),[state,setState]=React.useState({connected:false,error:''}),[busy,setBusy]=React.useState(false),nativeSidebarReady=typeof ctx.slots?.spec==='function'&&ctx.slots.spec('sidebar.workspaces.after')!==undefined;
      React.useEffect(()=>{let active=true;const refresh=()=>codexApi('state').then(value=>{if(active)setState(value);}).catch(error=>{if(active)setState(current=>({...current,error:error.message}));});refresh();const timer=setInterval(refresh,1500);return()=>{active=false;clearInterval(timer);};},[]);
      React.useEffect(()=>{if(!form)return;const sync=()=>{const next=form.getSnapshot();setFormSnapshot(next);if(next.value)setFormDraft(current=>({...next.value,...current}))};sync();return form.subscribe(sync)},[form]);
      const toggle=async()=>{setBusy(true);try{const next=await codexApi('connect',state.connected?{disconnect:true}:{});setState(next);ctx.emit('llm/adapters-updated');}catch(error){setState(current=>({...current,error:error.message}));}finally{setBusy(false);}};
      const patch=state.sidebarPatch||{},patchMessage=patch.status==='exit-required'?'补丁已准备。请从应用菜单完全退出 DSH（关闭到托盘不算退出），等待约 15 秒后重新打开。':patch.status==='restart-required'?'已完成 DSH 侧栏适配，请重启 DSH 后显示 Codex 项目区。':patch.status==='unsupported-version'?'当前 DSH 版本暂未适配，请更新 DKN Agent 后重试。':patch.status==='unsupported'||patch.status==='unsupported-layout'||patch.status==='failed'?`自动适配未完成：${patch.reason||'当前 DSH 安装方式暂不支持'}`:'';
      const saveField=(field,value)=>{setFormDraft(current=>({...current,[field]:value}));if(form?.set&&formSnapshot.writable)form.set(field,value).catch(error=>setState(current=>({...current,error:'保存配置失败：'+error.message})));};
      const field=(label,key,type='text',placeholder='')=>h('label',{style:{display:'grid',gap:6,flex:1,minWidth:220}},h('span',null,label),settingsControl('input',{type,placeholder,value:formDraft[key]??formSnapshot.value?.[key]??'',onChange:e=>setFormDraft(current=>({...current,[key]:e.target.value})),onBlur:e=>saveField(key,e.target.value)}));
      const flag=(label,key)=>h('label',{style:{display:'flex',alignItems:'center',gap:8,minWidth:220}},h('input',{type:'checkbox',checked:String(formDraft[key]??formSnapshot.value?.[key]??'true')==='true',onChange:e=>saveField(key,e.target.checked?'true':'false')}),h('span',null,label));
      const card=(title,children)=>h('section',{style:{marginTop:16,padding:16,border:'1px solid var(--dsw-alias-border-l4)',borderRadius:8,display:'grid',gap:12}},h('h3',{style:{margin:0,fontSize:16}},title),children);
      const configCard=card('完整 Codex Agent',h(React.Fragment,null,h('p',{style:{margin:0,opacity:.75}},'这是 DSH 原生会话使用的 app-server 运行时配置。'),h('div',{style:{display:'flex',flexWrap:'wrap',gap:12}},field('Codex Agent / app-server 路径','codexPath'),field('Codex 数据目录（可选）','codexHome'),field('DeepSeek API Key 环境变量','deepSeekApiKeyEnv','text','DEEPSEEK_API_KEY')),h('p',{style:{fontSize:12,opacity:.7,margin:0}},'插件只读取该环境变量进行余额请求，不保存或显示 API Key。'),h('p',{style:{fontSize:12,opacity:.7,margin:0}},formSnapshot.status==='ready'?(formSnapshot.writable?'配置可保存':'当前配置只读'):'配置表单尚未加载')));
      return h(ProviderSettingsLayout,{ctx,provider:'codex',title:'Codex · 项目模式',project:true},h('p',null,state.connected?'本机 Codex 已连接。已有对话会显示在 DSH 原生 Workspace/Session 列表下方，并在 DSH 原生对话界面继续。':'连接后可从 DSH 原生会话使用 Codex。'),h('div',{style:{display:'flex',alignItems:'center',gap:10}},h('span',{style:{color:state.connected?'#42c883':'#a0a6b2'}},state.connected?'● 已连接':'● 未连接'),settingsControl('button',{type:'button',disabled:busy,onClick:toggle},busy?'处理中…':state.connected?'断开 Codex':'连接本机 Codex')),configCard,h(WorkbenchPatchNotice),!nativeSidebarReady?h(CodexProjectFallback,{ctx,connected:state.connected}):null,patchMessage?h('p',{role:'status'},patchMessage):null,patch.attempts?.length?h('details',null,h('summary',null,'定位诊断'),h('pre',null,JSON.stringify(patch.attempts,null,2))):null,!nativeSidebarReady&&!patchMessage&&patch.status!=='checking'?h('p',{role:'status'},'Codex 项目区尚未启用，请重启 DSH 或检查插件状态。'):null,state.error?h('p',{role:'alert'},state.error):null);
    }
    function CodexCliSettingsPage({ctx}){
      const form=ctx.configForms?.get?.('dkn-agent-codex');
      const [snapshot,setSnapshot]=React.useState(()=>form?.getSnapshot?.()||{status:'unavailable',value:{}});
      const [draft,setDraft]=React.useState({});
      const [status,setStatus]=React.useState({state:'checking'});
      const [testPrompt,setTestPrompt]=React.useState('Reply with OK.');
      const [testResult,setTestResult]=React.useState(null);
      const [busy,setBusy]=React.useState('');
      const [error,setError]=React.useState('');
      React.useEffect(()=>{if(!form)return;const sync=()=>{const next=form.getSnapshot();setSnapshot(next);if(next.value)setDraft(current=>({...next.value,...current}))};sync();return form.subscribe(sync)},[form]);
      const refreshStatus=React.useCallback(async()=>{setBusy('status');setError('');try{setStatus(await codexApi('cli/status'));}catch(e){setStatus({state:'error',error:e.message});setError(e.message)}finally{setBusy('')}},[]);
      React.useEffect(()=>{refreshStatus();},[refreshStatus]);
      const save=(key,value)=>{setDraft(current=>({...current,[key]:value}));if(form?.set&&snapshot.writable)form.set(key,value).catch(e=>setError('保存配置失败：'+e.message));};
      const valueOf=key=>draft[key]??snapshot.value?.[key]??'';
      const field=(label,key,type='text',placeholder='')=>h('label',{style:{display:'grid',gap:6,flex:1,minWidth:230}},h('span',null,label),settingsControl('input',{type,placeholder,value:valueOf(key),onChange:e=>setDraft(current=>({...current,[key]:e.target.value})),onBlur:e=>save(key,e.target.value)}));
      const modelIds=Array.isArray(status.models)&&status.models.length?status.models:String(valueOf('codexCliModels')||'').split(/[\r\n,;]+/u).map(value=>value.trim()).filter(Boolean);
      const runTest=async()=>{setBusy('test');setError('');setTestResult(null);try{const result=await codexApi('cli/test',{prompt:testPrompt});setTestResult(result);}catch(e){setTestResult({state:'error',error:e.message});}finally{await refreshStatus();}};
      const statusText=status.state==='ready'?'已找到 CLI':status.state==='error'?'CLI 检测失败':'检测中';
      const statusColor=status.state==='ready'?'#42c883':status.state==='error'?'#e06c75':'#a0a6b2';
      const card=(title,children)=>h(SettingsCard,{title},children);
      const actionButton=(label,onClick,disabled=false)=>settingsControl('button',{type:'button',disabled,onClick},label);
      return h(ProviderSettingsLayout,{ctx,provider:'codex',title:'Codex CLI'},
        h(SettingsCard,{title:'运行状态'},
          h('strong',{role:'status',style:{color:statusColor}},statusText),
          status.path?h('code',{style:{overflowWrap:'anywhere'}},status.path):null,
          h(Notice,null,'模型连接 · '+connectionLabel(status.connection)),
          h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},actionButton(busy==='status'?'检测中…':'检测 CLI',refreshStatus,busy!==''),status.version?h('span',{style:{alignSelf:'center',fontSize:12,opacity:.75}},status.version):null),
          status.error?h('p',{role:'alert',style:{margin:0}},status.error):null),
        h(SettingsCard,{title:'登录与授权'},
          h(LoginInstructions,{command:'codex login'},'如果还没登录，在终端运行命令并完成浏览器授权，然后返回这里发送连接测试。')),
        card('基础配置',h(React.Fragment,null,
          h('div',{style:{display:'flex',flexWrap:'wrap',gap:12}},field('Codex CLI 路径','codexCliPath','text','留空自动发现'),field('默认模型 ID','codexCliModel','text','留空使用 CLI 默认模型')),
          h('label',{style:{display:'grid',gap:6}},h('span',null,'模型清单'),settingsControl('textarea',{rows:3,placeholder:'例如 gpt-5-codex\n或使用逗号分隔',value:valueOf('codexCliModels'),onChange:e=>setDraft(current=>({...current,codexCliModels:e.target.value})),onBlur:e=>save('codexCliModels',e.target.value)})),
          modelIds.length?h('label',{style:{display:'grid',gap:6}},h('span',null,'选择默认模型'),settingsControl('select',{value:valueOf('codexCliModel')||modelIds[0],onChange:e=>save('codexCliModel',e.target.value)},...modelIds.map(model=>h('option',{key:model,value:model},model)))):null,
          modelIds.length?h('div',{style:{display:'flex',gap:6,flexWrap:'wrap'}},...modelIds.map(model=>h('span',{key:model,style:{padding:'4px 8px',borderRadius:999,border:'1px solid var(--dsw-alias-border-l4)',fontSize:12}},model))):h('small',{style:{opacity:.65}},'未填写模型清单时使用 CLI 默认模型。'),
          h('div',{style:{display:'flex',flexWrap:'wrap',gap:12}},field('调用超时（毫秒）','codexCliTimeoutMs','number','180000'),field('默认推理强度','codexCliReasoningEffort','text','留空跟随模型默认值')),
          field('默认工作目录','codexCliCwd','text','留空跟随当前 DSH 会话目录'),
          h('p',{style:{fontSize:12,opacity:.7,margin:0}},snapshot.status==='ready'?(snapshot.writable?'修改后立即保存':'当前配置只读'):'配置表单尚未加载'))),
        card('连接测试',h(React.Fragment,null,
          h('p',{style:{margin:0,opacity:.75}},'“检测 CLI”只执行版本检查。“发送测试请求”会真实调用一次模型并消耗对应额度。'),
          h('label',{style:{display:'grid',gap:6}},h('span',null,'测试提示词'),settingsControl('input',{value:testPrompt,onChange:e=>setTestPrompt(e.target.value),placeholder:'Reply with OK.'})),
          h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},actionButton(busy==='test'?'测试中…':'发送测试请求',runTest,busy!=='')),
          testResult?.state==='ready'?h('div',{role:'status',style:{padding:12,borderRadius:8,background:'rgba(66,200,131,.1)'}},h('strong',null,'调用成功'),h('p',{style:{whiteSpace:'pre-wrap',margin:'8px 0 0'}},testResult.text||'CLI 已返回，但没有可显示的文本。')):null,
          testResult?.state==='error'?h('p',{role:'alert'},testResult.error):null)),
        error?h('p',{role:'alert',style:{marginTop:16}},error):null);
    }
    function SettingsCard({title,children}){
      return h('section',{style:{...sectionStyle(),marginTop:16,background:'var(--dsw-alias-bg-layer-2, transparent)'}},
        h('h3',{style:{margin:0,fontSize:16}},title),children);
    }
    function LoginInstructions({command,children}){
      const [copied,setCopied]=React.useState('');
      return h(React.Fragment,null,
        h(Notice,null,children),
        h('div',{style:rowStyle},
          h('code',{style:{overflowWrap:'anywhere'}},command),
          settingsControl('button',{type:'button',onClick:async()=>{
            try{await navigator.clipboard.writeText(command);setCopied('已复制');}
            catch{setCopied('请手动复制命令');}
          }},'复制登录命令'),
          copied?h('small',{role:'status'},copied):null));
    }
    function connectionLabel(result){
      if(!result)return '尚未验证模型连接';
      const time=result.testedAt?(' · '+formatTime(result.testedAt)):'';
      return (result.state==='ready'?'连接已验证，模型已返回回复':'上次连接测试失败')+time;
    }
    function ZcodeSettingsPage({ctx}){
      const form=ctx.configForms?.get?.('dkn-agent-codex');
      const snapshot=useFormSnapshot(form);
      const [draft,setDraft]=React.useState({}),[error,setError]=React.useState('');
      const [status,setStatus]=React.useState({state:'checking'}),[test,setTest]=React.useState(null);
      const [busy,setBusy]=React.useState(false);
      const detectCli=React.useCallback(async()=>{
        setStatus({state:'checking'});
        try{setStatus(await codexApi('zcode/status'));}
        catch(error){setStatus({state:'error',error:error.message});}
      },[]);
      React.useEffect(()=>{void detectCli();},[detectCli]);
      const valueOf=(key,fallback='')=>draft[key]??snapshot?.value?.[key]??fallback;
      const disabled=busy||!snapshot?.writable;
      const save=async(key,value)=>{
        if(!form?.set||disabled)return;
        setDraft(current=>({...current,[key]:value}));
        setTest(null);
        setError('');
        try{await form.set(key,value);await detectCli();}
        catch(error){setError('保存配置失败：'+error.message);}
        finally{setDraft(current=>{const next={...current};if(next[key]===value)delete next[key];return next;});}
      };
      const field=(label,key,type='text',placeholder='')=>h('label',{style:{display:'grid',gap:6}},
        h('span',null,label),
        settingsControl('input',{type,placeholder,disabled,value:valueOf(key),
          onChange:e=>setDraft(current=>({...current,[key]:e.target.value})),
          onBlur:e=>{if(e.target.value!==String(snapshot?.value?.[key]??''))void save(key,e.target.value);}}));
      const select=(label,key,options)=>h('label',{style:{display:'grid',gap:6}},
        h('span',null,label),settingsControl('select',{disabled,value:valueOf(key,options[0][0]),onChange:e=>void save(key,e.target.value)},
          ...options.map(([id,name])=>h('option',{key:id,value:id},name))));
      const runTest=async()=>{
        setBusy(true);setTest(null);
        try{setTest(await codexApi('zcode/test',{}));}
        catch(error){setTest({state:'error',error:error.message});}
        finally{await detectCli();setBusy(false);}
      };
      const cliState={found:'已找到 CLI',missing:'未找到 CLI',checking:'正在检测 CLI',error:'检测失败'}[status.state];
      const providerState=status.enabled===false?'已关闭，不出现在模型选择器':
        status.registered===true?'已注册到 DSH 模型选择器':
        status.enabled===true?'已开启，当前尚未注册。保存设置后完全退出并重启 DSH。':'等待检测';
      const accountMode=valueOf('zcodeAccountMode','standalone');
      return h(ProviderSettingsLayout,{ctx,provider:'zcode'},
        h(SettingsCard,{title:'运行状态'},
          h('strong',{role:'status'},cliState),
          status.path?h('code',{style:{overflowWrap:'anywhere'}},status.path):null,
          h(Notice,null,'DSH 提供方 · '+providerState),
          h(Notice,null,'模型连接 · '+connectionLabel(status.connection)),
          status.error?h('p',{role:'alert'},status.error):null,
          h('div',{style:rowStyle},settingsControl('button',{type:'button',disabled:busy||status.state==='checking',onClick:detectCli},'检测 CLI'))),
        h(SettingsCard,{title:'登录与授权'},
          accountMode==='start-plan'
            ?h(Notice,null,'Desktop Start Plan 使用 ZCode 桌面客户端的登录状态。请在 ZCode 桌面端登录并确认套餐可用，然后返回这里发送连接测试。')
            :h(LoginInstructions,{command:'zcode login'},'在终端运行登录命令并完成浏览器授权。授权后返回这里发送连接测试。')),
        h(SettingsCard,{title:'基础配置'},
          h('label',{style:rowStyle},h('input',{type:'checkbox',disabled,checked:String(valueOf('zcodeEnabled','true'))==='true',onChange:e=>void save('zcodeEnabled',String(e.target.checked))}),'启用 ZCode 模型提供方'),
          field('ZCode CLI 路径','zcodeCliPath','text','留空自动发现'),
          select('账号通道','zcodeAccountMode',[['standalone','Standalone / Coding Plan'],['start-plan','Desktop Start Plan']]),
          h(Notice,null,snapshot?.writable?'修改后自动保存。提供方开关或运行路径变更后，请重启 DSH。':'当前配置不可写。'),
          error?h('p',{role:'alert'},error):null),
        h(SettingsCard,{title:'连接测试'},
          h(Notice,null,'发送一条短提示词，收到模型文本后才确认连接。'),
          h('div',{style:rowStyle},settingsControl('button',{type:'button',disabled:busy||status.state!=='found',onClick:runTest},busy?'测试中…':'发送连接测试')),
          test?.state==='ready'?h('div',{role:'status'},h('strong',null,'已收到回复 · '+test.model),h('p',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}},test.text)):null,
          test?.state==='error'?h('p',{role:'alert'},test.error):null),
        h(SettingsCard,{title:'高级配置'},
          field('Node 可执行文件','zcodeCliNode','text','node'),
          field('工作目录','zcodeCliCwd','text','留空使用独立临时工作区'),
          field('ZCode 数据目录','zcodeDataBaseDir','text','留空使用原生目录'),
          field('单次回合超时（毫秒）','zcodeCliTimeoutMs','number','900000'),
          field('app-server 请求超时（毫秒）','zcodeAppServerTimeoutMs','number','120000'),
          select('工具权限策略','zcodeAuthorizationPolicy',[['deny','拒绝工具授权（默认）'],['allow-all','自动允许工具授权']])));
    }
    function quotaValueText(value){
      if(!value)return '正在读取…';
      if(value.source==='dsh-account'&&value.state==='available')return value.wallets?.length?value.wallets.map(row=>`${row.kind} ${row.currency} ${Number(row.balance).toFixed(2)}`).join(' · '):'账号未返回钱包明细';
      if(value.source==='codebuddy-account'&&value.regions)return value.regions.map(row=>(row.region==='cn'?'国内版':'国际版')+'：'+(row.state==='available'?`剩余 ${row.remaining} 积分`:row.error||'未读取')).join('；');
      if(value.buckets?.length)return value.buckets.map(row=>`${row.label} 剩余 ${row.remaining??'未知'} ${row.unit||''}${row.total!==undefined?' / '+row.total:''}`).join('；');
      if(value.source==='zcode-start-plan'&&value.state==='available')return value.activePlans?`Start Plan：${value.activePlans} 个有效套餐${value.entitlements?.length?' · '+value.entitlements.map(row=>row.name).join('、'):''}`:'Start Plan：无有效套餐';
      return null;
    }
    function QuotaSettingsPage({ctx}){
      const form=ctx.configForms?.get?.('dkn-agent-codex'),[snapshot,setSnapshot]=React.useState(()=>form?.getSnapshot?.()||{status:'unavailable',value:{}}),[draft,setDraft]=React.useState({}),[quota,setQuota]=React.useState(null),[quotaBusy,setQuotaBusy]=React.useState(false),[quotaError,setQuotaError]=React.useState('');
      React.useEffect(()=>{if(!form)return;const sync=()=>{const next=form.getSnapshot();setSnapshot(next);if(next.value)setDraft(current=>({...next.value,...current}))};sync();return form.subscribe(sync)},[form]);
      React.useEffect(()=>{let active=true;const refresh=(force=false)=>quotaSnapshot(force===true||force?.type==='dkn-rewards-changed').then(value=>{if(active){setQuota(value);setQuotaError('')}}).catch(()=>{if(active)setQuotaError('额度读取失败，请刷新重试')});refresh();const timer=setInterval(refresh,60000);window.addEventListener('dkn-rewards-changed',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('dkn-rewards-changed',refresh)}},[]);
      const [selected,setSelected]=React.useState(DKN_QUOTA_PROVIDER);
      const refreshQuota=async()=>{setQuotaBusy(true);setQuotaError('');try{setQuota(await quotaSnapshot(true))}catch{setQuotaError('额度读取失败，请刷新重试')}finally{setQuotaBusy(false)}};
      const flag=(label,key,detail)=>h('label',{style:{display:'grid',gridTemplateColumns:'24px 1fr',gap:10,alignItems:'start',padding:'14px 0',borderBottom:'1px solid var(--dsw-alias-border-l4)'}},h('input',{type:'checkbox',checked:String(draft[key]??snapshot.value?.[key]??'true')==='true',onChange:e=>{const value=e.target.checked?'true':'false';setDraft(current=>({...current,[key]:value}));if(form?.set&&snapshot.writable)form.set(key,value)}}),h('span',null,h('strong',null,label),h('small',{style:{display:'block',opacity:.7,marginTop:4}},detail)));
      const windowText=minutes=>{const value=Number(minutes);if(!Number.isFinite(value))return'未知窗口';if(value>=1000)return'周额度';if(value%60===0)return`${value/60}小时`;return`${value}分钟`};
      const resetText=timestamp=>{const value=Number(timestamp);if(!Number.isFinite(value))return'重置时间未知';const diff=Math.max(0,value*1000-Date.now());if(diff<60000)return'即将重置';const minutes=Math.ceil(diff/60000);if(minutes<60)return`${minutes}分钟后重置`;const hours=Math.ceil(minutes/60);if(hours<48)return`${hours}小时后重置`;return`${Math.ceil(hours/24)}天后重置`};
      const codexBuckets=value=>{const limits=value?.rateLimits?.rateLimitsByLimitId||{};const fallback=value?.rateLimits?.rateLimits;const rows=Object.values(limits);return(rows.length?rows:[fallback]).filter(bucket=>bucket?.primary).map(bucket=>({bucket:bucket.primary,label:windowText(bucket.primary.windowDurationMins),remaining:Math.max(0,100-Number(bucket.primary.usedPercent||0)),reset:resetText(bucket.primary.resetsAt)}));};
      const detail=(name,value)=>{const text=quotaValueText(value);if(text)return text;if(value.state==='missing-key')return'DSH 账号服务尚未就绪，且未配置 API Key';if(value.state==='unavailable-balance')return Number.isFinite(Number(value.credits))?`累计消耗 ${Number(value.credits)} 积分 · 剩余积分无法读取`:'剩余积分无法读取';if(value.state==='web-only')return'官方网页查看';if(value.state!=='available')return value.error||'暂不可用';if(value.balance_infos?.length)return value.balance_infos.map(item=>`${item.currency} ${Number(item.total_balance).toFixed(2)}`).join(' · ');const buckets=codexBuckets(value);return buckets.length?buckets.map(item=>`${item.label} ${item.remaining}%剩余 · ${item.reset}`).join('；'):'已连接，暂无限额明细'};
      const card=(title,value,detailText)=>h('article',{style:{padding:16,border:'1px solid var(--dsw-alias-border-l4)',borderRadius:8,background:'var(--dsw-alias-bg-layer-2)',display:'grid',gap:8}},h('div',{style:{display:'flex',alignItems:'center',gap:10}},h(ProviderIcon,{provider:title.toLowerCase(),size:22}),h('strong',null,title)),h('div',{style:{fontSize:16,lineHeight:1.5}},value),h('small',{style:{opacity:.7,lineHeight:1.5}},detailText),['CodeBuddy','Qoder'].includes(title)?h(DailyRewards,{provider:title.toLowerCase(),onClaimed:refreshQuota}):null,title==='CodeBuddy'?h('div',{style:{display:'flex',gap:12,flexWrap:'wrap'}},h('a',{href:'https://www.codebuddy.cn/',target:'_blank',rel:'noreferrer',style:{color:'inherit'}},'国内版个人中心 ↗'),h('a',{href:'https://www.codebuddy.ai/',target:'_blank',rel:'noreferrer',style:{color:'inherit'}},'国际版个人中心 ↗')):null);
      return h('main',{style:{height:'100%',padding:'28px 32px',overflowY:'auto',color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-bg-layer-1)',maxWidth:900}},settingsControl('button',{type:'button',onClick:()=>ctx.layout.selectPanel(ROOT_PANEL)},'‹ 返回 DKN Agent'),h(WorkbenchSupport),h('h2',{style:{marginBottom:8}},'额度与用量'),h(CheckinOverview),h('p',{style:{opacity:.8}},'这里显示当前账号的官方余额和套餐额度。'),h('div',{style:{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}},settingsControl('button',{type:'button',disabled:quotaBusy,onClick:refreshQuota},quotaBusy?'正在查询…':'刷新额度'),quota?.updatedAt?h('small',{style:{opacity:.7}},'更新于 '+new Date(quota.updatedAt).toLocaleTimeString()):null),quotaError?h('p',{role:'alert'},quotaError):null,h('nav',{'aria-label':'额度平台',style:{display:'flex',gap:8,flexWrap:'wrap',marginTop:20}},...['','codebuddy','deepseek','codex','qoder','zcode'].map(id=>settingsControl('button',{key:id,type:'button','aria-pressed':selected===id,onClick:()=>setSelected(id),style:{background:selected===id?'var(--dsw-alias-bg-layer-3)':'transparent'}},id?providerNames[id]:'全部'))),h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,marginTop:20}},...[card('CodeBuddy',detail('CodeBuddy',quota?.codebuddy),'读取各区域当前 CLI 登录账号的有效积分包；独立账号沿用配置页的账号选择。'),card('DeepSeek',detail('DeepSeek',quota?.deepseek),quota?.deepseek?.source==='dsh-account'?'与 DSH「账号与余额」同源，分别展示充值和赠金。':'当前显示 API Key 余额；DSH 账号服务就绪后优先显示登录账号。'),card('Codex',detail('Codex',quota?.codex),'读取 Codex app-server 限额窗口和剩余比例。'),card('Qoder',detail('Qoder',quota?.qoder),'通过官方 CLI 的账号查询协议读取套餐、加量包和组织额度。'),card('ZCode',detail('ZCode',quota?.zcode),'查询当前 ZCode 账号的 Coding Plan 或 Start Plan 官方额度，保留各通道原始单位。')].filter((_,index)=>!selected||['codebuddy','deepseek','codex','qoder','zcode'][index]===selected)),h('h3',{style:{marginTop:28}},'显示开关'),h('section',{style:{marginTop:10,padding:'4px 18px',border:'1px solid var(--dsw-alias-border-l4)',borderRadius:8}},flag('CodeBuddy 用量','showCodeBuddyQuota','控制 CodeBuddy 用量入口是否显示。'),flag('DeepSeek 余额','showDeepSeekQuota','控制 DeepSeek 余额入口是否显示。'),flag('Codex 用量','showCodexQuota','控制 Codex 用量入口是否显示。'),flag('Qoder 额度','showQoderQuota','控制 Qoder 套餐额度是否显示。'),flag('ZCode 套餐','showZcodeQuota','控制 ZCode 套餐权益是否显示。')),h('p',{style:{fontSize:12,opacity:.7,marginTop:16}},snapshot.status==='ready'?(snapshot.writable?'修改后立即保存':'当前配置只读'):'配置表单尚未加载'));
    }    function QuotaFooterAction({ctx,wide}){
      const form=ctx.configForms?.get?.('dkn-agent-codex'),[data,setData]=React.useState(null),[settings,setSettings]=React.useState(()=>form?.getSnapshot?.()||{value:{}}),[open,setOpen]=React.useState(false),[tip,setTip]=React.useState(null);
      React.useEffect(()=>{if(!form)return;const sync=()=>setSettings(form.getSnapshot());sync();return form.subscribe(sync)},[form]);
      React.useEffect(()=>{let active=true;const refresh=(force=false)=>quotaSnapshot(force===true||force?.type==='dkn-rewards-changed').then(value=>{if(active)setData(value)}).catch(()=>{});refresh();const timer=setInterval(refresh,60000);window.addEventListener('dkn-rewards-changed',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('dkn-rewards-changed',refresh)}},[]);
      const settingEnabled=key=>{const value=settings.value?.[key];const current=value&&typeof value==='object'&&typeof value.get==='function'?value.get():value;return String(current??'true')==='true'};
      const values=[['DeepSeek',data?.deepseek,'showDeepSeekQuota'],['Codex',data?.codex,'showCodexQuota'],['CodeBuddy',data?.codebuddy,'showCodeBuddyQuota'],['Qoder',data?.qoder,'showQoderQuota'],['ZCode',data?.zcode,'showZcodeQuota']].filter(([,value,key])=>value?.state==='available'&&settingEnabled(key));
      const label='额度与用量';
      const windowText=minutes=>{const value=Number(minutes);if(!Number.isFinite(value))return'未知窗口';if(value>=1000)return'周额度';if(value%60===0)return`${value/60}小时`;return`${value}分钟`};const resetText=timestamp=>{const value=Number(timestamp);if(!Number.isFinite(value))return'重置时间未知';const diff=Math.max(0,value*1000-Date.now());if(diff<60000)return'即将重置';const minutes=Math.ceil(diff/60000);if(minutes<60)return`${minutes}分钟后重置`;const hours=Math.ceil(minutes/60);if(hours<48)return`${hours}小时后重置`;return`${Math.ceil(hours/24)}天后重置`};const row=value=>{const text=quotaValueText(value);if(text)return text;if(value?.state==='missing-key')return'账号余额尚未就绪';if(value?.state==='unavailable-balance')return Number.isFinite(Number(value.credits))?`累计 ${Number(value.credits)} 积分 · 剩余不可读`:'剩余不可读';if(value?.state==='web-only')return'网页查看';if(value?.state!=='available')return'暂不可用';if(value.balance_infos?.length)return value.balance_infos.map(item=>`${item.currency} ${Number(item.total_balance).toFixed(2)}`).join(' · ');const limits=value?.rateLimits?.rateLimitsByLimitId||{};const buckets=Object.values(limits).filter(item=>item?.primary);const fallback=value?.rateLimits?.rateLimits;if(!buckets.length&&fallback?.primary)buckets.push(fallback);if(buckets.length)return buckets.map(item=>`${windowText(item.primary.windowDurationMins)} ${Math.max(0,100-Number(item.primary.usedPercent||0))}%剩余 · ${resetText(item.primary.resetsAt)}`).join('；');return'已连接，等待限额数据';};
      const show=event=>{const rect=event.currentTarget.getBoundingClientRect();setTip({left:16,bottom:Math.max(64,window.innerHeight-rect.top+8)});setOpen(true)};
      if(!['showDeepSeekQuota','showCodexQuota','showCodeBuddyQuota','showQoderQuota','showZcodeQuota'].some(settingEnabled))return h(React.Fragment,null,h(WorkbenchPatchNotice),h(WorkbenchUpdateNotice));
      return h(React.Fragment,null,h(WorkbenchPatchNotice),h(WorkbenchUpdateNotice),h('div',{style:{display:'flex',justifyContent:wide?'flex-start':'center',padding:'6px 8px'}},settingsControl('button',{type:'button','aria-label':label,title:label,onClick:()=>openProviderQuota(ctx),onMouseEnter:show,onMouseLeave:()=>setOpen(false),onFocus:show,onBlur:()=>setOpen(false),style:{display:'flex',alignItems:'center',justifyContent:'center',width:34,height:34,padding:7,border:0,background:'transparent',color:'var(--dsw-alias-label-secondary)',borderRadius:8}},h(Icon,{kind:'usage',size:20})),open&&tip?h('div',{role:'tooltip',style:{position:'fixed',zIndex:9999,left:tip.left,bottom:tip.bottom,width:270,padding:14,borderRadius:10,background:'var(--dsw-alias-bg-layer-2, #202024)',opacity:1,border:'1px solid #4b4b52',boxShadow:'0 10px 30px rgba(0,0,0,.55)',fontSize:12,color:'var(--dsw-alias-label-primary)',backdropFilter:'none'}},h('strong',null,'额度摘要'),...(values.length?values.map(([name,value])=>h('div',{key:name,style:{display:'flex',justifyContent:'space-between',gap:12,paddingTop:9}},h('span',null,name),h('span',null,row(value)))): [h('div',{key:'empty',style:{paddingTop:9,opacity:.7}},'暂无可用额度数据')]),h('div',{style:{paddingTop:10,opacity:.65}},'详细额度信息可在 DKN Agent 的额度页面查看')):null));
    }    const DKN_CODEX_PROVIDER='dkn-codex-agent';
    function makeIsolatedModelDirectory(inner,sessionId){
      const listeners=new Set();
      let mapped=null;
      let snapshot=inner.store.getSnapshot();
      const publish=()=>{
        const state=inner.store.getSnapshot();
        const codex=mapped===null?state.current?.provider===DKN_CODEX_PROVIDER:mapped===true;
        const groups=(state.groups||[]).filter(group=>codex?group.id===DKN_CODEX_PROVIDER:group.id!==DKN_CODEX_PROVIDER);
        const failures=(state.failures||[]).filter(failure=>codex?failure.id===DKN_CODEX_PROVIDER:failure.id!==DKN_CODEX_PROVIDER);
        const current=state.current;
        const routable=current===null||current===undefined?null:groups.some(group=>group.id===current.provider&&(group.models||[]).some(model=>model.id===current.model));
        snapshot={...state,groups,failures,routable};
        for(const listener of [...listeners])listener();
      };
      const unsubscribe=inner.store.subscribe(publish);
      publish();
      codexApi('native/session-map?sessionId='+encodeURIComponent(String(sessionId))).then(value=>{if(value&&typeof value.mapped==='boolean'){mapped=value.mapped;publish();}}).catch(()=>{});
      return {
        store:{subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},getSnapshot(){return snapshot;}},
        async load(){await inner.load();return snapshot;},
        select(selection){return inner.select(selection);},
        resetConnected(){inner.resetConnected();},
        dispose(){listeners.clear();try{unsubscribe();}catch{}},
      };
    }
    function applyModelIsolation(ctx){
      const install=scope=>{
        const resolver=scope.modelDirectories;
        if(!resolver||typeof resolver.directoryFor!=='function'||resolver.directoryFor.__dknIsolation)return;
        const original=resolver.directoryFor;
        const wrappers=new Map();
        const isolatedDirectoryFor=function(session){
          const inner=original.call(this,session);
          let wrapper=wrappers.get(inner);
          if(!wrapper){wrapper=makeIsolatedModelDirectory(inner,session);wrappers.set(inner,wrapper);}
          return wrapper;
        };
        isolatedDirectoryFor.__dknIsolation=true;
        scope.effect(()=>{
          resolver.directoryFor=isolatedDirectoryFor;
          return()=>{
            if(resolver.directoryFor===isolatedDirectoryFor)resolver.directoryFor=original;
            for(const wrapper of wrappers.values())wrapper.dispose();
            wrappers.clear();
          };
        },'dkn-agent: session model isolation');
      };
      ctx.inject(['modelDirectories'],install);
    }
    function applyCodex(ctx){ctx.effect(()=>{applyModelIsolation(ctx);const disposers=[ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:QODER_PANEL,inject:()=>({ctx})},QoderSettingsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:ROOT_PANEL,inject:()=>({ctx})},DknSettingsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:MODEL_PANEL,inject:()=>({ctx})},DknModelsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:CLI_PANEL,inject:()=>({ctx})},CodexCliSettingsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:ZCODE_PANEL,inject:()=>({ctx})},ZcodeSettingsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:QUOTA_PANEL,inject:()=>({ctx})},QuotaSettingsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:HUB_PANEL,inject:()=>({ctx})},CollaborationPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:CODEX_PANEL,inject:()=>({ctx})},CodexSettingsPage)),ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:ROOT_PANEL,order:25,label:()=>'DKN Agent'},Icon)),ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:HUB_PANEL,order:26,label:()=>'项目协作'},Icon)),ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:HUB_PANEL,order:31,label:()=>'项目协作',inject:()=>({ctx})},HubSettingsPage)),ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:CODEX_PANEL,order:30,label:()=>'DKN Agent · Codex',inject:()=>({ctx})},CodexSettingsPage)),ctx.slots.inject('sidebar.workspaces.after',()=>ctx.slots.register({name:'sidebar.workspaces.after',id:'dkn-agent-codex-projects',order:100,inject:()=>({ctx})},CodexProjectsSection)),ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'dkn-agent-quota-badge',order:10,inject:()=>({ctx})},QuotaFooterAction))];if(ctx.contextMenus?.register)disposers.push(ctx.contextMenus.register({id:'dkn-agent.collaboration',target:'workspace',order:500,resolve:({path,displayTitle})=>[{id:'collaboration',label:'项目协作',run:()=>openHubProject(ctx,{path,name:displayTitle})}]}));return()=>{if([QODER_PANEL,ROOT_PANEL,MODEL_PANEL,CLI_PANEL,ZCODE_PANEL,QUOTA_PANEL,CODEX_PANEL,HUB_PANEL].includes(ctx.layout.panelInfo.getSnapshot().activePanelId))ctx.layout.selectPanel(null);for(const dispose of disposers.reverse())dispose();};},'dkn-agent: Codex native sessions');}





