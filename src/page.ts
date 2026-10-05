import {installXProvider} from './x-provider-ui';
import {readAccounts} from './providers';
import {validateCapture,API,networkOf} from './core';
import {installFetchAdapter,installWebSocketAdapter,type AdapterResult} from './transport';
import {providerRegistry} from './providers';
import {AccountGuard} from './account-guard';
let xProvider:ReturnType<typeof installXProvider>|undefined;
const registry=providerRegistry(window,()=>!!xProvider?.managesWebpage());
xProvider=installXProvider(window,()=>{const providers=registry.discover();if(registry.isolationErrors().length)throw Error(registry.isolationErrors().join('；'));return providers;});
registry.discover();
const localRequests=new Set<string>();
const guards=new Map<string,AccountGuard>();
const emit=(data:unknown)=>window.postMessage({xconnect:'page',data},location.origin);
let stage='等待多签操作';
const pending=new Map<string,(r:any)=>void>();
const coordinate=async(url:string,body:unknown):Promise<AdapterResult>=>{
  if(!xProvider?.selectedAddress)return {kind:'passthrough'};
  stage='正在查询多签配置';
  const requestId=crypto.randomUUID();
  try{
   const capture=validateCapture(body,url);
   const bound=xProvider!.bind(requestId,capture)||await xProvider!.bindAgent(requestId,capture,async signer=>{
    const response=await fetch(API[networkOf(capture)]+'/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'userRole',user:signer}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('无法确认交易代理所属账户');return response.json();
   });
   if(bound)localRequests.add(requestId);
  }catch(e){return {kind:'error',error:(e as Error).message};}
  return new Promise(resolve=>{
  const timeout=setTimeout(()=>{guards.get(requestId)?.close();guards.delete(requestId);pending.delete(requestId);xProvider!.release(requestId);localRequests.delete(requestId);resolve({kind:'error',error:'Hyperclick 协调窗口已超时，请重新发起操作'});},21*60_000);
  pending.set(requestId,r=>{stage=r.kind==='passthrough'?'链上查询未识别为多签，已交回原网页':r.kind==='error'?'操作流程失败，请查看网页错误提示':'操作请求已返回结果';clearTimeout(timeout);pending.delete(requestId);xProvider!.release(requestId);localRequests.delete(requestId);guards.get(requestId)?.close();guards.delete(requestId);resolve(r);});
  emit({type:'CAPTURE',requestId,url,body,account:localRequests.has(requestId)?xProvider!.selectedAddress:undefined});
  });
};
installFetchAdapter(window,coordinate,()=>!!xProvider?.selectedAddress);
installWebSocketAdapter(window.WebSocket,coordinate,()=>!!xProvider?.selectedAddress);
const installedFetch=window.fetch;
window.addEventListener('message',async event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.xconnect!=='isolated') return;
  const d=event.data.data;
  if(d?.type==='GUARD'){
    if(!pending.has(d.requestId)){emit({type:'GUARD_RESULT',id:d.id,error:'原网页请求已失效，请重新发起操作'});return;}
    if(localRequests.has(d.requestId)){emit({type:'GUARD_RESULT',id:d.id,result:{...xProvider!.guard(d.requestId,d.m),broken:xProvider!.guard(d.requestId,d.m).broken||registry.isolationErrors().length>0}});return;}
    let guard=guards.get(d.requestId);
    if(!guard&&/^0x[0-9a-f]{40}$/i.test(d.m)){guard=new AccountGuard(d.m,registry.discover);guards.set(d.requestId,guard);}
    emit({type:'GUARD_RESULT',id:d.id,result:guard?await guard.check():{broken:true,blocked:[],unknown:[]}});return;
  }
  if(d?.type==='LOCAL_STATE'){
    if(!pending.has(d.requestId)){emit({type:'LOCAL_STATE_RESULT',id:d.id,error:'提案已结束'});return;}
    const wallets=await Promise.all(registry.discover().map(async p=>{
      try{return {brand:p.brand,accounts:await readAccounts(p.provider)};}catch{return {brand:p.brand,accounts:[],error:'暂时无法读取钱包'};}
    }));
    emit({type:'LOCAL_STATE_RESULT',id:d.id,result:{wallets,m:xProvider!.selectedAddress,isolationErrors:registry.isolationErrors()}});return;
  }
  if(d?.type==='EXIT_X'){try{xProvider!.disconnect();location.reload();}catch(e){emit({type:'EXIT_X_RESULT',id:d.id,error:(e as Error).message});}return;}
  if(d?.type==='LOCAL_SIGN'){
    try{
      if(!pending.has(d.requestId)||!localRequests.has(d.requestId))throw Error('本次连接不是 Hyperclick 本地入口，请重新连接 Hyperclick');
      const target=registry.discover().find(p=>p.brand===d.brand);
      if(!target)throw Error('未检测到指定钱包插件，请检查网站访问权限');
      const signature=await xProvider!.sign(d.requestId,d.expected,target.provider,d.typed,d.multi,d.leader);
      emit({type:'LOCAL_SIGN_RESULT',id:d.id,result:{signature}});
    }catch(e){emit({type:'LOCAL_SIGN_RESULT',id:d.id,error:(e as Error).message});}
    return;
  }
  if(d?.type==='HEALTH'){emit({type:'HEALTH_RESULT',id:d.id,result:{version:'0.7.3',hooked:window.fetch===installedFetch,stage,pending:pending.size,xAccount:xProvider!.selectedAddress,localRequests:localRequests.size}});return;}
  if(d?.type==='RESULT') { pending.get(d.requestId)?.(d.result); return; }
});
