import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isolateProvider} from '../src/provider-isolation';
import {XProvider} from '../src/x-provider';
test('native connector cannot auto-reconnect during X mode; signer reads actual account; normal events resume outside X',async()=>{
 let active=false,current='0x'+'11'.repeat(20),autoConnects=0,changes=0;
 const listeners=new Map<string,Set<Function>>();
 const raw:any={request:async()=>[current],on:(e:string,f:Function)=>{if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e)!.add(f);},removeListener:(e:string,f:Function)=>listeners.get(e)?.delete(f)};
 const signer=isolateProvider(raw,()=>active);
 const callback=()=>{autoConnects++;};raw.on('accountsChanged',callback);raw.on('connect',()=>{changes++;});
 const emit=(e:string)=>{for(const f of listeners.get(e)??[])f([current]);};
 emit('accountsChanged');assert.equal(autoConnects,1);
 active=true;current='0x'+'22'.repeat(20);emit('accountsChanged');emit('connect');
 assert.equal(autoConnects,1);assert.equal(changes,0);
 assert.deepEqual(await raw.request({method:'eth_accounts'}),[]);
 assert.deepEqual(await signer.request({method:'eth_accounts'}),[current]);
 await assert.rejects(raw.request({method:'eth_requestAccounts'}),/Hyperclick 本地多签/);
 assert.deepEqual(await signer.request({method:'eth_requestAccounts'}),[current]);
 active=false;emit('accountsChanged');assert.equal(autoConnects,2);
 raw.removeListener('accountsChanged',callback);emit('accountsChanged');assert.equal(autoConnects,2);
});
test('X suppresses native auto-connect already during initial wallet setup and releases mode on rejected setup',async()=>{
 let x:XProvider;let auto=0;let handler:Function|undefined;
 const raw:any={request:async({method}:any)=>{if(method==='eth_requestAccounts'){handler?.();throw Error('user rejected');}return [];},on:(_e:string,f:Function)=>{handler=f;},removeListener:()=>{}};
 const signer=isolateProvider(raw,()=>x.managesWebpage());
 x=new XProvider('Mainnet',async()=>({provider:signer,brand:'okx'}));raw.on('accountsChanged',()=>auto++);
 await assert.rejects(x.request({method:'eth_requestAccounts'}),/rejected/);
 assert.equal(auto,0);assert.equal(x.managesWebpage(),false);
});
test('configurable getter-only wallet methods are supported and raw signing still reaches wallet',async()=>{
 let active=true,calls=0;const listeners=new Map<string,Function>();
 const methods={request:async()=>{calls++;return ['actual'];},on:(event:string,fn:Function)=>listeners.set(event,fn),removeListener:(event:string)=>listeners.delete(event)};
 const raw:any={};for(const [key,value] of Object.entries(methods))Object.defineProperty(raw,key,{get:()=>value,configurable:true});
 const signer=isolateProvider(raw,()=>active);
 assert.deepEqual(await raw.request({method:'eth_accounts'}),[]);assert.equal(calls,0);
 assert.deepEqual(await signer.request({method:'eth_requestAccounts'}),['actual']);assert.equal(calls,1);
 let changes=0;raw.on('accountsChanged',()=>changes++);listeners.get('accountsChanged')?.();assert.equal(changes,0);
 active=false;listeners.get('accountsChanged')?.();assert.equal(changes,1);
});
test('provider proxy which binds methods on reads does not cause false isolation failure',async()=>{
 const raw:any=new Proxy({request:async()=>['actual'],on:()=>{},removeListener:()=>{}},{get(target,key){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 const signer=isolateProvider(raw,()=>true);
 assert.deepEqual(await raw.request({method:'eth_accounts'}),[]);
 assert.deepEqual(await signer.request({method:'eth_requestAccounts'}),['actual']);
});
test('non-configurable readonly method fails before any partial patch',()=>{
 const request=async()=>[];const raw:any={request};
 Object.defineProperty(raw,'on',{value:()=>{},writable:false,configurable:false});
 assert.throws(()=>isolateProvider(raw,()=>true),/\[on\].*不可替换/);
 assert.equal(raw.request,request);
});
test('failed installation restores exact original getter descriptors',()=>{
 const target:any={};const getter=()=>async()=>[];
 Object.defineProperty(target,'request',{get:getter,configurable:true});
 target.on=()=>{};
 const raw=new Proxy(target,{defineProperty(t,k,d){if(k==='on')throw Error('denied');return Reflect.defineProperty(t,k,d);}});
 assert.throws(()=>isolateProvider(raw,()=>true),/\[on\]/);
 assert.equal(Object.getOwnPropertyDescriptor(target,'request')?.get,getter);
});
