import {build} from 'esbuild';
import {mkdir,cp,rm,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
const inputs=new Set();
for(const name of ['page','content','background','panel']){
 const result=await build({entryPoints:[`src/${name}.ts`],outfile:`dist/${name}.js`,bundle:true,format:name==='background'?'esm':'iife',platform:'browser',target:'chrome120',minify:true,legalComments:'eof',metafile:true,define:{'process.env.NODE_ENV':'"production"'}});
 for(const output of Object.values(result.metafile.outputs))for(const [input,info] of Object.entries(output.inputs))if(info.bytesInOutput>0&&input.includes('node_modules/'))inputs.add(input);
}
const packages=new Map();
for(const input of inputs){
 let dir=dirname(resolve(input));
 while(dir!==dirname(dir)){
  try{const p=JSON.parse(await readFile(dir+'/package.json','utf8'));if(p.name){packages.set(p.name+'@'+p.version,{dir,p});break;}}catch{}
  dir=dirname(dir);
 }
}
const notices=[];
for(const [name,{dir,p}] of [...packages].sort(([a],[b])=>a.localeCompare(b))){
 const files=(await readdir(dir)).filter(f=>/^licen[cs]e(?:\.|$)/i.test(f));
 if(!files.length)throw Error('缺少第三方许可：'+name);
 notices.push('=== '+name+' · '+p.license+' ===\n\n'+(await Promise.all(files.map(f=>readFile(dir+'/'+f,'utf8')))).join('\n'));
}
if([...inputs].some(input=>input.includes('/_deps/jsr.io/@std/'))){
 const mit=await readFile('node_modules/@nktkas/hyperliquid/LICENSE','utf8');
 notices.push('=== Deno standard library · MIT ===\n\n'+mit.replace(/^Copyright.*$/m,'Copyright (c) 2018-2025 the Deno authors'));
}
const text='Hyperclick 构建内第三方组件许可（保留许可原文）\n\n'+notices.join('\n\n');
await writeFile('THIRD_PARTY_NOTICES.txt',text);await writeFile('dist/THIRD_PARTY_NOTICES.txt',text);
console.log('已构建 Chrome/Edge 扩展：dist/');
