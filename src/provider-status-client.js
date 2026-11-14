    function providerAvailability(provider,value){
      if(!value)return {text:'检测中',tone:'muted'};
      if(value.enabled===false)return {text:'已关闭',tone:'muted'};
      if(provider==='project')return {text:value.connected?'已连接':'未连接',tone:value.connected?'good':'muted'};
      if(value.connection?.state==='error'||value.error||value.cliCheck?.state==='unavailable'||value.state==='missing'||value.state==='error')return {text:'不可用',tone:'bad'};
      const last=value.usage?.lastCall||value.lastCall;
      const accountMatches=provider!=='codebuddy'||(value.accounts?.selectedId??null)===(last?.accountId??null);
      if(last?.state==='error'&&accountMatches)return {text:'不可用',tone:'bad'};
      if(value.connection?.state==='ready'||last?.state==='success'&&accountMatches)return {text:'可用',tone:'good'};
      if(value.state==='found'||value.state==='ready'||value.cliCheck?.state==='available')return {text:'待验证',tone:'warn'};
      return {text:'待配置',tone:'muted'};
    }
    function ProviderStatus({provider,project=false}){
      const [status,setStatus]=React.useState(null);
      React.useEffect(()=>{let active=true;
        const refresh=async()=>{
          const paths=project?['/plugins/dkn-agent/state']:provider==='codebuddy'?['/plugins/dsh-codebuddy-cli-cn/status','/plugins/dsh-codebuddy-cli-intl/status']:['/plugins/dkn-agent/'+({codex:'cli',qoder:'qoder',zcode:'zcode'}[provider])+'/status'];
          const values=await Promise.all(paths.map(async path=>{try{const r=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!r.ok)throw new Error();return providerAvailability(project?'project':provider,await r.json())}catch{return {text:'不可用',tone:'bad'}}}));
          let value=values.find(v=>v.tone==='good')||values.find(v=>v.tone==='warn')||values.find(v=>v.text==='待配置')||values[0];
          if(values.length>1&&values.some(v=>v.tone==='good')&&!values.every(v=>v.tone==='good'))value={text:'部分可用',tone:'good'};
          if(active)setStatus(value);
        };refresh();const timer=setInterval(refresh,30000);window.addEventListener('dkn-provider-verified',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('dkn-provider-verified',refresh)};
      },[provider,project]);
      const value=status||{text:'检测中',tone:'muted'},color={good:'#3ca978',warn:'#bf963a',bad:'#d7656b',muted:'var(--dsw-alias-label-secondary)'}[value.tone];
      return h('span',{'data-provider-status':provider,style:{display:'inline-flex',alignItems:'center',gap:5,fontSize:12,fontWeight:400,whiteSpace:'nowrap',color}},h('span',{'aria-hidden':true},'●'),value.text);
    }
