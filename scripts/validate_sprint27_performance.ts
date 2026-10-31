import { existsSync,readdirSync,statSync } from 'node:fs';
import { extname,join } from 'node:path';

const root=process.cwd();
const limits={
  prototype_js:250_000,
  prototype_css:150_000,
  production_js:2_000_000,
  production_css:750_000,
  production_total:5_000_000
};

const size=(p:string)=>statSync(p).size;
const docsJs=size(join(root,'docs','app.js'));
const docsCss=size(join(root,'docs','app.css'));
if(docsJs>limits.prototype_js)throw new Error(`Pages prototype JS budget exceeded: ${docsJs}`);
if(docsCss>limits.prototype_css)throw new Error(`Pages prototype CSS budget exceeded: ${docsCss}`);

const dist=join(root,'dist');
if(!existsSync(dist))throw new Error('Production bundle missing; run build before Sprint 27 performance gate.');
const files:string[]=[];
const walk=(dir:string)=>{for(const name of readdirSync(dir)){const p=join(dir,name);const s=statSync(p);if(s.isDirectory())walk(p);else files.push(p);}};
walk(dist);
const js=files.filter(x=>['.js','.cjs'].includes(extname(x))).reduce((n,p)=>n+size(p),0);
const css=files.filter(x=>extname(x)==='.css').reduce((n,p)=>n+size(p),0);
const total=files.reduce((n,p)=>n+size(p),0);
if(js>limits.production_js)throw new Error(`Production JS budget exceeded: ${js}`);
if(css>limits.production_css)throw new Error(`Production CSS budget exceeded: ${css}`);
if(total>limits.production_total)throw new Error(`Production artifact budget exceeded: ${total}`);
console.log('SPRINT 27 PERFORMANCE BUDGET PASSED',{prototype_js:docsJs,prototype_css:docsCss,production_js:js,production_css:css,production_total:total,limits});
