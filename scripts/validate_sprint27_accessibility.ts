import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html=readFileSync(join(process.cwd(),'docs','index.html'),'utf8');
const css=readFileSync(join(process.cwd(),'docs','app.css'),'utf8');
const js=readFileSync(join(process.cwd(),'docs','app.js'),'utf8');

const checks:Array<[string,boolean]>=[
  ['HTML language declared',/<html\s+lang=["'][a-z-]+["']/i.test(html)],
  ['Responsive viewport declared',/<meta\s+name=["']viewport["']/i.test(html)],
  ['Skip navigation link present',/class=["']skip-link["'][^>]*href=["']#main-content["']/i.test(js)],
  ['Main landmark has stable target',/id=["']main-content["']/i.test(js)&&/<main/i.test(js)],
  ['Visible keyboard focus rule exists',/:focus-visible/i.test(css)],
  ['Reduced motion preference supported',/prefers-reduced-motion/i.test(css)],
  ['Modal declares dialog semantics',/role=["']dialog["']/i.test(js)&&/aria-modal=["']true["']/i.test(js)],
  ['Modal supports Escape close',/e\.key===['"]Escape['"]/i.test(js)],
  ['Workspace role toggles expose pressed state',/aria-pressed=/i.test(js)],
  ['Current navigation exposes aria-current',/aria-current=["']page["']/i.test(js)],
  ['AI composer has accessible name',/aria-label=["']Message MindOS companion["']/i.test(js)],
  ['Care composer has accessible name',/aria-label=["']Message your care team["']/i.test(js)],
  ['No positive tabindex',!/tabindex=["'][1-9]/i.test(html+js)],
  ['Screening copy distinguishes diagnosis',/not a diagnosis/i.test(js)||/not diagnostic/i.test(js)]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} accessibility: ${name}`);
if(failed.length)throw new Error(`Sprint 27 accessibility gate failed: ${failed.map(x=>x[0]).join('; ')}`);
console.log(`SPRINT 27 ACCESSIBILITY BASELINE PASSED (${checks.length}/${checks.length})`);
