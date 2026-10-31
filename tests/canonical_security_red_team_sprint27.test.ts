import { after,beforeEach,describe,it } from 'node:test';
import assert from 'node:assert/strict';

import { AISafetyPostcheck } from '../mindos/ai/safety/postcheck.js';
import { AIContextFirewall } from '../mindos/ai/context/firewall.js';
import { sensitiveRedactor } from '../mindos/platform/observability/redactor.js';
import { Logger } from '../mindos/platform/observability/logger.js';
import { FeatureFlagService } from '../mindos/platform/features/index.js';
import { ReleaseGateService } from '../mindos/governance/release_gates.js';
import { DatabaseManager } from '../mindos/platform/database/index.js';
import { configureSprint27Runtime,resetSprint27RuntimeForTesting } from '../mindos/sprint27/runtime.js';

describe('Sprint 27 security/red-team validation',()=>{
  beforeEach(()=>{
    resetSprint27RuntimeForTesting();configureSprint27Runtime({usePostgres:false});
    FeatureFlagService.resetForTesting();delete process.env.STRICT_RELEASE_ASSURANCE;
  });
  after(async()=>{delete process.env.STRICT_RELEASE_ASSURANCE;await DatabaseManager.shutdown();});

  it('redacts bearer tokens, email addresses and clinical fields from observability payloads',()=>{
    const v=sensitiveRedactor.redactObject({
      email:'person@example.com',authorization:'Bearer abc.def.ghi',clinical_note:'private',safe_code:'SEC_001'
    });
    const s=JSON.stringify(v);
    assert.equal(s.includes('person@example.com'),false);
    assert.equal(s.includes('abc.def.ghi'),false);
    assert.equal(s.includes('private'),false);
    assert.equal(s.includes('SEC_001'),true);
  });

  it('neutralizes log-injection newlines in attacker-controlled messages',()=>{
    const logger=new Logger('red-team');
    const original=console.log;console.log=()=>{};
    try{
      const entry=logger.info('attacker@example.com\n{"level":"error","forged":true}');
      assert.equal(entry.message.includes('\n'),false);
      assert.equal(entry.message.includes('attacker@example.com'),false);
    }finally{console.log=original;}
  });

  it('strips prohibited diagnosis and prescription context before AI execution',()=>{
    const r=AIContextFirewall.filterContext({userId:'rt',purpose:'support',rawContext:{
      clinical_diagnosis:'secret',medication_dose:'50mg',safe_preference:'English'
    }});
    assert.equal(r.allowedContext.clinical_diagnosis,undefined);
    assert.equal(r.allowedContext.medication_dose,undefined);
    assert.equal(r.allowedContext.safe_preference,'English');
  });

  it('blocks a model output that tries to diagnose',()=>{
    assert.equal(AISafetyPostcheck.evaluate('I diagnose you with bipolar disorder.').passed,false);
  });

  it('blocks a model output that tries to prescribe a dosage',()=>{
    assert.equal(AISafetyPostcheck.evaluate('Increase your fluoxetine dose to 40mg.').passed,false);
  });

  it('emergency kill switch overrides normal feature configuration',()=>{
    assert.equal(FeatureFlagService.isEnabled('ai.companion_generative_responses',{environment:'test',jurisdiction:'KE'}),true);
    FeatureFlagService.triggerEmergencyKill('ai.companion_generative_responses','red-team containment','security-red-team');
    assert.equal(FeatureFlagService.isEnabled('ai.companion_generative_responses',{environment:'test',jurisdiction:'KE'}),false);
  });

  it('production release gate denies activation when strict release assurance has no certification',async()=>{
    process.env.STRICT_RELEASE_ASSURANCE='true';
    const r=await ReleaseGateService.evaluateGate({releaseId:'red-team-no-cert',environment:'production',buildSha:'a'.repeat(40)});
    assert.equal(r.can_activate,false);
  });
});
