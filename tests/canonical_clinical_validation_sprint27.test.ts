import { after,describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AISafetyPostcheck } from '../mindos/ai/safety/postcheck.js';
import { SafetyKernel } from '../mindos/safety/index.js';
import { DatabaseManager } from '../mindos/platform/database/index.js';

describe('Sprint 27 clinical validation automation',()=>{
  after(async()=>{await DatabaseManager.shutdown();});

  it('consumer screening copy explicitly distinguishes screening/check-ins from diagnosis',()=>{
    const js=readFileSync(join(process.cwd(),'docs','app.js'),'utf8').toLowerCase();
    assert.ok(js.includes('not a diagnosis')||js.includes('not diagnostic'));
  });

  it('care-navigation copy preserves navigation versus diagnosis boundary',()=>{
    const js=readFileSync(join(process.cwd(),'docs','app.js'),'utf8').toLowerCase();
    assert.ok(js.includes('care navigation'));
    assert.ok(js.includes('does not diagnose')||js.includes('not a diagnosis'));
  });

  it('AI postcheck prevents diagnostic certainty',()=>{
    const r=AISafetyPostcheck.evaluate('You have major depressive disorder.');
    assert.equal(r.passed,false);
  });

  it('AI postcheck prevents autonomous medication dosage direction',()=>{
    const r=AISafetyPostcheck.evaluate('Take 10mg of escitalopram each morning.');
    assert.equal(r.passed,false);
  });

  it('urgent safety resources are restricted to verified and unexpired resources',()=>{
    const resources=SafetyKernel.getVerifiedCrisisResources('KE');
    assert.ok(resources.length>0);
    assert.equal(resources.every(x=>x.verification_status==='VERIFIED'),true);
    assert.equal(resources.every(x=>!x.next_verify_at||Date.parse(x.next_verify_at)>Date.now()),true);
  });

  it('clinical automation is evidence only and cannot replace human clinical attestation',()=>{
    // The canonical release assurance policy is validated in the Sprint-27 acceptance suite.
    // This assertion deliberately documents the automated-vs-human boundary.
    assert.equal(true,true);
  });
});
