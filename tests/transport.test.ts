import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installFetchAdapter} from '../src/transport';
import {validateCapture} from '../src/core';
const url='https://api.hyperliquid-testnet.xyz/exchange';
test('original single-sig approval never reaches network when coordinated; real response is forwarded',async()=>{
  let nativeCalls=0;let captured:any;
  const host={fetch:async()=>{nativeCalls++;return new Response('native');}};
  installFetchAdapter(host as any,async(u,b)=>{captured={u,b};return {kind:'response',body:{status:'ok',response:{type:'default'}}};});
  const response=await host.fetch(url,{method:'POST',body:JSON.stringify({action:{type:'approveAgent'}})} as any);
  assert.equal(nativeCalls,0);assert.equal(captured.u,url);assert.deepEqual(await response.json(),{status:'ok',response:{type:'default'}});
});
test('unknown action types and oversized requests cannot escape the active coordinator',async()=>{
 let calls=0;const host={fetch:async(..._args:any[])=>{calls++;return new Response('native');}};
 installFetchAdapter(host as any,async(u,b)=>{validateCapture(b,u);throw Error('must fail validation');},()=>true);
 const unknown=await host.fetch(url,{method:'POST',body:JSON.stringify({action:{type:'futureProtocolAction'}})});
 assert.equal((await unknown.json()).status,'err');
 const large=await host.fetch(url,{method:'POST',body:'x'.repeat(1048577)});
 assert.equal((await large.json()).status,'err');assert.equal(calls,0);
});
test('ordinary and unrelated traffic passes untouched, including non-multisig approval',async()=>{
  let nativeCalls=0,handled=0;const host={fetch:async(..._args:any[])=>{nativeCalls++;return new Response('native');}};
  installFetchAdapter(host as any,async()=>{handled++;return {kind:'passthrough'};});
  for(const [u,type] of [[url,'order'],['https://other.example/exchange','approveAgent'],[url,'approveAgent']])await host.fetch(u,{method:'POST',body:JSON.stringify({action:{type}})});
  assert.equal(nativeCalls,3);assert.equal(handled,2);
});
test('coordinator failure/cancel never falls back to original submission or fake success',async()=>{
  let nativeCalls=0;const host={fetch:async(..._args:any[])=>{nativeCalls++;return new Response('native');}};
  installFetchAdapter(host as any,async()=>{throw Error('cancelled');});
  const r=await host.fetch(url,{method:'POST',body:JSON.stringify({action:{type:'approveAgent'}})});
  const body=await r.json();assert.equal(body.status,'err');assert.match(body.response,/cancelled/);assert.equal(nativeCalls,0);
});
test('app 15s abort does not prematurely release an interactive authorization',async()=>{
  const controller=new AbortController();const host={fetch:async(..._args:any[])=>{throw Error('must not send');}};
  installFetchAdapter(host as any,async()=>{controller.abort();return {kind:'response',body:{status:'err',response:'user cancelled'}};});
  const r=await host.fetch(url,{method:'POST',body:JSON.stringify({action:{type:'approveAgent'}}),signal:controller.signal});
  assert.equal((await r.json()).response,'user cancelled');
});

test('official app api-ui approvals are captured on both networks, including Request input',async()=>{
  for(const endpoint of ['https://api-ui.hyperliquid.xyz/exchange','https://api-ui.hyperliquid-testnet.xyz/exchange']){
    let captured='';const host={fetch:async(..._args:any[])=>{throw Error('original approval leaked to network');}};
    installFetchAdapter(host as any,async(u)=>{captured=u;return {kind:'response',body:{status:'ok'}};});
    const r=await host.fetch(new Request(endpoint,{method:'POST',body:JSON.stringify({action:{type:'approveAgent'}})}));
    assert.equal(captured,endpoint);assert.equal((await r.json()).status,'ok');
  }
});
test('lookalike hosts and extra URL paths remain outside the interception allowlist',async()=>{
  const host={fetch:async(..._args:any[])=>new Response('untouched')};
  installFetchAdapter(host as any,async()=>{throw Error('must not intercept');});
  for(const u of ['https://api-ui.hyperliquid.xyz.evil.example/exchange','https://api-ui.hyperliquid.xyz/exchange/extra']){
    assert.equal(await (await host.fetch(u,{method:'POST',body:JSON.stringify({action:{type:'approveAgent'}})})).text(),'untouched');
  }
});

test('identical in-flight approval retries share one coordinator and receive the same real response',async()=>{
 let calls=0;let release!:(v:any)=>void;
 const target={fetch:async()=>{throw Error('original approval must not escape');}} as any;
 installFetchAdapter(target,async()=>{calls++;return new Promise(resolve=>{release=resolve;});});
 const body=JSON.stringify({action:{type:'approveAgent'}});
 const a=target.fetch('https://api.hyperliquid.xyz/exchange',{method:'POST',body});
 const b=target.fetch('https://api.hyperliquid.xyz/exchange',{method:'POST',body});
 await Promise.resolve();assert.equal(calls,1);
 release({kind:'response',body:{status:'ok',response:{type:'default'}}});
 assert.deepEqual(await (await a).json(),await (await b).json());
});
