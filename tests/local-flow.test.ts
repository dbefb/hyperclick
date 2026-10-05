import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {toHex} from 'viem';
import {XProvider} from '../src/x-provider';
import {address,originalTyped,signatureParts,signatureHex,recover,outerTyped} from '../src/core';
test('mixed OKX and OneKey providers sign members and OKX leader, submit once with M preserved',async()=>{
 const keys=[101n,102n,103n,104n].map(n=>privateKeyToAccount(toHex(n,{size:32})));
 let current=keys[0];const m=address(current.address);let listener:any;let wire:any;let sent=0;
 const wallet={request:async({method,params=[]}:any)=>{
  if(['eth_accounts','eth_requestAccounts'].includes(method))return [current.address];
  if(method==='eth_chainId')return '0x3e7';
  if(method==='eth_signTypedData_v4')return current.signTypedData(JSON.parse(params[1]));
  throw Error(method);
 }};
 const oneKey={request:async({method,params=[]}:any)=>{
  if(['eth_accounts','eth_requestAccounts'].includes(method))return [keys[2].address];
  if(method==='eth_chainId')return '0x3e7';
  if(method==='eth_signTypedData_v4')return keys[2].signTypedData(JSON.parse(params[1]));
  throw Error(method);
 }};
 const x=new XProvider('Mainnet',async()=>({provider:wallet,brand:'okx'}));await x.request({method:'eth_requestAccounts'});
 const conf={authorizedUsers:keys.slice(1,3).map(k=>address(k.address)),threshold:2};const store:any={};const noop=()=>{};
 (globalThis as any).chrome={storage:{session:{get:async()=>store,set:async(v:any)=>Object.assign(store,v)},local:{get:async()=>({}),set:async()=>{}}},runtime:{id:'local-test',getURL:(p:string)=>'chrome-extension://local-test/'+p,onMessage:{addListener:(f:any)=>listener=f},onConnect:{addListener:noop}},
  tabs:{get:async()=>({windowId:1}),update:async()=>({}),sendMessage:async(_tab:any,msg:any)=>{
   if(msg.type==='GUARD')return {result:x.guard(msg.requestId,msg.m)};
   if(msg.type==='LOCAL_SIGN')return {result:{signature:await x.sign(msg.requestId,msg.expected,msg.brand==='onekey'?oneKey:wallet,msg.typed,msg.multi)}};
   if(msg.type==='RESULT')x.release(msg.requestId);
   return {};
  },onRemoved:{addListener:noop}},windows:{create:async()=>({id:1}),update:async()=>({})},action:{onClicked:{addListener:noop}},alarms:{create:noop,onAlarm:{addListener:noop}}};
 const old=globalThis.fetch;
 globalThis.fetch=async(url:any,init:any)=>{
  assert(String(url).startsWith('https://api.hyperliquid.xyz/'));
  if(String(url).endsWith('/info'))return new Response(JSON.stringify(conf));
  sent++;wire=JSON.parse(init.body);return new Response(JSON.stringify({status:'ok',response:{type:'default'}}));
 };
 try{
  await import('../src/background');
  const panel={id:'local-test',url:'chrome-extension://local-test/panel.html'};
  const page={id:'local-test',url:'https://app.hyperliquid.xyz/trade',tab:{id:7},frameId:0,documentId:'local-doc'};
  const message=(data:any,s:any=panel)=>new Promise<any>(resolve=>listener(data,s,resolve));
  const action:any={type:'approveAgent',hyperliquidChain:'Mainnet',signatureChainId:'0x3e7',agentAddress:address(keys[3].address),nonce:Date.now()};
  const signature=await x.request({method:'eth_signTypedData_v4',params:[m,JSON.stringify(originalTyped(action))]});
  const body={action,nonce:action.nonce,signature:signatureParts(signature)};assert(x.bind('local-request',body));
  const capture=await message({type:'CAPTURE',requestId:'local-request',url:'https://api.hyperliquid.xyz/exchange',body},page);
  assert.equal(capture.result.kind,'accepted');
  const rpc=(type:string,extra:any={})=>message({type,jobId:capture.result.id,...extra});
  assert.equal((await rpc('GET')).result.localMode,true);
  await rpc('LEADER',{address:keys[1].address});
  for(const key of keys.slice(1,3)){
   current=key;const r=await rpc('LOCAL_SIGN',{brand:key===keys[2]?'onekey':'okx',address:key.address,phase:'inner'});assert.ok(r.result,r.error);
   const accepted=await rpc('SIGNATURE',{address:key.address,signature:r.result.signature});assert.ok(accepted.result,accepted.error);
   assert.deepEqual(await x.request({method:'eth_accounts'}),[m]);
  }
  await rpc('PREPARE');current=keys[1];
  const r=await rpc('LOCAL_SIGN',{brand:'okx',address:current.address,phase:'outer'});assert.ok(r.result,r.error);
  assert.equal((await rpc('SUBMIT',{signature:r.result.signature})).result.status,'success');assert.equal(sent,1);
  assert.equal(wire.action.payload.multiSigUser,m);
  assert.equal(await recover(outerTyped(wire.action,wire.nonce),signatureHex(wire.signature)),address(keys[1].address));
  assert.deepEqual(await x.request({method:'eth_accounts'}),[m]);
  assert((await rpc('SUBMIT',{signature:r.result.signature})).error);assert.equal(sent,1);
 }finally{globalThis.fetch=old;}
});
