import {
  BetaCohortService,LaunchAuthorizationService,LaunchEvidenceService,LaunchMonitoringService,LaunchProgramService,
  LaunchRepository,PostLaunchReviewService
} from '../mindos/launch/index.js';
import { ReleaseAssuranceService,ValidationAttestationPolicy,ValidationEvidenceService } from '../mindos/validation/index.js';
import { configureSprint26Runtime } from '../mindos/sprint26/runtime.js';
import { configureSprint27Runtime } from '../mindos/sprint27/runtime.js';
import { configureSprint28Runtime } from '../mindos/sprint28/runtime.js';
import { DatabaseManager,getPool } from '../mindos/platform/database/index.js';

const build=(process.env.GITHUB_SHA||'8'.repeat(40)).slice(0,128);
const releaseId='SPRINT28-PERSISTENCE-SMOKE-TEST';
const launchCode='SPRINT28-KENYA-BETA-SMOKE';

configureSprint26Runtime({usePostgres:true});
configureSprint27Runtime({usePostgres:true});
configureSprint28Runtime({usePostgres:true});

const candidate=await ReleaseAssuranceService.createCandidate({
  release_id:releaseId,version:'28-test',build_sha:build,environment:'production',initiator_id:'sprint28-test-release-author',
  feature_keys:['consumer.core','ai.companion_generative_responses'],
  risk_signals:{safety_critical:true,authorization_or_consent:true,clinical_governance:true,ai_governance:true,professional_verification:true}
});
const vrefs=new Map<string,string>();
for(const gate of candidate.required_gates){
  const ev=await ValidationEvidenceService.recordAutomated({
    release_id:releaseId,build_sha:build,gate,status:'PASS',evidence_type:'SPRINT28_TEST_ONLY',
    source:'sprint28-postgres-smoke',summary:{gate,test_only:true},critical_findings:0,high_findings:0
  });
  vrefs.set(gate,ev.id);
}
const reviewers:any={
  CLINICAL:['test-clinician','CLINICAL_REVIEWER'],
  AI_SAFETY:['test-ai-safety','AI_SAFETY_REVIEWER'],
  PRIVACY_DPIA:['test-dpo','PRIVACY_OFFICER'],
  KENYA_REGULATORY:['test-regulatory','REGULATORY_REVIEWER'],
  SECURITY_RED_TEAM:['test-security','SECURITY_REVIEWER']
};
for(const gate of candidate.required_gates){
  if(!ValidationAttestationPolicy.requiresHuman(gate,candidate.risk_class))continue;
  const [reviewer_id,reviewer_role]=reviewers[gate];
  await ReleaseAssuranceService.attest({release_id:releaseId,build_sha:build,gate,reviewer_id,reviewer_role,decision:'APPROVED',evidence_refs:[vrefs.get(gate)!]});
}
await ReleaseAssuranceService.certify({release_id:releaseId,build_sha:build,certifier_id:'test-release-authority',certifier_role:'RELEASE_AUTHORITY'});

const scope={consumer:true,professional:false,community:false,payments:false,ai:true};
const program=await LaunchProgramService.create({
  code:launchCode,release_id:releaseId,version:'28-test',build_sha:build,owner_id:'test-program-owner',
  feature_keys:['consumer.core','ai.companion_generative_responses'],scope,
  beta_max_participants:2,limited_launch_max_participants:4,required_external_authorities:[],
  regulatory_scope_evidence_ref:'TEST-ONLY-REGULATORY-APPLICABILITY-EVIDENCE'
});
await LaunchProgramService.lockReleaseCandidate(program.id,{id:'test-release-manager',role:'RELEASE_MANAGER'});
await LaunchEvidenceService.generate(program.id,LaunchEvidenceService.requiredCategories(scope).map(category=>({
  category,evidence_ref:`TEST-${category}`,status:'PASS' as const
})),'test-qa-lead');

const preBeta=await LaunchMonitoringService.capture(program.id,'test-sre','production');
if(preBeta.status!=='GREEN')throw new Error('Sprint 28 pre-beta operational monitoring is not GREEN: '+preBeta.notes_codes.join(','));
await LaunchAuthorizationService.decide({
  program_id:program.id,decision_type:'CONTROLLED_BETA',reviewer_id:'test-beta-authority',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'
});
await LaunchAuthorizationService.activateBeta(program.id,{id:'test-beta-authority',role:'RELEASE_AUTHORITY'});

const rawSubject='SPRINT28-RAW-SUBJECT-MUST-NOT-PERSIST';
await BetaCohortService.inviteAndEnroll({
  program_id:program.id,subject_ref:rawSubject,participant_type:'USER',jurisdiction:'KE',invitation_ref:'TEST-INVITE',
  consent_receipt_ref:'TEST-CONSENT-RECEIPT',eligibility_evidence_refs:['TEST-ADULT-ELIGIBILITY','TEST-BETA-TERMS'],actor_id:'test-beta-operator'
});
await new Promise(r=>setTimeout(r,5));
const betaSnapshot=await LaunchMonitoringService.capture(program.id,'test-sre','production');
if(betaSnapshot.status!=='GREEN')throw new Error('Sprint 28 beta monitoring is not GREEN.');
await LaunchAuthorizationService.decide({
  program_id:program.id,decision_type:'LIMITED_KENYA_LAUNCH',reviewer_id:'test-launch-authority',reviewer_role:'RELEASE_AUTHORITY',decision:'APPROVED'
});
const active=await LaunchAuthorizationService.activateLimitedLaunch(program.id,{id:'test-launch-authority',role:'RELEASE_AUTHORITY'});
if(active.state!=='LIMITED_LAUNCH_ACTIVE')throw new Error('Limited Kenya launch test state did not activate.');

await new Promise(r=>setTimeout(r,5));
const postSnapshot=await LaunchMonitoringService.capture(program.id,'test-sre','production');
await new Promise(r=>setTimeout(r,5));
const review=await PostLaunchReviewService.review({
  program_id:program.id,build_sha:build,window_started_at:active.limited_launch_starts_at!,
  window_ended_at:new Date().toISOString(),incident_refs:[],monitoring_snapshot_refs:[postSnapshot.id],
  evidence_refs:['TEST-POST-LAUNCH-EVIDENCE'],reviewer_id:'test-post-launch-authority',reviewer_role:'RELEASE_AUTHORITY',
  decision:'CONTINUE',findings:['TEST_ONLY_NO_BLOCKERS'],corrective_actions:[]
});
if(review.decision!=='CONTINUE')throw new Error('Post-launch test review failed.');

const pool=getPool();
for(const table of ['launch_programs','launch_participants','launch_evidence_packages','launch_monitoring_snapshots','launch_authorization_decisions','launch_post_reviews']){
  const r=await pool.query('SELECT to_regclass($1) AS name',['public.'+table]);
  if(!r.rows[0]?.name)throw new Error('Missing Sprint 28 table: '+table);
}
const row=await pool.query('SELECT subject_ref_hash FROM launch_participants WHERE program_id=$1',[program.id]);
if(row.rows.length!==1)throw new Error('Sprint 28 participant persistence missing.');
if(String(row.rows[0].subject_ref_hash).includes(rawSubject))throw new Error('Raw launch participant identity was persisted.');
const serialized=JSON.stringify(row.rows);
if(serialized.includes(rawSubject))throw new Error('Raw launch participant identity leaked into persisted cohort record.');
const counts=await Promise.all([
  pool.query('SELECT COUNT(*)::int AS count FROM launch_monitoring_snapshots WHERE program_id=$1',[program.id]),
  pool.query('SELECT COUNT(*)::int AS count FROM launch_authorization_decisions WHERE program_id=$1',[program.id]),
  pool.query('SELECT COUNT(*)::int AS count FROM launch_post_reviews WHERE program_id=$1',[program.id])
]);
console.log('SPRINT 28 POSTGRES CONTROLLED-LAUNCH SMOKE PASSED',{
  release_id:releaseId,build_sha:build,risk_class:candidate.risk_class,
  monitoring_snapshots:Number(counts[0].rows[0]?.count),authorization_decisions:Number(counts[1].rows[0]?.count),
  post_launch_reviews:Number(counts[2].rows[0]?.count),raw_participant_identity_persisted:false,
  note:'All reviewers/evidence in this smoke are TEST-ONLY and do not authorize a real Kenya launch.'
});
await DatabaseManager.shutdown();
