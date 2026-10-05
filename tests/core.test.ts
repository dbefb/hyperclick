import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {privateKeyToAccount} from 'viem/accounts';
import {toHex} from 'viem';
import {API,Proposal,canonicalApproveAgent,actionHash,address,digest,envelope,fresh,innerTyped,originalTyped,outerTyped,recover,signatureHex,signatureParts,validateCapture,validateConfig} from '../src/core';
const f=JSON.parse(readFileSync(new URL('./fixtures/official-sdk.json',import.meta.url),'utf8'));
const keys=[1n,2n,3n,4n,5n].map(n=>privateKeyToAccount(toHex(n,{size:32})));
function capture(){return {...structuredClone(f.capture),action:{...f.capture.action,nonce:Date.now()},nonce:Date.now()};}
test('matches independent official Python SDK typed data, inner signatures, msgpack hash and outer signature',async()=>{
  assert.equal(digest(originalTyped(f.capture.action)),f.originalDigest);
  assert.equal(await recover(originalTyped(f.capture.action),signatureHex(f.capture.signature)),f.m);
  const inner=innerTyped(f.capture.action,f.m,f.leader);assert.equal(digest(inner),f.innerDigest);
  for(let i=0;i<2;i++)assert.deepEqual(signatureParts(await keys[i].signTypedData(inner as any)),f.signatures[i]);
  // Legacy fixture verifies only the Python low-level hash primitive, not server canonicalization.
  const multi=f.multi;
  const {type,...rest}=multi;assert.equal(actionHash(rest,f.capture.nonce),f.actionHash);
  assert.equal(digest(outerTyped(multi,f.capture.nonce)),f.outerDigest);
  assert.deepEqual(signatureParts(await keys[0].signTypedData(outerTyped(multi,f.capture.nonce) as any)),f.outerSignature);
});
test('accepts unnamed original approval and refuses other networks, extra fields, vaults and malformed actions',()=>{
  assert.deepEqual(validateCapture(f.capture,API.Testnet+'/exchange',f.capture.nonce),f.capture);
  assert.throws(()=>validateCapture(f.capture,API.Mainnet+'/exchange',f.capture.nonce));
  for(const a of [{type:'withdraw3'},{nonce:1},{destination:f.m}])assert.throws(()=>validateCapture({...f.capture,action:{...f.capture.action,...a}},API.Testnet+'/exchange',f.capture.nonce));
  assert.throws(()=>validateCapture({...f.capture,vaultAddress:f.m},API.Testnet+'/exchange',f.capture.nonce));
});
test('quorum rejects wrong signer and altered action; duplicate signatures never increase quorum',async()=>{
  const c=capture();const p=new Proposal(c,f.m,f.config);p.setLeader(f.leader);
  const sig=await keys[0].signTypedData(p.inner() as any);
  await assert.rejects(p.add(f.config.authorizedUsers[1],sig));
  await p.add(f.leader,sig);await p.add(f.leader,sig);assert.equal(Object.keys(p.signatures).length,1);assert.throws(()=>p.multi());
  const changed=innerTyped({...c.action,agentAddress:keys[2].address},f.m,f.leader);
  await assert.rejects(p.add(f.config.authorizedUsers[1],await keys[1].signTypedData(changed as any)));
  await p.add(f.config.authorizedUsers[1],await keys[1].signTypedData(p.inner() as any));assert.equal(p.multi().signatures.length,2);
});
test('leader change invalidates collected signatures and non-members cannot lead',async()=>{
  const p=new Proposal(capture(),f.m,f.config);p.setLeader(f.leader);await p.add(f.leader,await keys[0].signTypedData(p.inner() as any));
  p.setLeader(f.config.authorizedUsers[1]);assert.equal(Object.keys(p.signatures).length,0);
  assert.throws(()=>p.setLeader(f.m));
});
test('threshold and nonce validation fail closed',()=>{
  assert.equal(validateConfig(null),null);
  for(const c of [{authorizedUsers:[],threshold:1},{authorizedUsers:[f.m,f.m],threshold:2},{authorizedUsers:[f.m],threshold:0},{authorizedUsers:[f.m],threshold:2}])assert.throws(()=>validateConfig(c));
  assert.throws(()=>fresh(Date.now()-21*60_000));assert.throws(()=>fresh(Date.now()+120_000));
  assert.throws(()=>address('not-address'));
});

const canonical=JSON.parse(readFileSync(new URL('./fixtures/canonical-sdk.json',import.meta.url),'utf8'));
test('matches independent high-level SDK approveAgent wire bytes and outer signatures on both networks',async()=>{
  for(const v of canonical.cases){
    const expected=v.wire.action;
    const input={...f.capture.action,hyperliquidChain:v.isTestnet?'Testnet':'Mainnet',signatureChainId:v.isTestnet?'0x3e6':'0x3e7',agentAddress:keys[4].address};
    const inner=innerTyped(input,f.m,f.leader);
    assert.equal(digest(inner),v.innerDigest);
    const sigs=await Promise.all(keys.slice(0,2).map(async k=>signatureParts(await k.signTypedData(inner as any))));
    const multi=envelope(input,f.m,f.leader,sigs);
    // JSON equality checks key insertion order, unlike deepEqual.
    assert.equal(JSON.stringify(multi),JSON.stringify(expected));
    const {type,...rest}=multi;assert.equal(actionHash(rest,v.wire.nonce),v.actionHash);
    const outer=outerTyped(multi,v.wire.nonce);assert.equal(digest(outer),v.outerDigest);
    assert.equal(signatureHex(signatureParts(await keys[0].signTypedData(outer as any))),signatureHex(v.wire.signature));
    assert.equal(input.agentAddress,keys[4].address); // capture is not mutated
  }
});
test('different webpage key order, mixed-case agent and nullish name yield identical canonical hash',()=>{
  const a=canonical.cases[1].wire.action.payload.action;
  const variants=[{...f.capture.action,agentAddress:keys[4].address},{nonce:a.nonce,agentName:null,agentAddress:keys[4].address,type:a.type,signatureChainId:a.signatureChainId,hyperliquidChain:a.hyperliquidChain}];
  for(const input of variants){assert.equal(JSON.stringify(canonicalApproveAgent(input)),JSON.stringify(a));}
  const fixed=envelope(f.capture.action,f.m,f.leader,f.signatures);const {type,...rest}=fixed;
  assert.notEqual(actionHash(rest,f.capture.nonce),f.actionHash,'old raw-page serialization must not survive');
});
test('leader A may construct an envelope with threshold signatures from B and C; M remains fixed',async()=>{
  const p=new Proposal(capture(),f.m,f.config);p.setLeader(f.leader);
  for(const k of keys.slice(1,3))await p.add(address(k.address),await k.signTypedData(p.inner() as any));
  const multi=p.multi();assert.equal(multi.payload.multiSigUser,f.m);assert.equal(multi.payload.outerSigner,f.leader);
  assert.equal(await recover(outerTyped(multi,p.capture.nonce),await keys[0].signTypedData(outerTyped(multi,p.capture.nonce) as any)),f.leader);
});
