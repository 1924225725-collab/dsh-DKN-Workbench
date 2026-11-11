import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as React from 'react';

const source=await readFile(new URL('../src/codex-client.js',import.meta.url),'utf8');
const isolationSource=source.slice(source.indexOf('    const DKN_CODEX_PROVIDER='),source.indexOf('    function applyCodex('));

test('model isolation declares its service and restores directories on disposal',async()=>{
  let install,cleanup,subscriptions=0;
  const api=vm.runInNewContext(isolationSource+'\n({applyModelIsolation})',{
    codexApi:async()=>({mapped:true}),
  });
  // Cordis forbids even optional reads of services absent from inject.
  api.applyModelIsolation(new Proxy({inject(deps,fn){assert.equal(deps.join(','),'modelDirectories');install=fn;}},{get(target,key){if(key==='modelDirectories')throw Error('without inject');return target[key];}}));
  const state={groups:[{id:'dkn-codex-agent',models:[{id:'model-a'}]},{id:'other',models:[]}],failures:[{id:'other'}],current:{provider:'dkn-codex-agent',model:'model-a'}};
  const inner={store:{getSnapshot:()=>state,subscribe(){subscriptions++;return()=>subscriptions--; }},load:async()=>{},select:()=>{},resetConnected:()=>{}};
  const original=()=>inner,resolver={directoryFor:original};
  install({modelDirectories:resolver,effect(fn){cleanup=fn();}});
  const wrapper=resolver.directoryFor('session');
  await Promise.resolve();
  assert.equal(wrapper.store.getSnapshot().groups.length,1);
  assert.equal(wrapper.store.getSnapshot().groups[0].id,'dkn-codex-agent');
  assert.equal(subscriptions,1);
  cleanup();
  assert.equal(resolver.directoryFor,original);
  assert.equal(subscriptions,0);
});

let cordis;
try {cordis=await import('../research/dsh-full-rc1/vendor/cordis/lib/index.js');}
catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}

test('built client activates and unloads under the real DSH Cordis framework',{skip:!cordis},async()=>{
  let api;
  vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{
    window:{__ModuleLoader__:{load({factory}){api=factory(()=>React);}}},
    console,TextEncoder,TextDecoder,URL,URLSearchParams,setTimeout,clearTimeout,
  });
  const ctx=new cordis.Context();
  const noop=()=>{};
  const original=()=>{};
  const resolver={directoryFor:original};
  for(const [key,value] of Object.entries({
    slots:{inject:(_name,fn)=>fn(),register:()=>noop},
    locale:{register:()=>noop,bind:()=>key=>key},
    configForms:{get:()=>({}),whileServed:(_names,fn)=>fn()},
    layout:{panelInfo:{getSnapshot:()=>({activePanelId:null})},selectPanel:noop},
    uiWorkspace:{},contextMenus:{register:()=>noop},modelDirectories:resolver,
  }))ctx.provide(key,value);
  const fiber=await ctx.plugin(api);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(resolver.directoryFor.__dknIsolation,true);
  await fiber.dispose();
  assert.equal(resolver.directoryFor,original);
});
