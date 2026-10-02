import { InMemoryClinicalTaskRepository } from './repositories/in_memory_clinical_task_repository.js';
import { ClinicalTaskService } from './application/clinical_task_service.js';

const defaultRepository = new InMemoryClinicalTaskRepository();
ClinicalTaskService.setRepository(defaultRepository);

export * from './domain/types.js';
export * from './domain/entities.js';
export * from './repositories/interfaces.js';
export * from './repositories/in_memory_clinical_task_repository.js';
export * from './repositories/pg_clinical_task_repository.js';
export * from './api/routes.js';
export * from './application/clinical_task_service.js';

export function resetClinicalTasksForTesting(): void { defaultRepository.clear(); }