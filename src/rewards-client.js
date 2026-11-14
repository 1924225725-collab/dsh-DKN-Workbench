    function DailyRewards({provider,region='cn',accountId,onClaimed,disabled=false,compact=false}){
      const [value,setValue]=React.useState(null),[busy,setBusy]=React.useState(false);
      const claiming=React.useRef(false);
      const supported=provider==='qoder'||provider==='codebuddy'&&region==='cn';
      const root=provider==='codebuddy'?'/plugins/dsh-codebuddy-cli-cn/checkin':apiRoot+'qoder/checkin';
      const query=accountId!==undefined?'?accountId='+encodeURIComponent(accountId||'default'):'';
      const refresh=React.useCallback(async()=>{
        try{const response=await fetch(root+query,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error();setValue(await response.json())}catch{setValue({state:'error',message:'签到状态查询失败，请刷新重试'})}
      },[root,query]);
      React.useEffect(()=>{if(!supported)return;let active=true;const run=async()=>{if(active&&!claiming.current)await refresh()};run();const timer=setInterval(run,60000);window.addEventListener('dkn-rewards-changed',run);return()=>{active=false;clearInterval(timer);window.removeEventListener('dkn-rewards-changed',run)}},[supported,refresh]);
      if(!supported)return provider==='codebuddy'||provider==='zcode'?h('small',{style:{opacity:.65}},provider==='zcode'?'活动领取暂未接入，请在 ZCode 客户端查看活动及验证要求。':'国际版签到尚未验证，暂不开放领取。'):null;
      const labels={claimable:'可领取',claimed:'当前周期已领取','no-activity':'当前没有下发每日活动','not-eligible':'当前账号不符合资格',expired:'活动已结束','not-started':'活动尚未开始',unavailable:'状态暂无法识别','login-required':'需要登录','client-required':'需要官方桌面身份',error:'查询失败',unknown:'结果待核对'};
      const account=provider==='qoder'?'Qoder 国际版桌面账号（可能与 CLI 账号不同）':accountId!==undefined?'此账号的国内版每日签到':'CodeBuddy 国内版当前默认账号';
      const claim=async()=>{
        if(claiming.current)return;claiming.current=true;
        setBusy(true);try{
          const response=await fetch(root,{method:'POST',headers:{'Content-Type':'application/json',[provider==='codebuddy'?'x-dsh-codebuddy-action':'x-dkn-action']:'1'},body:JSON.stringify({action:'claim',...accountId!==undefined?{accountId:accountId||'default'}:{}}),signal:AbortSignal.timeout(60000)});
          if(!response.ok)throw Error();const next=await response.json();setValue(next);
          if(next.mutationAccepted||next.state==='claimed'){onClaimed?.();window.dispatchEvent(new Event('dkn-rewards-changed'))}
        }catch{setValue({state:'unknown',message:'领取结果不确定，请刷新状态核对；不会自动重试'})}finally{setBusy(false);claiming.current=false}
      };
      return h('section',{'aria-label':'每日奖励 '+provider,style:{borderTop:'1px solid var(--dsw-alias-border-l4)',paddingTop:12,marginTop:12,display:compact?'flex':'grid',flexWrap:'wrap',alignItems:'center',gap:8,fontSize:13}},
        !compact?h('strong',null,'签到状态'):null,!compact?h('small',{style:{opacity:.7}},account):null,
        h('div',{role:'status'},labels[value?.state]||'正在查询…',value?.state==='claimable'&&Number.isFinite(value.amount)?' · '+value.amount+(provider==='qoder'?' Credits':' 积分'):''),
        value?.message?h('small',null,value.message):null,
        !compact&&value?.resetAt?h('small',{style:{opacity:.65}},'下一周期：'+new Date(value.resetAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+'（北京时间）'):null,
        h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},settingsControl('button',{type:'button',disabled:busy||disabled,onClick:refresh},'刷新签到状态'),settingsControl('button',{type:'button',disabled:busy||disabled||value?.state!=='claimable',onClick:claim},busy?'正在领取…':'一键签到')));
    }
    function CheckinOverview(){
      const targets=[{id:'codebuddy',label:'CodeBuddy 国内',url:'/plugins/dsh-codebuddy-cli-cn/checkin',header:'x-dsh-codebuddy-action'},{id:'qoder',label:'Qoder 国际',url:apiRoot+'qoder/checkin',header:'x-dkn-action'}];
      const [rows,setRows]=React.useState({}),[busy,setBusy]=React.useState(false),[result,setResult]=React.useState('');
      const lock=React.useRef(false),generation=React.useRef(0);
      const labels={claimable:'可签到',claimed:'当前周期已领取','no-activity':'当前无每日活动','not-eligible':'不符合领取资格',expired:'活动已结束','not-started':'尚未开始','login-required':'需要登录','client-required':'需要官方桌面身份',unavailable:'状态未确认',error:'查询失败',unknown:'结果待核对'};
      const request=async(target,claim=false)=>{
        try{
          const response=await fetch(target.url,{cache:'no-store',signal:AbortSignal.timeout(claim?60000:30000),...claim?{method:'POST',headers:{'Content-Type':'application/json',[target.header]:'1'},body:JSON.stringify({action:'claim'})}:{}});
          if(!response.ok)throw Error();return await response.json();
        }catch{return {state:claim?'unknown':'error',message:claim?'结果不确定，请刷新核对，不会自动重试':'签到状态查询失败'}}
      };
      const refresh=async()=>{if(lock.current)return;const current=++generation.current;const values=await Promise.all(targets.map(async target=>[target.id,await request(target)]));if(generation.current===current)setRows(Object.fromEntries(values))};
      React.useEffect(()=>{refresh();const timer=setInterval(refresh,60000);window.addEventListener('dkn-rewards-changed',refresh);return()=>{generation.current++;clearInterval(timer);window.removeEventListener('dkn-rewards-changed',refresh)}},[]);
      const run=async()=>{
        if(lock.current)return;lock.current=true;generation.current++;setBusy(true);setResult('');let done=0,skipped=0,failed=0;
        try{
          for(const target of targets){
            let value=await request(target);
            if(value.state==='claimable'){
              value=await request(target,true);
              if(value.state==='claimed')done++;else failed++;
            }else if(value.state==='claimed'||value.state==='no-activity'||value.state==='not-eligible'||value.state==='expired'||value.state==='not-started')skipped++;else failed++;
            setRows(old=>({...old,[target.id]:value}));
          }
          setResult('处理完成：已领取 '+done+'，跳过 '+skipped+'，待处理 '+failed+'。');
        }finally{lock.current=false;setBusy(false);window.dispatchEvent(new Event('dkn-rewards-changed'))}
      };
      const available=targets.filter(target=>rows[target.id]?.state==='claimable').length;
      return h('section',{'aria-label':'签到状态',style:{maxWidth:960,margin:'16px 0 24px',padding:16,border:'1px solid var(--dsw-alias-border-l4)',borderRadius:10,background:'var(--dsw-alias-bg-layer-2)',display:'grid',gap:10}},
        h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}},h('strong',null,'签到状态'),h('div',{style:{display:'flex',gap:8}},settingsControl('button',{type:'button',disabled:busy,onClick:refresh},'刷新状态'),settingsControl('button',{type:'button',disabled:busy||!available,onClick:run},busy?'正在签到…':'一键签到'))),
        h('div',{style:{display:'flex',gap:16,flexWrap:'wrap'},role:'status'},...targets.map(target=>h('span',{key:target.id,title:rows[target.id]?.message||'',style:{color:rows[target.id]?.state==='claimed'?'#3ca978':'inherit'}},target.label+'：'+(labels[rows[target.id]?.state]||'正在查询…')))),
        h('small',{style:{opacity:.65}},'点击后依次领取 CodeBuddy 国内当前默认账号、Qoder 国际桌面账号的每日奖励；已领取或无活动会跳过。其他号池账号请单独签到。'),
        result?h('div',{role:'status'},result):null);
    }
