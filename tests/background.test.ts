import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {toHex} from 'viem';
import {address,originalTyped,signatureParts,signatureHex,recover,outerTyped, type Capture} from '../src/core';

test('background enforces origin, signature workflow, config checks and one submission',async()=>{
  const a=[11n,12n,13n,14n,15n].map(n=>privateKeyToAccount(toHex(n,{size:32})));
  const conf={authorizedUsers:a.slice(0,3).map(w=>address(w.address)),threshold:2};
  let current=structuredClone(conf);let listener:any;let wire:any;let sent=0;let uncertain=false;const notifications:any[]=[];
  let guardBroken=false;let blocked:string[]=[];let pluginTab=200;let pluginURL='';
  const storage:any={};const noop=()=>{};
  (globalThis as any).chrome={
    storage:{session:{get:async()=>storage,set:async(v:any)=>Object.assign(storage,v)},local:{get:async()=>({}),set:async()=>{}}},
    runtime:{id:'unit-test',getURL:(s:string)=>'chrome-extension://unit-test/'+s,onMessage:{addListener:(f:any)=>listener=f},onConnect:{addListener:noop}},
    tabs:{sendMessage:async(_id:any,m:any)=>{notifications.push(m);return m.type==='GUARD'?{result:{broken:guardBroken,blocked,unknown:[]}}:{};},onRemoved:{addListener:noop}},
    windows:{create:async(v:any)=>{pluginURL=v.url;return {id:1,tabs:[{id:++pluginTab}]};}},action:{onClicked:{addListener:noop}},alarms:{create:noop,onAlarm:{addListener:noop}}
  };
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async(url:any,init:any)=>{
    const body=JSON.parse(init.body);
    if(String(url).endsWith('/info'))return new Response(JSON.stringify(current));
    sent++;wire=body;if(uncertain)throw Error('network lost');
    return new Response(JSON.stringify({status:'ok',response:{type:'default'}}));
  };
  try{
    await import('../src/background');
    const page={id:'unit-test',url:'https://app.hyperliquid-testnet.xyz/trade',tab:{id:42},frameId:0,documentId:'doc-1'};
    const panel={id:'unit-test',url:'chrome-extension://unit-test/panel.html?job=x'};
    const message=(m:any,s:any=panel)=>new Promise<any>(resolve=>listener(m,s,resolve));
    async function create(){
      const nonce=Date.now();const action:Capture['action']={type:'approveAgent',hyperliquidChain:'Testnet',signatureChainId:'0x3e6',agentAddress:address(a[4].address),nonce};
      const body={action,nonce,signature:signatureParts(await a[3].signTypedData(originalTyped(action) as any))};
      const result=await message({type:'CAPTURE',url:'https://api-ui.hyperliquid-testnet.xyz/exchange',requestId:crypto.randomUUID(),body},page);
      assert.equal(result.result.kind,'accepted');return result.result.id;
    }
    let opened=0;
    (globalThis as any).chrome.sidePanel={open:(_args:any)=>{opened++;return Promise.resolve();},setOptions:async()=>{}};
    const opening=message({type:'OPEN_SIDE'},page);
    assert.equal(opened,1,'side panel opening is synchronous before ready awaits');
    assert.equal((await opening).result,true);
    assert.match((await message({type:'OPEN_SIDE'},{...page,url:'https://evil.example/'})).error,/来源/);
    assert.equal(opened,1);
    const tabs=(globalThis as any).chrome.tabs,send=tabs.sendMessage;
    tabs.get=async()=>({url:page.url});
    tabs.sendMessage=async(id:any,msg:any)=>msg.type==='CONNECTION_STATE'?{result:{m:address(a[3].address)}}:send(id,msg);
    assert.deepEqual((await message({type:'ACCOUNT_CONFIG',tabId:42,account:a[3].address})).result.config,conf);
    assert.match((await message({type:'ACCOUNT_CONFIG',tabId:42,account:a[0].address})).error,/账户已变化/);
    tabs.sendMessage=send;
    const id=await create();
    const rpc=(type:string,payload:any={})=>message({type,jobId:id,...payload});
    assert.match((await message({type:'LEADER',jobId:id,address:a[0].address},page)).error,/仅扩展/);
    assert.equal((await rpc('LEADER',{address:a[0].address})).result.leader,address(a[0].address));
    const inner=(await rpc('INNER')).result;
    for(let i=0;i<2;i++)assert.ok((await rpc('SIGNATURE',{address:a[i].address,signature:await a[i].signTypedData(inner)})).result);
    const outer=(await rpc('PREPARE')).result;
    const signature=await a[0].signTypedData(outer);
    current={...conf,threshold:3};assert.match((await rpc('SUBMIT',{signature})).error,/阈值发生变化/);assert.equal(sent,0);
    current=structuredClone(conf);
    const results=await Promise.all([rpc('SUBMIT',{signature}),rpc('SUBMIT',{signature})]);
    assert.equal(results.filter(r=>r.result?.status==='success').length,1);assert.equal(sent,1);
    assert.equal(await recover(outerTyped(wire.action,wire.nonce),signatureHex(wire.signature)),address(a[0].address));
    assert.equal(wire.action.payload.action.agentAddress,address(a[4].address));assert.equal(wire.action.payload.multiSigUser,address(a[3].address));
    assert.equal(notifications.at(-1).result.body.status,'ok');
    const id2=await create();const call=(type:string,payload:any={})=>message({type,jobId:id2,...payload});
    await call('LEADER',{address:a[0].address});const i2=(await call('INNER')).result;
    for(let i=0;i<2;i++)await call('SIGNATURE',{address:a[i].address,signature:await a[i].signTypedData(i2)});
    const o2=(await call('PREPARE')).result;uncertain=true;
    assert.equal((await call('SUBMIT',{signature:await a[0].signTypedData(o2)})).result.status,'unknown');
    assert.ok((await call('SUBMIT',{signature})).error);assert.equal(sent,2);
    assert.equal(notifications.at(-1).result.kind,'error');

  }finally{globalThis.fetch=oldFetch;}
});
