import { existsSync,readdirSync,statSync } from 'node:fs';
import { basename,extname,join } from 'node:path';

const root=process.cwd();
const limits={
  prototype_js:250_000,
  prototype_css:150_000,
  client_js:650_000,
  server_cjs:2_100_000,
  production_css:100_000,
  runtime_total:3_000_000,
  server_source_map:4_000_000
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

const serverFile=files.find(x=>basename(x)==='server.cjs');
if(!serverFile)throw new Error('Production server bundle dist/server.cjs is missing.');
const serverMap=files.find(x=>basename(x)==='server.cjs.map');
const clientJs=files
  .filter(x=>extname(x)==='.js'&&x.includes(`${join('dist','assets')}`))
  .reduce((n,p)=>n+size(p),0);
const serverJs=size(serverFile);
const css=files.filter(x=>extname(x)==='.css').reduce((n,p)=>n+size(p),0);
const html=files.filter(x=>extname(x)==='.html').reduce((n,p)=>n+size(p),0);
const runtimeTotal=clientJs+serverJs+css+html;
const mapBytes=serverMap?size(serverMap):0;

if(clientJs>limits.client_js)throw new Error(`Client JS budget exceeded: ${clientJs} > ${limits.client_js}`);
if(serverJs>limits.server_cjs)throw new Error(`Server CJS budget exceeded: ${serverJs} > ${limits.server_cjs}`);
if(css>limits.production_css)throw new Error(`Production CSS budget exceeded: ${css} > ${limits.production_css}`);
if(runtimeTotal>limits.runtime_total)throw new Error(`Production runtime artifact budget exceeded: ${runtimeTotal} > ${limits.runtime_total}`);
if(mapBytes>limits.server_source_map)throw new Error(`Server source-map budget exceeded: ${mapBytes} > ${limits.server_source_map}`);

console.log('SPRINT 27 PERFORMANCE BUDGET PASSED',{
  prototype_js:docsJs,
  prototype_css:docsCss,
  client_js:clientJs,
  server_cjs:serverJs,
  production_css:css,
  production_html:html,
  runtime_total:runtimeTotal,
  server_source_map:mapBytes,
  note:'Browser/client and Node server bundles are budgeted separately; source maps are tracked separately from runtime payload.',
  limits
});
