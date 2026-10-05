import { exchangeNetwork } from './endpoints';
export type AdapterResult = {kind:'passthrough'} | {kind:'response';body:unknown} | {kind:'error';error:string};
export function installFetchAdapter(target: {fetch:typeof fetch}, handler:(url:string,body:unknown)=>Promise<AdapterResult>,isManaged=()=>false) {
  const original=target.fetch.bind(target);
  const inflight=new Map<string,Promise<AdapterResult>>();
  target.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
    let url:string; let method:string; let text:string|undefined;
    try{
      url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
      if(!exchangeNetwork(url))return original(input,init);
      method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
      if(method!=='POST')return original(input,init);
      text=typeof init?.body==='string'?init.body:input instanceof Request?await input.clone().text():undefined;
      if(!text)return original(input,init);
      if(text.length>1_048_576){
        if(isManaged())return new Response(JSON.stringify({status:'err',response:'Hyperclick：请求过大，请拆分操作'}),{status:200,headers:{'Content-Type':'application/json'}});
        return original(input,init);
      }
    }catch{return original(input,init);}
    let body:any;try{body=JSON.parse(text);}catch{return original(input,init);}
    if(typeof body?.action?.type!=='string')return original(input,init);
    try{
      const key=url!+'\n'+text;
      let operation=inflight.get(key);
      if(!operation){operation=Promise.resolve().then(()=>handler(url!,body));inflight.set(key,operation);}
      let r:AdapterResult;
      try{r=await operation;}finally{if(inflight.get(key)===operation)inflight.delete(key);}
      if(r.kind==='passthrough')return original(input,init);
      return new Response(JSON.stringify(r.kind==='response'?r.body:{status:'err',response:'Hyperclick: '+r.error}),{status:200,headers:{'Content-Type':'application/json'}});
    }catch(e){return new Response(JSON.stringify({status:'err',response:'Hyperclick: '+(e as Error).message}),{status:200,headers:{'Content-Type':'application/json'}});}
  };
  return ()=>{target.fetch=original;};
}

export function installWebSocketAdapter(Socket:typeof WebSocket,handler:(url:string,body:unknown)=>Promise<AdapterResult>,isManaged=()=>false){
 const native=Socket.prototype.send;
 const pending=new WeakMap<WebSocket,Map<string,Promise<AdapterResult>>>();
 Socket.prototype.send=function(data:string|ArrayBufferLike|Blob|ArrayBufferView){
  const socket=this;
  if(socket.readyState!==Socket.OPEN||typeof data!=='string')return native.call(socket,data);
  const endpoints:Record<string,string>={
   'wss://api.hyperliquid.xyz/ws':'https://api.hyperliquid.xyz/exchange',
   'wss://api-ui.hyperliquid.xyz/ws':'https://api-ui.hyperliquid.xyz/exchange',
   'wss://api.hyperliquid-testnet.xyz/ws':'https://api.hyperliquid-testnet.xyz/exchange',
   'wss://api-ui.hyperliquid-testnet.xyz/ws':'https://api-ui.hyperliquid-testnet.xyz/exchange'
  };
  const url=endpoints[socket.url];if(!url)return native.call(socket,data);
  if(data.length>1_048_576){if(isManaged())throw Error('Hyperclick：请求过大，请拆分操作');return native.call(socket,data);}
  let msg:any;try{msg=JSON.parse(data);}catch{return native.call(socket,data);}
  if(msg.method!=='post'||!Number.isSafeInteger(msg.id)||msg.request?.type!=='action'||typeof msg.request?.payload?.action?.type!=='string')return native.call(socket,data);
  let requests=pending.get(socket);if(!requests){requests=new Map();pending.set(socket,requests);}
  const key=JSON.stringify(msg.request.payload);let result=requests.get(key);
  if(!result){result=Promise.resolve().then(()=>handler(url,msg.request.payload)).catch(e=>({kind:'error' as const,error:(e as Error).message}));requests.set(key,result);}
  const operation=result;
  void operation.then(r=>{
   if(requests!.get(key)===operation)requests!.delete(key);
   if(socket.readyState!==Socket.OPEN)return;
   if(r.kind==='passthrough'){native.call(socket,data);return;}
   const payload=r.kind==='response'?r.body:{status:'err',response:'Hyperclick: '+r.error};
   socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({channel:'post',data:{id:msg.id,response:{type:'action',payload}}}),origin:new URL(socket.url).origin}));
  });
 };
 return ()=>{Socket.prototype.send=native;};
}
