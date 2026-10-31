import { DatabaseManager,getPool } from '../mindos/platform/database/index.js';
import {
  ReleaseAssuranceService,ValidationAttestationPolicy,ValidationEvidenceService
} from '../mindos/validation/index.js';
import { configureSprint27Runtime } from '../mindos/sprint27/runtime.js';

const runtime=configureSprint27Runtime({usePostgres:true});
if(runtime.persistence!=='POSTGRES'||runtime.synthetic_human_approvals_allowed){
  throw new Error('Sprint 27 PostgreSQL release-assurance runtime configuration is invalid.');
}

const build=(process.env.GITHUB_SHA||'7'.repeat(40)).slice(0,128);
const releaseId='SPRINT27-PERSISTENCE-SMOKE-TEST';
const candidate=await ReleaseAssuranceService.createCandidate({
  release_id:releaseId,version:'27-test',build_sha:build,environment:'staging',
  initiator_id:'sprint27-test-initiator',feature_keys:['test-only'],
  risk_signals:{safety_critical:true,authorization_or_consent:true,clinical_governance:true,ai_governance:true}
});

const refs=new Map<string,string>();
for(const gate of candidate.required_gates){
  const ev=await ValidationEvidenceService.recordAutomated({
    release_id:releaseId,build_sha:build,gate,status:'PASS',
    evidence_type:'TEST_ONLY_PERSISTENCE_EVIDENCE',source:'sprint27-postgres-smoke',
    summary:{gate,test_only:true},critical_findings:0,high_findings:0
  });
  refs.set(gate,ev.id);
}

const human:any={
  CLINICAL:['test-clinician','CLINICAL_REVIEWER'],
  AI_SAFETY:['test-ai-safety','AI_SAFETY_REVIEWER'],
  PRIVACY_DPIA:['test-dpo','PRIVACY_OFFICER'],
  KENYA_REGULATORY:['test-regulatory','REGULATORY_REVIEWER'],
  SECURITY_RED_TEAM:['test-security','SECURITY_REVIEWER']
};
for(const gate of candidate.required_gates){
  if(!ValidationAttestationPolicy.requiresHuman(gate,candidate.risk_class))continue;
  const [reviewer_id,reviewer_role]=human[gate];
  await ReleaseAssuranceService.attest({
    release_id:releaseId,build_sha:build,gate,reviewer_id,reviewer_role,decision:'APPROVED',
    conditions:[],evidence_refs:[refs.get(gate)!]
  });
}

const cert=await ReleaseAssuranceService.certify({
  release_id:releaseId,build_sha:build,certifier_id:'test-release-authority',certifier_role:'RELEASE_AUTHORITY'
});
if(cert.decision!=='CERTIFIED')throw new Error('Test-only release assurance did not certify.');

const pool=getPool();
for(const table of ['validation_release_candidates','validation_evidence','validation_attestations','validation_release_certifications']){
  const r=await pool.query('SELECT to_regclass($1) AS name',['public.'+table]);
  if(!r.rows[0]?.name)throw new Error('Missing Sprint 27 persistence table: '+table);
}
const counts=await Promise.all([
  pool.query('SELECT COUNT(*)::int AS count FROM validation_release_candidates WHERE release_id=$1',[releaseId]),
  pool.query('SELECT COUNT(*)::int AS count FROM validation_evidence WHERE release_id=$1',[releaseId]),
  pool.query('SELECT COUNT(*)::int AS count FROM validation_attestations WHERE release_id=$1',[releaseId]),
  pool.query('SELECT COUNT(*)::int AS count FROM validation_release_certifications WHERE release_id=$1',[releaseId])
]);
if(Number(counts[0].rows[0]?.count)!==1||Number(counts[1].rows[0]?.count)<candidate.required_gates.length||Number(counts[2].rows[0]?.count)<5||Number(counts[3].rows[0]?.count)!==1){
  throw new Error('Sprint 27 PostgreSQL persistence counts are incomplete.');
}
console.log('SPRINT 27 POSTGRES RELEASE-ASSURANCE SMOKE PASSED',{
  release_id:releaseId,risk_class:candidate.risk_class,gates:candidate.required_gates.length,
  evidence:Number(counts[1].rows[0]?.count),attestations:Number(counts[2].rows[0]?.count),
  note:'TEST-ONLY reviewers validate persistence/authorization logic; no real-world approval is asserted.'
});
await DatabaseManager.shutdown();
