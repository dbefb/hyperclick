import * as exchange from '@nktkas/hyperliquid/api/exchange';
import {canonicalize} from '@nktkas/hyperliquid/signing';
import {safeParse} from 'valibot';
export type Action = {type:string;[key:string]:any};
export type Field = {name:string;type:string};
export type ActionSpec = {name:string;schema:any;fields?:Field[];primary?:string;vault:boolean;expiry:boolean};
const names:Record<string,string>={
 approveAgent:'交易代理授权',approveBuilderFee:'设置开发者手续费',usdSend:'转出合约账户 USDC',spotSend:'转出现货资产',withdraw3:'提现至外部地址',usdClassTransfer:'现货与合约划转',sendAsset:'跨账户资产划转',
 tokenDelegate:'委托或解除委托',cDeposit:'转入质押余额',cWithdraw:'提取质押余额',linkStakingUser:'关联质押账户',stakingLinkDisableTradingUser:'停用质押关联交易账户',
 convertToMultiSigUser:'修改多签配置',userDexAbstraction:'设置跨市场账户模式',userSetAbstraction:'设置账户模式',userPortfolioMargin:'设置组合保证金',
 order:'提交订单',cancel:'撤销订单',cancelByCloid:'按客户编号撤单',modify:'修改订单',batchModify:'批量修改订单',scheduleCancel:'设置定时撤单',twapOrder:'提交分批执行订单',twapCancel:'取消分批执行订单',updateLeverage:'调整杠杆',updateIsolatedMargin:'调整逐仓保证金',topUpIsolatedOnlyMargin:'按杠杆补充逐仓保证金',
 vaultTransfer:'金库存取款',createVault:'创建金库',vaultModify:'修改金库设置',vaultDistribute:'分配金库资金',createSubAccount:'创建子账户',subAccountModify:'修改子账户名称',subAccountTransfer:'子账户资金划转',subAccountSpotTransfer:'子账户现货划转',
 setReferrer:'设置推荐人',registerReferrer:'注册推荐码',claimRewards:'领取奖励',setDisplayName:'修改显示名称',spotUser:'设置现货零碎资产',borrowLend:'借贷与出借资产',reserveRequestWeight:'购买请求额度',noop:'使当前随机数失效',agentEnableDexAbstraction:'启用跨市场账户模式',agentSetAbstraction:'设置账户模式',agentSendAsset:'代理资产划转',hip3LiquidatorTransfer:'清算账户资金划转'
};
export const ACTIONS:Record<string,ActionSpec>={};
for(const [key,value] of Object.entries(exchange) as [string,any][]){
 if(!key.endsWith('Request'))continue;
 const schema=value.entries?.action,type=schema?.entries?.type?.literal;
 if(!type||!names[type])continue;
 const types=(exchange as any)[key.slice(0,-7)+'Types'];
 const primary=types?Object.keys(types)[0]:undefined;
 ACTIONS[type]={name:names[type],schema,primary,fields:primary?types[primary]:undefined,vault:!!value.entries.vaultAddress,expiry:!!value.entries.expiresAfter};
}
export const supported=(a:any)=>!!a&&typeof a.type==='string'&&Object.hasOwn(ACTIONS,a.type);
export const userSigned=(a:Action)=>!!ACTIONS[a.type]?.primary;
export function validateAction(a:Action):void{
 if(!supported(a))throw Error('暂未接入此操作：'+String(a?.type??'未知'));
 const spec=ACTIONS[a.type];let candidate={...a};
 if(a.type==='approveAgent')candidate.agentName??='';
 if(a.type==='userSetAbstraction')candidate.abstraction=({i:'disabled',u:'unifiedAccount',p:'portfolioMargin'} as any)[a.abstraction]??a.abstraction;
 try{canonicalize(spec.schema,candidate);}catch{throw Error('操作包含未知字段，已停止签署');}
 const result=safeParse(spec.schema,candidate);
 if(!result.success)throw Error('操作字段格式不正确：'+(result.issues[0].path?.map((p:any)=>String(p.key)).join('.')??a.type));
 const check=(v:any)=>{if(typeof v==='number'&&!Number.isSafeInteger(v))throw Error('操作数字超出精确范围');if(v&&typeof v==='object')Object.values(v).forEach(check);};check(a);
 if(a.type==='convertToMultiSigUser'){
  if(typeof a.signers!=='string')throw Error('多签配置必须为原始签名字符串');
  const config=JSON.parse(a.signers);
  if(config!==null){
   if(!config||Object.keys(config).some(k=>!['authorizedUsers','threshold'].includes(k))||!Array.isArray(config.authorizedUsers))throw Error('新的多签配置无效');
   const users=config.authorizedUsers.map((u:any)=>String(u).toLowerCase());
   if(!users.length||users.length>10||new Set(users).size!==users.length||users.some((u:string)=>!/^0x[0-9a-f]{40}$/.test(u))||!Number.isInteger(config.threshold)||config.threshold<1||config.threshold>users.length)throw Error('新的成员或阈值无效');
  }
 }
}
export function canonicalAction(a:Action):Action{
 validateAction(a);const copy={...a};
 if(a.type==='approveAgent')copy.agentName??='';
 if(copy.signatureChainId)copy.signatureChainId='0x'+BigInt(copy.signatureChainId).toString(16);
 // 地址字段按协议编码成小写；字符串字段保留原文。
 for(const f of ACTIONS[a.type].fields??[])if(f.type==='address')copy[f.name]=copy[f.name].toLowerCase();
 if(a.type==='userSetAbstraction')copy.abstraction=({disabled:'i',unifiedAccount:'u',portfolioMargin:'p'} as any)[a.abstraction]??a.abstraction;
 return canonicalize(ACTIONS[a.type].schema,copy) as Action;
}
export function userMessage(a:Action):Record<string,unknown>{
 const message:Record<string,unknown>={};
 for(const f of ACTIONS[a.type].fields??[])message[f.name]=a[f.name];
 if(a.type==='approveAgent')message.agentName=a.agentName??'';
 if(a.type==='userSetAbstraction')message.abstraction=({i:'disabled',u:'unifiedAccount',p:'portfolioMargin'} as any)[a.abstraction]??a.abstraction;
 return message;
}
export function actionFromTyped(t:any):Action{
 const type=Object.keys(ACTIONS).find(k=>ACTIONS[k].primary===t?.primaryType);
 if(!type)throw Error('暂未接入此签署类型');
 const a:Action={type,signatureChainId:'0x'+BigInt(t.domain.chainId).toString(16),...t.message};
 validateAction(a);return a;
}
const labels:Record<string,string>={agentAddress:'代理地址',agentName:'代理名称',destination:'接收地址',amount:'数量',token:'资产标识',sourceDex:'来源市场',destinationDex:'目标市场',fromSubAccount:'来源子账户',validator:'验证者地址',wei:'数量（亿分之一 HYPE）',isUndelegate:'解除委托',toPerp:'转入合约账户',maxFeeRate:'最高手续费率',builder:'开发者地址',user:'账户',enabled:'启用',abstraction:'账户模式',signers:'新的多签配置',vaultAddress:'金库地址',isDeposit:'存入',usd:'金额（百万分之一 USDC）',initialUsd:'初始金额（百万分之一 USDC）',name:'名称',description:'说明',allowDeposits:'允许存入',alwaysCloseOnWithdraw:'取出时平仓',subAccountUser:'子账户地址',code:'推荐码',displayName:'显示名称',toggleSpotDusting:'零碎资产处理',optOut:'不参加',operation:'借贷操作',asset:'资产编号',isCross:'全仓',leverage:'杠杆倍数',isBuy:'买入',ntli:'保证金变更（百万分之一 USDC）',orders:'订单',cancels:'撤销列表',modifies:'修改列表',grouping:'订单组合',builderFee:'开发者手续费',order:'订单内容',oid:'订单编号',cloid:'客户订单编号',twap:'分批订单',details:'执行详情',weight:'请求额度',time:'执行时间',tradingUser:'交易账户',isFinalize:'完成关联',dex:'市场',ntl:'金额',a:'资产编号',b:'买入',p:'价格',s:'数量',r:'只减仓',t:'订单类型',c:'客户订单编号',o:'订单编号',f:'快速撤单',m:'执行分钟数',limit:'限价单',trigger:'触发单',isMarket:'市价触发',triggerPx:'触发价格',tpsl:'止盈止损',tif:'有效方式',authorizedUsers:'授权成员',threshold:'签名阈值'};
const values:Record<string,string>={Mainnet:'主网',Testnet:'测试网',disabled:'独立账户',unifiedAccount:'统一账户',portfolioMargin:'组合保证金',i:'独立账户',u:'统一账户',p:'组合保证金',supply:'出借',borrow:'借入',repay:'偿还',deposit:'存入',withdraw:'取出',na:'普通订单',normalTpsl:'关联止盈止损',positionTpsl:'仓位止盈止损',tp:'止盈',sl:'止损',Alo:'只挂单',Ioc:'立即成交或取消',Gtc:'持续有效',FrontendMarket:'市价立即执行',spot:'现货'};
function readable(v:any,context=''):string{
 if(v===null)return '无';if(typeof v==='boolean')return v?'是':'否';
 if(Array.isArray(v))return v.map((x,i)=>`${i+1}. ${readable(x,context)}`).join('\n');
 if(v&&typeof v==='object')return Object.entries(v).map(([k,x])=>{
  if(context==='builder')return k==='b'?'开发者地址：'+x:'手续费率：'+decimalUnits(BigInt(String(x)),4)+'%';
  if(context==='grouping'&&k==='p')return '订单优先费率：'+decimalUnits(BigInt(String(x)),6)+'%';
  const label=context==='twap'&&k==='t'?'随机执行时间':context==='details'?(k==='t'?'触发条件':'终止价格'):context==='details.t'?(k==='a'?'高于触发价格时启动':'触发价格'):labels[k]??k;
  return `${label}：${readable(x,context==='details'?context+'.'+k:k)}`;
 }).join('\n');
 return values[String(v)]??String(v??'');
}
function decimalUnits(value:bigint,places:number){const sign=value<0n?'-':'';const n=(value<0n?-value:value).toString().padStart(places+1,'0');return sign+n.slice(0,-places)+(n.slice(-places).replace(/0+$/,'')?'.'+n.slice(-places).replace(/0+$/,''):'');}
export function actionView(a:Action){
 const rows:[string,string][]=[];
 for(const [k,v] of Object.entries(a)){
  if(['type','hyperliquidChain','signatureChainId','nonce'].includes(k)||v===undefined)continue;
  if(k==='time'&&['usdSend','spotSend','withdraw3'].includes(a.type))continue;
  const val=k==='signers'?JSON.parse(v):v;
  const label=k==='a'&&['modify','batchModify'].includes(a.type)?'撤单后始终下新订单':k==='t'&&a.type==='twapCancel'?'分批订单编号':k==='builder'&&typeof v==='object'?'开发者手续费':['usd','initialUsd','ntli','wei'].includes(k)?({usd:'金额',initialUsd:'初始金额',ntli:'保证金变更',wei:'数量'} as any)[k]:labels[k]??k;
  let text=readable(val,k);
  if(k==='wei'){text=decimalUnits(BigInt(v),8)+' HYPE';}
  if(['usd','initialUsd','ntli'].includes(k))text=decimalUnits(BigInt(v),6)+' USDC';
  if(k==='ntl'&&a.type==='hip3LiquidatorTransfer')text=decimalUnits(BigInt(v),6)+'（该市场报价资产）';
  if(a.type==='borrowLend'&&k==='amount'&&v===null)text='全部';
  rows.push([label,text]);
 }
 let title=ACTIONS[a.type]?.name??a.type;
 if(a.type==='tokenDelegate')title=a.isUndelegate?'解除质押委托':'委托质押';
 if(a.type==='approveAgent'&&/^0x0{40}$/i.test(a.agentAddress))title='撤销交易代理';
 if(a.type==='convertToMultiSigUser'&&JSON.parse(a.signers)===null)title='恢复为单签账户';
 const risk=a.type==='approveAgent'?'代理可以在协议允许的范围内交易，可能造成交易损失。':a.type==='convertToMultiSigUser'?'此操作会改变账户控制权，请核对新成员和签名阈值。':a.type==='approveBuilderFee'?'后续交易可能收取这里设置的开发者手续费。':a.type==='withdraw3'?'请核对外部接收地址，提现完成后无法撤销。':'';
 return {title,rows,risk};
}
