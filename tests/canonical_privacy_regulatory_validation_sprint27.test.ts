import { after,beforeEach,describe,it } from 'node:test';
import assert from 'node:assert/strict';

import { DatabaseManager } from '../mindos/platform/database/index.js';
import { ValidationError } from '../mindos/platform/errors/index.js';
import { PrivacyGovernanceEngine } from '../mindos/privacy_governance/application/service.js';
import { RegulatoryCertificationService } from '../mindos/regulatory_governance/certification/service.js';
import { ValidationAttestationPolicy } from '../mindos/validation/index.js';

describe('Sprint 27 privacy/DPIA and Kenya regulatory validation',()=>{
  beforeEach(()=>{RegulatoryCertificationService.resetForTesting();});
  after(async()=>{await DatabaseManager.shutdown();});

  it('privacy release gate fails closed when a processing activity is not registered/approved',async()=>{
    const result=await PrivacyGovernanceEngine.evaluateReleaseGate({
      processing_activity_code:'UNREGISTERED_SPRINT27_TEST',
      data_categories:[] as any,
      purpose:'release validation'
    } as any);
    assert.equal(result.permitted,false);
    assert.match(result.reason||'',/NOT_REGISTERED/i);
  });

  it('DPIA release assurance requires an attributable human privacy officer',()=>{
    assert.equal(ValidationAttestationPolicy.requiresHuman('PRIVACY_DPIA','A'),true);
    assert.equal(ValidationAttestationPolicy.roleAllowed('PRIVACY_DPIA','PRIVACY_OFFICER'),true);
    assert.equal(ValidationAttestationPolicy.roleAllowed('PRIVACY_DPIA','RELEASE_AUTOMATION'),false);
  });

  it('Kenya regulatory release assurance requires an attributable human regulatory reviewer',()=>{
    assert.equal(ValidationAttestationPolicy.requiresHuman('KENYA_REGULATORY','A'),true);
    assert.equal(ValidationAttestationPolicy.roleAllowed('KENYA_REGULATORY','REGULATORY_REVIEWER'),true);
    assert.equal(ValidationAttestationPolicy.roleAllowed('KENYA_REGULATORY','RELEASE_AUTOMATION'),false);
  });

  it('canonical authority registry does not fabricate DHA/ODPC/KMPDC registration success',()=>{
    const statuses=RegulatoryCertificationService.listExternalStatuses('KE');
    assert.equal(statuses.length,3);
    assert.equal(statuses.every(x=>x.status==='PENDING'),true);
    assert.equal(statuses.every(x=>!x.registration_reference),true);
    assert.equal(statuses.every(x=>x.verified_by==='SYSTEM_BASELINE_NOT_LEGAL_APPROVAL'),true);
  });

  it('external regulatory status cannot be marked registered without an evidence reference',()=>{
    assert.throws(()=>RegulatoryCertificationService.verifyExternalStatus({
      authorityCode:'DHA',jurisdictionCode:'KE',
      registrationType:'Digital Health Solution Statutory Registration',
      registrationReference:'',verifiedBy:'regulatory-reviewer'
    }),ValidationError);
  });

  it('verified external status becomes REGISTERED only after explicit reviewer evidence is supplied',()=>{
    const v=RegulatoryCertificationService.verifyExternalStatus({
      authorityCode:'DHA',jurisdictionCode:'KE',
      registrationType:'Digital Health Solution Statutory Registration',
      registrationReference:'TEST-EVIDENCE-REF-NOT-A-REAL-REGISTRATION',
      verifiedBy:'regulatory-reviewer-test'
    });
    assert.equal(v.status,'REGISTERED');
    assert.equal(v.registration_reference,'TEST-EVIDENCE-REF-NOT-A-REAL-REGISTRATION');
  });
});
