/**
 * MindOS Outcomes & Measurement-Based Care Bounded Context Entry Point
 * Sprint 23 Bounded Context
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import { InMemoryOutcomeRepository } from './repositories/in_memory_outcome_repository.js';
import { MeasureRegistry } from './measures/measure_registry.js';
import { OutcomeMeasurementService } from './measurements/measurement_service.js';
import { OutcomeSeriesService } from './series/outcome_series_service.js';
import { OutcomeReviewService } from './reviews/outcome_review_service.js';
import { OutcomeAlertService } from './alerts/outcome_alert_service.js';
import { OutcomeService } from './application/outcome_service.js';
import { ProgressViewService } from './application/progress_view_service.js';

// Default repository instance
const defaultRepository = new InMemoryOutcomeRepository();
MeasureRegistry.initialize();
OutcomeMeasurementService.setRepository(defaultRepository);
OutcomeSeriesService.setRepository(defaultRepository);
OutcomeReviewService.setRepository(defaultRepository);
OutcomeAlertService.setRepository(defaultRepository);
OutcomeService.setRepository(defaultRepository);
ProgressViewService.setRepository(defaultRepository);

export * from './domain/types.js';
export * from './domain/entities.js';
export * from './domain/invariants.js';
export * from './measures/measure_registry.js';
export * from './measures/seed_measures.js';
export * from './repositories/interfaces.js';
export * from './repositories/in_memory_outcome_repository.js';
export * from './repositories/pg_outcome_repository.js';
export * from './repositories/pg_outcome_governance_repository.js';
export * from './measurements/measurement_service.js';
export * from './series/comparability_service.js';
export * from './series/outcome_series_service.js';
export * from './trends/clinical_change_rules.js';
export * from './trends/trend_engine.js';
export * from './reviews/outcome_review_service.js';
export * from './alerts/outcome_alert_service.js';
export * from './alerts/outcome_alert_policy.js';
export * from './adapters/assessment_outcome_adapter.js';
export * from './adapters/care_plan_outcome_adapter.js';
export * from './adapters/safety_kernel_outcome_adapter.js';
export * from './application/outcome_service.js';
export * from './application/progress_view_service.js';
export * from './infrastructure/outcome_reconciliation_service.js';

export function resetOutcomesForTesting(): void {
  defaultRepository.clear();
  MeasureRegistry.resetForTesting();
  ClinicalChangeRuleRegistry.resetForTesting();
  OutcomeAlertPolicyRegistry.clear();
}
