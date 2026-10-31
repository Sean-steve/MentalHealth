import { after,beforeEach,describe,it } from 'node:test';
import assert from 'node:assert/strict';

import { AuthorizationError,DomainInvariantError } from '../mindos/platform/errors/index.js';
import { DatabaseManager } from '../mindos/platform/database/index.js';
import {
  BetaCohortService,LaunchAuthorizationService,LaunchEvidenceService,LaunchProgramService,LaunchRepository,PostLaunchReviewService
} from '../mindos/launch/index.js';
import { RegulatoryCertificationService } from '../mindos/regulatory_governance/certification/service.js';
import {
  ReleaseAssuranceService,ValidationAttestationPolicy,ValidationEvidenceService
} from '../mindos/validation/index.js';
import { configureSprint27Runtime,resetSprint27RuntimeForTesting } from '../mindos/sprint27/runtime.js';
import { configureSprint28Runtime,resetSprint28RuntimeForTesting } from '../mindos/sprint28/runtime.js';

const build='8'.repeat(40);
let seq=0;
const rid=()=>`s28-release-${++seq}`;

async function seedCertifiedRelease(releaseId:string,buildSha=build){
  const c=await ReleaseAssuranceService.createCandidate({
    release_id:releaseId,version:'28-test',build_sha:buildSha,environment:'production',initiator_id:'release-author',
    feature_keys:['mindos-core'],risk_signals:{safety_critical:true,authorization_or_consent:true,clinical_governance:true,ai_governance:true,professional_verification:true}
  });
  const refs=new Map<string,string>();
  for(const gate of c.required_gates){
    const ev=await ValidationEvidenceService.recordAutomated({
      release_id:releaseId,build_sha:buildSha,gate,status:'PASS',evidence_type:'SPRINT28_TEST_ONLY',
      source:'sprint28-acceptance',summary:{gate,test_only:true},critical_findings:0,high_findings:0
    });
    refs.set(gate,ev.id);
  }
  const reviewers:any={
    CLINICAL:['clinical-reviewer-test','CLINICAL_REVIEWER'],
    AI_SAFETY:['ai-safety-reviewer-test','AI_SAFETY_REVIEWER'],
    PRIVACY_DPIA:['privacy-reviewer-test','PRIVACY_OFFICER'],
    KENYA_REGULATORY:['reg-reviewer-test','REGULATORY_REVIEWER'],
    SECURITY_RED_TEAM:['security-reviewer-test','SECURITY_REVIEWER']
  };
  for(const gate of c.required_gates){
    if(!ValidationAttestationPolicy.requiresHuman(gate,c.risk_class))continue;
    const [reviewer_id,reviewer_role]=reviewers[gate];
    await ReleaseAssuranceService.attest({
      release_id:releaseId,build_sha:buildSha,gate,reviewer_id,reviewer_role,decision:'APPROVED',evidence_refs:[refs.get(gate)!]
    });
  }
  await ReleaseAssuranceService.certify({release_id:releaseId,build_sha:buildSha,certifier_id:'release-authority-test',certifier_role:'RELEASE_AUTHORITY'});
}

function evidenceItems(scope:any){
  return LaunchEvidenceService.requiredCategories(scope).map(category=>({category,evidence_ref:`TEST-${category}`,status:'PASS' as const}));
}

async function createLockedProgram(options:{releaseId?:string;external?:string[];betaLimit?:number;limitedLimit?:number;scope?:any}={}){
  const releaseId=options.releaseId||rid();
  await seedCertifiedRelease(releaseId);
  const scope=options.scope||{consumer:true,professional:true,community:false,payments:false,ai:true};
  const p=await LaunchProgramService.create({
    code:`PROGRAM-${releaseId}`,release_id:releaseId,version:'28-test',build_sha:build,owner_id:'program-owner',
    feature_keys:['ai.companion_generative_responses','consumer.core'],scope,
    beta_max_participants:options.betaLimit||2,limited_launch_max_participants:options.limitedLimit||4,
    required_external_authorities:options.external||[],regulatory_scope_evidence_ref:'TEST-HUMAN-REGULATORY-SCOPE-DETERMINATION'
  });
  await LaunchProgramService.lockReleaseCandidate(p.id,{id:'release-manager',role:'RELEASE_MANAGER'});
  await LaunchEvidenceService.generate(p.id,evidenceItems(scope),'qa-lead');
  await LaunchRepository.saveMonitoringSnapshot({
    id:`00000000-0000-7000-8000-${String(seq).padStart(12,'0')}`,program_id:p.id,build_sha:build,environment:'production',status:'GREEN',
    critical_launch_blockers:0,open_critical_incidents:0,safety_resources_valid:true,incident_response_ready:true,rollback_ready:true,
    database_healthy:true,dr_ready:true,privacy_lifecycle_clear:true,notes_codes:[],captured_by:'test-monitor',captured_at:new Date().toISOString()
  });
  return LaunchProgramService.get(p.id);
}

describe('MindOS Sprint 28 — Controlled Beta & Kenya Launch Readiness',()=>{
  beforeEach(()=>{
    resetSprint27RuntimeForTesting();configureSprint27Runtime({usePostgres:false});
    resetSprint28RuntimeForTesting();configureSprint28Runtime({usePostgres:false});
    RegulatoryCertificationService.resetForTesting();
    process.env.LAUNCH_PARTICIPANT_HASH_SALT='sprint28-test-salt';
  });
  after(async()=>{delete process.env.LAUNCH_PARTICIPANT_HASH_SALT;await DatabaseManager.shutdown();});

  it('refuses to lock a launch program to an uncertified release candidate',async()=>{
    const p=await LaunchProgramService.create({
      code:'UNCERTIFIED',release_id:'missing-release-cert',version:'1',build_sha:build,owner_id:'owner',
      feature_keys:['consumer.core'],scope:{consumer:true,professional:false,community:false,payments:false,ai:false},
      beta_max_participants:1,limited_launch_max_participants:2,required_external_authorities:[],
      regulatory_scope_evidence_ref:'human-reg-scope-ref'
    });
    await assert.rejects(()=>LaunchProgramService.lockReleaseCandidate(p.id,{id:'manager',role:'RELEASE_MANAGER'}),DomainInvariantError);
  });

  it('requires an explicit Kenya regulatory applicability evidence reference even when no external registration is deemed applicable',async()=>{
    await seedCertifiedRelease('reg-scope');
    await assert.rejects(()=>LaunchProgramService.create({
      code:'NO-REG-SCOPE',release_id:'reg-scope',version:'1',build_sha:build,owner_id:'owner',feature_keys:['consumer.core'],
      scope:{consumer:true,professional:false,community:false,payments:false,ai:false},beta_max_participants:1,limited_launch_max_participants:2,
      required_external_authorities:[],regulatory_scope_evidence_ref:''
    }),DomainInvariantError);
  });

  it('does not persist raw participant identity in the beta cohort record',async()=>{
    const p=await createLockedProgram();
    await LaunchAuthorizationService.decide({program_id:p.id,decision_type:'CONTROLLED_BETA',reviewer_id:'authority',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'});
    await LaunchAuthorizationService.activateBeta(p.id,{id:'authority',role:'RELEASE_AUTHORITY'});
    const participant=await BetaCohortService.inviteAndEnroll({
      program_id:p.id,subject_ref:'user-private-123',participant_type:'USER',jurisdiction:'KE',invitation_ref:'INV-1',
      consent_receipt_ref:'CONSENT-1',eligibility_evidence_refs:['AGE-ADULT-CONFIRMED','BETA-TERMS-ACK'],actor_id:'beta-operator'
    });
    assert.notEqual(participant.subject_ref_hash,'user-private-123');
    assert.equal(JSON.stringify(participant).includes('user-private-123'),false);
    assert.equal(participant.subject_ref_hash.length,64);
  });

  it('enforces the controlled-beta cohort ceiling without an operator bypass',async()=>{
    const p=await createLockedProgram({betaLimit:1,limitedLimit:2});
    await LaunchAuthorizationService.decide({program_id:p.id,decision_type:'CONTROLLED_BETA',reviewer_id:'authority',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'});
    await LaunchAuthorizationService.activateBeta(p.id,{id:'authority',role:'RELEASE_AUTHORITY'});
    await BetaCohortService.inviteAndEnroll({program_id:p.id,subject_ref:'u1',participant_type:'USER',jurisdiction:'KE',invitation_ref:'i1',consent_receipt_ref:'c1',eligibility_evidence_refs:['e1'],actor_id:'op'});
    await assert.rejects(()=>BetaCohortService.inviteAndEnroll({program_id:p.id,subject_ref:'u2',participant_type:'USER',jurisdiction:'KE',invitation_ref:'i2',consent_receipt_ref:'c2',eligibility_evidence_refs:['e2'],actor_id:'op'}),DomainInvariantError);
  });

  it('blocks cohort access before activation, for nonmembers, outside Kenya, and outside feature scope',async()=>{
    const p=await createLockedProgram();
    await LaunchAuthorizationService.decide({program_id:p.id,decision_type:'CONTROLLED_BETA',reviewer_id:'authority',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'});
    await assert.rejects(()=>BetaCohortService.assertFeatureAccess(p.id,'u1','consumer.core'),DomainInvariantError);
    await LaunchAuthorizationService.activateBeta(p.id,{id:'authority',role:'RELEASE_AUTHORITY'});
    await assert.rejects(()=>BetaCohortService.assertFeatureAccess(p.id,'u1','consumer.core'),DomainInvariantError);
    await BetaCohortService.inviteAndEnroll({program_id:p.id,subject_ref:'u1',participant_type:'USER',jurisdiction:'KE',invitation_ref:'i',consent_receipt_ref:'c',eligibility_evidence_refs:['e'],actor_id:'op'});
    await assert.rejects(()=>BetaCohortService.assertFeatureAccess(p.id,'u1','consumer.core','UG'),DomainInvariantError);
    await assert.rejects(()=>BetaCohortService.assertFeatureAccess(p.id,'u1','not-authorized'),DomainInvariantError);
    assert.equal((await BetaCohortService.assertFeatureAccess(p.id,'u1','consumer.core')).allowed,true);
  });

  it('withdrawal immediately removes beta feature access',async()=>{
    const p=await createLockedProgram();
    await LaunchAuthorizationService.decide({program_id:p.id,decision_type:'CONTROLLED_BETA',reviewer_id:'authority',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'});
    await LaunchAuthorizationService.activateBeta(p.id,{id:'authority',role:'RELEASE_AUTHORITY'});
    await BetaCohortService.inviteAndEnroll({program_id:p.id,subject_ref:'u1',participant_type:'USER',jurisdiction:'KE',invitation_ref:'i',consent_receipt_ref:'c',eligibility_evidence_refs:['e'],actor_id:'op'});
    await BetaCohortService.withdraw(p.id,'u1','u1');
    await assert.rejects(()=>BetaCohortService.assertFeatureAccess(p.id,'u1','consumer.core'),DomainInvariantError);
  });

  it('pending required external Kenya authority evidence blocks beta/launch authorization',async()=>{
    const p=await createLockedProgram({external:['DHA']});
    const readiness=await LaunchAuthorizationService.evaluate(p.id);
    assert.equal(readiness.ready,false);
    assert.ok(readiness.blockers.includes('EXTERNAL_REGULATORY_EVIDENCE_MISSING:DHA'));
    await assert.rejects(()=>LaunchAuthorizationService.decide({program_id:p.id,decision_type:'CONTROLLED_BETA',reviewer_id:'authority',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'}),DomainInvariantError);
  });

  it('does not permit the launch program owner to self-authorize the beta',async()=>{
    const p=await createLockedProgram();
    await assert.rejects(()=>LaunchAuthorizationService.decide({program_id:p.id,decision_type:'CONTROLLED_BETA',reviewer_id:'program-owner',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'}),AuthorizationError);
  });

  it('requires a real observed beta cohort before limited Kenya launch authorization',async()=>{
    const p=await createLockedProgram();
    await LaunchAuthorizationService.decide({program_id:p.id,decision_type:'CONTROLLED_BETA',reviewer_id:'authority',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'});
    await LaunchAuthorizationService.activateBeta(p.id,{id:'authority',role:'RELEASE_AUTHORITY'});
    await assert.rejects(()=>LaunchAuthorizationService.decide({program_id:p.id,decision_type:'LIMITED_KENYA_LAUNCH',reviewer_id:'authority-2',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'}),DomainInvariantError);
    await BetaCohortService.inviteAndEnroll({program_id:p.id,subject_ref:'u1',participant_type:'USER',jurisdiction:'KE',invitation_ref:'i',consent_receipt_ref:'c',eligibility_evidence_refs:['e'],actor_id:'op'});
    await assert.rejects(()=>LaunchAuthorizationService.decide({program_id:p.id,decision_type:'LIMITED_KENYA_LAUNCH',reviewer_id:'authority-2',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'}),DomainInvariantError);
    await LaunchRepository.saveMonitoringSnapshot({
      id:`00000000-0000-7000-9000-${String(seq).padStart(12,'0')}`,program_id:p.id,build_sha:build,environment:'production',status:'GREEN',critical_launch_blockers:0,
      open_critical_incidents:0,safety_resources_valid:true,incident_response_ready:true,rollback_ready:true,database_healthy:true,dr_ready:true,privacy_lifecycle_clear:true,
      notes_codes:[],captured_by:'beta-monitor',captured_at:new Date().toISOString()
    });
    const d=await LaunchAuthorizationService.decide({program_id:p.id,decision_type:'LIMITED_KENYA_LAUNCH',reviewer_id:'authority-2',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'});
    assert.equal(d.decision,'APPROVED');
  });

  it('emergency hold immediately denies cohort access and requires release authority to resume',async()=>{
    const p=await createLockedProgram();
    await LaunchAuthorizationService.decide({program_id:p.id,decision_type:'CONTROLLED_BETA',reviewer_id:'authority',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'});
    await LaunchAuthorizationService.activateBeta(p.id,{id:'authority',role:'RELEASE_AUTHORITY'});
    await BetaCohortService.inviteAndEnroll({program_id:p.id,subject_ref:'u1',participant_type:'USER',jurisdiction:'KE',invitation_ref:'i',consent_receipt_ref:'c',eligibility_evidence_refs:['e'],actor_id:'op'});
    await LaunchProgramService.emergencyHold(p.id,{id:'incident-commander',role:'INCIDENT_COMMANDER'},'test containment');
    await assert.rejects(()=>BetaCohortService.assertFeatureAccess(p.id,'u1','consumer.core'),DomainInvariantError);
    await assert.rejects(()=>LaunchAuthorizationService.resume(p.id,{id:'op',role:'BETA_OPERATOR'}),AuthorizationError);
    const resumed=await LaunchAuthorizationService.resume(p.id,{id:'authority',role:'RELEASE_AUTHORITY'});
    assert.equal(resumed.state,'BETA_ACTIVE');
  });

  it('post-launch review cannot start before actual limited-launch activation and cannot use off-window monitoring evidence',async()=>{
    const p=await createLockedProgram();
    await assert.rejects(()=>PostLaunchReviewService.review({
      program_id:p.id,build_sha:build,window_started_at:new Date(Date.now()-2000).toISOString(),window_ended_at:new Date(Date.now()-1000).toISOString(),
      incident_refs:[],monitoring_snapshot_refs:['x'],evidence_refs:['e'],reviewer_id:'authority',reviewer_role:'RELEASE_AUTHORITY',decision:'CONTINUE',findings:[],corrective_actions:[]
    }),DomainInvariantError);
  });
});
