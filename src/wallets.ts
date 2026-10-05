import { assert, type Address, type Typed } from './core';
import type { Hex } from 'viem';
export type Rpc = (type:string,payload?:Record<string,unknown>)=>Promise<any>;
export type Wallet = {label:string;sign:(data:Typed,phase:'inner'|'outer')=>Promise<Hex>;close?:()=>Promise<void>};
export type WalletFactory = (expected:Address,route:string,rpc:Rpc)=>Promise<Wallet>;
export const connectWallet:WalletFactory=async(expected,route,rpc)=>{
  const job=await rpc('GET');
  if(route==='plugin:onekey'||route==='plugin:okx'){
    assert(job.localMode,'本地插件签署需要网页连接 Hyperclick：取消本次提案，断开网页钱包，选择 Hyperclick后重试');
    return {label:route==='plugin:okx'?'OKHyperclick 本地插件':'OneKey 本地插件',sign:async(_data,phase)=>{
      const result=await rpc('LOCAL_SIGN',{brand:route.slice(7),address:expected,phase});return result.signature as Hex;
    }};
  }
  throw Error('请选择 OneKey 或 OKX Wallet 浏览器插件');
};
