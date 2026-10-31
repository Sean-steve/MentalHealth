export * from './domain/types.js';
export * from './repositories/in_memory.js';
export * from './application/staffing_registry.js';
export * from './application/escalation_service.js';
export * from './application/follow_up_service.js';
export * from './application/incident_service.js';

import { ClinicalOperationsRepository } from './repositories/in_memory.js';

export function resetClinicalOperationsForTesting(): void {
  ClinicalOperationsRepository.reset();
}
