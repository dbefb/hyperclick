import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installWebSocketAdapter} from '../src/transport';
import {validateCapture} from '../src/core';
class Socket extends EventTarget{static OPEN=1;readyState=1;url='wss://api.hyperliquid.xyz/ws';sent:any[]=[];send(v:any){this.sent.push(v);}}
const action=(id:number)=>JSON.stringify({method:'post',id,request:{type:'action',payload:{action:{type:'order'},nonce:1}}});
test('websocket coordinates once, forwards genuine response by request id, and preserves subscriptions',async()=>{
 let calls=0,release:any;const undo=installWebSocketAdapter(Socket as any,async()=>{calls++;return new Promise(r=>release=r);});const s=new Socket(),messages:any[]=[];s.addEventListener('message',(e:any)=>messages.push(JSON.parse(e.data)));
 try{s.send('ping');s.send(JSON.stringify({method:'subscribe',subscription:{type:'allMids'}}));s.send(action(10));s.send(action(11));await Promise.resolve();assert.equal(calls,1);assert.equal(s.sent.length,2);
 const body={status:'ok',response:{type:'order',data:{statuses:[{resting:{oid:55}}]}}};release({kind:'response',body});await new Promise(r=>setTimeout(r,0));assert.deepEqual(messages.map(m=>m.data.id),[10,11]);assert.deepEqual(messages[0].data.response.payload,body);assert.equal(s.sent.length,2);
 }finally{undo();}
});
test('unknown WebSocket actions fail before native submission in managed mode',async()=>{
 const s=new Socket(),messages:any[]=[];s.addEventListener('message',(e:any)=>messages.push(JSON.parse(e.data)));
 const undo=installWebSocketAdapter(Socket as any,async(u,b)=>{validateCapture(b,u);throw Error('must fail validation');},()=>true);
 try{s.send(action(3).replace('order','futureProtocolAction'));await new Promise(r=>setTimeout(r,0));assert.equal(s.sent.length,0);assert.equal(messages[0].data.response.payload.status,'err');}finally{undo();}
});
test('websocket passes non-multisig actions and never sends originals after a coordination failure',async()=>{
 const s=new Socket(),messages:any[]=[];s.addEventListener('message',(e:any)=>messages.push(JSON.parse(e.data)));let undo=installWebSocketAdapter(Socket as any,async()=>({kind:'passthrough'}));s.send(action(1));await new Promise(r=>setTimeout(r,0));assert.equal(s.sent.length,1);undo();
 undo=installWebSocketAdapter(Socket as any,async()=>{throw Error('用户取消');});s.send(action(2));await new Promise(r=>setTimeout(r,0));assert.equal(s.sent.length,1);assert.equal(messages[0].data.response.payload.status,'err');undo();
});
