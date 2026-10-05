import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {toHex} from 'viem';
import {signMultiSigL1,signMultiSigUserSigned,canonicalize} from '@nktkas/hyperliquid/signing';
import {ACTIONS,canonicalAction,validateAction,userMessage,userSigned,actionView} from '../src/actions';
import {API,address,Proposal,originalCaptureTyped,outerTyped,signatureParts,signatureHex,validateCapture,innerTyped,digest,actionHash} from '../src/core';
import {actionExamples,dest} from './fixtures/actions';
const keys=[51n,52n,53n].map(n=>privateKeyToAccount(toHex(n,{size:32})));
const m=address(keys[2].address),leader=address(keys[0].address);
test('all registered actions match SDK inner and outer signatures on both networks',async()=>{
 const now=Date.now(),examples=actionExamples(now);assert.deepEqual(Object.keys(ACTIONS).sort(),Object.keys(examples).sort());
 for(const network of ['Mainnet','Testnet'] as const)for(const [type,fields] of Object.entries(examples)){
  const spec=ACTIONS[type];const action:any=canonicalize(spec.schema,{type,...(spec.primary?{signatureChainId:network==='Mainnet'?'0x3e7':'0x3e6',hyperliquidChain:network}:{}),...fields,...(spec.primary&&!('time' in fields)?{nonce:now}:{})});
  const unsigned:any={action,nonce:now,...(!spec.primary?{network}:{}),signature:{r:'0x1',s:'0x1',v:27}};
  unsigned.signature=signatureParts(await keys[2].signTypedData(originalCaptureTyped(unsigned) as any));
  const capture=validateCapture(Object.fromEntries(Object.entries(unsigned).filter(([k])=>k!=='network')),API[network]+'/exchange');
  const p=new Proposal(capture,m,{authorizedUsers:keys.slice(0,2).map(k=>address(k.address)),threshold:2});p.setLeader(leader);
  for(const key of keys.slice(0,2))await p.add(address(key.address),await key.signTypedData(p.inner() as any));
  const canonical=canonicalAction(action);let reference:any;
  if(spec.primary){
   reference=await signMultiSigUserSigned({signers:keys.slice(0,2),multiSigUser:m,action:{...action,...userMessage(action)},payloadAction:canonical,types:{[spec.primary]:spec.fields}} as any);
  }else reference=await signMultiSigL1({signers:keys.slice(0,2),multiSigUser:m,signatureChainId:network==='Mainnet'?'0x3e7':'0x3e6',action:canonical,nonce:now,isTestnet:network==='Testnet'} as any);
  assert.equal(JSON.stringify(p.multi()),JSON.stringify(reference.action),type+' envelope '+network);
  assert.equal(signatureHex(signatureParts(await keys[0].signTypedData(outerTyped(p.multi(),now,capture) as any))),signatureHex(reference.signature),type+' outer '+network);
  assert.ok(actionView(action).title);
 }
});
test('vault context and expiration are bound in both signature layers',async()=>{
 const now=Date.now();const c:any={network:'Testnet',action:{type:'cancel',cancels:[{a:0,o:1}]},nonce:now,vaultAddress:dest,expiresAfter:now+120000,signature:{r:'0x1',s:'0x1',v:27}};
 const p=new Proposal(c,m,{authorizedUsers:keys.slice(0,2).map(k=>address(k.address)),threshold:2});p.setLeader(leader);
 for(const k of keys.slice(0,2))await p.add(address(k.address),await k.signTypedData(p.inner() as any));
 const ref=await signMultiSigL1({signers:keys.slice(0,2),multiSigUser:m,signatureChainId:'0x3e6',action:c.action,nonce:now,isTestnet:true,vaultAddress:dest,expiresAfter:c.expiresAfter} as any);
 assert.equal(JSON.stringify(p.multi()),JSON.stringify(ref.action));assert.equal(signatureHex(signatureParts(await keys[0].signTypedData(outerTyped(p.multi(),now,c) as any))),signatureHex(ref.signature));
 assert.notEqual(digest(p.inner()),digest(innerTyped(c.action,m,leader,{...c,vaultAddress:m})));
 assert.notEqual(digest(outerTyped(p.multi(),now,c)),digest(outerTyped(p.multi(),now,{...c,expiresAfter:now+110000})));
});
test('refuses unknown or altered fields and invalid multisig transitions; displays precise stake amount',()=>{
 const now=Date.now(),base={type:'tokenDelegate',hyperliquidChain:'Mainnet',signatureChainId:'0x3e7',validator:dest,wei:123456789,isUndelegate:false,nonce:now};
 for(const action of [{type:'unknown'}, {...base,extra:1},{...base,wei:9007199254740992},{type:'order',orders:[{a:0,b:true,p:'1',s:'1',r:false,t:{limit:{tif:'Gtc',evil:true}}}],grouping:'na'}])assert.throws(()=>validateAction(action));
 assert.match(actionView(base).rows.find(([k])=>k.startsWith('数量'))![1],/^1.23456789 HYPE$/);
 assert.throws(()=>validateAction({type:'convertToMultiSigUser',hyperliquidChain:'Mainnet',signatureChainId:'0x3e7',signers:JSON.stringify({authorizedUsers:[dest,dest],threshold:1}),nonce:now}));
 const changed={...base,isUndelegate:true};assert.notEqual(digest(innerTyped(base,m,leader)),digest(innerTyped(changed,m,leader)));
});
test('rejects inapplicable vault context and shows fees and TWAP fields without ambiguous labels',()=>{
 const now=Date.now(),body={action:{type:'vaultTransfer',vaultAddress:dest,isDeposit:true,usd:1000000},nonce:now,vaultAddress:dest,signature:{r:'0x1',s:'0x1',v:27}};
 assert.throws(()=>validateCapture(body,API.Mainnet+'/exchange'),/不支持金库/);
 const order={type:'order',...actionExamples(now).order,builder:{b:dest,f:10},grouping:{p:1000000}};
 const rows=actionView(order).rows;assert.match(rows.find(([k])=>k==='开发者手续费')![1],/手续费率：0.001%/);
 assert.match(rows.find(([k])=>k==='订单组合')![1],/优先费率：1%/);
 assert.match(actionView({type:'twapOrder',...actionExamples(now).twapOrder}).rows[0][1],/随机执行时间：是/);
});
