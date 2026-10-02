import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const required=[
  'mindos/care_plans/domain/types.ts',
  'mindos/care_plans/domain/entities.ts',
  'mindos/care_plans/repositories/interfaces.ts',
  'mindos/care_plans/repositories/in_memory_care_plan_repository.ts',
  'mindos/care_plans/repositories/pg_care_plan_repository.ts',
  'mindos/care_plans/plans/care_plan_service.ts',
  'mindos/care_plans/progress/care_plan_progress_service.ts',
  'mindos/care_plans/api/routes.ts',
  'mindos/clinical_tasks/domain/types.ts',
  'mindos/clinical_tasks/application/clinical_task_service.ts',
  'mindos/clinical_tasks/repositories/interfaces.ts',
  'mindos/clinical_tasks/repositories/in_memory_clinical_task_repository.ts',
  'mindos/clinical_tasks/repositories/pg_clinical_task_repository.ts',
  'mindos/clinical_tasks/api/routes.ts',
  'mindos/professional_messaging/application/professional_messaging_service.ts',
  'mindos/professional_messaging/repositories/pg_professional_messaging_repository.ts',
  'mindos/professional_messaging/adapters/notification_adapter.ts',
  'mindos/professional_messaging/adapters/safety_adapter.ts',
  'mindos/professional_messaging/adapters/attachment_policy.ts',
  'mindos/professional_messaging/api/routes.ts',
  'mindos/platform/database/migrations/020_canonical_care_plans_tasks_messaging.sql',
  'mindos/sprint22/runtime.ts',
  'mindos/sprint22/index.ts',
  'tests/canonical_care_plans_tasks_messaging_sprint22.test.ts',
  'server.ts'
];
const failures=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const p of required) if(!fs.existsSync(path.join(root,p))) failures.push(`missing: ${p}`);

if(failures.length===0){
  const plan=read('mindos/care_plans/plans/care_plan_service.ts');
  const task=read('mindos/clinical_tasks/application/clinical_task_service.ts');
  const taskApi=read('mindos/clinical_tasks/api/routes.ts');
  const progress=read('mindos/care_plans/progress/care_plan_progress_service.ts');
  const messaging=read('mindos/professional_messaging/application/professional_messaging_service.ts');
  const messagingSafety=read('mindos/professional_messaging/adapters/safety_adapter.ts');
  const attachmentPolicy=read('mindos/professional_messaging/adapters/attachment_policy.ts');
  const migration=read('mindos/platform/database/migrations/020_canonical_care_plans_tasks_messaging.sql');
  const runtime=read('mindos/sprint22/runtime.ts');
  const server=read('server.ts');
  const tests=read('tests/canonical_care_plans_tasks_messaging_sprint22.test.ts');
  const carePlanSources=[
    plan,
    read('mindos/care_plans/goals/care_goal_service.ts'),
    read('mindos/care_plans/assignments/assignment_service.ts'),
    read('mindos/care_plans/reviews/care_plan_review_service.ts')
  ].join('\n');

  if(!plan.includes('createPlanWithInitialVersion')) failures.push('care plan creation is not atomic');
  if(/reviewFrequencyDays\s*\?\?\s*30|reviewFrequencyDays\s*\|\|\s*30/.test(plan)) failures.push('care plan invents a 30-day review cadence');
  if(!task.includes('trusted system actor')) failures.push('owner-domain completion is not restricted to trusted system actors');
  if(taskApi.includes('complete-as-domain')) {
    const activeRoute=/\.post\([^\n]*complete-as-domain/.test(taskApi);
    if(activeRoute) failures.push('external owner-domain completion route exists');
  }
  if(!progress.includes('ClinicalTaskService.listTasksForPlan')) failures.push('care plan progress is not linked to real clinical tasks');
  if(!messaging.includes('NOT_CONFIGURED')) failures.push('messaging safety-unconfigured state is not explicit');
  if(!messagingSafety.includes('ProtectedMessageSafetyScannerPort')||!messagingSafety.includes('SafetySignalForwarderPort')) failures.push('privacy-preserving messaging Safety bridge incomplete');
  if(!attachmentPolicy.includes('DenyByDefaultMessagingAttachmentPolicy')||!messaging.includes('attachmentPolicyPort.validate')) failures.push('attachment policy is not deny-by-default');
  for (const [name, source] of [['migration', migration], ['messaging', messaging]]) {
    if (/;\\\\n|,\\\\n/.test(source)) failures.push(`${name} contains a literal \\n patch artifact`);
    if (/[,;]\+\s{2,}/.test(source)) failures.push(`${name} contains a stray + patch artifact`);
  }
  if(!runtime.includes('PgCarePlanRepository')||!runtime.includes('PgClinicalTaskRepository')||!runtime.includes('PgProfessionalMessagingRepository')){
    failures.push('Sprint 22 PostgreSQL runtime bootstrap incomplete');
  }
  if(!server.includes("app.use('/api/v1', sprint22Router)")) failures.push('Sprint 22 API router not wired into server');
  const depCreates=(migration.match(/CREATE TABLE IF NOT EXISTS clinical_task_dependencies/g)||[]).length;
  if(depCreates!==1) failures.push(`clinical_task_dependencies declaration count = ${depCreates}, expected 1`);
  for(const table of ['care_plans','care_plan_versions','care_goals','care_interventions','clinical_tasks','professional_message_threads','professional_messages']){
    if(!migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) failures.push(`migration missing table: ${table}`);
  }
  if(carePlanSources.includes('DataClassification.RESTRICTED')) failures.push('care plan events use non-canonical RESTRICTED classification');
  if(!carePlanSources.includes('DataClassification.CLINICAL_RECORD')) failures.push('care plan events are not classified as CLINICAL_RECORD');
  if(!tests.includes('spoofed-assessment-completion')) failures.push('anti-spoof owner-domain completion regression missing');
  if(!tests.includes('projects real clinical-task state')) failures.push('care-plan task projection regression missing');
}

if(failures.length){
  console.error('SPRINT 22 STRUCTURAL VERIFICATION FAILED');
  for(const f of failures) console.error('- '+f);
  process.exit(1);
}
console.log('SPRINT 22 STRUCTURAL VERIFICATION PASSED');
console.log(`Required files checked: ${required.length}`);
console.log('Safety/governance assertions: atomic initial plan, no invented review cadence, owner-domain anti-spoof, explicit messaging safety state.');
