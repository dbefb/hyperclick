import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {toHex} from 'viem';
import {XProvider} from '../src/x-provider';
import {ACTIONS,canonicalAction} from '../src/actions';
import {address,originalCaptureTyped,signatureParts,signatureHex,recover,outerTyped,validateCapture} from '../src/core';
import {actionExamples,dest} from './fixtures/actions';
test('transfer, staking, vault, account settings and order requests traverse wallet, background and real-response bridge',async()=>{
 const keys=[201n,202n,203n].map(n=>privateKeyToAccount(toHex(n,{size:32})));let current=keys[0];
 const wallet={request:async({method,params=[]}:any)=>{if(['eth_accounts','eth_requestAccounts'].includes(method))return [current.address];if(method==='eth_chainId')return '0x3e7';if(method==='eth_signTypedData_v4')return current.signTypedData(JSON.parse(params[1]));throw Error(method);}};
 const x=new XProvider('Mainnet',async()=>({brand:'okx',provider:wallet}));await x.request({method:'eth_requestAccounts'});
 const m=address(keys[0].address),conf={authorizedUsers:keys.slice(1).map(k=>address(k.address)),threshold:2};let listener:any,wire:any,result:any,nextResponse:any;const noop=()=>{},store:any={};let sends=0;
 (globalThis as any).chrome={storage:{session:{get:async()=>store,set:async(v:any)=>Object.assign(store,v)}},runtime:{id:'flow-test',getURL:(s:string)=>'chrome-extension://flow-test/'+s,onMessage:{addListener:(fn:any)=>listener=fn},onConnect:{addListener:noop}},tabs:{sendMessage:async(_id:any,msg:any)=>{
  if(msg.type==='GUARD')return {result:x.guard(msg.requestId,msg.m)};
  if(msg.type==='LOCAL_SIGN')return {result:{signature:await x.sign(msg.requestId,msg.expected,wallet,msg.typed,msg.multi,msg.leader)}};
  if(msg.type==='RESULT'){result=msg.result;x.release(msg.requestId);}return {};
 },onRemoved:{addListener:noop}},windows:{create:async()=>({})},action:{onClicked:{addListener:noop}},alarms:{create:noop,onAlarm:{addListener:noop}}};
 const old=fetch;globalThis.fetch=async(url:any,init:any)=>{if(String(url).endsWith('/info'))return new Response(JSON.stringify(JSON.parse(init.body).type==='userRole'?{role:'agent',data:{user:m}}:conf));sends++;wire=JSON.parse(init.body);return new Response(JSON.stringify(nextResponse));};
 try{
  await import('../src/background');const panel={id:'flow-test',url:'chrome-extension://flow-test/panel.html'},page={id:'flow-test',url:'https://app.hyperliquid.xyz/trade',tab:{id:4},frameId:0};
  const message=(data:any,s:any=panel)=>new Promise<any>(r=>listener(data,s,r));
  for(const type of ['usdSend','spotSend','withdraw3','cWithdraw','tokenDelegate','vaultTransfer','userSetAbstraction','convertToMultiSigUser','order','cancel']){
   current=keys[0];const nonce=Date.now(),fields=(actionExamples(nonce) as any)[type],user=!!ACTIONS[type].primary;
   const action:any={type,...(user?{hyperliquidChain:'Mainnet',signatureChainId:'0x3e7'}:{}),...fields,...(user&&!fields.time?{nonce}:{})};
   const c:any={action,nonce,network:'Mainnet',signature:{r:'0x1',s:'0x1',v:27},...(ACTIONS[type].vault?{vaultAddress:dest}:{}),...(ACTIONS[type].expiry?{expiresAfter:nonce+120000}:{})};
   const isAgent=type==='cancel';
   const sig=isAgent?await privateKeyToAccount(toHex(204n,{size:32})).signTypedData(originalCaptureTyped(c) as any):await x.request({method:'eth_signTypedData_v4',params:[m,JSON.stringify(originalCaptureTyped(c))]});c.signature=signatureParts(sig);
   const {network,...body}=c;const captured=validateCapture(body,'https://api.hyperliquid.xyz/exchange');const requestId=crypto.randomUUID();assert(isAgent?await x.bindAgent(requestId,captured,async()=>({role:'agent',data:{user:m}})):x.bind(requestId,captured));
   if(isAgent)assert.match((await message({type:'CAPTURE',requestId:'wrong-agent',url:'https://api.hyperliquid.xyz/exchange',body,account:dest},page)).error,/不属于/);
   const accepted=await message({type:'CAPTURE',requestId,account:m,url:'https://api.hyperliquid.xyz/exchange',body},page);assert.ok(accepted.result,accepted.error);
   const rpc=(type:string,extra:any={})=>message({type,jobId:accepted.result.id,...extra});
   assert.ok((await rpc('LEADER',{address:keys[1].address})).result);
   for(const k of keys.slice(1)){current=k;const s=await rpc('LOCAL_SIGN',{brand:'okx',address:k.address,phase:'inner'});assert.ok(s.result,s.error);assert.ok((await rpc('SIGNATURE',{address:k.address,signature:s.result.signature})).result);}
   await rpc('PREPARE');current=keys[1];const s=await rpc('LOCAL_SIGN',{brand:'okx',address:current.address,phase:'outer'});assert.ok(s.result,s.error);
   nextResponse=type==='order'?{status:'ok',response:{type:'order',data:{statuses:[{error:'Order must have minimum value of $10.'}]}}}:type==='cancel'?{status:'ok',response:{type:'cancel',data:{statuses:['success']}}}:{status:'ok',response:{type:'default'}};
   const done=await rpc('SUBMIT',{signature:s.result.signature});assert.ok(done.result,done.error);assert.equal(done.result.status,type==='order'?'failed':'success');assert.deepEqual(result.body,nextResponse);
   assert.equal(wire.action.payload.multiSigUser,m);assert.deepEqual(wire.action.payload.action,canonicalAction(action));assert.equal(wire.vaultAddress,c.vaultAddress);assert.equal(wire.expiresAfter,c.expiresAfter);
   assert.equal(await recover(outerTyped(wire.action,nonce,captured),signatureHex(wire.signature)),address(keys[1].address));assert.deepEqual(await x.request({method:'eth_accounts'}),[m]);
  }
  assert.equal(sends,10);
 }finally{globalThis.fetch=old;}
});
