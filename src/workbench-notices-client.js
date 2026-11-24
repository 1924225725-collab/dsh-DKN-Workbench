    const DKN_REPOSITORY='https://github.com/1924225725-collab/dsh-DKN-Workbench';
    let dknThanksShown=false,dknUpdateShown=false;
    const GUIDE_SEEN_KEY='dkn-workbench:installation-guide-seen';
    const WORKBENCH_GUIDE='__DKN_WORKBENCH_GUIDE__';
    let dknUpdatePromise;
    let dknPatchShown=false;
    function WorkbenchPatchNotice(){
      const [patch,setPatch]=React.useState(null);
      React.useEffect(()=>{
        const key='dkn-workbench:sidebar-install-notice';
        if(dknPatchShown)return;
        try{if(localStorage.getItem(key)==='shown'){dknPatchShown=true;return;}}catch{}
        let active=true,attempts=0,timer;
        const check=async()=>{try{const state=await codexApi('state'),value=state.sidebarPatch;if(!active)return;if(value?.status&&value.status!=='checking'&&!dknPatchShown){dknPatchShown=true;try{localStorage.setItem(key,'shown');}catch{}setPatch(value);return;}}catch{}if(active&&++attempts<20)timer=setTimeout(check,1500);};
        check();return()=>{active=false;clearTimeout(timer);};
      },[]);
      if(!patch)return null;
      const ready=patch.status==='ready';
      return h(WorkbenchModal,{title:'首次安装：Codex 侧栏适配',onClose:()=>setPatch(null)},h('p',{style:{margin:0,lineHeight:1.7}},ready?'Codex 侧栏适配已完成。连接本机 Codex 后，可在侧栏查看项目和对话。':'Codex 项目列表需要一次侧栏适配。若提示补丁已准备或需要重启，请从托盘完全退出 DSH，等待约 15 秒再打开；无需退出 Codex。'),h('p',{style:{margin:0,lineHeight:1.7,opacity:.75}},'这条说明仅首次安装显示。适配进度和异常可随时在 Codex 项目模式配置页查看；侧栏未就绪时也可使用配置页中的项目列表。'),settingsControl('button',{type:'button',onClick:()=>setPatch(null)},'知道了'));
    }
    const externalLink=(label,url)=>h('a',{href:url,target:'_blank',rel:'noopener noreferrer',style:{...entryButtonStyle,display:'inline-flex',textDecoration:'none'}},label);
    function WorkbenchModal({title,onClose,children,maxWidth=420}){
      const closeRef=React.useRef();
      React.useEffect(()=>{const previous=document.activeElement;closeRef.current?.focus();const key=event=>{if(event.key==='Escape'){event.preventDefault();onClose()}if(event.key==='Tab'){const controls=closeRef.current?.parentElement?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled)');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus()}},[]);
      return h('div',{className:'dkn-modal-overlay',style:{position:'fixed',inset:0,zIndex:20000,background:'rgba(0,0,0,.38)',display:'grid',placeItems:'center',padding:16}},h(DknMotionStyles),h('section',{role:'dialog','aria-modal':true,'aria-label':title,style:{position:'relative',width:'min(100%,'+maxWidth+'px)',maxHeight:'85vh',overflowY:'auto',padding:24,borderRadius:14,border:'1px solid var(--dsw-alias-border-l4)',background:'var(--dsw-alias-bg-layer-2,#202228)',color:'var(--dsw-alias-label-primary,#eee)',boxShadow:'0 16px 60px #0005',display:'grid',gap:16}},settingsControl('button',{ref:closeRef,type:'button','aria-label':'关闭'+title,onClick:onClose,style:{position:'absolute',right:10,top:10,padding:'4px 8px'}},'×'),h('h3',{style:{margin:'0 24px 0 0'}},title),children));
    }
    function WorkbenchGuide({onClose}){
      return h(WorkbenchModal,{title:'使用攻略',onClose,maxWidth:720},
        h('article',{style:{fontSize:13,lineHeight:1.8,overflowWrap:'anywhere'}},
          ...WORKBENCH_GUIDE.slice(1).map((block,index)=>{
            if(block.startsWith('## '))return h('h4',{key:index,style:{margin:'20px 0 6px',fontSize:16}},block.slice(3));
            if(block.startsWith('### '))return h('h5',{key:index,style:{margin:'14px 0 6px',fontSize:14}},block.slice(4));
            return h('p',{key:index,style:{margin:'0 0 12px'}},block);
          })),
        h('div',{className:'wp-toolbar'},externalLink('在 GitHub 阅读',DKN_REPOSITORY+'/blob/main/docs/workbench-guide.md')));
    }
    function WorkbenchSupport({ctx}){
      const [dialog,setDialog]=React.useState('');
      React.useEffect(()=>{
        if(dknThanksShown)return;
        dknThanksShown=true;
        try{
          if(localStorage.getItem(GUIDE_SEEN_KEY)==='1')return;
          localStorage.setItem(GUIDE_SEEN_KEY,'1');
        }catch{}
        setDialog('welcome');
      },[]);
      const close=()=>setDialog('');
      return h(React.Fragment,null,h(DknMotionStyles),h(WorkbenchSkin),h('div',{className:'workbench-support',style:{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',margin:'12px 0'}},externalLink('☆ Star',DKN_REPOSITORY),h('small',{style:{opacity:.65}},'DKN Workbench · __DKN_AGENT_VERSION__'),h(StylePicker),h(PluginSettingsButton,{ctx})),
        dialog==='welcome'?h(WorkbenchModal,{title:'感谢使用 DKN Workbench',onClose:close},
          h('p',{style:{margin:0,lineHeight:1.7}},'第一次使用？攻略会带你完成平台安装、登录和首条对话，也可以随时从「插件总设置」打开。'),
          h('div',{style:{display:'flex',gap:10,flexWrap:'wrap'}},
            settingsControl('button',{type:'button',onClick:()=>setDialog('guide')},'阅读使用攻略'),
            settingsControl('button',{type:'button',onClick:close},'继续使用'),
            externalLink('☆ 前往 GitHub',DKN_REPOSITORY))):null,
        dialog==='guide'?h(WorkbenchGuide,{onClose:close}):null);
    }
    function WorkbenchUpdateNotice(){
      const [update,setUpdate]=React.useState(null);
      React.useEffect(()=>{let active=true;dknUpdatePromise??=codexApi('update').catch(()=>null);dknUpdatePromise.then(value=>{if(active&&value?.updateAvailable&&!dknUpdateShown){dknUpdateShown=true;setUpdate(value)}});return()=>{active=false}},[]);
      if(!update)return null;
      return h(WorkbenchModal,{title:'发现插件新版本',onClose:()=>setUpdate(null)},h('p',{style:{margin:0,lineHeight:1.7}},'当前 '+update.currentVersion+' → 最新 '+update.latestVersion+'。请到插件市场检查更新，或从 GitHub 下载新版安装包。'),h('div',{style:{display:'flex',gap:10,flexWrap:'wrap'}},externalLink('GitHub 下载更新',DKN_REPOSITORY+'/releases/latest'),settingsControl('button',{type:'button',onClick:()=>setUpdate(null)},'稍后更新')));
    }
    function compactQuota(value){
      if(value?.state!=='available')return '—';
      if(value.regions)return value.regions.filter(row=>row.state==='available').map(row=>Number(row.remaining).toLocaleString(undefined,{maximumFractionDigits:2})).join(' / ')||'—';
      const limits=value.rateLimits?.rateLimitsByLimitId;const windows=limits?Object.values(limits):[value.rateLimits?.rateLimits];
      const percentages=windows.filter(row=>Number.isFinite(row?.primary?.usedPercent)).map(row=>Math.max(0,Math.min(100,100-row.primary.usedPercent)).toFixed(0)+'%');
      if(percentages.length)return percentages.join(' / ');
      if(value.buckets?.length)return value.buckets.map(row=>Number.isFinite(row.remaining)?Number(row.remaining).toLocaleString(undefined,{maximumFractionDigits:2}):'—').join(' / ');
      if(value.source==='dsh-account')return value.wallets?.map(row=>Number(row.balance).toFixed(2)).join(' / ')||'—';
      if(value.balance_infos?.length)return value.balance_infos.map(row=>Number(row.total_balance).toFixed(2)).join(' / ');
      return '—';
    }
    function ProviderVerify({provider,onVerified}){
      const [open,setOpen]=React.useState(false),[busy,setBusy]=React.useState(false),[result,setResult]=React.useState(null),[region,setRegion]=React.useState('cn');
      const verify=async()=>{setBusy(true);setResult(null);try{
        const codebuddy=provider==='codebuddy';
        const response=await fetch(codebuddy?'/plugins/dsh-codebuddy-cli-'+region+'/actions':apiRoot+({orcaterm:'orcaterm',trae:'trae',codex:'cli',qoder:'qoder',zcode:'zcode',antigravity:'antigravity'}[provider])+'/test',{method:'POST',headers:{'Content-Type':'application/json',[codebuddy?'x-dsh-codebuddy-action':'x-dkn-action']:'1'},body:JSON.stringify(codebuddy?{action:'test'}:{prompt:'Reply with exactly OK. Do not use any tools.'}),signal:AbortSignal.timeout(190000)});
        const value=await response.json();if(!response.ok)throw new Error(value.error||value.message||'验证失败');
        const reply=value.reply||value.text;if(typeof reply!=='string'||!reply.trim())throw new Error('未收到文字回复');
        setResult({reply});window.dispatchEvent(new Event('dkn-provider-verified'));onVerified?.();
      }catch(error){setResult({error:error.name==='TimeoutError'?'验证等待超时，请进入配置页查看。':error.message});window.dispatchEvent(new Event('dkn-provider-verified'))}finally{setBusy(false)}};
      return h(React.Fragment,null,settingsControl('button',{type:'button','aria-label':'验证 '+providerNames[provider],onClick:()=>{setResult(null);setOpen(true)}},'验证'),open?h(WorkbenchModal,{title:'验证 '+providerNames[provider],onClose:()=>setOpen(false)},h('p',{style:{margin:0,lineHeight:1.6}},'向当前账号的模型发送一条短请求，可能消耗少量额度。不会发送你的聊天历史。'),provider==='codebuddy'?settingsControl('select',{'aria-label':'验证区域',value:region,onChange:event=>setRegion(event.target.value),disabled:busy},h('option',{value:'cn'},'国内版'),h('option',{value:'intl'},'国际版')):null,settingsControl('button',{type:'button',disabled:busy,onClick:verify},busy?'正在等待回复…':'开始验证'),result?h('div',{role:'status'},result.error?h('p',null,result.error):h(React.Fragment,null,h('strong',null,'验证成功 · 实际回复'),h('pre',{style:{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:180,overflowY:'auto'}},result.reply))):null):null);
    }
