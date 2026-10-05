import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

// 图标仅在开发时生成，需要开发工具 sharp，生产构建和扩展不依赖它。
const source=await readFile(new URL('../src/brand.ts',import.meta.url),'utf8');
const svg=JSON.parse(source.match(/HYPERCLICK_ICON_SVG = (".*");/)[1]);
const dir=new URL('../public/icons/',import.meta.url);
await mkdir(dir,{recursive:true});
await writeFile(new URL('hyperclick.svg',dir),svg+'\n');
for(const size of [16,32,48,128,512]){
  await sharp(Buffer.from(svg),{density:768}).resize(size,size).png().toFile(new URL(`${size}.png`,dir).pathname);
}
console.log('已生成 Hyperclick SVG 和 16/32/48/128/512 像素图标。');
