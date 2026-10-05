import {HYPERCLICK_ICON_SVG} from './brand';
import {XProvider} from './x-provider';
import type {Provider,Brand} from './providers';
export function installXProvider(win:Window,discover:()=>{provider:Provider;brand:Brand}[]){
 let pending:{id:string;resolve:(p:{provider:Provider;brand:Brand})=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}|undefined;
 const choose=()=>new Promise<{provider:Provider;brand:Brand}>((resolve,reject)=>{
  const id=crypto.randomUUID();
  const timer=setTimeout(()=>{if(pending?.id===id){pending=undefined;reject(Error('钱包选择已超时，请重新连接 Hyperclick'));}},300000);
  pending={id,resolve,reject,timer};
  win.postMessage({xconnect:'page',data:{type:'CHOOSER_READY'}},win.location.origin);
 });
 win.addEventListener('message',async event=>{
  if(event.source!==win||event.origin!==win.location.origin||event.data?.xconnect!=='isolated')return;
  const d=event.data.data;
  if(d?.type!=='CONNECTION_STATE'&&d?.type!=='CONNECTION_CHOOSE')return;
  const reply=(result?:unknown,error?:string)=>win.postMessage({xconnect:'page',data:{type:d.type+'_RESULT',id:d.id,result,error}},win.location.origin);
  try{
   if(d.type==='CONNECTION_STATE'){const mainWallet=provider.selectedAddress?await provider.mainWalletState():undefined;reply({choiceId:pending?.id,m:provider.selectedAddress,connecting:provider.managesWebpage()&&!provider.selectedAddress,mainWallet});return;}
   if(!pending||d.choiceId!==pending.id)throw Error('此连接请求已失效，请在网页重新选择 Hyperclick');
   if(d.brand==='cancel'){const p=pending;pending=undefined;clearTimeout(p.timer);p.reject(Object.assign(Error('用户取消连接'),{code:4001}));reply({cancelled:true});return;}
   if(d.brand!=='okx'&&d.brand!=='onekey')throw Error('未知钱包入口');
   const selected=discover().find(p=>p.brand===d.brand);
   if(!selected)throw Error('未检测到所选钱包，请安装并允许访问 Hyperliquid 后刷新');
   const p=pending;pending=undefined;clearTimeout(p.timer);p.resolve(selected);reply({connecting:true});
  }catch(e){reply(undefined,(e as Error).message);}
 });
 const provider=new XProvider(win.location.hostname==='app.hyperliquid-testnet.xyz'?'Testnet':'Mainnet',choose);
 provider.on('masterRequired',state=>win.postMessage({xconnect:'page',data:{type:'MASTER_REQUIRED',state}},win.location.origin));
 provider.on('masterReady',()=>win.postMessage({xconnect:'page',data:{type:'MASTER_READY'}},win.location.origin));
 const detail=Object.freeze({info:Object.freeze({uuid:crypto.randomUUID(),name:'Hyperclick',rdns:'local.xconnect.wallet',icon:'data:image/svg+xml,'+encodeURIComponent(HYPERCLICK_ICON_SVG)}),provider});
 const announce=()=>win.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail}));
 win.addEventListener('eip6963:requestProvider',announce);announce();
 return provider;
}
