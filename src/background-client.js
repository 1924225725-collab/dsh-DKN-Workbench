    function BackgroundControls(){
      const [state,setState]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
      React.useEffect(()=>{let active=true;const refresh=()=>codexApi('background/state').then(v=>{if(active)setState(v)}).catch(()=>{});refresh();const timer=setInterval(refresh,5000);return()=>{active=false;clearInterval(timer)}},[]);
      const act=async input=>{setBusy(true);setError('');try{setState(await codexApi('background/action',input))}catch(e){setError(e.message)}finally{setBusy(false)}};
      const toggle=(key,checked)=>{const value={keepAlive:state?.keepAlive===true,autoStart:state?.autoStart===true,[key]:checked};if(!value.keepAlive)value.autoStart=false;act({action:'save',...value});};
      return h('section',{'aria-label':'后台服务',style:{padding:'12px 0',display:'grid',gap:8}},
        h('div',{style:{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}},h('strong',null,'后台服务'),h('span',{role:'status'},state?.running?'● 运行中'+(state.version?' · '+state.version:''):'○ 已停止'),settingsControl('button',{type:'button',disabled:busy,onClick:()=>act({action:state?.running?'stop':'start'})},state?.running?'停止后台':'启动后台')),
        h('div',{style:{display:'flex',gap:16,flexWrap:'wrap'}},h('label',null,h('input',{type:'checkbox','aria-label':'退出 DSH 后继续运行',checked:state?.keepAlive===true,disabled:busy||!state,onChange:e=>toggle('keepAlive',e.target.checked)}),' 退出 DSH 后继续运行'),h('label',null,h('input',{type:'checkbox','aria-label':'随 Windows 登录启动',checked:state?.autoStart===true,disabled:busy||!state?.keepAlive,onChange:e=>toggle('autoStart',e.target.checked)}),' 随 Windows 登录启动')),
        h('small',{style:{opacity:.65}},'API 与签到共用后台；停止后台会暂停两项功能。卸载前请关闭自启并停止后台。'),
        error?h('small',{role:'alert'},error):null);
    }
