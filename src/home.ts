export async function startHome(rpc:(type:string,payload?:Record<string,unknown>)=>Promise<any>,tabId:number){
 const root=document.getElementById('app')!;
 root.innerHTML='<header><div class="brand"><img class="brand-mark" src="icons/hyperclick.svg" alt="" aria-hidden="true"><span>Hyperclick</span></div><span class="badge">v0.7.3</span></header><main><h1 id="title">连接多签账户</h1><p id="status" class="muted"></p><div id="choices" class="wallet-options"><button class="wallet-option" data-brand="onekey"><span class="wallet-icon onekey-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 7a6 6 0 0 0-6 6c0 2.2 1.2 4.1 3 5.1V25h6v-6.9a6 6 0 0 0-3-11.1Zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" fill="currentColor"/></svg></span><span>OneKey</span><span class="wallet-arrow" aria-hidden="true">›</span></button><button class="wallet-option" data-brand="okx"><span class="wallet-icon okx-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path fill="currentColor" d="M3 3h9v9H3zm17 0h9v9h-9zM12 12h8v8h-8zM3 20h9v9H3zm17 0h9v9h-9z"/></svg></span><span>OKX Wallet</span><span class="wallet-arrow" aria-hidden="true">›</span></button><button class="text-button" data-brand="cancel">取消连接</button></div><section id="account-roster" hidden aria-live="polite"><div id="account-list"></div><p id="account-help" class="muted"></p><button id="check-master" class="text-button">刷新账户状态</button></section><p id="error" class="inline-error" role="alert" hidden></p></main>';
 const title=root.querySelector('#title')!,status=root.querySelector('#status')!,choices=root.querySelector<HTMLElement>('#choices')!,error=root.querySelector<HTMLElement>('#error')!;
 let state:any,busy=false,stopped=false,polling=false;choices.hidden=true;
 const success=sessionStorage.getItem('x-success-'+tabId);
 const roster=root.querySelector<HTMLElement>('#account-roster')!;
 let account='',config:any=undefined,configError=false,loadedAt=0,loading=false;
 function connectionStatus(){
  roster.hidden=!state?.m||!!state.choiceId;if(roster.hidden)return;
  const wallet=state.mainWallet,current=wallet?.current?.toLowerCase(),name=wallet?.brand==='okx'?'OKX Wallet':'OneKey';
  title.textContent=config===undefined?'账户类型待确认':config?'多签账户':'普通账户';
  status.textContent=configError?'暂时无法查询账户类型，请重试。':config===undefined?'正在查询账户类型…':config?`需要 ${config.threshold} / ${config.authorizedUsers.length} 个成员签名`:'此账户未设置原生多签。';
  if(success&&config!==undefined)status.textContent='✓ 上次操作已完成 · '+status.textContent;
  const list=root.querySelector('#account-list')!;list.replaceChildren();
  const rows=[{address:state.m,label:config?'多签账户 M':'账户'}];
  if(config)config.authorizedUsers.forEach((a:string,i:number)=>{if(a.toLowerCase()!==state.m.toLowerCase())rows.push({address:a,label:'成员 '+String.fromCharCode(65+i)});});
  if(current&&!rows.some(r=>r.address.toLowerCase()===current))rows.push({address:current,label:'其他账户'});
  for(const entry of rows){
   const row=document.createElement('div');row.className='account-row';row.dataset.address=entry.address.toLowerCase();
   const active=current===entry.address.toLowerCase();row.classList.toggle('current',active);
   const label=document.createElement('strong');label.textContent=entry.label;
   const code=document.createElement('code');code.textContent=entry.address.slice(0,8)+'…'+entry.address.slice(-6);code.title=entry.address;
   const copy=document.createElement('button');copy.className='text-button';copy.textContent='复制';copy.setAttribute('aria-label','复制'+entry.label+'地址');
   copy.onclick=async()=>{try{await navigator.clipboard.writeText(entry.address);copy.textContent='已复制';}catch{error.hidden=false;error.textContent='复制失败：'+entry.address;}};
   row.append(label,code,copy);
   if(active){const badge=document.createElement('span');badge.className='current-label';badge.textContent=name+' · 当前连接';row.append(badge);}
   list.append(row);
  }
  root.querySelector('#account-help')!.textContent=!wallet||!current?'请解锁钱包并检查连接。':current!==state.m.toLowerCase()?'下一次操作前，请在 '+name+' 切回'+(config?'多签账户 M。':'连接时的账户。'):wallet.retryRequired?'已切回，请回原网页重新点击刚才的操作。':'可返回 Hyperliquid 发起操作。';
 }
 async function loadConfig(force=false){
  const m=state?.m;if(!m||state.choiceId)return;
  if(account!==m){account=m;config=undefined;configError=false;loadedAt=0;loading=false;}
  if(loading||(!force&&Date.now()-loadedAt<30000))return;
  loading=true;const target=m;
  try{const result=await rpc('ACCOUNT_CONFIG',{tabId,account:target});if(account!==target||stopped)return;config=result.config;configError=false;}
  catch{if(account===target){config=undefined;configError=true;}}
  finally{if(account===target){loading=false;loadedAt=Date.now();if(!stopped)connectionStatus();}}
 }
 root.querySelector('#check-master')!.addEventListener('click',async()=>{await poll();await loadConfig(true);});
 async function poll(){
  if(stopped||polling||busy)return;polling=true;
  try{
   state=await rpc('FLOW',{tabId});
   if(state.jobId&&!state.choiceId){sessionStorage.removeItem('x-success-'+tabId);location.replace('panel.html?side=1&tab='+tabId+'&job='+encodeURIComponent(state.jobId));return;}
   choices.hidden=!state.choiceId;
   title.textContent=state.choiceId?'选择连接钱包':state.connecting?'等待钱包确认':state.m?'多签账户已连接':'等待网页连接';
   status.textContent=state.choiceId?'请在钱包内选择多签账户 M。':state.connecting?'请在钱包中确认连接。':state.m?'':'请在 Hyperliquid 选择 Hyperclick。';
   error.hidden=true;if(account!==state.m){account='';config=undefined;}connectionStatus();void loadConfig();
  }catch(e){error.hidden=false;error.textContent=(e as Error).message;}
  finally{polling=false;}
 }
 root.querySelectorAll<HTMLButtonElement>('[data-brand]').forEach(button=>button.onclick=async()=>{
  if(busy||!state?.choiceId)return;busy=true;error.hidden=true;
  root.querySelectorAll<HTMLButtonElement>('[data-brand]').forEach(b=>b.disabled=true);
  try{await rpc('CHOOSE',{tabId,choiceId:state.choiceId,brand:button.dataset.brand});choices.hidden=true;title.textContent='正在连接';status.textContent='请在钱包中确认连接。';}
  catch(e){error.hidden=false;error.textContent=(e as Error).message;}
  finally{busy=false;root.querySelectorAll<HTMLButtonElement>('[data-brand]').forEach(b=>b.disabled=false);void poll();}
 });
 await poll();const timer=setInterval(()=>void poll(),800);
 window.addEventListener('pagehide',()=>{stopped=true;clearInterval(timer);},{once:true});
}
