import {ACTIONS,canonicalAction,userSigned,userMessage,validateAction,type Action} from './actions';
import { exchangeNetwork } from './endpoints';
import { encode } from '@msgpack/msgpack';
import { concat, hashTypedData, hexToBytes, keccak256, recoverTypedDataAddress, toHex, type Hex } from 'viem';

export type Address = `0x${string}`;
export type Chain = 'Mainnet' | 'Testnet';
export type Signature = { r: Hex; s: Hex; v: number };
export type ApproveAgent = {
  type: 'approveAgent'; hyperliquidChain: Chain; signatureChainId: Hex;
  agentAddress: Address; agentName?: string | null; nonce: number;
};
export type Config = { authorizedUsers: Address[]; threshold: number };
export type Capture = { action: Action; nonce: number; signature: Signature; network?:Chain; vaultAddress?: Address | null; expiresAfter?: number | null; isFrontend?: boolean };
export type MultiAction = {
  type: 'multiSig'; signatureChainId: Hex; signatures: Signature[];
  payload: { multiSigUser: Address; outerSigner: Address; action: Action };
};
export type Typed = { domain: { name: string; version: string; chainId: number; verifyingContract: Address }; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> };
export const API = { Mainnet: 'https://api.hyperliquid.xyz', Testnet: 'https://api.hyperliquid-testnet.xyz' } as const;
export const MAX_AGE = 20 * 60_000;
export const ZERO = '0x0000000000000000000000000000000000000000' as Address;
export function assert(ok: unknown, message: string): asserts ok { if (!ok) throw Error(message); }
export function address(value: unknown): Address {
  assert(typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value), '地址格式无效');
  return value.toLowerCase() as Address;
}
export function validateConfig(value: unknown): Config | null {
  if (value === null) return null;
  const v = value as Config;
  assert(v && Array.isArray(v.authorizedUsers), '无法确认链上多签成员');
  const users = v.authorizedUsers.map(address);
  assert(users.length > 0 && users.length <= 10 && new Set(users).size === users.length, '多签成员配置无效');
  assert(Number.isInteger(v.threshold) && v.threshold >= 1 && v.threshold <= users.length, '多签阈值无效');
  return { authorizedUsers: users, threshold: v.threshold };
}
export function fresh(nonce: number, now = Date.now()) {
  assert(Number.isSafeInteger(nonce) && nonce <= now + 60_000 && nonce >= now - MAX_AGE, '提案已过期或时钟不正确，请取消后重新发起操作');
}
export function networkOf(c:Capture):Chain {
  const n=c.network??c.action.hyperliquidChain;assert(n==='Mainnet'||n==='Testnet','缺少操作网络');return n;
}
export function validateCapture(value: unknown, endpoint: string, now = Date.now()): Capture {
  const v = value as Capture;
  assert(v && typeof v === 'object' && v.action, '缺少操作请求');
  const network=exchangeNetwork(endpoint);assert(network,'来源接口无效');
  validateAction(v.action);
  assert(Object.keys(v).every(k=>['action','signature','nonce','vaultAddress','expiresAfter','isFrontend'].includes(k)),'未知请求字段，停止适配');
  if(userSigned(v.action)){
    assert(v.action.hyperliquidChain===network,'页面网络与操作网络不一致');
    assert(typeof v.action.signatureChainId==='string'&&/^0x[0-9a-f]+$/i.test(v.action.signatureChainId)&&Number.isSafeInteger(Number(v.action.signatureChainId))&&Number(v.action.signatureChainId)>0,'签名链编号无效');
    assert(v.vaultAddress==null&&v.expiresAfter==null,'此类操作不支持金库上下文或失效时间');
    assert((v.action.nonce??v.action.time)===v.nonce,'内外随机数不一致');
  }else{
    if(v.vaultAddress!=null){assert(ACTIONS[v.action.type].vault,'此操作不支持金库上下文');address(v.vaultAddress);}
    if(v.expiresAfter!=null){assert(ACTIONS[v.action.type].expiry,'此操作不支持失效时间');assert(Number.isSafeInteger(v.expiresAfter)&&v.expiresAfter>now,'操作已超过失效时间');}
    if(v.action.nonce!==undefined)assert(v.action.nonce===v.nonce,'内外随机数不一致');
  }
  fresh(v.nonce,now);signatureHex(v.signature);
  return {...structuredClone(v),...(!userSigned(v.action)?{network}:{})};
}
const EIP_DOMAIN = [
  {name:'name',type:'string'},{name:'version',type:'string'},
  {name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}
];
function typed(chainId:Hex, primaryType:string, fields:{name:string;type:string}[], message:Record<string,unknown>):Typed {
 return {domain:{name:'HyperliquidSignTransaction',version:'1',chainId:Number(chainId),verifyingContract:ZERO},types:{EIP712Domain:EIP_DOMAIN,[primaryType]:fields},primaryType,message};
}
export function originalTyped(a:Action):Typed {
 const spec=ACTIONS[a.type];assert(spec?.primary&&spec.fields,'操作采用哈希签名，需要完整请求');
 return typed(a.signatureChainId,spec.primary,spec.fields,userMessage(a));
}
export function l1Typed(action:unknown,c:Pick<Capture,'nonce'|'vaultAddress'|'expiresAfter'>,network:Chain):Typed {
 return {domain:{name:'Exchange',version:'1',chainId:1337,verifyingContract:ZERO},types:{EIP712Domain:EIP_DOMAIN,Agent:[{name:'source',type:'string'},{name:'connectionId',type:'bytes32'}]},primaryType:'Agent',message:{source:network==='Mainnet'?'a':'b',connectionId:actionHash(action,c.nonce,c.vaultAddress,c.expiresAfter)}};
}
export function originalCaptureTyped(c:Capture):Typed {return userSigned(c.action)?originalTyped(c.action):l1Typed(c.action,c,networkOf(c));}
export function innerTyped(a:Action,m:Address,leader:Address,c?:Capture):Typed {
 if(!userSigned(a)){assert(c,'缺少完整操作请求');return l1Typed([address(m),address(leader),canonicalAction(a)],c,networkOf(c));}
 const spec=ACTIONS[a.type];const fields=spec.fields!.flatMap(f=>f.name==='hyperliquidChain'?[f,{name:'payloadMultiSigUser',type:'address'},{name:'outerSigner',type:'address'}]:[f]);
 return typed(a.signatureChainId,spec.primary!,fields,{...userMessage(a),payloadMultiSigUser:address(m),outerSigner:address(leader)});
}
export function signatureHex(s: Signature): Hex {
  assert(s && /^0x[0-9a-f]{1,64}$/i.test(s.r) && /^0x[0-9a-f]{1,64}$/i.test(s.s) && [27,28].includes(s.v), '签名格式错误');
  return (s.r.slice(2).padStart(64,'0') + s.s.slice(2).padStart(64,'0') + s.v.toString(16)).replace(/^/,'0x') as Hex;
}
export function signatureParts(hex: Hex): Signature {
  assert(/^0x[0-9a-f]{130}$/i.test(hex), '钱包未返回标准 ECDSA 签名');
  let v = parseInt(hex.slice(130),16); if(v < 2) v += 27;
  assert([27,28].includes(v), '不支持该签名格式');
  return { r:('0x'+BigInt('0x'+hex.slice(2,66)).toString(16)) as Hex,s:('0x'+BigInt('0x'+hex.slice(66,130)).toString(16)) as Hex,v };
}
export async function recover(data: Typed, hex: Hex): Promise<Address> {
  return address(await recoverTypedDataAddress({...data,signature:hex} as any));
}
export function actionHash(a:unknown,nonce:number,vaultAddress?:Address|null,expiresAfter?:number|null):Hex {
 const chunks:Uint8Array[]=[encode(a),hexToBytes(toHex(BigInt(nonce),{size:8}))];
 chunks.push(new Uint8Array([vaultAddress?1:0]));if(vaultAddress)chunks.push(hexToBytes(address(vaultAddress)));
 if(expiresAfter!=null)chunks.push(new Uint8Array([0]),hexToBytes(toHex(BigInt(expiresAfter),{size:8})));
 return keccak256(concat(chunks));
}
export function canonicalApproveAgent(a:ApproveAgent):ApproveAgent {return canonicalAction(a) as ApproveAgent;}
export function envelope(action:Action,m:Address,leader:Address,signatures:Signature[],network:Chain='Mainnet'):MultiAction {
 return {type:'multiSig',signatureChainId:action.signatureChainId??(network==='Mainnet'?'0x3e7':'0x3e6'),signatures,payload:{multiSigUser:address(m),outerSigner:address(leader),action:canonicalAction(action)}};
}
export function outerTyped(a:MultiAction,nonce:number,c?:Capture):Typed {
 const {type:_,...withoutTag}=a;
 const network=c?networkOf(c):a.payload.action.hyperliquidChain;
 assert(network==='Mainnet'||network==='Testnet','缺少外层签署网络');
 return typed(a.signatureChainId,'HyperliquidTransaction:SendMultiSig',[{name:'hyperliquidChain',type:'string'},{name:'multiSigActionHash',type:'bytes32'},{name:'nonce',type:'uint64'}],{hyperliquidChain:network,multiSigActionHash:actionHash(withoutTag,nonce,c?.vaultAddress,c?.expiresAfter),nonce});
}
export function captureKey(c:Capture):Hex {return actionHash(c.action,c.nonce,c.vaultAddress,c.expiresAfter);}
export function freshCapture(c:Capture){fresh(c.nonce);if(c.expiresAfter!=null)assert(c.expiresAfter>Date.now(),'操作已过期，请重新发起');}
export function digest(t: Typed): Hex { return hashTypedData(t as any); }
export function configKey(c: Config): string { return JSON.stringify({users:[...c.authorizedUsers].sort(),threshold:c.threshold}); }

export class Proposal {
  readonly capture: Capture; readonly m: Address; readonly config: Config;
  leader?: Address; signatures: Record<string,Hex> = {}; locked = false;
  constructor(capture:Capture,m:Address,config:Config) { this.capture=structuredClone(capture); this.m=address(m); this.config=structuredClone(config); }
  setLeader(next: Address) {
    assert(!this.locked,'已进入最终提交阶段');
    const l=address(next); assert(this.config.authorizedUsers.includes(l),'提交人 不是授权成员');
    if(this.leader!==l) this.signatures={}; this.leader=l;
  }
  inner(): Typed { assert(this.leader,'请先确定 提交人'); return innerTyped(this.capture.action,this.m,this.leader,this.capture); }
  async add(signer: Address, sig: Hex) {
    assert(!this.locked,'已进入最终提交阶段'); freshCapture(this.capture);
    const a=address(signer); assert(this.config.authorizedUsers.includes(a),'地址不属于多签成员');
    assert(await recover(this.inner(),sig)===a,'签名地址不匹配，或签名内容被改变');
    this.signatures[a]=sig;
  }
  multi(): MultiAction {
    assert(this.leader,'缺少 提交人'); freshCapture(this.capture);
    const sigs=this.config.authorizedUsers.filter(a=>this.signatures[a]).map(a=>signatureParts(this.signatures[a]));
    assert(sigs.length>=this.config.threshold,'签名数未达到阈值');
    return envelope(this.capture.action,this.m,this.leader,sigs,networkOf(this.capture));
  }
}
