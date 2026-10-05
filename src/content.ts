import {masterNotice} from './master-notice';
let localConnected=false;
document.addEventListener('click',event=>{
 if(!event.isTrusted)return;
 const path=event.composedPath();
 const entry=path.some(node=>node instanceof Element&&node.matches('[data-x-connect-wallet]'));
 const button=path.find(node=>node instanceof Element&&node.matches('button,[role="button"]')) as Element|undefined;
 const label=button?.textContent?.trim()??(path.find(n=>n instanceof Element&&n.textContent?.trim().startsWith('Hyperclick')) as Element|undefined)?.textContent?.trim()??'';
 const operation=localConnected&&/^(Establish Connection|Enable Trading|Confirm|Send|Transfer|Withdraw|Deposit|Stake|Unstake|Delegate|Undelegate|Buy|Sell|Long|Short|Close|Cancel|Save|Approve|Submit|Claim|Create|确认|发送|划转|提现|存入|质押|解除|买入|卖出|撤单|保存|提交|领取)/i.test(label);
 if(!entry&&!label.includes('Hyperclick')&&!operation)return;
 void chrome.runtime.sendMessage({type:'OPEN_SIDE'}).then(r=>{
   if(!r?.error)return;
   let notice=document.getElementById('x-side-open-notice');
   if(!notice){notice=document.createElement('div');notice.id='x-side-open-notice';notice.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647;padding:14px;background:#102322;color:#e4fcf6;border:1px solid #39d5c1;max-width:320px';document.documentElement.append(notice);}
   notice.textContent='Hyperclick 侧栏未能自动打开，请点击浏览器工具栏的 Hyperclick 图标。';
 }).catch(()=>{});
},true);
const post=(data:unknown)=>window.postMessage({xconnect:'isolated',data},location.origin);
const calls=new Map<string,{resolve:(v:any)=>void;timer:ReturnType<typeof setTimeout>}>();
window.addEventListener('message',async event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.xconnect!=='page')return;
  const d=event.data.data;
  if(d?.type==='CONNECTION_STATE_RESULT'&&d.result){
    localConnected=!!d.result.m;
    if(document.getElementById('hyperclick-master-notice')){
      if(d.result.mainWallet?.status==='ready'&&d.result.mainWallet.retryRequired)masterNotice(document,'已切回多签账户 M，请回原网页重新点击刚才的操作。',true);
      else if(!d.result.m)document.getElementById('hyperclick-master-notice')?.remove();
    }
  }
  if(d?.type==='MASTER_REQUIRED'&&typeof d.state?.message==='string')masterNotice(document,'Hyperclick：'+d.state.message);
  if(d?.type==='MASTER_READY')document.getElementById('hyperclick-master-notice')?.remove();
  if(d?.type==='CHOOSER_READY')void chrome.runtime.sendMessage({type:'CONNECTION_READY'}).catch(()=>{});
  if(d?.type==='CAPTURE' && typeof d.requestId==='string'){
    try{
      const response=await chrome.runtime.sendMessage(d);
      const r=response?.error?{kind:'error',error:response.error}:response?.result;
      if(r?.kind!=='accepted')post({type:'RESULT',requestId:d.requestId,result:r??{kind:'error',error:'扩展未响应'}});
    }catch(e){post({type:'RESULT',requestId:d.requestId,result:{kind:'error',error:(e as Error).message}});}
  }
  if((d?.type==='CONNECTION_STATE_RESULT'||d?.type==='CONNECTION_CHOOSE_RESULT'||d?.type==='GUARD_RESULT'||d?.type==='HEALTH_RESULT'||d?.type==='LOCAL_SIGN_RESULT'||d?.type==='LOCAL_STATE_RESULT')){
    const c=calls.get(d.id); if(c){clearTimeout(c.timer);calls.delete(d.id);c.resolve(d);}
  }
});
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(m.type==='RESULT'){post(m);reply({ok:true});return;}
  if(m.type==='CONNECTION_STATE'||m.type==='CONNECTION_CHOOSE'||m.type==='HEALTH'||m.type==='GUARD'||m.type==='LOCAL_SIGN'||m.type==='LOCAL_STATE'){
    const id=crypto.randomUUID();
    calls.set(id,{resolve:reply,timer:setTimeout(()=>{calls.delete(id);reply({error:'钱包请求超时'});},m.type==='LOCAL_SIGN'?300000:m.type==='HEALTH'?2000:5000)});
    post({...m,id});return true;
  }
});

void chrome.runtime.sendMessage({type:'CONNECTION_READY'}).catch(()=>{});
