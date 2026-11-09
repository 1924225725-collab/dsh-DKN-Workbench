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
      background:'var(--dsw-alias-background-primary, transparent)', color:'inherit'
    };
    function settingsControl(tag, props, ...children) {
      const base = tag==='button' ? {...entryButtonStyle,font:'inherit'} : settingsFieldStyle;
      const disabled = props.disabled && tag==='button' ? {cursor:'default',opacity:.55} : {};
      return h(tag,{...props,style:{...base,...props.style,...disabled}},...children);
    }
    async function codexApi(path,body){const r=await fetch(apiRoot+path,body?{method:'POST',headers:{'Content-Type':'application/json','x-dkn-action':'1'},body:JSON.stringify(body)}:{cache:'no-store'});const value=await r.json();if(!r.ok)throw Object.assign(new Error(value.error||'请求失败'),{submissionUncertain:value.submissionUncertain});return value;}
    async function quotaSnapshot(){const value=await codexApi('quota');const statuses=await Promise.allSettled(['cn','intl'].map(region=>fetch('/plugins/dsh-codebuddy-cli-'+region+'/status',{cache:'no-store'}).then(response=>response.ok?response.json():null)));const regions=statuses.map(item=>item.status==='fulfilled'?item.value:null).filter(Boolean);const usage=regions.map(item=>item.usage||{});const credits=usage.reduce((total,item)=>total+(Number.isFinite(Number(item.credits))?Number(item.credits):0),0);value.codebuddy={state:'unavailable-balance',credits,regions:regions.map(item=>({provider:item.provider,calls:item.usage?.calls||0,credits:item.usage?.credits||0,lastCall:item.usage?.lastCall||null})),url:'https://www.codebuddy.cn'};return value;}
    function DknSettingsPage({ctx}){const card=(title,text,button,panel)=>h('section',{style:{padding:20,border:'1px solid var(--dsw-alias-border-l4)',borderRadius:10,background:'var(--dsw-alias-background-secondary)',display:'grid',gap:10}},h('h3',{style:{margin:0,fontSize:18}},title),h('p',{style:{margin:0,color:'var(--dsw-alias-label-secondary)',lineHeight:1.6}},text),settingsControl('button',{type:'button',style:entryButtonStyle,onClick:()=>ctx.layout.selectPanel(panel)},button));return h('main',{style:{height:'100%',padding:'40px 48px',color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-background-primary)',maxWidth:900}},h('div',{style:{display:'grid',gap:8}},h('h2',{style:{margin:0,fontSize:28}},'DKN Agent'),h('p',{style:{margin:0,color:'var(--dsw-alias-label-secondary)'}},'统一管理模型提供方、额度显示与 Codex 运行时。')),h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16,marginTop:28}},card('模型配置','配置 CodeBuddy、Codex CLI 和 ZCode CLI，它们会出现在 DSH 新建对话的模型选择器中。','进入模型配置',MODEL_PANEL),card('额度与用量','单独管理额度入口和显示项目。只展示有可靠来源的用量信息。','进入额度与用量',QUOTA_PANEL),card('Codex Agent 设置','连接完整 Codex Agent，管理项目对话、app-server 和本机运行时。','进入 Codex Agent 设置',CODEX_PANEL)));}
    function DknModelsPage({ctx}){const card=(title,text,button,onClick)=>h('section',{style:{padding:20,border:'1px solid var(--dsw-alias-border-l4)',borderRadius:10,background:'var(--dsw-alias-background-secondary)',display:'grid',gap:10}},h('h3',{style:{margin:0,fontSize:18}},title),h('p',{style:{margin:0,color:'var(--dsw-alias-label-secondary)',lineHeight:1.6}},text),settingsControl('button',{type:'button',style:entryButtonStyle,onClick},button));return h('main',{style:{height:'100%',padding:'40px 48px',overflowY:'auto',color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-background-primary)',maxWidth:900}},settingsControl('button',{type:'button',onClick:()=>ctx.layout.selectPanel(ROOT_PANEL)},'‹ 返回 DKN Agent'),h('h2',{style:{margin:'24px 0 8px',fontSize:28}},'模型配置'),h('p',{style:{margin:0,color:'var(--dsw-alias-label-secondary)'}},'所有提供方使用统一的状态、配置和测试布局；项目模式的 Codex Agent 由本机 app-server 决定模型。'),h('div',{style:{display:'grid',gap:16,marginTop:28}},card('CodeBuddy','国内版和国际版作为 CodeBuddy 的模型分支，分别管理账号、CLI 和用量。','配置 CodeBuddy',()=>ctx.layout.selectPanel('codebuddy-cli')),card('Codex CLI（命令模式）','调用官方 Codex CLI，可填写模型清单并在会话中选择具体模型。','配置 Codex CLI',()=>ctx.layout.selectPanel(CLI_PANEL)),card('Codex Agent（项目模式）','用于 DSH 原生项目会话，模型由本机 Codex app-server 管理，不与 CLI 模型清单混用。','配置 Codex Agent',()=>ctx.layout.selectPanel(CODEX_PANEL)),card('ZCode CLI','通过 ZCode 自带的 app-server 使用已登录账号，模型清单、推理档位和图片能力由 CLI 动态返回。','配置 ZCode CLI',()=>ctx.layout.selectPanel(ZCODE_PANEL))));}
    function CodexSettingsPage({ctx}){
      const form=ctx.configForms?.get?.('dkn-agent-codex'),[formSnapshot,setFormSnapshot]=React.useState(()=>form?.getSnapshot?.()||{status:'unavailable',value:{}}),[formDraft,setFormDraft]=React.useState({}),[state,setState]=React.useState({connected:false,error:''}),[busy,setBusy]=React.useState(false),nativeSidebarReady=typeof ctx.slots?.spec==='function'&&ctx.slots.spec('sidebar.workspaces.after')!==undefined;
      React.useEffect(()=>{let active=true;const refresh=()=>codexApi('state').then(value=>{if(active)setState(value);}).catch(error=>{if(active)setState(current=>({...current,error:error.message}));});refresh();const timer=setInterval(refresh,1500);return()=>{active=false;clearInterval(timer);};},[]);
      React.useEffect(()=>{if(!form)return;const sync=()=>{const next=form.getSnapshot();setFormSnapshot(next);if(next.value)setFormDraft(current=>({...next.value,...current}))};sync();return form.subscribe(sync)},[form]);
      const toggle=async()=>{setBusy(true);try{const next=await codexApi('connect',state.connected?{disconnect:true}:{});setState(next);ctx.emit('llm/adapters-updated');}catch(error){setState(current=>({...current,error:error.message}));}finally{setBusy(false);}};
      const patch=state.sidebarPatch||{},patchMessage=patch.status==='exit-required'?'补丁已准备。请从应用菜单完全退出 DSH（关闭到托盘不算退出），等待约 15 秒后重新打开。':patch.status==='restart-required'?'已完成 DSH 侧栏适配，请重启 DSH 后显示 Codex 项目区。':patch.status==='unsupported-version'?'当前 DSH 版本暂未适配，请更新 DKN Agent 后重试。':patch.status==='unsupported'||patch.status==='unsupported-layout'||patch.status==='failed'?`自动适配未完成：${patch.reason||'当前 DSH 安装方式暂不支持'}`:'';
      const saveField=(field,value)=>{setFormDraft(current=>({...current,[field]:value}));if(form?.set&&formSnapshot.writable)form.set(field,value).catch(error=>setState(current=>({...current,error:'保存配置失败：'+error.message})));};
      const field=(label,key,type='text',placeholder='')=>h('label',{style:{display:'grid',gap:6,flex:1,minWidth:220}},h('span',null,label),settingsControl('input',{type,placeholder,value:formDraft[key]??formSnapshot.value?.[key]??'',onChange:e=>setFormDraft(current=>({...current,[key]:e.target.value})),onBlur:e=>saveField(key,e.target.value)}));
      const flag=(label,key)=>h('label',{style:{display:'flex',alignItems:'center',gap:8,minWidth:220}},h('input',{type:'checkbox',checked:String(formDraft[key]??formSnapshot.value?.[key]??'true')==='true',onChange:e=>saveField(key,e.target.checked?'true':'false')}),h('span',null,label));
      const card=(title,children)=>h('section',{style:{marginTop:16,padding:16,border:'1px solid var(--dsw-alias-border-l4)',borderRadius:8,display:'grid',gap:12}},h('h3',{style:{margin:0}},title),children);
      const configCard=card('完整 Codex Agent',h(React.Fragment,null,h('p',{style:{margin:0,opacity:.75}},'这是 DSH 原生会话使用的 app-server 运行时配置。'),h('div',{style:{display:'flex',flexWrap:'wrap',gap:12}},field('Codex Agent / app-server 路径','codexPath'),field('Codex 数据目录（可选）','codexHome'),field('DeepSeek API Key 环境变量','deepSeekApiKeyEnv','text','DEEPSEEK_API_KEY')),h('p',{style:{fontSize:12,opacity:.7,margin:0}},'插件只读取该环境变量进行余额请求，不保存或显示 API Key。'),h('p',{style:{fontSize:12,opacity:.7,margin:0}},formSnapshot.status==='ready'?(formSnapshot.writable?'配置可保存':'当前配置只读'):'配置表单尚未加载')));
      return h('main',{style:{height:'100%',padding:'28px 32px',overflowY:'auto',color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-background-primary)'}},settingsControl('button',{type:'button',onClick:()=>ctx.layout.selectPanel(MODEL_PANEL)},'‹ 返回模型配置'),h('h2',null,'DKN Agent · Codex 设置'),h('p',null,state.connected?'本机 Codex 已连接。已有对话会显示在 DSH 原生 Workspace/Session 列表下方，并在 DSH 原生对话界面继续。':'连接后可从 DSH 原生会话使用 Codex。'),h('div',{style:{display:'flex',alignItems:'center',gap:10}},h('span',{style:{color:state.connected?'#42c883':'#a0a6b2'}},state.connected?'● 已连接':'● 未连接'),settingsControl('button',{type:'button',disabled:busy,onClick:toggle},busy?'处理中…':state.connected?'断开 Codex':'连接本机 Codex')),configCard,patchMessage?h('p',{role:'status'},patchMessage):null,patch.attempts?.length?h('details',null,h('summary',null,'定位诊断'),h('pre',null,JSON.stringify(patch.attempts,null,2))):null,!nativeSidebarReady&&!patchMessage&&patch.status!=='checking'?h('p',{role:'status'},'Codex 项目区尚未启用，请重启 DSH 或检查插件状态。'):null,state.error?h('p',{role:'alert'},state.error):null);
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
      return h('main',{style:{height:'100%',padding:'28px 32px',overflowY:'auto',color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-background-primary)',maxWidth:960}},
        settingsControl('button',{type:'button',onClick:()=>ctx.layout.selectPanel(MODEL_PANEL)},'‹ 返回模型配置'),
        h('h2',{style:{marginBottom:8}},'Codex CLI 配置'),
        h('p',{style:{opacity:.8}},'配置本机 Codex CLI 模型提供方。完整 Codex Agent 的项目会话和 app-server 设置在单独入口中。'),
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
      return h('section',{style:{...sectionStyle(),marginTop:16,background:'var(--dsw-alias-background-secondary, transparent)'}},
        h('h3',{style:{margin:0}},title),children);
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
      return h('main',{style:{height:'100%',boxSizing:'border-box',padding:'28px 32px',overflowY:'auto',color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-background-primary)',maxWidth:960}},
        settingsControl('button',{type:'button',onClick:()=>ctx.layout.selectPanel(MODEL_PANEL)},'‹ 返回模型配置'),
        h('h2',{style:{marginBottom:8}},'ZCode CLI 配置'),
        h(Notice,null,'通过本机 ZCode 运行时在 DSH 中使用模型。'),
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
    function QuotaSettingsPage({ctx}){
      const form=ctx.configForms?.get?.('dkn-agent-codex'),[snapshot,setSnapshot]=React.useState(()=>form?.getSnapshot?.()||{status:'unavailable',value:{}}),[draft,setDraft]=React.useState({}),[quota,setQuota]=React.useState(null);
      React.useEffect(()=>{if(!form)return;const sync=()=>{const next=form.getSnapshot();setSnapshot(next);if(next.value)setDraft(current=>({...next.value,...current}))};sync();return form.subscribe(sync)},[form]);
      React.useEffect(()=>{let active=true;const refresh=()=>quotaSnapshot().then(value=>{if(active)setQuota(value)}).catch(()=>{});refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer)}},[]);
      const flag=(label,key,detail)=>h('label',{style:{display:'grid',gridTemplateColumns:'24px 1fr',gap:10,alignItems:'start',padding:'14px 0',borderBottom:'1px solid var(--dsw-alias-border-l4)'}},h('input',{type:'checkbox',checked:String(draft[key]??snapshot.value?.[key]??'true')==='true',onChange:e=>{const value=e.target.checked?'true':'false';setDraft(current=>({...current,[key]:value}));if(form?.set&&snapshot.writable)form.set(key,value)}}),h('span',null,h('strong',null,label),h('small',{style:{display:'block',opacity:.7,marginTop:4}},detail)));
      const windowText=minutes=>{const value=Number(minutes);if(!Number.isFinite(value))return'未知窗口';if(value>=1000)return'周额度';if(value%60===0)return`${value/60}小时`;return`${value}分钟`};
      const resetText=timestamp=>{const value=Number(timestamp);if(!Number.isFinite(value))return'重置时间未知';const diff=Math.max(0,value*1000-Date.now());if(diff<60000)return'即将重置';const minutes=Math.ceil(diff/60000);if(minutes<60)return`${minutes}分钟后重置`;const hours=Math.ceil(minutes/60);if(hours<48)return`${hours}小时后重置`;return`${Math.ceil(hours/24)}天后重置`};
      const codexBuckets=value=>{const limits=value?.rateLimits?.rateLimitsByLimitId||{};const fallback=value?.rateLimits?.rateLimits;const rows=Object.values(limits);return(rows.length?rows:[fallback]).filter(bucket=>bucket?.primary).map(bucket=>({bucket:bucket.primary,label:windowText(bucket.primary.windowDurationMins),remaining:Math.max(0,100-Number(bucket.primary.usedPercent||0)),reset:resetText(bucket.primary.resetsAt)}));};
      const detail=(name,value)=>{if(!value)return'暂未读取';if(value.state==='missing-key')return'未找到 DSH API Key';if(value.state==='unavailable-balance')return Number.isFinite(Number(value.credits))?`累计消耗 ${Number(value.credits)} 积分 · 剩余积分无法读取`:'剩余积分无法读取';if(value.state==='web-only')return'官方网页查看';if(value.state!=='available')return value.error||'暂不可用';if(value.balance_infos?.length)return value.balance_infos.map(item=>`${item.currency} ${item.total_balance}`).join(' · ');const buckets=codexBuckets(value);return buckets.length?buckets.map(item=>`${item.label} ${item.remaining}%剩余 · ${item.reset}`).join('；'):'已连接，暂无限额明细'};
      const card=(title,value,detailText)=>h('article',{style:{padding:16,border:'1px solid var(--dsw-alias-border-l4)',borderRadius:8,background:'var(--dsw-alias-background-secondary)',display:'grid',gap:8}},h('strong',null,title),h('div',{style:{fontSize:20}},value),h('small',{style:{opacity:.7,lineHeight:1.5}},detailText));
      return h('main',{style:{height:'100%',padding:'28px 32px',overflowY:'auto',color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-background-primary)',maxWidth:900}},settingsControl('button',{type:'button',onClick:()=>ctx.layout.selectPanel(ROOT_PANEL)},'‹ 返回 DKN Agent'),h('h2',{style:{marginBottom:8}},'额度与用量'),h('p',{style:{opacity:.8}},'这里显示当前插件能确认的实时数据，并控制哪些入口显示在 DSH 中。'),h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,marginTop:20}},card('CodeBuddy',detail('CodeBuddy',quota?.codebuddy),'官方网页暂未提供插件余额接口。'),card('DeepSeek',detail('DeepSeek',quota?.deepseek),'读取 DSH 当前凭据对应的官方余额。'),card('Codex',detail('Codex',quota?.codex),'读取 Codex app-server 限额窗口和剩余比例。')),h('h3',{style:{marginTop:28}},'显示开关'),h('section',{style:{marginTop:10,padding:'4px 18px',border:'1px solid var(--dsw-alias-border-l4)',borderRadius:8}},flag('CodeBuddy 用量','showCodeBuddyQuota','控制 CodeBuddy 用量入口是否显示。'),flag('DeepSeek 余额','showDeepSeekQuota','控制 DeepSeek 余额入口是否显示。'),flag('Codex 用量','showCodexQuota','控制 Codex 用量入口是否显示。')),h('p',{style:{fontSize:12,opacity:.7,marginTop:16}},snapshot.status==='ready'?(snapshot.writable?'修改后立即保存':'当前配置只读'):'配置表单尚未加载'));
    }    function QuotaFooterAction({ctx,wide}){
      const form=ctx.configForms?.get?.('dkn-agent-codex'),[data,setData]=React.useState(null),[settings,setSettings]=React.useState(()=>form?.getSnapshot?.()||{value:{}}),[open,setOpen]=React.useState(false),[tip,setTip]=React.useState(null);
      React.useEffect(()=>{if(!form)return;const sync=()=>setSettings(form.getSnapshot());sync();return form.subscribe(sync)},[form]);
      React.useEffect(()=>{let active=true;const refresh=()=>quotaSnapshot().then(value=>{if(active)setData(value)}).catch(()=>{});refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer)}},[]);
      const settingEnabled=key=>{const value=settings.value?.[key];const current=value&&typeof value==='object'&&typeof value.get==='function'?value.get():value;return String(current??'true')==='true'};
      const values=[['DeepSeek',data?.deepseek,'showDeepSeekQuota'],['Codex',data?.codex,'showCodexQuota'],['CodeBuddy',data?.codebuddy,'showCodeBuddyQuota']].filter(([,value,key])=>value?.state==='available'&&settingEnabled(key));
      const enabled=values.length, single=enabled===1, available=values.filter(([,value])=>value.state==='available').length;
      const bucketFor=value=>{const byId=value?.rateLimits?.rateLimitsByLimitId||{};const primary=Object.values(byId).map(item=>item?.primary).find(item=>item&&Number.isFinite(Number(item.usedPercent)));return primary||value?.rateLimits?.rateLimits?.primary};
      const used=single?Number(bucketFor(values[0][1])?.usedPercent):NaN;
      const hasPercent=Number.isFinite(used);
      const percent=hasPercent?Math.max(0,Math.min(100,100-used)):0;
      const ring=`conic-gradient(${available?'#42c883':'#8492a6'} ${percent}%, rgba(128,128,128,.25) 0)`;
      const label=enabled?'额度摘要':'额度';
      const windowText=minutes=>{const value=Number(minutes);if(!Number.isFinite(value))return'未知窗口';if(value>=1000)return'周额度';if(value%60===0)return`${value/60}小时`;return`${value}分钟`};const resetText=timestamp=>{const value=Number(timestamp);if(!Number.isFinite(value))return'重置时间未知';const diff=Math.max(0,value*1000-Date.now());if(diff<60000)return'即将重置';const minutes=Math.ceil(diff/60000);if(minutes<60)return`${minutes}分钟后重置`;const hours=Math.ceil(minutes/60);if(hours<48)return`${hours}小时后重置`;return`${Math.ceil(hours/24)}天后重置`};const row=value=>{if(value?.state==='missing-key')return'未找到 API Key';if(value?.state==='unavailable-balance')return Number.isFinite(Number(value.credits))?`累计 ${Number(value.credits)} 积分 · 剩余不可读`:'剩余不可读';if(value?.state==='web-only')return'网页查看';if(value?.state!=='available')return'暂不可用';if(value.balance_infos?.length)return value.balance_infos.map(item=>`${item.currency} ${item.total_balance}`).join(' · ');const limits=value?.rateLimits?.rateLimitsByLimitId||{};const buckets=Object.values(limits).filter(item=>item?.primary);const fallback=value?.rateLimits?.rateLimits;if(!buckets.length&&fallback?.primary)buckets.push(fallback);if(buckets.length)return buckets.map(item=>`${windowText(item.primary.windowDurationMins)} ${Math.max(0,100-Number(item.primary.usedPercent||0))}%剩余 · ${resetText(item.primary.resetsAt)}`).join('；');return'已连接，等待限额数据';};
      const show=event=>{const rect=event.currentTarget.getBoundingClientRect();setTip({left:16,bottom:Math.max(64,window.innerHeight-rect.top+8)});setOpen(true)};
      return h('div',{style:{position:'relative',display:'flex',justifyContent:wide?'flex-start':'center',padding:wide?'6px 8px':'6px',background:'#171719',isolation:'isolate'}},h('button',{type:'button','aria-label':label,title:label,onMouseEnter:show,onMouseLeave:()=>setOpen(false),onFocus:show,onBlur:()=>setOpen(false),style:{position:'relative',zIndex:2,width:wide?34:28,height:wide?34:28,borderRadius:'50%',border:'2px solid #303034',background:ring,color:'#f5f5f5',cursor:'default',padding:3,boxShadow:'0 1px 4px rgba(0,0,0,.35)'}},h('span',{style:{display:'grid',placeItems:'center',width:'100%',height:'100%',borderRadius:'50%',background:'#242427',fontSize:11}},single?(hasPercent?`${Math.round(percent)}%`:'—'):'$')),open&&tip?h('div',{role:'tooltip',style:{position:'fixed',zIndex:9999,left:tip.left,bottom:tip.bottom,width:270,padding:14,borderRadius:10,background:'#202024',opacity:1,border:'1px solid #4b4b52',boxShadow:'0 10px 30px rgba(0,0,0,.55)',fontSize:12,color:'#f5f5f5',backdropFilter:'none'}},h('strong',null,'额度摘要'),...(values.length?values.map(([name,value])=>h('div',{key:name,style:{display:'flex',justifyContent:'space-between',gap:12,paddingTop:9}},h('span',null,name),h('span',null,row(value)))): [h('div',{key:'empty',style:{paddingTop:9,opacity:.7}},'暂无可用额度数据')]),h('div',{style:{paddingTop:10,opacity:.65}},'详细额度信息可在 DKN Agent 的额度页面查看')):null);
    }    function applyCodex(ctx){ctx.effect(()=>{const disposers=[ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:ROOT_PANEL,inject:()=>({ctx})},DknSettingsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:MODEL_PANEL,inject:()=>({ctx})},DknModelsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:CLI_PANEL,inject:()=>({ctx})},CodexCliSettingsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:ZCODE_PANEL,inject:()=>({ctx})},ZcodeSettingsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:QUOTA_PANEL,inject:()=>({ctx})},QuotaSettingsPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:HUB_PANEL,inject:()=>({ctx})},CollaborationPage)),ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:CODEX_PANEL,inject:()=>({ctx})},CodexSettingsPage)),ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:ROOT_PANEL,order:25,label:()=>'DKN Agent'},Icon)),ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:CODEX_PANEL,order:30,label:()=>'DKN Agent · Codex',inject:()=>({ctx})},CodexSettingsPage)),ctx.slots.inject('sidebar.workspaces.after',()=>ctx.slots.register({name:'sidebar.workspaces.after',id:'dkn-agent-codex-projects',order:100,inject:()=>({ctx})},CodexProjectsSection)),ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'dkn-agent-quota-badge',order:10,inject:()=>({ctx})},QuotaFooterAction))];if(ctx.contextMenus?.register)disposers.push(ctx.contextMenus.register({id:'dkn-agent.collaboration',target:'workspace',order:500,resolve:({path,displayTitle})=>[{id:'collaboration',label:'项目协作',run:()=>openHubProject(ctx,{path,name:displayTitle})}]}));return()=>{if([ROOT_PANEL,MODEL_PANEL,CLI_PANEL,ZCODE_PANEL,QUOTA_PANEL,CODEX_PANEL,HUB_PANEL].includes(ctx.layout.panelInfo.getSnapshot().activePanelId))ctx.layout.selectPanel(null);for(const dispose of disposers.reverse())dispose();};},'dkn-agent: Codex native sessions');}





