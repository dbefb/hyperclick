import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submissionResult} from '../src/response';
test('accepted orders, partial failures and unexpected replies are distinguished',()=>{
 const classify=(type:string,response:any)=>submissionResult({type},{status:'ok',response});
 assert.equal(classify('order',{type:'order',data:{statuses:[{resting:{oid:12}}]}}).status,'success');
 assert.equal(classify('order',{type:'order',data:{statuses:[{resting:{oid:12}},{error:'insufficient margin'}]}}).status,'failed');
 assert.equal(classify('twapOrder',{type:'twapOrder',data:{status:{error:'invalid size'}}}).status,'failed');
 assert.equal(classify('order',{type:'default'}).status,'unknown');
 assert.equal(classify('order',{type:'order',data:{statuses:[{futureStatus:{}}]}}).status,'unknown');
 assert.equal(classify('createVault',{type:'createVault',data:'bad address'}).status,'unknown');
 assert.equal(classify('createSubAccount',{type:'createSubAccount',data:'0x'+'11'.repeat(20)}).status,'success');
 assert.equal(classify('withdraw3',{type:'default'}).status,'success');
});
