    // A vector rig rather than a looping video: each action follows observed gateway state.
    function CourierCharacter(){
      const [style]=useWorkbenchStyle();
      if(style==='illustrated')return h('img',{src:DKN_WORKBENCH_ART.courier,alt:'',className:'dkn-courier-art',draggable:false});
      const p=(d,props={})=>h('path',{d,...props});
      return h('svg',{viewBox:'0 0 120 144',className:'dkn-courier-art','aria-hidden':true,fill:'none'},
        h('ellipse',{cx:60,cy:137,rx:29,ry:4,fill:'currentColor',opacity:.09}),
        h('g',{className:'dkn-courier-body',stroke:'#333036',strokeWidth:2.3,strokeLinejoin:'round',strokeLinecap:'round'},
          h('g',{className:'dkn-courier-leg left'},p('M43 112v18q0 6 12 3l5-18', {fill:'#45434a'})),
          h('g',{className:'dkn-courier-leg right'},p('M60 115l5 18q12 3 12-3v-18',{fill:'#45434a'})),
          p('M43 86q-14 5-16 22l10 6 8-13M77 86q14 5 16 22l-10 6-8-13',{fill:'#a7b9d2'}),
          p('M32 100l9 5m38 0 9-5',{stroke:'#ecedf0',strokeWidth:5}),
          p('M43 84h34l7 34H36Z',{fill:'#f8f6ee'}),p('M48 83q12 19 24 0',{fill:'#9bafca'}),
          h('g',{className:'dkn-courier-arm left'},p('M34 106q-8 6-2 12t11-6',{fill:'#f5d9c8'})),
          h('g',{className:'dkn-courier-arm right'},p('M86 106q8 6 2 12t-11-6',{fill:'#f5d9c8'})),
          h('g',{className:'dkn-courier-head'},
            h('circle',{cx:20,cy:64,r:10,fill:'#f5d9c8'}),h('circle',{cx:100,cy:64,r:10,fill:'#f5d9c8'}),
            p('M24 43q0-24 36-24t36 24v23q-2 23-36 23T24 66Z',{fill:'#f9e4d5'}),
            p('M18 58Q6 35 22 22L18 17q12 0 19-7 19-12 40-2 13-1 25 11l8-1-4 9q10 19-3 34l-9-19-7 9-8-16-9 12-8-14-11 16-3-12-16 17-1-13Z',{fill:'#edcf97'}),
            p('M36 23q18-9 36-3',{stroke:'#fff5dc',strokeWidth:4}),
            h('g',{className:'dkn-courier-eyes',fill:'#433a36',strokeWidth:1.5},
              h('ellipse',{cx:42,cy:61,rx:7.5,ry:10}),h('ellipse',{cx:78,cy:61,rx:7.5,ry:10}),
              h('circle',{cx:40,cy:57,r:3,fill:'white',stroke:'none'}),h('circle',{cx:76,cy:57,r:3,fill:'white',stroke:'none'})),
            h('g',{stroke:'#343136',strokeWidth:3},h('rect',{x:24,y:46,width:32,height:29,rx:12}),h('rect',{x:64,y:46,width:32,height:29,rx:12}),p('M56 55q4-4 8 0M20 49h5m70 0h5')),
            p('M55 77q5 4 10 0',{strokeWidth:1.5}),p('M29 74h5m52 0h5',{stroke:'#e5aaa1',strokeWidth:3})),
          h('g',{className:'dkn-courier-box',stroke:'#8b6b47',strokeWidth:1.6},
            p('M46 100l16-7 17 7-17 8Z',{fill:'#ecd4ac'}),p('M46 100v20l16 8v-20Z',{fill:'#d6b78a'}),p('M62 108v20l17-8v-20Z',{fill:'#e2c398'}),p('M54 97l17 8v7',{stroke:'#faf0da',strokeWidth:3}))),
        h('text',{x:92,y:27,className:'dkn-courier-reaction',fill:'currentColor',fontSize:20,fontWeight:700},'?'));
    }
    const DKN_ROUTE_SCENE_CSS=`
      .dkn-route-scene{border:1px solid var(--dsw-alias-border-l4);border-radius:12px;padding:14px 16px;margin:0 0 18px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);min-width:0}
      .dkn-route-scene header{display:flex;justify-content:space-between;align-items:center;gap:12px}.dkn-route-scene header strong{font-size:12px}.dkn-route-scene header button{font-size:11px!important;padding:4px 8px!important}
      .dkn-route-stage{height:160px;position:relative;isolation:isolate;overflow:hidden}.dkn-route-track{position:absolute;left:12%;right:12%;bottom:35px;border-top:1px dashed var(--dsw-alias-border-l4)}
      .dkn-route-node{position:absolute;bottom:24px;width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--dsw-alias-border-l4);border-radius:11px;background:var(--dsw-alias-bg-layer-2);z-index:1}.dkn-route-node.source{left:4%}.dkn-route-node.target{right:4%}.dkn-route-node.target::after{content:'';position:absolute;inset:-4px;border:1px solid currentColor;border-radius:14px;opacity:0}
      .dkn-route-travel{position:absolute;left:17%;right:17%;bottom:30px;height:122px;pointer-events:none}.dkn-courier{position:absolute;left:0;width:100px;bottom:0}.dkn-courier-art{display:block;width:100%;overflow:visible}.dkn-courier-body{transform-origin:60px 130px;animation:dkn-courier-breathe 3s ease-in-out infinite}.dkn-courier-head{transform-origin:60px 80px}.dkn-courier-eyes{transform-origin:60px 61px;animation:dkn-courier-blink 5s infinite}.dkn-courier-box,.dkn-courier-reaction{display:none}.dkn-courier-leg{transform-origin:60px 113px}.dkn-courier-arm{transform-origin:60px 97px}
      .dkn-route-labels{display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:11px;color:var(--dsw-alias-label-secondary)}.dkn-route-labels span:last-child{text-align:right;overflow-wrap:anywhere}.dkn-route-caption{font-size:12px;margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dkn-route-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-secondary)}
      .dkn-courier-arm.right{transform-origin:84px 97px}.dkn-courier-arm.left{transform-origin:36px 97px}
      [data-phase=idle] .dkn-courier-arm.right{animation:dkn-courier-wave 9s ease-in-out infinite}
      [data-phase=success] .dkn-courier-head{animation:dkn-courier-nod 1s ease-in-out 2}
      [data-phase=error] .dkn-courier-arm.left{transform:rotate(20deg)}[data-phase=error] .dkn-courier-arm.right{transform:rotate(-20deg)}
      @keyframes dkn-courier-wave{0%,72%,100%{transform:rotate(0)}78%,88%{transform:rotate(-32deg)}83%,93%{transform:rotate(-18deg)}}@keyframes dkn-courier-nod{50%{transform:translateY(2px) rotate(-3deg)}}
      [data-phase=working] .dkn-courier-box,[data-phase=success] .dkn-courier-box{display:block}
      [data-phase=working] .dkn-courier{animation:dkn-courier-deliver 4s ease-in-out infinite}
      [data-phase=working] .dkn-courier-body{animation:dkn-courier-step .5s ease-in-out infinite}
      [data-phase=working] .dkn-courier-leg.left{animation:dkn-courier-walk .5s ease-in-out infinite alternate}[data-phase=working] .dkn-courier-leg.right{animation:dkn-courier-walk .5s ease-in-out infinite alternate-reverse}
      [data-phase=working] .target::after{animation:dkn-courier-pulse 2s ease-out infinite}
      [data-phase=queued] .dkn-courier-head{animation:dkn-courier-look 2s ease-in-out infinite}
      [data-phase=success] .dkn-courier{animation:dkn-courier-return 2.4s ease-in-out both}
      [data-phase=success] .dkn-route-dot{background:#479a78}
      [data-phase=error] .dkn-courier-reaction{display:block}[data-phase=error] .dkn-courier-head{animation:dkn-courier-look .8s ease-in-out 2}[data-phase=error] .dkn-route-dot{background:#bd8757}
      [data-phase=stopped] .dkn-courier-head{transform:rotate(-7deg)}
      @keyframes dkn-courier-breathe{50%{transform:translateY(-1.5px)}}@keyframes dkn-courier-blink{0%,43%,47%,100%{transform:scaleY(1)}45%{transform:scaleY(.08)}}
      @keyframes dkn-courier-deliver{0%{left:0}55%,100%{left:calc(100% - 100px)}}@keyframes dkn-courier-return{from{left:calc(100% - 100px)}to{left:0}}
      @keyframes dkn-courier-step{50%{transform:translateY(-2px) rotate(1deg)}}@keyframes dkn-courier-walk{from{transform:rotate(-8deg)}to{transform:rotate(8deg)}}@keyframes dkn-courier-look{50%{transform:rotate(5deg)}}@keyframes dkn-courier-pulse{0%{opacity:.35}100%{opacity:0;transform:scale(1.2)}}
      .dkn-route-scene[data-paused=true] *{animation-play-state:paused!important}
      @media(max-width:520px){.dkn-route-scene{padding:12px}.dkn-route-travel{left:14%;right:14%}.dkn-courier{width:84px}.dkn-route-stage{height:145px}@keyframes dkn-courier-deliver{0%{left:0}55%,100%{left:calc(100% - 84px)}}@keyframes dkn-courier-return{from{left:calc(100% - 84px)}to{left:0}}}
      @media(prefers-reduced-motion:reduce){.dkn-route-scene *,.dkn-route-scene ::after{animation:none!important;transition:none!important}}
    `;
    function RouteScene({state,stale=false}){
      const [paused,setPaused]=React.useState(()=>{try{return localStorage.getItem('dkn-route-animation')==='paused'}catch{return false}}),[completion,setCompletion]=React.useState(null);
      const seen=React.useRef(undefined),savedTarget=state.models?.[0]||'',previousTarget=React.useRef(savedTarget);
      const newest=state.records?.[0],stamp=newest?JSON.stringify([newest.time,newest.model,newest.status,newest.elapsedMs]):'';
      React.useEffect(()=>{
        if(previousTarget.current!==savedTarget){previousTarget.current=savedTarget;seen.current=stamp;setCompletion(null);return;}
        if(seen.current===undefined){seen.current=stamp;return;}
        if(seen.current===stamp)return;
        seen.current=stamp;
        // Only observed completions for the saved destination, never old history on page entry.
        if(newest?.model===savedTarget)setCompletion(newest.status==='success'?'success':'error');
      },[stamp,savedTarget]);
      React.useEffect(()=>{if(!completion)return;const timer=setTimeout(()=>setCompletion(null),5000);return()=>clearTimeout(timer)},[completion]);
      const phase=stale?'unknown':state.runtimeUnavailable||!state.running?'stopped':state.active>0?'working':state.queued>0?'queued':completion||'idle';
      const target=state.catalog?.find(row=>row.id===savedTarget),targetName=target?target.providerName+' · '+target.name:savedTarget||'尚未选择目标';
      const captions={unknown:'状态暂时无法同步',stopped:'服务未运行',working:'正在向目标模型搬运请求',queued:'请求正在排队',success:'已收到回复，正在送回',error:'请求未完成，请查看最近请求',idle:savedTarget?'等待新请求':'选择并保存一个目标模型'};
      const toggle=()=>setPaused(current=>{try{localStorage.setItem('dkn-route-animation',current?'running':'paused')}catch{}return !current});
      return h('section',{className:'dkn-route-scene','data-phase':phase,'data-paused':paused,'aria-label':'模型路由动态'},h('style',null,DKN_ROUTE_SCENE_CSS),
        h('header',null,h('strong',null,'请求搬运站'),settingsControl('button',{type:'button',onClick:toggle,'aria-pressed':paused},paused?'播放动画':'暂停动画')),
        h('div',{className:'dkn-route-stage','aria-hidden':true},h('div',{className:'dkn-route-track'}),h('div',{className:'dkn-route-node source'},h(Icon,{kind:'connection',size:18})),h('div',{className:'dkn-route-travel'},h('div',{className:'dkn-courier'},h(CourierCharacter))),h('div',{className:'dkn-route-node target'},h(ProviderIcon,{provider:savedTarget.startsWith('trae')?'trae':savedTarget.startsWith('codebuddy')?'codebuddy':savedTarget.startsWith('qoder')?'qoder':savedTarget.startsWith('zcode')?'zcode':savedTarget.startsWith('antigravity')?'antigravity':'codex',size:18}))),
        h('div',{className:'dkn-route-labels'},h('span',null,'API · '+(state.publicModel||'dkn')),h('span',null,targetName)),
        h('div',{className:'dkn-route-caption',role:'status'},h('span',{className:'dkn-route-dot','aria-hidden':true}),captions[phase],state.active>0||state.queued>0?h('small',null,'进行中 '+state.active+' · 排队 '+state.queued):null));
    }
