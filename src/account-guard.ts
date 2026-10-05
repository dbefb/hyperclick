import {readAccounts,type Provider,type Brand} from './providers';
export class AccountGuard {
  private tracked=new Map<Provider,{brand:Brand;listener:(v:any)=>void}>();
  private broken=false;
  constructor(private m:string,private discover:()=>{provider:Provider;brand:Brand}[]){this.m=m.toLowerCase();}
  private contains(accounts:any){return Array.isArray(accounts)&&accounts.some(a=>String(a).toLowerCase()===this.m);}
  async check(){
    const blocked=new Set<Brand>();const unknown=new Set<Brand>();
    await Promise.all(this.discover().map(async({provider,brand})=>{
      try{
        const accounts=await readAccounts(provider);
        if(!Array.isArray(accounts))throw Error('invalid accounts');
        if(this.contains(accounts)){
          blocked.add(brand);
          if(!this.tracked.has(provider)){
            const first=String(accounts[0]).toLowerCase();
            const listener=(next:any)=>{if(!Array.isArray(next)||String(next[0]).toLowerCase()!==first)this.broken=true;};
            provider.on?.('accountsChanged',listener);this.tracked.set(provider,{brand,listener});
          }
        }else if(this.tracked.has(provider))this.broken=true;
      }catch{unknown.add(brand);if(this.tracked.has(provider))this.broken=true;}
    }));
    return {broken:this.broken,blocked:[...blocked],unknown:[...unknown]};
  }
  close(){for(const [p,t] of this.tracked)p.removeListener?.('accountsChanged',t.listener);this.tracked.clear();}
}
