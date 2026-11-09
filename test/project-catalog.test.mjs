import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectThreadPager} from '../lib/codex-project-catalog.js';
test('project pagination includes legacy directory threads, excludes other assignments, sorts and replays pages',async()=>{
  const project={id:'p',roots:[{path:'D:/project'}]},calls=[];
  const rows=Array.from({length:250},(_,i)=>({id:'thread-'+i,projectId:i%2?'p':null,cwd:'D:/project',updatedAt:1000-i,archived:false}));
  rows.push({id:'other-project',projectId:'other',cwd:'D:/project',updatedAt:2000},{id:'other-root',projectId:null,cwd:'D:/different',updatedAt:2000},{id:'archived',projectId:null,cwd:'D:/project',archived:true,updatedAt:3000});
  const runtime={async call(method,params){calls.push({method,params});const filtered=rows.filter(row=>row.projectId===params.projectId&&(!params.cwd||params.cwd.includes(row.cwd))&&!!row.archived===params.archived).sort((a,b)=>b.updatedAt-a.updatedAt);const start=Number(params.cursor||0);return{data:filtered.slice(start,start+100),nextCursor:start+100<filtered.length?String(start+100):null};}};
  const pager=new ProjectThreadPager(),params={limit:100,archived:false,sortKey:'updated_at',sortDirection:'desc'};
  const first=await pager.page(runtime,params,project);assert.equal(first.data.length,100);
  const second=await pager.page(runtime,params,project,first.nextCursor);const replay=await pager.page(runtime,params,project,first.nextCursor);assert.deepEqual(replay,second);
  const third=await pager.page(runtime,params,project,second.nextCursor);assert.equal(third.nextCursor,null);
  const all=[...first.data,...second.data,...third.data];assert.equal(all.length,250);assert.equal(new Set(all.map(row=>row.id)).size,250);assert.deepEqual(all.map(row=>row.id),Array.from({length:250},(_,i)=>'thread-'+i));
  assert.equal(all[0].displayMembership,'directory');assert.equal(all[0].projectId,null);
  assert.ok(calls.some(call=>call.params.projectId===null&&call.params.cwd[0]==='D:/project'));
  assert.ok(calls.every(call=>call.method==='thread/list'));
  await assert.rejects(pager.page(runtime,{...params,archived:true},project,first.nextCursor),/过期|条件/);
  const archived=await pager.page(runtime,{...params,archived:true},project);assert.deepEqual(archived.data.map(row=>row.id),['archived']);
});
