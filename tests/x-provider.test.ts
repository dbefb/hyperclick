import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {toHex} from 'viem';
import {XProvider} from '../src/x-provider';
import {address,originalTyped,signatureParts,Proposal,outerTyped,recover} from '../src/core';

test('X provider keeps M while raw wallet changes M → A → B → leader; genuine signatures and no native event suppression',async()=>{
 const keys=[71n,72n,73n,74n].map(n=>privateKeyToAccount(toHex(n,{size:32})));
 let current=keys[0];let rawListeners=0;let calls:string[]=[];
 const raw={request:async({method,params=[]}:any)=>{calls.push(method);if(method==='eth_accounts'||method==='eth_requestAccounts')return [current.address];if(method==='eth_chainId')return '0x3e7';if(method==='eth_signTypedData_v4')return current.signTypedData(JSON.parse(params[1]));throw Error(method);},on:()=>{rawListeners++;}};
 const x=new XProvider('Mainnet',async()=>({provider:raw,brand:'okx'}));const events:any[]=[];x.on('accountsChanged',a=>events.push(a));
 const m=address(keys[0].address);assert.deepEqual(await x.request({method:'eth_accounts'}),[]);
 assert.deepEqual(await x.request({method:'eth_requestAccounts'}),[m]);
 const action:any={type:'approveAgent',hyperliquidChain:'Mainnet',signatureChainId:'0x3e7',agentAddress:address(keys[3].address),nonce:Date.now()};
 const original=await x.request({method:'eth_signTypedData_v4',params:[m,JSON.stringify(originalTyped(action))]});
 const capture={action,nonce:action.nonce,signature:signatureParts(original)};
 assert.equal(x.bind('req',capture),true);assert.equal(x.bind('other',capture),false);
 const p=new Proposal(capture,m,{authorizedUsers:keys.slice(1,3).map(k=>address(k.address)),threshold:2});p.setLeader(address(keys[1].address));
 for(const key of keys.slice(1,3)){
  current=key;
  assert.deepEqual(await x.request({method:'eth_accounts'}),[m]);
  assert.equal(x.guard('req',m).broken,false);
  const sig=await x.sign('req',key.address,raw,p.inner());await p.add(address(key.address),sig);
 }
 current=keys[1];const outer=outerTyped(p.multi(),action.nonce);const sig=await x.sign('req',current.address,raw,outer,p.multi());
 assert.equal(await recover(outer,sig),address(current.address));
 assert.deepEqual(events,[[m]]);assert.equal(rawListeners,0);
 assert(!calls.includes('eth_sendTransaction'));x.release('req');assert.equal(x.guard('req',m).broken,true);
});

test('X refuses arbitrary methods, wrong M, unbound captures, altered agents and signatures after disconnect',async()=>{
 const k=privateKeyToAccount(toHex(81n,{size:32})),other=privateKeyToAccount(toHex(82n,{size:32}));
 let current=k;const raw={request:async({method,params=[]}:any)=>{if(method==='eth_accounts'||method==='eth_requestAccounts')return [current.address];if(method==='eth_chainId')return '0x3e7';return current.signTypedData(JSON.parse(params[1]));}};
 const x=new XProvider('Mainnet',async()=>({provider:raw,brand:'okx'}));await x.request({method:'eth_requestAccounts'});
 await assert.rejects(x.request({method:'eth_sendTransaction'}),/不支持/);
 const action:any={type:'approveAgent',hyperliquidChain:'Mainnet',signatureChainId:'0x3e7',agentAddress:address(other.address),nonce:Date.now()};
 await assert.rejects(x.request({method:'eth_signTypedData_v4',params:[other.address,originalTyped(action)]}),/不是/);
 const outside=await k.signTypedData(originalTyped(action) as any);assert.equal(x.bind('fake',{action,nonce:action.nonce,signature:signatureParts(outside)}),false);
 const signature=await x.request({method:'eth_signTypedData_v4',params:[k.address,originalTyped(action)]});
 const capture={action,nonce:action.nonce,signature:signatureParts(signature)};x.bind('req',capture);
 const p=new Proposal(capture,address(k.address),{authorizedUsers:[address(other.address)],threshold:1});p.setLeader(address(other.address));
 const altered=p.inner();altered.message.agentAddress=k.address;
 await assert.rejects(x.sign('req',other.address,raw,altered),/不匹配/);
 await assert.rejects(x.sign('req',other.address,raw,p.inner()),/不是指定/);
 x.disconnect();assert.equal(x.guard('req',k.address).broken,true);current=other;
 await assert.rejects(x.sign('req',other.address,raw,p.inner()),/已断开|已失效/);
});

test('approved frontend agent requests bind to M and reject another accounts agent',async()=>{
 const keys=[301n,302n,303n,304n,305n].map(n=>privateKeyToAccount(toHex(n,{size:32}))); 
 const {originalCaptureTyped}=await import('../src/core');
 const raw={request:async({method}:any)=>method==='eth_chainId'?'0x3e7':[keys[3].address]};
 const x=new XProvider('Mainnet',async()=>({provider:raw,brand:'okx'}));await x.request({method:'eth_requestAccounts'});
 const capture:any={network:'Mainnet',action:{type:'cancel',cancels:[{a:0,o:1}]},nonce:Date.now(),signature:{r:'0x1',s:'0x1',v:27}};
 capture.signature=signatureParts(await keys[4].signTypedData(originalCaptureTyped(capture) as any));
 assert.equal(await x.bindAgent('wrong-agent',capture,async()=>({role:'agent',data:{user:keys[0].address}})),false);
 assert.equal(await x.bindAgent('bound-agent',capture,async signer=>{assert.equal(signer,address(keys[4].address));return {role:'agent',data:{user:keys[3].address}};}),true);
 assert.equal(x.guard('bound-agent',address(keys[3].address)).broken,false);
 assert.deepEqual(await x.request({method:'eth_accounts'}),[address(keys[3].address)]);
});

test('after leader signing, the next M request explains the switch and never asks A to sign as M',async()=>{
 const mKey=privateKeyToAccount(toHex(401n,{size:32})),aKey=privateKeyToAccount(toHex(402n,{size:32}));
 for(const brand of ['okx','onekey'] as const){
  let current=mKey,locked=false,signs=0;const messages:any[]=[];
  const raw={request:async({method,params=[]}:any)=>{if(locked)throw Error('locked');if(method==='eth_accounts'||method==='eth_requestAccounts')return [current.address];if(method==='eth_chainId')return '0x3e7';if(method==='eth_signTypedData_v4'){signs++;return current.signTypedData(JSON.parse(params[1]));}throw Error(method);}};
  const x=new XProvider('Mainnet',async()=>({provider:raw,brand}));await x.request({method:'eth_requestAccounts'});x.on('masterRequired',s=>messages.push(s));
  current=aKey;const action:any={type:'usdSend',hyperliquidChain:'Mainnet',signatureChainId:'0x3e7',destination:address(aKey.address),amount:'1',time:Date.now()};
  const state=await x.mainWalletState();assert.equal(state.status,'switch');assert.equal(state.brand,brand);assert.equal(state.current,address(aKey.address));
  await assert.rejects(x.request({method:'eth_signTypedData_v4',params:[mKey.address,originalTyped(action)]}),/切回多签账户 M/);
  assert.equal(signs,0);assert.equal(messages.length,1);assert.equal(messages[0].m,address(mKey.address));assert.equal((await x.mainWalletState()).retryRequired,true);
  assert.deepEqual(await x.request({method:'eth_accounts'}),[address(mKey.address)]);
  current=mKey;assert.equal((await x.mainWalletState()).status,'ready');
  const sig=await x.request({method:'eth_signTypedData_v4',params:[mKey.address,originalTyped(action)]});assert.equal(await recover(originalTyped(action),sig),address(mKey.address));assert.equal(signs,1);assert.equal((await x.mainWalletState()).retryRequired,false);
  locked=true;assert.equal((await x.mainWalletState()).status,'unavailable');
 }
});
