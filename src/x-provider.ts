import {actionFromTyped,userSigned,canonicalAction} from './actions';
import {address,assert,digest,originalTyped,originalCaptureTyped,innerTyped,outerTyped,recover,signatureHex,signatureParts,validateCapture,API,actionHash,networkOf,ZERO,type Address,type Capture,type Typed,type MultiAction} from './core';
import type {Brand,Provider} from './providers';
import {readAccounts} from './providers';
import type {Hex} from 'viem';
export class XProvider {
 private m?:Address;private wallet?:Provider;private chain:number;
 private brand?:Brand;private retryRequired=false;
 private listeners=new Map<string,Set<(v:any)=>void>>();
 private issued=new Map<string,Address>();
 private captures=new Map<string,{m:Address;capture:Capture}>();
 private busy=false;private connecting=false;
 managesWebpage=()=>!!this.m||this.connecting;
 constructor(private network:'Mainnet'|'Testnet',private choose:()=>Promise<{provider:Provider;brand:Brand}>) {this.chain=network==='Mainnet'?999:998;}
 get selectedAddress(){return this.m??null;}
 async mainWalletState(){
  const m=this.m,wallet=this.wallet,brand=this.brand;
  if(!m||!wallet)return {status:'disconnected',brand,current:null,retryRequired:false};
  try{
   const accounts=await readAccounts(wallet);
   if(this.m!==m||this.wallet!==wallet)return {status:'disconnected',brand,current:null,retryRequired:false};
   const current=accounts?.[0]?address(accounts[0]):null;
   return {status:current===m?'ready':'switch',brand,current,retryRequired:this.retryRequired};
  }catch{return {status:'unavailable',brand,current:null,retryRequired:this.retryRequired};}
 }
 private async requireMaster(){
  const state=await this.mainWalletState();
  if(state.status==='ready')return;
  this.retryRequired=true;
  const name=this.brand==='okx'?'OKX Wallet':'OneKey';
  const message=state.status==='unavailable'?`无法读取 ${name} 当前账户。请解锁钱包，确认已选中多签账户 M（${this.m}），再回原网页重新点击本次操作。`:`请在 ${name} 切回多签账户 M（${this.m}），再回原网页重新点击本次操作。`;
  this.emit('masterRequired',{m:this.m,...state,retryRequired:true,message});
  throw Object.assign(Error(message),{code:4001});
 }
 get chainId(){return '0x'+this.chain.toString(16);}
 isConnected=()=>!!this.m;
 on=(name:string,fn:(v:any)=>void)=>{if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name)!.add(fn);return this;};
 removeListener=(name:string,fn:(v:any)=>void)=>{this.listeners.get(name)?.delete(fn);return this;};
 private emit(name:string,v:any){for(const fn of this.listeners.get(name)??[])fn(v);}
 private async exclusive<T>(fn:()=>Promise<T>){assert(!this.busy,'已有钱包请求，请先完成');this.busy=true;try{return await fn();}finally{this.busy=false;}}
 request=async({method,params=[]}:{method:string;params?:any[]}):Promise<any>=>{
  if(method==='eth_accounts')return this.m?[this.m]:[];
  if(method==='eth_chainId')return this.chainId;
  if(method==='net_version')return String(this.chain);
  if(method==='eth_requestAccounts'){
   if(this.m)return [this.m];
   return this.exclusive(async()=>{
    this.connecting=true;
    try{
    const {provider,brand}=await this.choose();
    const accounts=await provider.request({method:'eth_requestAccounts'});
    const m=address(accounts?.[0]);const chain=Number(await provider.request({method:'eth_chainId'}));
    assert([1,999,998,42161,421614].includes(chain),'请先把钱包切换到 HyperEVM 或 Arbitrum 网络');
    this.m=m;this.wallet=provider;this.brand=brand;this.retryRequired=false;this.chain=chain;
    this.emit('connect',{chainId:this.chainId});this.emit('accountsChanged',[m]);this.emit('chainChanged',this.chainId);return [m];
    }finally{this.connecting=false;}
   });
  }
  if(method==='wallet_getPermissions')return this.m?[{parentCapability:'eth_accounts',caveats:[{type:'restrictReturnedAccounts',value:[this.m]}]}]:[];
  if(method==='wallet_requestPermissions'){assert(params[0]?.eth_accounts,'仅支持账户连接权限');await this.request({method:'eth_requestAccounts'});return this.request({method:'wallet_getPermissions'});}
  if(method==='wallet_revokePermissions'){this.disconnect();return null;}
  if(method==='wallet_switchEthereumChain'){
   const next=Number(params[0]?.chainId);assert([1,999,998,42161,421614].includes(next),'Hyperclick 暂不支持此网络');
   assert(!this.busy&&this.captures.size===0,'多签期间不可切换 Hyperclick 网络');this.chain=next;this.emit('chainChanged',this.chainId);return null;
  }
  if(method==='eth_signTypedData_v4')return this.exclusive(async()=>{
   assert(this.m&&this.wallet,'请先连接 Hyperclick');assert(this.captures.size===0,'已有多签授权正在进行');
   assert(address(params[0])===this.m,'网页请求账户不是 Hyperclick 连接的 M');
   const t:Typed=typeof params[1]==='string'?JSON.parse(params[1]):params[1];
   const isL1=t?.primaryType==='Agent';
   let a:any;
   if(isL1){
    assert(t.domain?.name==='Exchange'&&t.domain.version==='1'&&Number(t.domain.chainId)===1337&&address(t.domain.verifyingContract)===ZERO,'操作签名域无效');
    const expected:Typed={domain:{name:'Exchange',version:'1',chainId:1337,verifyingContract:ZERO},types:{Agent:[{name:'source',type:'string'},{name:'connectionId',type:'bytes32'}]},primaryType:'Agent',message:{source:this.network==='Mainnet'?'a':'b',connectionId:t.message?.connectionId}};
    assert(/^0x[0-9a-f]{64}$/i.test(String(t.message?.connectionId))&&digest(t)===digest(expected),'操作哈希或网络不匹配');
   }else{
    a=actionFromTyped(t);
    validateCapture({action:a,nonce:a.nonce??a.time,signature:{r:'0x1',s:'0x1',v:27}},API[this.network]+'/exchange');
    assert(digest(t)===digest(originalTyped(a)),'网页签名内容与操作类型不匹配');
   }
   await this.requireMaster();
   if(!isL1&&Number(await this.wallet.request({method:'eth_chainId'}))!==Number(a.signatureChainId))await this.wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:a.signatureChainId}]});
   await this.requireMaster();this.retryRequired=false;this.emit('masterReady',{});
   const signature=await this.wallet.request({method:'eth_signTypedData_v4',params:[this.m,JSON.stringify(t)]}) as Hex;
   assert(await recover(t,signature)===this.m,'M 的原始签名不匹配');
   this.issued.clear();this.issued.set(digest(t)+signatureHex(signatureParts(signature)),this.m);return signature;
  });
  const error=Object.assign(Error('Hyperclick 本地多签入口暂不支持 '+method),{code:4200});throw error;
 };
 disconnect(){assert(!this.busy,'请先完成钱包请求');this.m=undefined;this.wallet=undefined;this.brand=undefined;this.retryRequired=false;this.issued.clear();this.captures.clear();this.emit('accountsChanged',[]);this.emit('disconnect',{code:4900,message:'Hyperclick 已断开'});}
 bind(id:string,capture:Capture){
  const key=digest(originalCaptureTyped(capture))+signatureHex(capture.signature);const m=this.issued.get(key);
  if(!m||m!==this.m)return false;
  this.issued.delete(key);this.captures.set(id,{m,capture:structuredClone(capture)});return true;
 }
 async bindAgent(id:string,capture:Capture,lookup:(signer:Address)=>Promise<any>){
  const m=this.m;if(!m||userSigned(capture.action)||networkOf(capture)!==this.network)return false;
  const signer=await recover(originalCaptureTyped(capture),signatureHex(capture.signature));
  const role=await lookup(signer);
  if(this.m!==m||role?.role!=='agent'||String(role?.data?.user).toLowerCase()!==m)return false;
  this.captures.set(id,{m,capture:structuredClone(capture)});return true;
 }
 release(id:string){this.captures.delete(id);}
 guard(id:string,m:string){const c=this.captures.get(id);return {xProvider:!!c,broken:!c||c.m!==m.toLowerCase()||this.m!==c.m,blocked:[],unknown:[]};}
 async sign(id:string,expected:string,provider:Provider,typed:Typed,multi?:MultiAction,leader?:Address){
  return this.exclusive(async()=>{
   const c=this.captures.get(id);assert(c&&c.m===this.m,'Hyperclick 连接已断开或提案已失效');
   const a=c.capture.action;
   if(typed.primaryType!=='HyperliquidTransaction:SendMultiSig'){
    const outer=address(leader??typed.message.outerSigner);
    assert(digest(typed)===digest(innerTyped(a,c.m,outer,c.capture)),'多签账户或操作内容不匹配');
   }else{
    assert(multi?.type==='multiSig','缺少原始多签封装');
    assert(address(multi.payload.multiSigUser)===c.m&&address(multi.payload.outerSigner)===address(expected),'外层账户不匹配');
    assert(actionHash(canonicalAction(multi.payload.action),c.capture.nonce)===actionHash(canonicalAction(a),c.capture.nonce),'外层操作内容改变');
    assert(digest(typed)===digest(outerTyped(multi,c.capture.nonce,c.capture)),'外层签名摘要不匹配');
   }
   const signer=address(expected);
   const accounts=await provider.request({method:'eth_requestAccounts'});
   assert(address(accounts?.[0])===signer,'当前钱包账户不是指定签名者 '+signer+'，请切换后重试');
   const chain=Number(await provider.request({method:'eth_chainId'}));
   if(typed.primaryType!=='Agent'&&chain!==Number(typed.domain.chainId))await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x'+typed.domain.chainId.toString(16)}]});
   assert(address((await provider.request({method:'eth_accounts'}))?.[0])===signer,'钱包账户已变化，请重试');
   const signature=await provider.request({method:'eth_signTypedData_v4',params:[signer,JSON.stringify(typed)]}) as Hex;
   assert(this.captures.get(id)===c&&this.m===c.m,'授权已停止');
   assert(await recover(typed,signature)===signer,'签名者或签署内容不匹配');return signature;
  });
 }
}
