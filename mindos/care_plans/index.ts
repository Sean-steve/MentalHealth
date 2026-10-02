/**
 * MindOS Care Plans Bounded Context Entry Point
 * Sprint 22
 */
import { InMemoryCarePlanRepository } from './repositories/in_memory_care_plan_repository.js';
import { CarePlanService } from './plans/care_plan_service.js';
import { CareGoalService } from './goals/care_goal_service.js';
import { CareInterventionService } from './interventions/care_intervention_service.js';
import { AssignmentService } from './assignments/assignment_service.js';
import { CarePlanReviewService } from './reviews/care_plan_review_service.js';
import { CarePlanProgressService } from './progress/care_plan_progress_service.js';

const defaultRepository=new InMemoryCarePlanRepository();
CarePlanService.setRepository(defaultRepository);
CareGoalService.setRepository(defaultRepository);
CareInterventionService.setRepository(defaultRepository);
AssignmentService.setRepository(defaultRepository);
CarePlanReviewService.setRepository(defaultRepository);
CarePlanProgressService.setRepository(defaultRepository);

export * from './domain/types.js';
export * from './domain/entities.js';
export * from './domain/invariants.js';
export * from './repositories/interfaces.js';
export * from './repositories/in_memory_care_plan_repository.js';
export * from './repositories/pg_care_plan_repository.js';
export * from './application/eligibility_service.js';
export * from './plans/care_plan_service.js';
export * from './goals/care_goal_service.js';
export * from './interventions/care_intervention_service.js';
export * from './assignments/assignment_service.js';
export * from './reviews/care_plan_review_service.js';
export * from './progress/care_plan_progress_service.js';
export * from './api/routes.js';

export function resetCarePlansForTesting():void{void defaultRepository.clear();}
