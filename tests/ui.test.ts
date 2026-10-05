import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {privateKeyToAccount} from 'viem/accounts';
import {toHex} from 'viem';
import {Proposal,address,originalTyped,outerTyped,recover,signatureParts} from '../src/core';

test('three steps gate approval, collect A/B signatures, and submit with the chosen leader',async()=>{
  const win=new Window({url:'https://test.example/panel.html?job=test'});
  for(const [key,value] of Object.entries({window:win,document:win.document,location:win.location}))Object.defineProperty(globalThis,key,{value,configurable:true});
  win.document.body.innerHTML='<div id="app"></div>';
  const {start}=await import('../src/ui');
  const keys=[21n,22n,23n,24n,25n].map(n=>privateKeyToAccount(toHex(n,{size:32})));
  const nonce=Date.now();const action:any={type:'approveAgent',hyperliquidChain:'Testnet',signatureChainId:'0x3e6',agentAddress:address(keys[4].address),nonce};
  const capture={action,nonce,signature:signatureParts(await keys[3].signTypedData(originalTyped(action) as any))};
  const p=new Proposal(capture,address(keys[3].address),{authorizedUsers:keys.slice(0,3).map(k=>address(k.address)),threshold:2});
  let status='collecting',submits=0;const job=()=>({capture,m:p.m,config:p.config,leader:p.leader,signatures:p.signatures,status});
  const rpc=async(type:string,arg:any={})=>{
    switch(type){
      case 'LIST':return {jobs:[],settings:{}};
      case 'GET':return job();
      case 'WALLET':throw Error('must not access original webpage wallet');
      case 'LEADER':p.setLeader(arg.address);return job();
      case 'INNER':return p.inner();
      case 'SIGNATURE':await p.add(arg.address,arg.signature);return job();
      case 'PREPARE':status='outer';return outerTyped(p.multi(),nonce);
      case 'SUBMIT':assert.equal(await recover(outerTyped(p.multi(),nonce),arg.signature),p.leader);status='success';submits++;return job();
      default:throw Error(type);
    }
  };
  await start(rpc,async(expected)=>({label:'test',sign:async data=>keys.find(k=>address(k.address)===expected)!.signTypedData(data as any)}));
  const query=(s:string)=>win.document.querySelector(s) as any;
  const wait=async(pred:()=>boolean)=>{for(let i=0;i<100;i++){if(pred())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI did not settle');};
  assert.match(query('h1').textContent,/确认本次签署内容/);
  assert.equal(win.document.body.textContent!.includes('WalletConnect'),false);
  assert.equal(query('#leader'),null);
  assert.equal(query('#next-review').disabled,true);
  query('#ack').checked=true;query('#ack').dispatchEvent(new win.Event('change'));
  query('#next-review').click();
  assert.match(query('h1').textContent,/提交人/);
  assert.equal(query('#next-leader').disabled,true);
  query('#leader').value=p.config.authorizedUsers[0];query('#leader').dispatchEvent(new win.Event('change'));
  await wait(()=>!query('#leader').disabled);
  query('#next-leader').click();
  assert.match(query('h1').textContent,/逐个收集/);
  assert.equal(query('#submit'),null);
  for(let i=0;i<2;i++){
    const a=p.config.authorizedUsers[i];const s=query(`[data-route="${a}"]`);s.value=i?'plugin:okx':'plugin:onekey';s.dispatchEvent(new win.Event('change'));
    query(`[data-sign="${a}"]`).click();await wait(()=>Object.keys(p.signatures).length===i+1&&!query('.busy-status'));
  }
  assert.match(query('h1').textContent,/成员签名已齐/);
  assert.match(query('.flow-final').textContent,/提交人最终确认/);
  assert.equal(query('#submit').disabled,false);query('#submit').click();
  await wait(()=>!!query('.success'));assert.equal(submits,1);assert.match(query('.success').textContent,/已接收本次操作/);
  await win.happyDOM.close();
});
