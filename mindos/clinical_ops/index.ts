export * from './domain/types.js';
export * from './repositories/index.js';
export * from './application/staffing_registry.js';
export * from './application/escalation_service.js';
export * from './application/follow_up_service.js';
export * from './application/incident_service.js';

import { ClinicalOperationsRepository, resetClinicalOperationsRepository } from './repositories/index.js';

export function resetClinicalOperationsForTesting(): void {
  resetClinicalOperationsRepository();
  void ClinicalOperationsRepository.reset?.();
}
