export function masterNotice(doc:Document,message:string,ready=false){
 let box=doc.getElementById('hyperclick-master-notice');
 if(!box){
  box=doc.createElement('div');box.id='hyperclick-master-notice';box.setAttribute('role','alert');
  box.style.cssText='position:fixed;right:20px;top:90px;z-index:2147483647;max-width:min(400px,calc(100vw - 40px));padding:18px;border-radius:12px;border:1px solid #ba8a46;box-shadow:0 8px 32px #0008;font:15px/1.6 sans-serif;overflow-wrap:anywhere';
  const text=doc.createElement('div');text.dataset.message='true';box.append(text);
  const close=doc.createElement('button');close.textContent='知道了';close.style.cssText='margin-top:10px;padding:5px 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer';close.onclick=()=>box?.remove();box.append(close);
  doc.documentElement.append(box);
 }
 box.style.background=ready?'#103329':'#362b19';box.style.color=ready?'#b9fce6':'#ffe0a8';
 box.querySelector('[data-message]')!.textContent=message;
}
