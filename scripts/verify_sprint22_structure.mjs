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
  'mindos/clinical_tasks/adapters/notification_adapter.ts',
  'mindos/clinical_tasks/application/clinical_task_scheduler.ts',
  'mindos/clinical_tasks/application/ports.ts',
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
  'mindos/clinical_tasks/adapters/recurrence_policy_adapter.ts',
  'mindos/sprint22/maintenance.ts',
  'scripts/run_sprint22_maintenance.ts',
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
  const carePlanApi=read('mindos/care_plans/api/routes.ts');
  const carePlanReview=read('mindos/care_plans/reviews/care_plan_review_service.ts');
  const assignmentService=read('mindos/care_plans/assignments/assignment_service.ts');
  const task=read('mindos/clinical_tasks/application/clinical_task_service.ts');
  const taskRepositoryInterface=read('mindos/clinical_tasks/repositories/interfaces.ts');
  const taskPgRepository=read('mindos/clinical_tasks/repositories/pg_clinical_task_repository.ts');
  const scheduler=read('mindos/clinical_tasks/application/clinical_task_scheduler.ts');
  const taskPorts=read('mindos/clinical_tasks/application/ports.ts');
  const recurrencePolicy=read('mindos/clinical_tasks/adapters/recurrence_policy_adapter.ts');
  const maintenance=read('mindos/sprint22/maintenance.ts');
  const taskApi=read('mindos/clinical_tasks/api/routes.ts');
  const progress=read('mindos/care_plans/progress/care_plan_progress_service.ts');
  const messaging=read('mindos/professional_messaging/application/professional_messaging_service.ts');
  const messagingRepositoryInterface=read('mindos/professional_messaging/repositories/interfaces.ts');
  const messagingPgRepository=read('mindos/professional_messaging/repositories/pg_professional_messaging_repository.ts');
  const messagingApi=read('mindos/professional_messaging/api/routes.ts');
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

  if(!plan.includes('UnitOfWork.run')||
     !plan.includes('createPlanAggregate')||
     !plan.includes('replaceActiveVersionAggregate')||
     !plan.includes('registerOutboxEvent')) failures.push('Care Plan aggregate mutations/outbox are not application-owned Unit-of-Work transactions');
  if(!carePlanApi.includes('normalizeProfessionalGoals')||
     !carePlanApi.includes('normalizeProfessionalInterventions')||
     !carePlanApi.includes('generateUUIDv7')) failures.push('Care Plan API does not normalize client domain records');
  if(!carePlanApi.includes('normalizeProfessionalGoals')||
     !carePlanApi.includes('normalizeProfessionalInterventions')||
     !carePlanApi.includes('generateUUIDv7')) failures.push('Care Plan API does not normalize client domain records');
  if(!carePlanReview.includes('Care Plan review is stale because the current plan version has changed')||
     !carePlanReview.includes('Care Goal review does not belong to the Care Plan version under review')||
     !carePlanReview.includes('if(review.completed_at) return review;')) failures.push('Care Plan review version/goal integrity guards missing');
  if(!carePlanApi.includes('Invalid plan_type')||
     !carePlanApi.includes('Invalid review_type')||
     !carePlanApi.includes('Invalid Care Plan review outcome')) failures.push('Care Plan API enum validation incomplete');
  if(/reviewFrequencyDays\s*\?\?\s*30|reviewFrequencyDays\s*\|\|\s*30/.test(plan)) failures.push('care plan invents a 30-day review cadence');
  if(!plan.includes('requires subject-user acknowledgement before activation')||
     !plan.includes('if(version.acknowledged_by_user) return plan')) failures.push('Care Plan acknowledgement gate missing');
  if(!plan.includes('cannot create a replacement active version')||
     !plan.includes('Current Care Plan version')) failures.push('terminal/stale Care Plan revision guard missing');
  if(!assignmentService.includes('RelationshipAccessEvaluator.assertAccess')||
     !assignmentService.includes('does not belong to the current Care Plan version')) failures.push('assignment service authorization/version binding missing');
  if(!task.includes('trusted system actor')) failures.push('owner-domain completion is not restricted to trusted system actors');
  if(!task.includes('UnitOfWork.run')||
     !task.includes('createTaskAggregate')||
     !task.includes('completeTaskAggregate')||
     !task.includes('registerOutboxEvent')) failures.push('Clinical Task mutations/outbox are not Unit-of-Work atomic');
  if(!taskRepositoryInterface.includes('saveTaskWithExpectedState')||
     !taskPgRepository.includes('ConcurrencyError')||
     !taskPgRepository.includes('ON CONFLICT (idempotency_key)')) failures.push('Clinical Task optimistic/idempotent persistence contract incomplete');
  if(!task.includes('User-assigned clinical task must target the subject of the care relationship')) failures.push('cross-user task creation is not denied');
  if(!taskApi.includes('SYSTEM-owned clinical tasks cannot be created through the external HTTP API')) failures.push('external API can create SYSTEM-owned tasks');
  if(!taskApi.includes('Invalid task_type')||
     !taskApi.includes('Invalid assigned_to_type')||
     !taskApi.includes('Invalid task priority')) failures.push('task API runtime enum validation incomplete');
  if(taskApi.includes('completion_authority: completion_authority')||taskApi.includes('owner_domain,')) failures.push('external task creation API exposes authoritative completion fields');
  if(!task.includes('assertActorMatchesAssignment')||
     !task.includes('CareTeamService.getMembership')||
     !task.includes('CARE_RELATIONSHIP_ENDED')) failures.push('task action authorization does not revalidate assignment/relationship state');
  if(!scheduler.includes('Creates at most one next occurrence')||!scheduler.includes('recurrence:')) failures.push('bounded recurrence scheduler missing');
  if(!scheduler.includes('findReminderReceipt')||!migration.includes('clinical_task_reminder_receipts')) failures.push('reminder idempotency persistence missing');
  if(!migration.includes('recurrence_parent_task_id')||
     !migration.includes('recurrence_sequence')||
     !migration.includes('created_by_professional_id')) failures.push('recurrence lineage persistence missing');
  if(!taskPorts.includes('RECURRENCE_POLICY_NOT_CONFIGURED')) failures.push('recurrence does not fail explicitly when policy is absent');
  if(!recurrencePolicy.includes('PolicyRegistryClinicalTaskRecurrenceAdapter')||
     !recurrencePolicy.includes('PRIOR_DUE_AT')||
     !recurrencePolicy.includes('COMPLETED_AT')) failures.push('governed recurrence policy registry incomplete');
  if(!runtime.includes('MINDOS_TASK_RECURRENCE_POLICIES_JSON')||
     !runtime.includes('PolicyRegistryClinicalTaskRecurrenceAdapter')) failures.push('recurrence policy registry is not runtime-configured');
  if(!maintenance.includes('ClinicalTaskService.reconcile')||
     !maintenance.includes('sendDueReminders')||
     !maintenance.includes('spawnNextOccurrence')) failures.push('Sprint 22 maintenance runner does not orchestrate reconciliation, reminders and recurrence');
  if(taskApi.includes('complete-as-domain')) {
    const activeRoute=/\.post\([^\n]*complete-as-domain/.test(taskApi);
    if(activeRoute) failures.push('external owner-domain completion route exists');
  }
  if(!progress.includes('ClinicalTaskService.listTasksForPlan')) failures.push('care plan progress is not linked to real clinical tasks');
  if(!messaging.includes('NOT_CONFIGURED')) failures.push('messaging safety-unconfigured state is not explicit');
  if(!messaging.includes('UnitOfWork.run')||
     !messaging.includes('createThreadAggregate')||
     !messaging.includes('createMessageIdempotent')||
     !messaging.includes('registerOutboxEvent')) failures.push('Professional Messaging mutations/outbox are not Unit-of-Work atomic');
  if(!messagingRepositoryInterface.includes('saveMessageWithExpectedStatus')||
     !messagingRepositoryInterface.includes('saveThreadWithExpectedVersion')||
     !messagingPgRepository.includes('ConcurrencyError')||
     !messagingPgRepository.includes('ON CONFLICT (thread_id, idempotency_key)')) failures.push('Professional Messaging optimistic/idempotent persistence contract incomplete');
  if(messagingApi.includes('response_expectation_reference')) failures.push('messaging API still accepts client-defined response expectations');
  if(!messagingApi.includes('Invalid thread_type')||
     !messagingApi.includes('Invalid message_type')) failures.push('messaging runtime enum validation incomplete');
  if(!messaging.includes('Reply target must belong to the same care thread')) failures.push('cross-thread reply integrity guard missing');
  if(!messagingSafety.includes('ProtectedMessageSafetyScannerPort')||!messagingSafety.includes('SafetySignalForwarderPort')) failures.push('privacy-preserving messaging Safety bridge incomplete');
  if(!messagingSafety.includes('source_reference: params.content_reference')) failures.push('Safety bridge does not reference protected content evidence');
  if(!messagingSafety.includes('CrisisResponseSafetySignalForwarder')||
     !messagingSafety.includes('CrisisResponseOrchestrator')||
     !messagingSafety.includes('SignalSourceType.SYSTEM_OBSERVATION')) failures.push('canonical messaging Safety forwarder missing');
  if(!runtime.includes('messagingSafetyScanner')||
     !runtime.includes('UnconfiguredMessagingSafetyAdapter')) failures.push('messaging Safety runtime does not fail closed/reset when scanner is absent');
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
  if(!tests.includes('generates one idempotent next occurrence')) failures.push('recurrence acceptance regression missing');
  if(!tests.includes('deduplicates policy-driven task reminders')) failures.push('reminder deduplication regression missing');
  if(!tests.includes('fails closed for care-message attachments')) failures.push('attachment fail-closed regression missing');
  if(!tests.includes('reconciles plan, unfinished tasks and messaging')) failures.push('relationship-closure acceptance regression missing');
  if(!tests.includes('denies task action immediately after relationship termination')) failures.push('termination race regression missing');
  if(!tests.includes('rejects cross-user task assignment outside the care relationship subject')) failures.push('cross-user task assignment denial regression missing');
  if(!tests.includes('rejects a reply reference that points into another care thread')) failures.push('cross-thread reply regression missing');
  if(!tests.includes('makes completed Care Plan review retries idempotent')) failures.push('Care Plan review retry regression missing');
  if(!tests.includes('rejects a stale Care Plan review')) failures.push('stale Care Plan review regression missing');
  if(!tests.includes('does not let a professional bypass required user acknowledgement')) failures.push('acknowledgement-gate regression missing');
  if(!tests.includes('does not allow a terminal Care Plan to be resurrected')) failures.push('terminal plan immutability regression missing');
  if(!tests.includes('generates one idempotent next occurrence')) failures.push('recurrence acceptance regression missing');
  if(!tests.includes('deduplicates policy-driven task reminders')) failures.push('reminder deduplication regression missing');
  if(!tests.includes('fails closed for care-message attachments')) failures.push('attachment fail-closed regression missing');
}

if(failures.length){
  console.error('SPRINT 22 STRUCTURAL VERIFICATION FAILED');
  for(const f of failures) console.error('- '+f);
  process.exit(1);
}
console.log('SPRINT 22 STRUCTURAL VERIFICATION PASSED');
console.log(`Required files checked: ${required.length}`);
console.log('Safety/governance assertions: atomic initial plan, no invented review cadence, owner-domain anti-spoof, explicit messaging safety state.');
