import {
  CarePlanService,
  CareGoalService,
  CareInterventionService,
  AssignmentService,
  CarePlanReviewService,
  CarePlanProgressService
} from '../care_plans/index.js';
import { PgCarePlanRepository } from '../care_plans/repositories/pg_care_plan_repository.js';
import {
  ClinicalTaskService,
  ClinicalTaskScheduler,
  PgClinicalTaskRepository,
  NotificationServiceClinicalTaskReminderAdapter,
  PolicyRegistryClinicalTaskRecurrenceAdapter,
  parseClinicalTaskRecurrencePolicies,
  ClinicalTaskRecurrencePolicy,
  UnconfiguredClinicalTaskRecurrenceAdapter
} from '../clinical_tasks/index.js';
import {
  ProfessionalMessagingService,
  PgProfessionalMessagingRepository,
  NotificationServiceMessagingAdapter,
  ProtectedMessageSafetyScannerPort,
  SafetyKernelMessagingAdapter,
  CrisisResponseSafetySignalForwarder,
  CanonicalAcuteDistressProtectedMessageScanner,
  RepositoryProtectedMessageContentResolver,
  ConfiguredMessagingAttachmentPolicy,
  MessagingAttachmentPolicyConfig,
  parseMessagingAttachmentPolicyConfig,
  DenyByDefaultMessagingAttachmentPolicy
} from '../professional_messaging/index.js';

export interface Sprint22RuntimeStatus {
  persistence: 'POSTGRES' | 'IN_MEMORY_DEFAULT';
  professional_messaging_notifications: 'CONFIGURED';
  professional_messaging_safety: 'CONFIGURED';
  professional_messaging_attachments: 'CONFIGURED' | 'DENY_BY_DEFAULT';
  clinical_task_reminders: 'CONFIGURED';
  clinical_task_recurrence: 'CONFIGURED' | 'EXPLICIT_POLICY_REQUIRED';
}

let configured = false;
let status: Sprint22RuntimeStatus = {
  persistence: 'IN_MEMORY_DEFAULT',
  professional_messaging_notifications: 'CONFIGURED',
  professional_messaging_safety: 'CONFIGURED',
  professional_messaging_attachments: 'DENY_BY_DEFAULT',
  clinical_task_reminders: 'CONFIGURED',
  clinical_task_recurrence: 'EXPLICIT_POLICY_REQUIRED'
};

export function configureSprint22Runtime(options: {
  usePostgres?: boolean;
  recurrencePolicies?: ClinicalTaskRecurrencePolicy[];
  messagingSafetyScanner?: ProtectedMessageSafetyScannerPort;
  attachmentPolicyConfig?: MessagingAttachmentPolicyConfig;
} = {}): Sprint22RuntimeStatus {
  const usePostgres = options.usePostgres ?? process.env.NODE_ENV === 'production';

  if (usePostgres) {
    const carePlanRepository = new PgCarePlanRepository();
    CarePlanService.setRepository(carePlanRepository);
    CareGoalService.setRepository(carePlanRepository);
    CareInterventionService.setRepository(carePlanRepository);
    AssignmentService.setRepository(carePlanRepository);
    CarePlanReviewService.setRepository(carePlanRepository);
    CarePlanProgressService.setRepository(carePlanRepository);

    ClinicalTaskService.setRepository(new PgClinicalTaskRepository());
    ProfessionalMessagingService.setRepository(new PgProfessionalMessagingRepository());
  }

  ProfessionalMessagingService.setNotificationPort(new NotificationServiceMessagingAdapter());
  ClinicalTaskScheduler.setReminderPort(new NotificationServiceClinicalTaskReminderAdapter());

  const messagingSafetyScanner =
    options.messagingSafetyScanner ??
    new CanonicalAcuteDistressProtectedMessageScanner(
      new RepositoryProtectedMessageContentResolver(
        ProfessionalMessagingService.getRepository()
      )
    );
  ProfessionalMessagingService.setSafetyPort(
    new SafetyKernelMessagingAdapter(
      messagingSafetyScanner,
      new CrisisResponseSafetySignalForwarder()
    )
  );

  const attachmentPolicyConfig =
    options.attachmentPolicyConfig ??
    parseMessagingAttachmentPolicyConfig(
      process.env.MINDOS_MESSAGE_ATTACHMENT_POLICY_JSON
    );
  if (attachmentPolicyConfig) {
    ProfessionalMessagingService.setAttachmentPolicyPort(
      new ConfiguredMessagingAttachmentPolicy(attachmentPolicyConfig)
    );
  } else {
    ProfessionalMessagingService.setAttachmentPolicyPort(
      new DenyByDefaultMessagingAttachmentPolicy()
    );
  }

  const recurrencePolicies =
    options.recurrencePolicies ??
    parseClinicalTaskRecurrencePolicies(process.env.MINDOS_TASK_RECURRENCE_POLICIES_JSON);
  if (recurrencePolicies.length > 0) {
    ClinicalTaskScheduler.setRecurrencePort(
      new PolicyRegistryClinicalTaskRecurrenceAdapter(recurrencePolicies)
    );
  } else {
    ClinicalTaskScheduler.setRecurrencePort(
      new UnconfiguredClinicalTaskRecurrenceAdapter()
    );
  }

  configured = true;
  status = {
    persistence: usePostgres ? 'POSTGRES' : 'IN_MEMORY_DEFAULT',
    professional_messaging_notifications: 'CONFIGURED',
    professional_messaging_safety: 'CONFIGURED',
    professional_messaging_attachments: attachmentPolicyConfig ? 'CONFIGURED' : 'DENY_BY_DEFAULT',
    clinical_task_reminders: 'CONFIGURED',
    clinical_task_recurrence: recurrencePolicies.length > 0 ? 'CONFIGURED' : 'EXPLICIT_POLICY_REQUIRED'
  };
  return { ...status };
}

export function getSprint22RuntimeStatus(): Sprint22RuntimeStatus & { configured: boolean } {
  return { ...status, configured };
}
