import {randomUUID} from 'node:crypto';

// Merge canonical project membership with older, unassigned threads at the
// project's exact roots. This is display-only and never assigns a thread.
export class ProjectThreadPager {
  constructor(){this.pages=new Map();}
  async page(runtime,params,project,cursor){
    const roots=[...new Set((project.roots||[]).map(root=>root.path).filter(Boolean))];
    const signature=JSON.stringify({params,projectId:project.id,roots});
    for(const [key,value] of this.pages)if(Date.now()-value.at>600000)this.pages.delete(key);
    let state;
    if(cursor){
      const entry=this.pages.get(cursor);
      if(!entry||entry.signature!==signature)throw new Error('对话列表已过期或条件已变化，请收起项目后重新展开');
      if(!entry.result)entry.result=this.read(runtime,entry.state,signature);
      return entry.result;
    }
    state={seen:new Set(),streams:[{filter:{projectId:project.id},buffer:[],cursor:undefined,done:false}]};
    if(roots.length)state.streams.push({filter:{projectId:null,cwd:roots},buffer:[],cursor:undefined,done:false});
    state.params=params;
    return this.read(runtime,state,signature);
  }
  async read(runtime,state,signature){
    const data=[];
    for(let step=0;data.length<100;step++){
      if(step>1000)throw new Error('对话分页未能正常结束，请刷新项目');
      await Promise.all(state.streams.map(async stream=>{
        let pages=0;
        while(!stream.buffer.length&&!stream.done){
          if(pages++>100)throw new Error('Codex 返回了过多空页，请刷新项目');
          const result=await runtime.call('thread/list',{...state.params,...stream.filter,...(stream.cursor?{cursor:stream.cursor}:{})});
          if(result.nextCursor&&result.nextCursor===stream.cursor)throw new Error('Codex 返回了重复分页游标');
          stream.cursor=result.nextCursor;stream.done=!result.nextCursor;
          // Respect canonical membership even if another client moved a thread.
          stream.buffer=(result.data||[]).filter(thread=>stream.filter.projectId===null?thread.projectId==null:thread.projectId===stream.filter.projectId);
        }
      }));
      const choices=state.streams.filter(stream=>stream.buffer.length);
      if(!choices.length)break;
      choices.sort((a,b)=>Number(b.buffer[0].updatedAt||0)-Number(a.buffer[0].updatedAt||0));
      const stream=choices[0],thread=stream.buffer.shift();
      if(state.seen.has(thread.id))continue;
      state.seen.add(thread.id);
      data.push(stream.filter.projectId===null?{...thread,displayMembership:'directory'}:thread);
    }
    let nextCursor=null;
    if(state.streams.some(stream=>stream.buffer.length||!stream.done)){
      nextCursor='dkn-project-'+randomUUID();
      while(this.pages.size>=64)this.pages.delete(this.pages.keys().next().value);
      this.pages.set(nextCursor,{state,signature,at:Date.now(),result:null});
    }
    return {data,nextCursor};
  }
  clear(){this.pages.clear();}
}
