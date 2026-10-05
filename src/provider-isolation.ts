import type {Provider} from './providers';
export function isolateProvider(raw:Provider,active:()=>boolean):Provider{
 const request=raw.request.bind(raw),on=raw.on?.bind(raw),remove=raw.removeListener?.bind(raw);
 const wrappers=new Map<string,Map<(...args:any[])=>void,(...args:any[])=>void>>();
 const protectedEvents=new Set(['accountsChanged','chainChanged','connect','disconnect']);
 const facadeRequest:Provider['request']=async args=>{
  if(active()){
   if(args.method==='eth_accounts')return [];
   if(args.method==='wallet_getPermissions')return [];
   if(['eth_requestAccounts','wallet_requestPermissions','wallet_switchEthereumChain','eth_signTypedData_v4','personal_sign','eth_sendTransaction'].includes(args.method))throw Object.assign(Error('Hyperclick 本地多签模式正在管理网页账户。请在 Hyperclick 中签署；如需直连原钱包，请刷新网页后重新选择连接入口。'),{code:4001});
  }
  return request(args);
 };
 const facadeOn=on?((event:string,fn:(...args:any[])=>void)=>{
  if(!protectedEvents.has(event))return on(event,fn);
  let map=wrappers.get(event);if(!map){map=new Map();wrappers.set(event,map);}
  let wrapped=map.get(fn);if(!wrapped){wrapped=(...args:any[])=>{if(!active())fn.apply(raw,args);};map.set(fn,wrapped);}
  return on(event,wrapped);
 }):undefined;
 const facadeRemove=remove?((event:string,fn:(...args:any[])=>void)=>remove(event,wrappers.get(event)?.get(fn)??fn)):undefined;
 const replacements:Record<string,Function>={request:facadeRequest};
 if(facadeOn)replacements.on=facadeOn;
 if(facadeRemove)replacements.removeListener=facadeRemove;
 const originals=new Map<string,PropertyDescriptor|undefined>();
 let step='request';const changed:string[]=[];
 try{
  for(const key of Object.keys(replacements)){
   step=key;const d=Object.getOwnPropertyDescriptor(raw,key);originals.set(key,d);
   if(d&&!d.configurable&&(!('value' in d)||!d.writable))throw Error('接口属性不可替换');
   if(!d&&!Object.isExtensible(raw))throw Error('钱包接口不可扩展');
  }
  for(const [key,value] of Object.entries(replacements)){
   step=key;const d=originals.get(key);
   changed.push(key);
   Object.defineProperty(raw,key,d&&!d.configurable?{value}:{value,writable:true,configurable:true,enumerable:d?.enumerable??true});
   if(Object.getOwnPropertyDescriptor(raw,key)?.value!==value)throw Error('钱包拒绝安装隔离接口');
  }
 }catch(e){
  const rollback:string[]=[];
  for(const key of changed.reverse())try{
   const d=originals.get(key);if(d)Object.defineProperty(raw,key,d);else if(!Reflect.deleteProperty(raw,key))throw Error('delete failed');
  }catch{rollback.push(key);}
  throw Error(`账户隔离失败 [${step}]: ${(e as Error).message}。${rollback.length?'恢复失败，请刷新网页。':'未发起钱包连接。'}请勿在此模式中切换成员`);
 }

 return {request,on,removeListener:remove};
}
