/**
 * MindOS Care Relationship Lifecycle Transition Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { DomainInvariantError, NotFoundError } from '../../platform/errors/index.js';
import { CareRelationship } from '../domain/entities.js';
import { CareRelationshipState } from '../domain/types.js';
import { ICareRelationshipRepository } from '../repositories/interfaces.js';

export class LifecycleTransitionService {
  private static repository: ICareRelationshipRepository;

  public static setRepository(repo: ICareRelationshipRepository): void {
    LifecycleTransitionService.repository = repo;
  }

  public static async transition(
    relationshipId: string,
    targetState: CareRelationshipState,
    actorId: string,
    reason?: string
  ): Promise<CareRelationship> {
    const rel = await LifecycleTransitionService.repository.findRelationshipById(relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${relationshipId} not found.`);
    }

    const previousState = rel.status;
    validateStateTransition('CareRelationshipState', previousState, targetState, rel.id, actorId);

    rel.status = targetState;
    rel.state = targetState;
    rel.updated_at = new Date().toISOString();
    rel.version += 1;

    if (targetState === CareRelationshipState.TERMINATED || targetState === CareRelationshipState.REVOKED) {
      rel.ended_at = new Date().toISOString();
    }

    await LifecycleTransitionService.repository.saveRelationship(rel);

    const eventMap: Partial<Record<CareRelationshipState, string>> = {
      [CareRelationshipState.ACTIVE]: 'care_relationship.activated',
      [CareRelationshipState.PAUSED]: 'care_relationship.paused',
      [CareRelationshipState.RESTRICTED]: 'care_relationship.restricted',
      [CareRelationshipState.TRANSFER_PENDING]: 'care_relationship.transfer_initiated',
      [CareRelationshipState.TERMINATED]: 'care_relationship.terminated',
      [CareRelationshipState.EXPIRED]: 'care_relationship.expired',
      [CareRelationshipState.REVOKED]: 'care_relationship.revoked'
    };

    const eventType = eventMap[targetState];
    if (eventType) {
      EventBus.enqueue(
        eventType,
        'care_relationships',
        rel.id,
        DataClassification.RESTRICTED,
        {
          relationship_id: rel.id,
          previous_state: previousState,
          new_state: targetState,
          reason,
          actor_id: actorId
        }
      );
    }

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: `CARE_RELATIONSHIP.STATE_TRANSITION.${targetState}`,
      resource_type: 'care_relationship',
      resource_id: rel.id,
      purpose: 'Lifecycle State Machine Transition',
      authorization_basis: { from: previousState, to: targetState },
      result: 'ALLOWED',
      metadata: { previousState, targetState, reason }
    });

    return rel;
  }
}
