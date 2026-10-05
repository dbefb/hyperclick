import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {installXProvider} from '../src/x-provider-ui';
import {startHome} from '../src/home';
test('X connection chooses wallet through sidebar messages without creating a webpage drawer',async()=>{
 const w=new Window({url:'https://app.hyperliquid.xyz/trade'});
 Object.defineProperty(globalThis,'CustomEvent',{value:w.CustomEvent,configurable:true});
 const messages:any[]=[];(w as any).postMessage=(m:any)=>messages.push(m);
 const m='0x'+'11'.repeat(20);let calls=0;
 const x=installXProvider(w as any,()=>[{brand:'okx',provider:{request:async({method})=>{if(method==='eth_chainId')return '0x3e7';calls++;return [m];}}}]);
 const connection=x.request({method:'eth_requestAccounts'});
 assert.equal(w.document.body.children.length,0);
 assert(messages.some(m=>m.data?.type==='CHOOSER_READY'));
 function send(data:any){w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data:{xconnect:'isolated',data}}));}
 send({type:'CONNECTION_STATE',id:'state'});
 const choiceId=messages.at(-1).data.result.choiceId;
 send({type:'CONNECTION_CHOOSE',id:'stale',choiceId:'old',brand:'okx'});
 assert.match(messages.at(-1).data.error,/失效/);assert.equal(calls,0);
 send({type:'CONNECTION_CHOOSE',id:'pick',choiceId,brand:'okx'});
 assert.deepEqual(await connection,[m]);assert.equal(calls,1);
 send({type:'CONNECTION_STATE',id:'done'});
 for(let i=0;i<20&&messages.at(-1).data.id!=='done';i++)await new Promise(r=>setTimeout(r,1));
 assert.equal(messages.at(-1).data.result.m,m);assert.equal(messages.at(-1).data.result.choiceId,undefined);
 await w.happyDOM.abort();
});
test('sidebar home displays choice then connected home in one surface',async()=>{
 const w=new Window({url:'https://test.example/panel.html?side=1&tab=7'});
 for(const [k,v] of Object.entries({window:w,document:w.document,location:w.location,sessionStorage:w.sessionStorage}))Object.defineProperty(globalThis,k,{value:v,configurable:true});
 w.document.body.innerHTML='<div id="app"></div>';
 let connected=false;const selected:any[]=[];
 const rpc=async(t:string,p:any)=>{if(t==='FLOW')return connected?{m:'0x'+'11'.repeat(20)}:{choiceId:'new'};if(t==='ACCOUNT_CONFIG')return {config:{authorizedUsers:['0x'+'22'.repeat(20)],threshold:1}};if(t==='CHOOSE'){selected.push(p);connected=true;return {connecting:true};}};
 await startHome(rpc,7);
 try{
  assert.equal((w.document.querySelector('#choices') as any).hidden,false);
  assert.equal(w.document.querySelectorAll('.wallet-option').length,2);
  assert.equal(w.document.querySelector('[data-brand="okx"]')!.textContent!.trim().includes('OKX Wallet'),true);
  assert.equal(w.document.querySelector('#app')!.textContent!.includes('WalletConnect'),false);
  (w.document.querySelector('[data-brand="onekey"]') as any).click();
  for(let i=0;i<30&&w.document.querySelector('#title')!.textContent!=='多签账户';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(selected[0].brand,'onekey');assert.equal(selected[0].choiceId,'new');
  assert.equal(w.document.querySelector('#title')!.textContent,'多签账户');
  assert.equal((w.document.querySelector('#choices') as any).hidden,true);
 }finally{w.dispatchEvent(new w.Event('pagehide'));await w.happyDOM.abort();}
});

test('home lists members once and moves the current wallet highlight without duplicate addresses',async()=>{
 const w=new Window({url:'https://test.example/panel.html?side=1&tab=7'});
 for(const [k,v] of Object.entries({window:w,document:w.document,location:w.location,sessionStorage:w.sessionStorage}))Object.defineProperty(globalThis,k,{value:v,configurable:true});
 w.document.body.innerHTML='<div id="app"></div>';
 const m='0x'+'11'.repeat(20),a='0x'+'22'.repeat(20),b='0x'+'33'.repeat(20);
 let state:any={m,mainWallet:{brand:'okx',current:a,status:'switch'}},config:any={authorizedUsers:[a,b],threshold:2},fail=false;
 await startHome(async(t)=>{if(t==='FLOW')return state;if(fail)throw Error('offline');return {m,config};},7);
 const flush=async()=>{await new Promise(r=>setTimeout(r,15));};
 const refresh=async()=>{(w.document.querySelector('#check-master') as any).click();await flush();};
 try{
  await flush();assert.equal(w.document.querySelectorAll('.account-row').length,3);
  assert.equal(w.document.querySelectorAll('.current').length,1);assert.equal((w.document.querySelector('.current') as any).dataset.address,a);
  assert.equal(w.document.querySelectorAll('code[title="'+m+'"]').length,1);assert.match(w.document.querySelector('#account-help')!.textContent!,/切回/);
  state.mainWallet={brand:'okx',current:m,status:'ready',retryRequired:true};await refresh();
  assert.equal((w.document.querySelector('.current') as any).dataset.address,m);assert.match(w.document.querySelector('#account-help')!.textContent!,/重新点击/);
  state.mainWallet.current=null;await refresh();assert.equal(w.document.querySelectorAll('.current').length,0);
  config=null;await refresh();assert.equal(w.document.querySelector('#title')!.textContent,'普通账户');assert.equal(w.document.querySelectorAll('.account-row').length,1);
  fail=true;await refresh();assert.equal(w.document.querySelector('#title')!.textContent,'账户类型待确认');assert.match(w.document.querySelector('#status')!.textContent!,/暂时无法/);
 }finally{w.dispatchEvent(new w.Event('pagehide'));await w.happyDOM.abort();}
});

test('webpage switch notice is visible, updates in place and treats wallet text as plain text',async()=>{
 const {masterNotice}=await import('../src/master-notice');const w=new Window();
 masterNotice(w.document as any,'请切回 M <script>test</script>');
 assert.equal(w.document.querySelectorAll('#hyperclick-master-notice').length,1);assert.equal(w.document.querySelector('script'),null);
 masterNotice(w.document as any,'已切回 M，请重新点击原网页操作。',true);
 assert.equal(w.document.querySelectorAll('#hyperclick-master-notice').length,1);assert.match(w.document.querySelector('[role="alert"]')!.textContent!,/重新点击/);
 (w.document.querySelector('#hyperclick-master-notice button') as any).click();assert.equal(w.document.querySelector('#hyperclick-master-notice'),null);await w.happyDOM.abort();
});
