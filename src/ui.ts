import {address,networkOf} from './core';
import {actionView} from './actions';
import {type Rpc,type Wallet,type WalletFactory} from './wallets';
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const short=(s:string)=>s.slice(0,8)+'…'+s.slice(-6);
type Step='review'|'leader'|'collect';
export async function start(rpc:Rpc,factory:WalletFactory,demo=false){
 const root=document.getElementById('app')!;
 let job:any,busy='',error='',errorPhase='',live:any,reading=false,step:Step='review',selectedSigner='',acknowledged=false;
 const routes=new Map<string,string>(),wallets=new Map<string,Wallet>();
 window.addEventListener('x-wallet-status',e=>{if(busy){busy=(e as CustomEvent).detail;render();}});
 const active=()=>job&&['collecting','outer'].includes(job.status);
 const count=()=>Object.keys(job?.signatures??{}).length;
 const finalStage=()=>active()&&count()>=job.config.threshold;
 const stepNumber=()=>step==='review'?1:step==='leader'?2:3;
 const signed=(a:string)=>!!job?.signatures?.[a];
 function nextSigner(){
  if(!job)return;
  if(finalStage()){selectedSigner=job.leader;return;}
  if(!selectedSigner||signed(selectedSigner)||!job.config.authorizedUsers.includes(selectedSigner))
   selectedSigner=job.config.authorizedUsers.find((a:string)=>!signed(a))??job.leader;
 }
 function walletInfo(a:string,route:string){
  if(!route.startsWith('plugin:'))return {message:'使用所选钱包入口完成本次签署。',mismatch:false};
  const brand=route.slice(7),name=brand==='okx'?'OKX':'OneKey';
  const found=live?.wallets?.find((w:any)=>w.brand===brand),current=found?.accounts?.[0];
  if(found?.error)return {message:name+' 暂时无法读取账户，请确认插件可用。',mismatch:false};
  if(!found)return {message:'正在检查 '+name+' 钱包…',mismatch:false};
  if(!current)return {message:name+' 未连接，请在钱包中选择 '+short(a),mismatch:false};
  if(current.toLowerCase()!==a)return {message:'请在 '+name+' 切换到 '+short(a)+'，然后签署。',mismatch:true};
  return {message:'✓ '+name+' 已连接所需地址 '+short(a),mismatch:false};
 }
 function updateAccounts(){
  if(!job||step!=='collect'||!active())return;
  const box=root.querySelector<HTMLElement>('#active-wallet');
  const target=finalStage()?job.leader:selectedSigner;
  const route=routes.get(target)??'';
  const info=walletInfo(target,route);
  if(box){box.textContent=info.message;box.classList.toggle('account-mismatch',info.mismatch);}
  const button=root.querySelector<HTMLButtonElement>('#submit');
  if(button&&route.startsWith('plugin:'))button.disabled=!!busy||info.mismatch||!route;
 }
 async function readAccounts(){
  if(reading||!job?.localMode||!active()||demo)return;
  reading=true;
  try{live=await rpc('LOCAL_STATE');}catch{live={wallets:[]};}
  finally{
   reading=false;
   if(error&&/当前钱包账户不是指定签名者/.test(error)){
    const target=finalStage()?job.leader:selectedSigner;
    if(!walletInfo(target,routes.get(target)??'').mismatch){error='';render();return;}
   }
   updateAccounts();
  }
 }
 async function closeWallets(){await Promise.allSettled([...wallets.values()].map(w=>w.close?.()));wallets.clear();}
 async function refresh(){job=await rpc('GET');nextSigner();}
 async function run(label:string,fn:()=>Promise<void>){
  if(busy)return;busy=label;error='';render();
  try{await fn();}catch(e){error=(e as Error).message;}
  finally{busy='';await refresh().catch(()=>{});render();}
 }
 function network(){return networkOf(job.capture)==='Mainnet'?'主网':'测试网';}
 function summary(){return `<section class="summary"><div class="summary-row"><span>操作</span><b>${esc(actionView(job.capture.action).title)}</b></div><div class="summary-row"><span>多签账户</span><code title="${esc(job.m)}">${esc(short(job.m))}</code></div><div class="summary-row"><span>签名要求</span><b>${job.config.threshold} / ${job.config.authorizedUsers.length} 个地址</b></div></section>`;}
 function review(){
  const info=actionView(job.capture.action);
  const rows:[string,string][]=[['多签账户',job.m],...info.rows];
  if(job.capture.vaultAddress)rows.push(['操作所用金库或子账户',job.capture.vaultAddress]);
  if(job.capture.expiresAfter)rows.push(['失效时间',new Date(job.capture.expiresAfter).toLocaleString('zh-CN')]);
  return `<div class="heading-row"><p class="eyebrow">第一步 · 核对操作</p><span class="network">${network()}</span></div><h1>确认本次签署内容</h1>${summary()}<section class="review-detail">${rows.map(([label,value])=>`<div class="review-field"><span>${esc(label)}</span><code>${esc(value)}</code></div>`).join('')}</section>${info.risk?`<div class="permission"><span>↗</span><p>${esc(info.risk)}</p></div>`:''}<details><summary>查看完整请求</summary><pre class="raw-request">${esc(JSON.stringify({action:job.capture.action,nonce:job.capture.nonce,vaultAddress:job.capture.vaultAddress,expiresAfter:job.capture.expiresAfter},null,2))}</pre></details><label class="consent"><input id="ack" type="checkbox" ${acknowledged?'checked':''} ${busy?'disabled':''}><span>我已核对账户和本次操作内容。</span></label><button class="primary" id="next-review" ${!acknowledged||busy?'disabled':''}>选择提交人 <span>→</span></button>`;
 }
 function leader(){return `<div class="heading-row"><p class="eyebrow">第二步 · 选择提交人</p><span class="network">${network()}</span></div><h1>谁来担任提交人？</h1><p class="muted">提交人须是授权成员。收齐 ${job.config.threshold} 个成员签名后，由提交人再次签署并提交。</p><label class="section-label" for="leader">选择本次提交人</label><select id="leader" ${busy||job.status==='outer'?'disabled':''}><option value="">请选择成员</option>${job.config.authorizedUsers.map((a:string,i:number)=>`<option value="${a}" ${job.leader===a?'selected':''}>${String.fromCharCode(65+i)} · ${a}</option>`).join('')}</select><div class="flow-actions"><button class="text-button" id="back-review">← 返回核对</button><button class="primary" id="next-leader" ${!job.leader||busy?'disabled':''}>进入多签收集 <span>→</span></button></div>`;}
 function memberCard(a:string,i:number){
  const complete=signed(a),focused=selectedSigner===a&&!finalStage(),route=routes.get(a)??'';
  return `<article data-member="${a}" class="signer flow-signer ${complete?'signed':''} ${focused?'flow-focused':''}"><div class="avatar">${String.fromCharCode(65+i)}</div><div class="signer-body"><div class="signer-head"><code title="${a}">${short(a)}</code>${a===job.leader?'<span class="leader-tag">提交人</span>':''}<span class="sign-state">${complete?'✓ 已收集':focused?'当前签名':'待签署'}</span></div>${focused?`<div class="wallet-row"><select aria-label="${String.fromCharCode(65+i)} 的钱包" data-route="${a}" ${busy||!active()?'disabled':''}><option value="">选择钱包入口</option><option value="plugin:onekey" ${route==='plugin:onekey'?'selected':''}>OneKey</option><option value="plugin:okx" ${route==='plugin:okx'?'selected':''}>OKX Wallet</option></select><button class="wallet-button" data-sign="${a}" ${!route||busy||!active()?'disabled':''}>签署</button></div><p id="active-wallet" class="account-state" role="status"></p>`:!complete&&!finalStage()?`<button class="text-button flow-select" data-focus="${a}">选择此成员签署 →</button>`:''}</div></article>`;
 }
 function collect(){
  const complete=finalStage(),leaderRoute=routes.get(job.leader)??'';
  return `<div class="heading-row"><p class="eyebrow">第三步 · 多签收集</p><span class="network">${network()}</span></div><h1>${complete?'成员签名已齐':'逐个收集成员签名'}</h1><p class="muted">${complete?'请选择提交人的钱包完成提交。':'选择当前成员及钱包，逐个完成签署。'}</p><div class="section-label"><span>已收集签名</span><b class="count">${count()} / ${job.config.threshold}</b></div><div class="progress"><i style="width:${Math.min(count()/job.config.threshold,1)*100}%"></i></div>${complete?`<section class="summary flow-final"><div class="section-label"><span>提交人最终确认</span></div><p class="muted">请切换钱包至 ${esc(short(job.leader))}。</p><div class="wallet-row"><select aria-label="提交人的钱包" data-route="${job.leader}" ${busy?'disabled':''}><option value="">选择提交人的钱包入口</option><option value="plugin:onekey" ${leaderRoute==='plugin:onekey'?'selected':''}>OneKey</option><option value="plugin:okx" ${leaderRoute==='plugin:okx'?'selected':''}>OKX Wallet</option></select></div><p id="active-wallet" class="account-state" role="status"></p><button class="primary" id="submit" ${!leaderRoute||busy?'disabled':''}>由提交人签署并提交 <span>↗</span></button></section>`:''}${complete?`<details class="collapsed-signatures"><summary>查看已收集的成员签名（${count()} 个）</summary><div class="signers">${job.config.authorizedUsers.map(memberCard).join('')}</div></details>`:`<div class="signers">${job.config.authorizedUsers.map(memberCard).join('')}</div>`}<div class="flow-actions"><button class="text-button" id="back-leader" ${count()||busy?'disabled':''}>← 返回选择提交人</button></div>`;
 }
 function render(){
  const isActive=active();const terminal=job&&!isActive;
  root.innerHTML=`<header><div class="brand"><img class="brand-mark" src="icons/hyperclick.svg" alt="" aria-hidden="true"><span>Hyperclick</span></div><span class="badge ${demo?'demo':''}">${demo?'交互演示':'v0.7.3'}</span></header>${job&&isActive?`<nav class="flow-steps" aria-label="授权步骤">${['核对操作','选择提交人','多签收集'].map((name,i)=>`<span class="${stepNumber()===i+1?'current':stepNumber()>i+1?'complete':''}">${i+1} ${name}</span>`).join('')}</nav>`:''}${busy||error?`<div class="flow-alert" aria-live="polite">${busy?`<p class="busy-status" role="status">${esc(busy)}</p>`:''}${error?`<p class="inline-error" role="alert">${errorPhase==='outer'?'提交人最终签署：':''}${esc(error)} <button id="dismiss-error" class="text-button">关闭提示</button></p>`:''}</div>`:''}<main>${!job?`<h1>共同确认，完成多签。</h1><p class="muted">在 Hyperliquid 连接列表选择 Hyperclick，连接多签账户 M，然后在网页发起操作。</p><div id="diagnostics" role="status"></div><div id="jobs"></div>`:terminal?`<h1>${job.status==='success'?'操作已提交':job.status==='unknown'?'操作结果待确认':job.status==='failed'?'操作返回失败':'本次操作已取消'}</h1>${summary()}${job.status==='success'?'<div class="success">✓ HyperCore 已接收本次操作</div>':`<div class="error">${esc(job.error??'请核对原网页结果')}</div>`}`:step==='review'?review():step==='leader'?leader():collect()}${isActive?`<button class="text-button" id="cancel" ${busy?'disabled':''}>取消本次操作</button>`:''}</main>`;
  updateAccounts();
  root.querySelector('#dismiss-error')?.addEventListener('click',()=>{error='';render();});
  root.querySelector('#ack')?.addEventListener('change',e=>{acknowledged=(e.target as HTMLInputElement).checked;render();});
  root.querySelector('#next-review')?.addEventListener('click',()=>{if(acknowledged){step='leader';error='';render();}});
  root.querySelector('#back-review')?.addEventListener('click',()=>{step='review';render();});
  root.querySelector('#leader')?.addEventListener('change',e=>run('设置提交人…',async()=>{await rpc('LEADER',{address:(e.target as HTMLSelectElement).value});await closeWallets();routes.clear();selectedSigner='';}));
  root.querySelector('#next-leader')?.addEventListener('click',()=>{if(job.leader){step='collect';nextSigner();render();}});
  root.querySelector('#back-leader')?.addEventListener('click',()=>{if(!count()){step='leader';render();}});
  root.querySelectorAll<HTMLElement>('[data-focus]').forEach(el=>el.addEventListener('click',()=>{selectedSigner=el.dataset.focus!;error='';render();}));
  root.querySelectorAll<HTMLSelectElement>('[data-route]').forEach(el=>el.addEventListener('change',()=>{routes.set(el.dataset.route!,el.value);wallets.delete(el.dataset.route!);error='';render();}));
  root.querySelectorAll<HTMLButtonElement>('[data-sign]').forEach(el=>el.addEventListener('click',()=>run('请在钱包中确认成员签名…',async()=>{
    const a=address(el.dataset.sign);errorPhase='inner';let wallet=wallets.get(a);
    if(!wallet){wallet=await factory(a,routes.get(a)!,rpc);wallets.set(a,wallet);}
    const data=await rpc('INNER');const signature=await wallet.sign(data,'inner');await rpc('SIGNATURE',{address:a,signature});selectedSigner='';
  })));
  root.querySelector('#submit')?.addEventListener('click',()=>run('等待提交人最终确认…',async()=>{
    const a=address(job.leader);errorPhase='outer';let wallet=wallets.get(a);
    if(!wallet){const route=routes.get(a);if(!route)throw Error('请先选择提交人的钱包入口');wallet=await factory(a,route,rpc);wallets.set(a,wallet);}
    const data=await rpc('PREPARE');const signature=await wallet.sign(data,'outer');
    busy='正在提交至 HyperCore…';render();const result=await rpc('SUBMIT',{signature});if(['success','failed','unknown'].includes(result.status))await closeWallets();
  }));
  root.querySelector('#cancel')?.addEventListener('click',()=>run('正在取消…',async()=>{await rpc('CANCEL');await closeWallets();}));

 }
 async function homeStatus(){
  if(job||demo)return;
  try{
   const states=await rpc('DIAGNOSTICS');const el=root.querySelector('#diagnostics');
   if(el)el.textContent=states.length?states.map((s:any)=>s.error??(!s.hooked?'网页请求钩子已被替换，请刷新页面':`网页已接入 Hyperclick ${s.version} · ${s.stage}`)).join('；'):'未找到 Hyperliquid 标签页';
   const list=await rpc('LIST'),links=root.querySelector('#jobs');
   if(links){links.replaceChildren();for(const j of list.jobs){const a=document.createElement('a');a.className='job-link';a.href='panel.html?job='+encodeURIComponent(j.id);a.textContent=short(j.m)+' · '+(j.network==='Mainnet'?'主网':'测试网')+' · '+({collecting:'收集中',outer:'待最终签署',submitting:'提交中',success:'已完成',failed:'失败',unknown:'结果待确认',cancelled:'已取消'} as any)[j.status];links.append(a);}}
  }catch{const el=root.querySelector('#diagnostics');if(el)el.textContent='接入检查失败，请刷新 Hyperliquid 后重试';}
 }
 try{
  try{await refresh();if(job?.leader)step='collect';}catch(e){if(location.search.includes('job='))error=(e as Error).message;}
  render();
 }catch(e){error=(e as Error).message;render();}
 if(job?.localMode&&!demo){await readAccounts();const timer=setInterval(()=>void readAccounts(),1500);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});}
 if(!job&&!demo){await homeStatus();const timer=setInterval(()=>void homeStatus(),3000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});}
}
