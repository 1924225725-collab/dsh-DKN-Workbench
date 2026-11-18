    function PluginPerformancePill({useChat}){
      if(typeof useChat!=='function')return null;
      const nodes=useChat(snapshot=>snapshot.legacy?.nodes||[]);
      let node;for(let index=nodes.length-1;index>=0;index--){if(nodes[index]?.kind==='assistant'){node=nodes[index];break;}}
      const value=pluginPerformanceReading(node);
      return value?h('span',{'data-dkn-performance':'average',title:value.title,style:{fontSize:11,color:'var(--dsw-alias-label-secondary)',padding:'2px 6px',whiteSpace:'nowrap'}},value.text):null;
    }
    function installPerformanceFallback(ctx){
      if(typeof ctx.slots?.inject!=='function'||typeof ctx.slots?.register!=='function')return()=>{};
      return ctx.slots.inject('conversation.composer.dock',()=>ctx.slots.register({name:'conversation.composer.dock',id:'dkn-average-throughput',order:2},PluginPerformancePill));
    }
