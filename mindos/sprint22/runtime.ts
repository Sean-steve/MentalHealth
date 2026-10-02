import {
  CarePlanService,
  CareGoalService,
  CareInterventionService,
  AssignmentService,
  CarePlanReviewService,
  CarePlanProgressService
} from '../care_plans/index.js';
import { PgCarePlanRepository } from '../care_plans/repositories/pg_care_plan_repository.js';
import { ClinicalTaskService, PgClinicalTaskRepository } from '../clinical_tasks/index.js';
import {
  ProfessionalMessagingService,
  PgProfessionalMessagingRepository,
  NotificationServiceMessagingAdapter
} from '../professional_messaging/index.js';

export interface Sprint22RuntimeStatus {
  persistence: 'POSTGRES' | 'IN_MEMORY_DEFAULT';
  professional_messaging_notifications: 'CONFIGURED';
  professional_messaging_safety: 'EXPLICIT_SCANNER_AND_FORWARDER_REQUIRED';
  professional_messaging_attachments: 'DENY_BY_DEFAULT';
}

let configured = false;
let status: Sprint22RuntimeStatus = {
  persistence: 'IN_MEMORY_DEFAULT',
  professional_messaging_notifications: 'CONFIGURED',
  professional_messaging_safety: 'EXPLICIT_SCANNER_AND_FORWARDER_REQUIRED',
  professional_messaging_attachments: 'DENY_BY_DEFAULT'
};

export function configureSprint22Runtime(options: {
  usePostgres?: boolean;
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

  configured = true;
  status = {
    persistence: usePostgres ? 'POSTGRES' : 'IN_MEMORY_DEFAULT',
    professional_messaging_notifications: 'CONFIGURED',
    professional_messaging_safety: 'EXPLICIT_SCANNER_AND_FORWARDER_REQUIRED',
    professional_messaging_attachments: 'DENY_BY_DEFAULT'
  };
  return { ...status };
}

export function getSprint22RuntimeStatus(): Sprint22RuntimeStatus & { configured: boolean } {
  return { ...status, configured };
}
