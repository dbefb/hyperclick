import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AccountGuard} from '../src/account-guard';
const m='0x'+'1'.repeat(40),a='0x'+'2'.repeat(40);
function provider(initial:string[]){let accounts=initial;const listeners=new Set<(v:any)=>void>();const methods:string[]=[];return {methods,provider:{request:async({method}:any)=>{methods.push(method);assert.equal(method,'eth_accounts');return accounts;},on:(_e:string,fn:(v:any)=>void)=>{listeners.add(fn);},removeListener:(_e:string,fn:(v:any)=>void)=>{listeners.delete(fn);}},change:(next:string[])=>{accounts=next;for(const fn of listeners)fn(next);}};}
test('blocks a plugin exposing M, uses only read-only account inspection and never suppresses changes',async()=>{
  const okx=provider([m]);const other=provider([]);const g=new AccountGuard(m,()=>[{provider:okx.provider,brand:'okx'},{provider:other.provider,brand:'onekey'}]);
  assert.deepEqual(await g.check(),{broken:false,blocked:['okx'],unknown:[]});
  okx.change([a]);assert.equal((await g.check()).broken,true);
  okx.change([m]);assert.equal((await g.check()).broken,true,'switching back must not revive a stale webpage request');
  assert.ok(okx.methods.every(x=>x==='eth_accounts'));g.close();
});
test('M via independent connection permits unconnected injected wallets; failed inspection fails closed',async()=>{
  const okx=provider([]);const g=new AccountGuard(m,()=>[{provider:okx.provider,brand:'okx'}]);
  assert.deepEqual(await g.check(),{broken:false,blocked:[],unknown:[]});
  const bad=new AccountGuard(m,()=>[{brand:'onekey',provider:{request:async()=>{throw Error('locked');}}}]);
  assert.deepEqual(await bad.check(),{broken:false,blocked:[],unknown:['onekey']});
});
