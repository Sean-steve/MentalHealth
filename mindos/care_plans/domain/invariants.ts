/**
 * MindOS Care Plans Domain Invariants & Governance Rules
 */
import { DomainInvariantError, AuthorizationError } from '../../platform/errors/index.js';
import { CarePlan, CarePlanVersion, CareGoal } from './entities.js';
import { CarePlanState, CarePlanVersionStatus, CareGoalProvenance } from './types.js';

export class CarePlanInvariants {
  public static assertRelationshipEligible(relationship: { id: string; status: string; primary_provider_id?: string; }): void {
    if (relationship.status !== 'ACTIVE') {
      throw new DomainInvariantError(
        `R-PLAN-001: Cannot author or mutate Care Plan under inactive CareRelationship ${relationship.id} (status: ${relationship.status}).`,
        { safeUserMessage: 'An active care relationship is required for care planning.' }
      );
    }
  }

  public static assertVersionEditable(version: CarePlanVersion): void {
    if (version.status === CarePlanVersionStatus.ACTIVE || version.status === CarePlanVersionStatus.SUPERSEDED) {
      throw new DomainInvariantError(
        `R-PLAN-003: CarePlanVersion ${version.id} (version ${version.version}) is in ${version.status} state and cannot be mutated in-place. A new plan version must be drafted.`,
        { safeUserMessage: 'Active care plan versions are immutable. Please create a new plan version.' }
      );
    }
  }

  public static assertGoalActivationProvenance(goal: CareGoal, actorRole: string): void {
    if (goal.provenance === CareGoalProvenance.AI_SUGGESTED && actorRole !== 'PROFESSIONAL' && actorRole !== 'CLINICAL_REVIEWER') {
      throw new AuthorizationError(
        `R-PLAN-005: AI-suggested care goal ${goal.id} requires human clinical professional review before activation.`,
        { errorCode: 'AUTHZ_003' }
      );
    }
  }

  public static assertPlanActive(plan: CarePlan, operation = 'clinical task execution'): void {
    if (plan.status !== CarePlanState.ACTIVE) {
      throw new DomainInvariantError(
        `R-PLAN-006: Care Plan ${plan.id} is in status ${plan.status}. Active care plan required for ${operation}.`,
        { safeUserMessage: `Care plan is currently ${plan.status.toLowerCase()}.` }
      );
    }
  }
}
