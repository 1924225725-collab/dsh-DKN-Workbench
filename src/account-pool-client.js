    function AccountPool({status,statusUrl,active,action,disabled,label,setLabel,confirmRemoval,setConfirmRemoval}){
      const [quotas,setQuotas]=React.useState({}),[loading,setLoading]=React.useState(false),[query,setQuery]=React.useState(''),[adding,setAdding]=React.useState(false);
      const rows=[{id:null,label:'默认 CLI 登录',credentialsPresent:true},...(status.accounts.accounts||[])],ids=rows.map(row=>row.id||'default').join(',');
      const generation=React.useRef(0);
      const refresh=React.useCallback(async(force=false)=>{
        const current=++generation.current;setLoading(true);let next=0;
        const targets=ids.split(',');
        await Promise.all(Array.from({length:Math.min(3,targets.length)},async()=>{while(next<targets.length){const id=targets[next++];try{
          const response=await fetch(statusUrl+'?accountQuotaId='+encodeURIComponent(id)+(force?'&refresh=1':''),{cache:'no-store',signal:AbortSignal.timeout(18000)});
          if(!response.ok)throw new Error();const value=await response.json();if(!value.accountQuota)throw new Error();
          if(generation.current===current)setQuotas(old=>({...old,[id]:value.accountQuota}));
        }catch{if(generation.current===current)setQuotas(old=>({...old,[id]:{state:'error',error:'余额查询失败，请重试或检查登录'}}))}}}));
        if(generation.current===current)setLoading(false);
      },[ids,statusUrl]);
      React.useEffect(()=>{if(!active)return;refresh();const timer=setInterval(refresh,60000);return()=>{generation.current++;clearInterval(timer)}},[active,refresh]);
      const choose=id=>action('select',id);
      const control=(text,onClick,blocked=false)=>settingsControl('button',{type:'button',disabled:disabled||blocked,onClick},text);
      return h('section',{'aria-label':'CodeBuddy 号池',style:{display:'grid',gap:14}},
        h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}},h('h3',{style:{margin:0}},'账号池'),h('div',{style:rowStyle},control(loading?'查询中…':'刷新余额',()=>refresh(true),loading),control(adding?'收起新增':'添加账号',()=>setAdding(!adding),!status.accounts.supported))),
        h(Notice,null,'一键设为新对话默认账号。已有对话保留原账号；要在已有对话换号，请选该账号对应的模型。'),
        settingsControl('input',{'aria-label':'搜索账号',placeholder:'搜索账号备注',value:query,onChange:e=>setQuery(e.target.value)}),
        status.accounts.storageError?h('p',{role:'alert'},'账号记录读取失败，请检查本地数据'):null,
        adding?h('div',{style:rowStyle},settingsControl('input',{'aria-label':'账号备注',placeholder:'给账号起个容易辨认的名字',maxLength:40,value:label,onChange:e=>setLabel(e.target.value),style:{flex:1,minWidth:150}}),control('创建账号',()=>action('add'),!label.trim())):null,
        ...rows.filter(row=>row.label.toLowerCase().includes(query.toLowerCase())).map(account=>{
          const id=account.id||'default',quota=quotas[id],selected=status.accounts.selectedId===account.id;
          const balance=quota?.state==='available'&&Number.isFinite(quota.remaining)?quota.remaining.toLocaleString(undefined,{maximumFractionDigits:2})+' 积分':quota?.state==='error'?'待登录或检查':'读取余额…';
          return h('article',{key:id,style:{border:'1px solid var(--dsw-alias-border-l4)',borderRadius:10,padding:14,background:selected?'var(--dsw-alias-bg-layer-3)':'var(--dsw-alias-bg-layer-2)',display:'grid',gap:8}},
            h('div',{style:{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}},h('div',{style:{flex:1,minWidth:140}},h('strong',null,account.label),h('div',{style:{fontSize:18,marginTop:6}},balance)),selected?h('span',{style:{fontSize:12,color:'var(--dsw-alias-label-secondary)'}},'当前默认'):control('设为默认',()=>choose(account.id),account.pathError||(!account.credentialsPresent&&account.id!==null))),
            active&&statusUrl.includes('-cn/')?h(DailyRewards,{provider:'codebuddy',accountId:account.id,disabled,compact:true,onClaimed:()=>refresh(true)}):null,
            h('details',null,h('summary',{style:{cursor:'pointer',fontSize:12,color:'var(--dsw-alias-label-secondary)'}},'登录与详情'),
              quota?.error?h('p',{role:'status'},quota.error):null,
              account.id?h('div',{style:{...rowStyle,marginTop:10}},control(account.loginCommand?'重新生成登录命令':'生成登录命令',()=>action('prepareLogin',account.id),account.pathError),control('移出账号池',()=>setConfirmRemoval(account.id),selected||account.activeCalls>0)):h(Notice,null,'沿用官方 CLI 的当前登录。可在连接页复制登录命令。'),
              account.loginCommand?h('div',{style:{display:'grid',gap:8,marginTop:10}},h('code',{style:{overflowWrap:'anywhere'}},account.loginCommand),control('复制登录命令',()=>navigator.clipboard.writeText(account.loginCommand))):null,
              account.id?h(Notice,null,'插件累计调用 '+(account.usage?.calls||0)+' 次 · 正在执行 '+(account.activeCalls||0)+' 次'):null,
              confirmRemoval===account.id&&account.id?h('div',{style:{...rowStyle,marginTop:10}},h(Notice,null,'仅从列表移出，保留本地登录文件。'),control('确认移出',()=>action('remove',account.id),selected||account.activeCalls>0),control('取消',()=>setConfirmRemoval(''))):null));
        }));
    }
