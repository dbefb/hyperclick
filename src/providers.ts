import {isolateProvider} from './provider-isolation';
export type Brand='onekey'|'okx';
export type Provider={request:(args:{method:string;params?:unknown[]})=>Promise<any>;on?:(event:string,fn:(value:any)=>void)=>void;removeListener?:(event:string,fn:(value:any)=>void)=>void};
export function providerRegistry(win:Window,isXActive?:()=>boolean){
  const entries=new Map<Provider,Brand>();
  const isolated=new Map<Provider,Provider>();const failures=new Map<Provider,string>();
  function record(provider:Provider,brand:Brand){
    entries.set(provider,brand);
    if(isXActive&&!isolated.has(provider)&&!failures.has(provider)){
      try{isolated.set(provider,isolateProvider(provider,isXActive));}catch(e){failures.set(provider,`${brand==='okx'?'OKX':'OneKey'}：${(e as Error).message}`);}
    }
  }
  const announced=(event:Event)=>{
    const d=(event as CustomEvent).detail;
    const brand=d?.info?.rdns==='so.onekey.app.wallet'?'onekey':['com.okex.wallet','com.okx.wallet'].includes(d?.info?.rdns)?'okx':undefined;
    if(brand&&d?.provider?.request)record(d.provider,brand);
  };
  win.addEventListener('eip6963:announceProvider',announced,{capture:true});
  function discover(){
    win.dispatchEvent(new Event('eip6963:requestProvider'));
    const w=win as any;
    for(const [brand,p] of [['onekey',w.$onekey?.ethereum],['okx',w.okxwallet?.ethereum??w.okxwallet]] as const)if(p?.request)record(p,brand);
    return [...entries].map(([provider,brand])=>({provider:isolated.get(provider)??provider,brand}));
  }
  return {discover,isolationErrors:()=>[...new Set(failures.values())]};
}
export async function readAccounts(provider:Provider){
  let timer:ReturnType<typeof setTimeout>;
  try{return await Promise.race([provider.request({method:'eth_accounts'}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('账户检查超时')),2000);})]);}
  finally{clearTimeout(timer!);}
}
