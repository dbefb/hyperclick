import { start } from './ui';
import {startHome} from './home';
import { connectWallet } from './wallets';
const jobId=new URLSearchParams(location.search).get('job');
const port=chrome.runtime.connect({name:'x-panel'});
setInterval(()=>{try{port.postMessage({ping:true});}catch{}},20_000);
const rpc=async(type:string,payload:Record<string,unknown>={})=>{
  const r=await chrome.runtime.sendMessage({type,jobId,...payload});
  if(r?.error)throw Error(r.error);return r.result;
};
const tabId=Number(new URLSearchParams(location.search).get('tab'));
let returningHome=false;
const routedRpc=async(type:string,payload:Record<string,unknown>={})=>{
 const result=await rpc(type,payload);
 if((type==='SUBMIT'||type==='GET')&&result?.status==='success'&&!returningHome){
  returningHome=true;
  sessionStorage.setItem('x-success-'+result.tabId,'true');
  setTimeout(()=>{void rpc('HOME',{tabId:result.tabId}).then(()=>location.replace('panel.html?side=1&tab='+result.tabId)).catch(()=>{});},500);
 }
 return result;
};
(jobId?start(routedRpc,connectWallet):tabId?startHome(rpc,tabId):start(rpc,connectWallet)).catch(e=>{document.getElementById('app')!.textContent=(e as Error).message;});
