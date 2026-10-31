import { configureSprint24Runtime } from '../mindos/sprint24/index.js';
import {
  ClinicalIncidentService,
  ClinicalOperationsEscalationService,
  ClinicalOperationsFollowUpService,
  ClinicalOperationsStaffingRegistry,
  SafetyPlanSharingService
} from '../mindos/clinical_ops/index.js';
import { RiskState } from '../mindos/platform/shared/state_machines.js';
import { generateUUIDv7, getPool, DatabaseManager } from '../mindos/platform/database/index.js';

const status=await configureSprint24Runtime({usePostgres:true});
if(status.persistence!=='POSTGRES'||!status.staffing_truth_enforced||status.safety_kernel_bridge!=='ACTIVE'){
  throw new Error('Sprint 24 PostgreSQL runtime/staffing bridge was not fully enabled.');
}

const pool=getPool();
const required=[
  'clinical_ops_capabilities',
  'clinical_ops_escalations',
  'clinical_ops_follow_ups',
  'clinical_ops_incidents',
  'clinical_ops_safety_plan_shares'
];
for(const table of required){
  const result=await pool.query('SELECT to_regclass($1) AS name',['public.'+table]);
  if(!result.rows[0]?.name)throw new Error('Missing Sprint 24 table: '+table);
}

const userId=generateUUIDv7();
await pool.query(
  `INSERT INTO users(id,email_normalized,account_state,created_at,updated_at)
   VALUES($1,$2,'ACTIVE',NOW(),NOW())`,
  [userId,`sprint24-${userId}@mindos.local`]
);

await ClinicalOperationsStaffingRegistry.configure({
  jurisdiction:'KE',
  queue_key:'CLINICAL_REVIEW',
  staffing_state:'STAFFED',
  qualified_role_codes:['SAFETY_REVIEWER'],
  configured_by:'sprint24-certifier',
  policy_version:'ops-cert-1'
});

const escalation=await ClinicalOperationsEscalationService.createIfStaffed({
  subject_user_id:userId,
  risk_event_id:'runtime-smoke-risk-'+userId,
  risk_state:RiskState.HIGH,
  level:'L2',
  jurisdiction:'KE',
  reason_codes:['RUNTIME_SMOKE'],
  policy_version:'safety-cert-1'
});
if(!escalation)throw new Error('Staffed Sprint 24 escalation was not persisted.');

await ClinicalOperationsFollowUpService.schedule({
  escalation_id:escalation.id,
  subject_user_id:userId,
  type:'AUTOMATED_REMINDER',
  scheduled_for:new Date(Date.now()+60_000).toISOString(),
  channel:'IN_APP'
});

await SafetyPlanSharingService.grant({
  safety_plan_reference:'safety-plan:runtime-smoke',
  subject_user_id:userId,
  actor_user_id:userId,
  grantee_type:'TRUSTED_CONTACT',
  grantee_id:'trusted-contact-runtime-smoke',
  scopes:['VIEW_VERIFIED_RESOURCES']
});

await ClinicalIncidentService.open({
  incident_type:'RUNTIME_SMOKE',
  severity:'LOW',
  affected_component:'clinical_ops',
  evidence_references:['test:sprint24-postgres-smoke'],
  safety_policy_version:'safety-cert-1',
  release_version:'sprint24-cert',
  created_by:'sprint24-certifier'
});

for(const [table,min] of [
  ['clinical_ops_capabilities',1],
  ['clinical_ops_escalations',1],
  ['clinical_ops_follow_ups',1],
  ['clinical_ops_incidents',1],
  ['clinical_ops_safety_plan_shares',1]
] as const){
  const r=await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  if(Number(r.rows[0]?.count||0)<min)throw new Error(`Sprint 24 PostgreSQL persistence failed for ${table}.`);
}

console.log('SPRINT 24 POSTGRES SMOKE PASSED',status);
await DatabaseManager.shutdown();
