import {userSigned} from './actions';
import {submissionResult} from './response';
import { API, MAX_AGE, Proposal, address, assert, configKey, digest, fresh, originalTyped, outerTyped, recover, signatureHex, signatureParts, validateCapture, validateConfig, networkOf, originalCaptureTyped, freshCapture, type Capture, type Config, type Address } from './core';
import type { Hex } from 'viem';

type Job = {
  id:string; formatVersion?:number; requestId:string; tabId:number; documentId?:string; origin:string; created:number;
  localMode?:boolean; capture:Capture; m:Address; config:Config; leader?:Address; signatures:Record<string,Hex>;
  status:'collecting'|'outer'|'submitting'|'success'|'failed'|'unknown'|'cancelled'; error?:string;
};
const jobs=new Map<string,Job>();
const locks=new Map<string,Promise<unknown>>();
const ready=chrome.storage.session.get('jobs').then(async r=>{
  for(const j of (r.jobs??[]) as Job[]){
    if(j.status==='submitting'){j.status='unknown';j.error='扩展在提交期间重启，结果未知；不要重复提交。';}
    if(['collecting','outer'].includes(j.status)&&j.formatVersion!==3){j.status='failed';j.error='签名格式已升级，请刷新原网页并重新建立连接；旧提案不可继续提交';await sendResult(j,{kind:'error',error:j.error});}
    jobs.set(j.id,j);
  }
  await save();
});
async function save(){await chrome.storage.session.set({jobs:[...jobs.values()]});}
function model(j:Job){const p=new Proposal(j.capture,j.m,j.config);p.leader=j.leader;p.signatures={...j.signatures};return p;}
async function json(url:string,body:unknown){
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25_000)});
  if(!r.ok)throw Error('HyperCore HTTP '+r.status);return r.json();
}
async function configuration(c:Capture,m:Address){return validateConfig(await json(API[networkOf(c)]+'/info',{type:'userToMultiSigSigners',user:m}));}
async function unchanged(j:Job){
  freshCapture(j.capture);const c=await configuration(j.capture,j.m);
  assert(c&&configKey(c)===configKey(j.config),'链上成员或阈值发生变化，请重新发起操作');
}
async function guardCheck(j:Job){
  const res=await chrome.tabs.sendMessage(j.tabId,{type:'GUARD',requestId:j.requestId,m:j.m},j.documentId?{documentId:j.documentId}:{});
  assert(res?.result&&!res.error,res?.error??'无法确认原网页连接，请刷新后重试');
  const g=res.result;
  assert(!g.broken,'原网页钱包账户已改变，本次提案停止；请重新连接 M 并建立连接');
  if(j.localMode)assert(g.xProvider,'Hyperclick 本地账户连接已失效');
  return g;
}
async function sendResult(j:Job,result:unknown){
  await chrome.tabs.sendMessage(j.tabId,{type:'RESULT',requestId:j.requestId,result},j.documentId?{documentId:j.documentId}:{}).catch(()=>{});
}
async function fail(j:Job,error:string,status:Job['status']='failed'){
  j.status=status;j.error=error;await save();await sendResult(j,{kind:'error',error});
}
async function capture(m:any,s:chrome.runtime.MessageSender){
  assert(s.tab?.id!==undefined && s.frameId===0,'请求必须来自 Hyperliquid 主页面');
  const origin=new URL(s.url!).origin;
  const network=origin==='https://app.hyperliquid.xyz'?'Mainnet':origin==='https://app.hyperliquid-testnet.xyz'?'Testnet':null;
  assert(network,'来源网站不受支持');
  assert(typeof m.requestId==='string'&&m.requestId.length<100,'请求 ID 无效');
  const c=validateCapture(m.body,m.url);
  assert(networkOf(c)===network,'页面与操作网络不同');
  const sourceSigner=await recover(originalCaptureTyped(c),signatureHex(c.signature));
  let master=sourceSigner;
  if(m.account&&address(m.account)!==sourceSigner){
   assert(!userSigned(c.action),'用户签名请求的账户不一致');
   const role=await json(API[networkOf(c)]+'/info',{type:'userRole',user:sourceSigner});
   assert(role?.role==='agent'&&address(role?.data?.user)===address(m.account),'原始签名不属于该账户的交易代理');
   master=address(m.account);
  }
  const conf=await configuration(c,master);
  if(!conf)return {kind:'passthrough'};
  const active=[...jobs.values()].find(j=>j.m===master && networkOf(j.capture)===network && ['collecting','outer','submitting'].includes(j.status));
  assert(!active,'该账户已有待处理操作，请完成或取消原提案');
  const j:Job={formatVersion:3,id:crypto.randomUUID(),requestId:m.requestId,tabId:s.tab.id,documentId:s.documentId,origin,created:Date.now(),capture:c,m:master,config:conf,signatures:{},status:'collecting'};
  jobs.set(j.id,j);await save();
  const guard=await guardCheck(j).catch(()=>undefined);j.localMode=!!guard?.xProvider;await save();
  await chrome.sidePanel?.setOptions({tabId:j.tabId,path:'panel.html?job='+j.id+'&side=1&tab='+j.tabId,enabled:true}).catch(()=>{});
  try{if(!chrome.sidePanel)await chrome.windows.create({url:chrome.runtime.getURL('panel.html')+'?job='+j.id,type:'popup',width:600,height:850});}
  catch{await fail(j,'无法打开 Hyperclick 组件，请点击扩展图标');}
  return {kind:'accepted',id:j.id};
}
async function panel(m:any){
  if(['FLOW','CHOOSE','HOME','ACCOUNT_CONFIG'].includes(m.type)){
    assert(Number.isInteger(m.tabId),'缺少原网页标签页');
    const tab=await chrome.tabs.get(m.tabId);
    assert(/^https:\/\/app\.hyperliquid(?:-testnet)?\.xyz\//.test(tab.url??''),'原网页已关闭或离开 Hyperliquid');
    if(m.type==='HOME'){await chrome.sidePanel?.setOptions({tabId:m.tabId,path:'panel.html?side=1&tab='+m.tabId,enabled:true});return {ok:true};}
    const state=await chrome.tabs.sendMessage(m.tabId,{type:m.type==='CHOOSE'?'CONNECTION_CHOOSE':'CONNECTION_STATE',choiceId:m.choiceId,brand:m.brand},{frameId:0});
    assert(!state?.error,state?.error);assert(state?.result,'网页未响应，请刷新后重新连接 Hyperclick');
    if(m.type==='CHOOSE')return state.result;
    if(m.type==='ACCOUNT_CONFIG'){
      const master=address(state.result.m);assert(master===address(m.account),'连接账户已变化，请重试');
      const network=new URL(tab.url!).hostname==='app.hyperliquid-testnet.xyz'?'Testnet':'Mainnet';
      const config=validateConfig(await json(API[network]+'/info',{type:'userToMultiSigSigners',user:master}));
      return {m:master,config};
    }
    const active=[...jobs.values()].find(j=>j.tabId===m.tabId&&['collecting','outer','submitting'].includes(j.status));
    return {...state.result,jobId:state.result.choiceId?undefined:active?.id};
  }
  if(m.type==='DIAGNOSTICS'){
    const tabs=await chrome.tabs.query({url:['https://app.hyperliquid.xyz/*','https://app.hyperliquid-testnet.xyz/*']});
    return Promise.all(tabs.map(async t=>{
      try{const h=await chrome.tabs.sendMessage(t.id!,{type:'HEALTH'},{frameId:0});return {tabId:t.id,...h.result,error:h.error};}
      catch{return {tabId:t.id,error:'网页未接入当前扩展，请刷新 Hyperliquid 页面后重试'};}
    }));
  }
  if(m.type==='LIST')return {jobs:[...jobs.values()].map(j=>({id:j.id,m:j.m,status:j.status,network:networkOf(j.capture)}))};
  const j=jobs.get(m.jobId);assert(j,'找不到提案，请在 Hyperliquid 重新建立连接');
  if(m.type==='GET')return j;
  if(m.type==='LOCAL_STATE') {const r=await chrome.tabs.sendMessage(j.tabId,{type:'LOCAL_STATE',requestId:j.requestId},j.documentId?{documentId:j.documentId}:{});assert(!r.error,r.error);return r.result;}
  if(m.type==='CANCEL'){
    assert(j.status!=='submitting','提交已发出，无法撤销，请等待结果');
    if(['success','failed','cancelled','unknown'].includes(j.status))return j;
    await fail(j,'用户取消了多签操作','cancelled');return j;
  }
  assert(['collecting','outer'].includes(j.status),'提案不可再修改或提交');freshCapture(j.capture);
  const p=model(j);
  if(m.type==='LOCAL_SIGN'){
    assert(j.localMode,'请先取消本次提案，在 Hyperliquid 的连接列表选择 Hyperclick，再建立连接');
    assert(m.brand==='okx'||m.brand==='onekey','不支持的钱包插件');
    const expected=address(m.address);
    assert(j.config.authorizedUsers.includes(expected),'不是多签成员');
    assert(m.phase==='inner'?j.status==='collecting':m.phase==='outer'&&j.status==='outer'&&expected===j.leader,'签署阶段不匹配');
    await guardCheck(j);await unchanged(j);
    const typed=m.phase==='inner'?p.inner():outerTyped(p.multi(),j.capture.nonce,j.capture);
    const response=await chrome.tabs.sendMessage(j.tabId,{type:'LOCAL_SIGN',requestId:j.requestId,brand:m.brand,expected,typed,leader:j.leader,multi:m.phase==='outer'?p.multi():undefined},j.documentId?{documentId:j.documentId}:{});
    assert(response?.result?.signature&&!response.error,response?.error??'钱包签署未返回');
    assert(await recover(typed,response.result.signature)===expected,'签名者或内容不匹配');
    assert(['collecting','outer'].includes(j.status),'提案已停止');
    const latest=model(j);assert(digest(m.phase==='inner'?latest.inner():outerTyped(latest.multi(),j.capture.nonce,j.capture))===digest(typed),'签署期间提案或提交人已改变');
    await guardCheck(j);return {signature:response.result.signature};
  }
  if(m.type==='LEADER'){
    assert(j.status==='collecting','已经准备最终签名，不能更改提交人');
    p.setLeader(m.address);j.leader=p.leader;j.signatures=p.signatures;await save();return j;
  }
  if(m.type==='INNER')return p.inner();
  if(m.type==='SIGNATURE'){
    assert(j.status==='collecting','提案已冻结');await p.add(m.address,m.signature);j.signatures=p.signatures;await save();return j;
  }
  if(m.type==='PREPARE'){
    await guardCheck(j);
    await unchanged(j);const action=p.multi();j.status='outer';await save();return outerTyped(action,j.capture.nonce,j.capture);
  }
  if(m.type==='SUBMIT'){
    assert(j.status==='outer','先完成内层签名并准备最终提交');
    await guardCheck(j);
    await unchanged(j);const action=p.multi();
    assert(await recover(outerTyped(action,j.capture.nonce,j.capture),m.signature)===j.leader,'外层签名不属于提交人 或内容被修改');
    j.status='submitting';await save();
    try{
      const result=await json(API[networkOf(j.capture)]+'/exchange',{action,nonce:j.capture.nonce,signature:signatureParts(m.signature),...(j.capture.vaultAddress?{vaultAddress:j.capture.vaultAddress}:{}),...(j.capture.expiresAfter!=null?{expiresAfter:j.capture.expiresAfter}:{})});
      const state=submissionResult(j.capture.action,result);j.status=state.status;j.error=state.error;
      await save();await sendResult(j,{kind:'response',body:result});
    }catch(e){await fail(j,'提交结果未知：'+(e as Error).message+'。请检查链上操作结果，勿重复提交。','unknown');}
    return j;
  }
  if(m.type==='WALLET')throw Error('请使用 OneKey 或 OKX Wallet 浏览器插件');
  throw Error('未知指令');
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  if(m?.type==='OPEN_SIDE'){
    if(s.id!==chrome.runtime.id||s.frameId!==0||s.tab?.id===undefined||!/^https:\/\/app\.hyperliquid(?:-testnet)?\.xyz\//.test(s.url??'')){reply({error:'侧栏来源无效'});return;}
    if(!chrome.sidePanel){reply({error:'浏览器不支持侧栏'});return;}
    chrome.sidePanel.open({tabId:s.tab.id}).then(()=>reply({result:true}),e=>reply({error:e.message}));return true;
  }

  (async()=>{
    await ready;
    if(m?.type==='CONNECTION_READY'){
      assert(s.id===chrome.runtime.id&&s.frameId===0&&s.tab?.id!==undefined&&/^https:\/\/app\.hyperliquid(?:-testnet)?\.xyz\//.test(s.url??''),'来源无效');
      await chrome.sidePanel?.setOptions({tabId:s.tab!.id!,path:'panel.html?side=1&tab='+s.tab!.id,enabled:true});return {ok:true};
    }
    if(m?.type==='CAPTURE')return capture(m,s);
    assert(s.id===chrome.runtime.id&&s.url?.startsWith(chrome.runtime.getURL('panel.html')),'仅扩展确认窗口可操作提案');
    if(!m.jobId||['GET','WALLET','INNER','LOCAL_SIGN','LOCAL_STATE'].includes(m.type))return panel(m);
    const prev=locks.get(m.jobId)??Promise.resolve();
    const next=prev.catch(()=>{}).then(()=>panel(m));locks.set(m.jobId,next);
    try{return await next;}finally{if(locks.get(m.jobId)===next)locks.delete(m.jobId);}
  })().then(result=>reply({result}),error=>reply({error:(error as Error).message}));return true;
});
chrome.runtime.onConnect.addListener(port=>{if(port.name==='x-panel')port.onMessage.addListener(()=>{});});
chrome.action.onClicked.addListener(()=>{if(!chrome.sidePanel)void chrome.windows.create({url:chrome.runtime.getURL('panel.html'),type:'popup',width:600,height:850});});
chrome.alarms.create('expire',{periodInMinutes:1});
chrome.alarms.onAlarm.addListener(async()=>{
  await ready;
  for(const j of jobs.values()){
    if(Date.now()-j.capture.nonce>MAX_AGE&&['collecting','outer'].includes(j.status))await fail(j,'提案已过期，请重新发起操作');
    if(Date.now()-j.created>24*3600_000&&!['collecting','outer','submitting'].includes(j.status))jobs.delete(j.id);
  }await save();
});
chrome.tabs.onRemoved.addListener(async id=>{await ready;for(const j of jobs.values())if(j.tabId===id&&['collecting','outer'].includes(j.status))await fail(j,'原网页已关闭','cancelled');});

chrome.sidePanel?.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
