import {privateKeyToAccount} from 'viem/accounts';
import {toHex} from 'viem';
import {Proposal,address,originalTyped,outerTyped,recover,signatureParts, type Capture} from './core';
import {start} from './ui';
const accounts=[1n,2n,3n,4n,5n].map(n=>privateKeyToAccount(toHex(n,{size:32})));
const nonce=Date.now();
const action:Capture['action']={type:'approveAgent',hyperliquidChain:'Testnet',signatureChainId:'0x3e6',agentAddress:address(accounts[4].address),nonce};
const c:Capture={action,nonce,signature:signatureParts(await accounts[3].signTypedData(originalTyped(action) as any))};
const p=new Proposal(c,address(accounts[3].address),{authorizedUsers:accounts.slice(0,3).map(a=>address(a.address)),threshold:2});
let status='collecting';
const job=()=>({id:'demo',capture:c,m:p.m,config:p.config,leader:p.leader,signatures:p.signatures,status});
const rpc=async(type:string,arg:any={})=>{
  if(type==='LIST')return {jobs:[]};
  if(type==='GET')return job();
  if(type==='LEADER'){p.setLeader(arg.address);return job();}
  if(type==='INNER')return p.inner();
  if(type==='SIGNATURE'){await p.add(arg.address,arg.signature);return job();}
  if(type==='PREPARE'){status='outer';return outerTyped(p.multi(),nonce);}
  if(type==='SUBMIT'){if(await recover(outerTyped(p.multi(),nonce),arg.signature)!==p.leader)throw Error('提交人不匹配');status='success';return job();}
  if(type==='CANCEL'){status='cancelled';return job();}
  if(type==='WALLET')return [{id:'demo-okx',name:'OKX（模拟）'},{id:'demo-onekey',name:'OneKey（模拟）'}];
    throw Error('未知演示操作');
};
await start(rpc,async(expected)=>({label:'模拟钱包',sign:async data=>{
  const wallet=accounts.find(a=>address(a.address)===expected)!;return wallet.signTypedData(data as any);
}}),true);
