/**
 * MindOS Care Relationships & Care Continuity Context
 * Sprint 21 Bounded Context
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import { InMemoryCareRelationshipRepository } from './repositories/in_memory_care_relationship_repository.js';
import { CareRelationshipService } from './relationships/care_relationship_service.js';
import { CareTeamService } from './memberships/care_team_service.js';
import { RelationshipAccessEvaluator } from './access/relationship_access_evaluator.js';
import { LifecycleTransitionService } from './transitions/lifecycle_transition_service.js';
import { CareTransferService } from './transfers/care_transfer_service.js';
import { ContinuityReconciliationService } from './infrastructure/continuity_reconciliation_service.js';

// Initialize default in-memory repository instance
const defaultRepository = new InMemoryCareRelationshipRepository();
CareRelationshipService.setRepository(defaultRepository);
CareTeamService.setRepository(defaultRepository);
RelationshipAccessEvaluator.setRepository(defaultRepository);
LifecycleTransitionService.setRepository(defaultRepository);
CareTransferService.setRepository(defaultRepository);
ContinuityReconciliationService.setRepository(defaultRepository);

export * from './domain/types.js';
export * from './domain/entities.js';
export * from './domain/invariants.js';
export * from './repositories/interfaces.js';
export * from './repositories/in_memory_care_relationship_repository.js';
export * from './relationships/care_relationship_service.js';
export * from './memberships/care_team_service.js';
export * from './access/relationship_access_evaluator.js';
export * from './transitions/lifecycle_transition_service.js';
export * from './transfers/care_transfer_service.js';
export * from './application/eligibility_service.js';
export * from './adapters/referral_transition_adapter.js';
export * from './adapters/appointment_lifecycle_adapter.js';
export * from './infrastructure/continuity_reconciliation_service.js';

export function resetCareRelationshipsForTesting(): void {
  defaultRepository.clear();
}
