import { after,beforeEach,describe,it } from 'node:test';
import assert from 'node:assert/strict';

import { AISafetyPostcheck } from '../mindos/ai/safety/postcheck.js';
import { AIContextFirewall } from '../mindos/ai/context/firewall.js';
import { DatabaseManager } from '../mindos/platform/database/index.js';
import { AuthorizationError,DomainInvariantError } from '../mindos/platform/errors/index.js';
import { ReleaseGateService } from '../mindos/governance/release_gates.js';
import {
  ReleaseAssuranceService,ValidationAttestationPolicy,ValidationEvidenceService,ValidationRiskClassifier
} from '../mindos/validation/index.js';
import { configureSprint27Runtime,resetSprint27RuntimeForTesting } from '../mindos/sprint27/runtime.js';

const build='a'.repeat(40);

async function candidateA(id='release-a'){
  return ReleaseAssuranceService.createCandidate({
    release_id:id,version:'27.0.0',build_sha:build,environment:'production',initiator_id:'author-1',
    feature_keys:['safety','ai','clinical'],
    risk_signals:{safety_critical:true,authorization_or_consent:true,clinical_governance:true,ai_governance:true,professional_verification:true}
  });
}

describe('MindOS Sprint 27 — Validation & Release Assurance',()=>{
  beforeEach(()=>{
    resetSprint27RuntimeForTesting();
    configureSprint27Runtime({usePostgres:false});
    delete process.env.STRICT_RELEASE_ASSURANCE;
  });
  after(async()=>{
    resetSprint27RuntimeForTesting();
    delete process.env.STRICT_RELEASE_ASSURANCE;
    await DatabaseManager.shutdown();
  });

  it('classifies safety/authz/clinical/AI governance releases as Risk Class A',()=>{
    assert.equal(ValidationRiskClassifier.classify({safety_critical:true}),'A');
    assert.equal(ValidationRiskClassifier.classify({authorization_or_consent:true}),'A');
    assert.equal(ValidationRiskClassifier.classify({clinical_governance:true}),'A');
    assert.equal(ValidationRiskClassifier.classify({ai_governance:true}),'A');
  });

  it('requires deep validation gates for a Risk Class A release',async()=>{
    const c=await candidateA();
    for(const gate of ['AUTOMATED_QA','SECURITY_RED_TEAM','CLINICAL','AI_SAFETY','PRIVACY_DPIA','KENYA_REGULATORY','ACCESSIBILITY','PERFORMANCE','RELIABILITY_DR','INCIDENT_READINESS']){
      assert.ok(c.required_gates.includes(gate as any),gate);
    }
  });

  it('does not require clinical/regulatory human gates for cosmetic-only Risk Class D changes',()=>{
    const risk=ValidationRiskClassifier.classify({cosmetic_only:true});
    assert.equal(risk,'D');
    assert.deepEqual(ValidationRiskClassifier.requiredGates(risk,{cosmetic_only:true}),['AUTOMATED_QA','ACCESSIBILITY']);
  });

  it('AI safety postcheck rejects diagnostic declarations',()=>{
    const result=AISafetyPostcheck.evaluate('I diagnose you with depression.');
    assert.equal(result.passed,false);
    assert.ok(result.violation_reasons.some(x=>x.includes('DIAGNOSTIC')));
  });

  it('AI safety postcheck rejects prescription/dosage directions',()=>{
    const result=AISafetyPostcheck.evaluate('You should take 20mg of sertraline daily.');
    assert.equal(result.passed,false);
    assert.ok(result.violation_reasons.some(x=>x.includes('PRESCRIPTION')));
  });

  it('AI context firewall strips diagnosis/prescription records before model context',()=>{
    const result=AIContextFirewall.filterContext({
      userId:'u1',purpose:'support',rawContext:{diagnosis:'private',prescription:'private',preferred_language:'en'}
    });
    assert.equal('diagnosis' in result.allowedContext,false);
    assert.equal('prescription' in result.allowedContext,false);
    assert.equal(result.allowedContext.preferred_language,'en');
  });

  it('binds automated evidence to the exact candidate build SHA',async()=>{
    await candidateA();
    await assert.rejects(()=>ValidationEvidenceService.recordAutomated({
      release_id:'release-a',build_sha:'b'.repeat(40),gate:'AUTOMATED_QA',status:'PASS',
      evidence_type:'CI',source:'test',summary:{tests:1}
    }),DomainInvariantError);
  });

  it('rejects raw sensitive text fields from release evidence summaries',async()=>{
    await candidateA();
    await assert.rejects(()=>ValidationEvidenceService.recordAutomated({
      release_id:'release-a',build_sha:build,gate:'AUTOMATED_QA',status:'PASS',
      evidence_type:'CI',source:'test',summary:{clinical_note:'private note'}
    }),DomainInvariantError);
  });

  it('does not allow PASS evidence with unresolved critical findings',async()=>{
    await candidateA();
    await assert.rejects(()=>ValidationEvidenceService.recordAutomated({
      release_id:'release-a',build_sha:build,gate:'SECURITY_RED_TEAM',status:'PASS',
      evidence_type:'RED_TEAM',source:'test',summary:{suite:'security'},critical_findings:1
    }),DomainInvariantError);
  });

  it('requires humans for clinical/privacy/regulatory/AI safety gates and Risk-A security',()=>{
    for(const gate of ['CLINICAL','PRIVACY_DPIA','KENYA_REGULATORY','AI_SAFETY','SECURITY_RED_TEAM']){
      assert.equal(ValidationAttestationPolicy.requiresHuman(gate as any,'A'),true,gate);
    }
  });

  it('prevents the release initiator from self-attesting a mandatory human gate',async()=>{
    await candidateA();
    const ev=await ValidationEvidenceService.recordAutomated({
      release_id:'release-a',build_sha:build,gate:'CLINICAL',status:'PASS',
      evidence_type:'CLINICAL_AUTOMATED_CHECKS',source:'test',summary:{checks:5}
    });
    await assert.rejects(()=>ReleaseAssuranceService.attest({
      release_id:'release-a',build_sha:build,gate:'CLINICAL',reviewer_id:'author-1',
      reviewer_role:'CLINICAL_REVIEWER',decision:'APPROVED',evidence_refs:[ev.id]
    }),AuthorizationError);
  });

  it('does not accept automation as a Kenya regulatory reviewer',async()=>{
    await candidateA();
    const ev=await ValidationEvidenceService.recordAutomated({
      release_id:'release-a',build_sha:build,gate:'KENYA_REGULATORY',status:'PASS',
      evidence_type:'REGULATORY_CONTROL_MAPPING',source:'test',summary:{controls:3}
    });
    await assert.rejects(()=>ReleaseAssuranceService.attest({
      release_id:'release-a',build_sha:build,gate:'KENYA_REGULATORY',reviewer_id:'bot-1',
      reviewer_role:'RELEASE_AUTOMATION',decision:'APPROVED',evidence_refs:[ev.id]
    }),AuthorizationError);
  });

  it('keeps production authorization blocked when required human attestations are missing',async()=>{
    const c=await candidateA();
    for(const gate of c.required_gates){
      await ValidationEvidenceService.recordAutomated({
        release_id:c.release_id,build_sha:build,gate,status:'PASS',evidence_type:'TEST_EVIDENCE',
        source:'sprint27-test',summary:{gate,synthetic_test_only:true},critical_findings:0,high_findings:0
      });
    }
    const result=await ReleaseAssuranceService.evaluate(c.release_id);
    assert.equal(result.gate_status.CLINICAL,'PENDING');
    assert.ok(result.blockers.includes('CLINICAL:HUMAN_ATTESTATION_MISSING'));
    assert.equal((await ReleaseAssuranceService.productionAuthorizationStatus(c.release_id,build)).authorized,false);
  });

  it('blocks a security red-team gate with unresolved HIGH findings',async()=>{
    await candidateA();
    await ValidationEvidenceService.recordAutomated({
      release_id:'release-a',build_sha:build,gate:'SECURITY_RED_TEAM',status:'PASS',
      evidence_type:'RED_TEAM',source:'test',summary:{suite:'security'},critical_findings:0,high_findings:1
    });
    const result=await ReleaseAssuranceService.evaluate('release-a');
    assert.equal(result.gate_status.SECURITY_RED_TEAM,'RED');
    assert.ok(result.blockers.includes('SECURITY_RED_TEAM:HIGH_FINDINGS_OPEN'));
  });

  it('strict production governance gate fails closed when release-readiness certification is absent',async()=>{
    process.env.STRICT_RELEASE_ASSURANCE='true';
    const result=await ReleaseGateService.evaluateGate({releaseId:'missing-cert',environment:'production',buildSha:build});
    assert.equal(result.can_activate,false);
    assert.ok(result.blocking_reasons.some(x=>x.includes('RELEASE_READINESS_CERTIFICATION_MISSING')));
  });

  it('can issue a TEST-ONLY exact-build certification only after all evidence and human gates are satisfied by separate reviewers',async()=>{
    const c=await candidateA('release-complete-test');
    const evidenceByGate=new Map<string,string>();
    for(const gate of c.required_gates){
      const ev=await ValidationEvidenceService.recordAutomated({
        release_id:c.release_id,build_sha:build,gate,status:'PASS',evidence_type:'TEST_ONLY_VALIDATION',
        source:'sprint27-acceptance-test',summary:{gate,test_only:true},critical_findings:0,high_findings:0
      });
      evidenceByGate.set(gate,ev.id);
    }
    const reviewers:any={
      CLINICAL:['clinician-test','CLINICAL_REVIEWER'],
      AI_SAFETY:['ai-safety-test','AI_SAFETY_REVIEWER'],
      PRIVACY_DPIA:['dpo-test','PRIVACY_OFFICER'],
      KENYA_REGULATORY:['regulatory-test','REGULATORY_REVIEWER'],
      SECURITY_RED_TEAM:['security-test','SECURITY_REVIEWER']
    };
    for(const gate of c.required_gates){
      if(!ValidationAttestationPolicy.requiresHuman(gate,c.risk_class))continue;
      const [reviewer_id,reviewer_role]=reviewers[gate];
      await ReleaseAssuranceService.attest({
        release_id:c.release_id,build_sha:build,gate,reviewer_id,reviewer_role,
        decision:'APPROVED',conditions:[],evidence_refs:[evidenceByGate.get(gate)!]
      });
    }
    const certification=await ReleaseAssuranceService.certify({
      release_id:c.release_id,build_sha:build,certifier_id:'release-authority-test',certifier_role:'RELEASE_AUTHORITY'
    });
    assert.equal(certification.decision,'CERTIFIED');
    assert.equal((await ReleaseAssuranceService.productionAuthorizationStatus(c.release_id,build)).authorized,true);
    assert.equal((await ReleaseAssuranceService.productionAuthorizationStatus(c.release_id,'c'.repeat(40))).authorized,false);
  });

  it('prevents the release initiator from issuing final certification',async()=>{
    const c=await ReleaseAssuranceService.createCandidate({
      release_id:'release-d',version:'1',build_sha:build,environment:'production',initiator_id:'same-person',
      feature_keys:['cosmetic'],risk_signals:{cosmetic_only:true}
    });
    for(const gate of c.required_gates){
      await ValidationEvidenceService.recordAutomated({
        release_id:c.release_id,build_sha:build,gate,status:'PASS',evidence_type:'TEST',source:'test',summary:{ok:true}
      });
    }
    await assert.rejects(()=>ReleaseAssuranceService.certify({
      release_id:c.release_id,build_sha:build,certifier_id:'same-person',certifier_role:'RELEASE_AUTHORITY'
    }),AuthorizationError);
  });

  it('expires evidence instead of silently treating stale validation as current',async()=>{
    const c=await ReleaseAssuranceService.createCandidate({
      release_id:'release-expired',version:'1',build_sha:build,environment:'production',initiator_id:'author',
      feature_keys:['cosmetic'],risk_signals:{cosmetic_only:true}
    });
    await ValidationEvidenceService.recordAutomated({
      release_id:c.release_id,build_sha:build,gate:'AUTOMATED_QA',status:'PASS',evidence_type:'CI',source:'test',
      summary:{ok:true},expires_at:'2020-01-01T00:00:00.000Z'
    });
    const result=await ReleaseAssuranceService.evaluate(c.release_id);
    assert.equal(result.gate_status.AUTOMATED_QA,'RED');
    assert.ok(result.blockers.includes('AUTOMATED_QA:EVIDENCE_EXPIRED'));
  });
});
