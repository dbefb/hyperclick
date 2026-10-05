import type {Action} from './actions';
type Result={status:'success'|'failed'|'unknown';error?:string};
// 节点接收请求不等于所有子操作成功，必须核对逐项状态。
export function submissionResult(action:Action,result:any):Result{
 const unknown:Result={status:'unknown',error:'返回结果无法确认，请核对原网页或链上状态，勿重复提交。'};
 if(result?.status==='err')return {status:'failed',error:typeof result.response==='string'?result.response:JSON.stringify(result.response)};
 if(result?.status!=='ok'||!result.response)return unknown;
 const response=result.response,type=response.type;
 const expected:Record<string,string[]>={order:['order'],cancel:['cancel'],cancelByCloid:['cancel'],modify:['default','order'],batchModify:['order','default'],twapOrder:['twapOrder'],twapCancel:['twapCancel'],createVault:['createVault'],createSubAccount:['createSubAccount']};
 if(!(expected[action.type]??['default']).includes(type))return unknown;
 if(type==='default')return {status:'success'};
 if(type==='createVault'||type==='createSubAccount')return /^0x[0-9a-f]{40}$/i.test(response.data)?{status:'success'}:unknown;
 const statuses=type==='order'||type==='cancel'?response.data?.statuses:[response.data?.status];
 if(!Array.isArray(statuses)||!statuses.length)return unknown;
 const errors=statuses.filter(s=>typeof s?.error==='string').map(s=>s.error);
 if(errors.length)return {status:'failed',error:'存在失败项，请核对原网页的逐项结果：'+errors.join('；')};
 const valid=statuses.every(s=>type==='cancel'||type==='twapCancel'?s==='success':type==='twapOrder'?Number.isSafeInteger(s?.running?.twapId):s==='waitingForFill'||s==='waitingForTrigger'||Number.isSafeInteger(s?.resting?.oid)||Number.isSafeInteger(s?.filled?.oid));
 return valid?{status:'success'}:unknown;
}
