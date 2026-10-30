/**
 * MindOS Care Transfer Management Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * 
 * Rules:
 * - Transfer requires target provider verification and patient consent.
 * - During TRANSFER_PENDING, original relationship remains in governed transfer state.
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { DomainInvariantError, AuthorizationError, NotFoundError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { CareRelationship } from '../domain/entities.js';
import {
  CareRelationshipState,
  CareRelationshipOriginType,
  CareTeamRole
} from '../domain/types.js';
import { ICareRelationshipRepository } from '../repositories/interfaces.js';
import { CareRelationshipService } from '../relationships/care_relationship_service.js';
import { CareTeamService } from '../memberships/care_team_service.js';
import { ProfessionalService } from '../../professionals/index.js';

export interface InitiateTransferParams {
  relationshipId: string;
  targetProviderId: string;
  reason: string;
  actorId: string;
}

export interface CompleteTransferParams {
  relationshipId: string;
  userConsentReference: string;
  actorId: string;
}

export class CareTransferService {
  private static repository: ICareRelationshipRepository;

  public static setRepository(repo: ICareRelationshipRepository): void {
    CareTransferService.repository = repo;
  }

  public static async initiateTransfer(
    params: InitiateTransferParams
  ): Promise<CareRelationship> {
    const rel = await CareTransferService.repository.findRelationshipById(params.relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${params.relationshipId} not found.`);
    }

    if (rel.status !== CareRelationshipState.ACTIVE && rel.status !== CareRelationshipState.PAUSED) {
      throw new DomainInvariantError(
        `Cannot initiate transfer on relationship in state ${rel.status}. Must be ACTIVE or PAUSED.`
      );
    }

    // Verify target provider eligibility
    const isTargetVerified = ProfessionalService.isVerified(params.targetProviderId);
    if (!isTargetVerified) {
      throw new AuthorizationError(
        `Target provider ${params.targetProviderId} is not verified for care delivery.`,
        { errorCode: 'AUTHZ_003' }
      );
    }

    validateStateTransition(
      'CareRelationshipState',
      rel.status,
      CareRelationshipState.TRANSFER_PENDING,
      rel.id,
      params.actorId
    );

    rel.status = CareRelationshipState.TRANSFER_PENDING;
    rel.state = CareRelationshipState.TRANSFER_PENDING;
    rel.transfer_target_provider_id = params.targetProviderId;
    rel.updated_at = new Date().toISOString();
    rel.version += 1;

    await CareTransferService.repository.saveRelationship(rel);

    EventBus.enqueue(
      'care_relationship.transfer_initiated',
      'care_relationships',
      rel.id,
      DataClassification.RESTRICTED,
      {
        relationship_id: rel.id,
        current_provider_id: rel.primary_provider_id,
        target_provider_id: params.targetProviderId,
        reason: params.reason
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CARE_RELATIONSHIP.TRANSFER_INITIATED',
      resource_type: 'care_relationship',
      resource_id: rel.id,
      purpose: 'Transfer of Care',
      authorization_basis: { targetProviderId: params.targetProviderId },
      result: 'ALLOWED',
      metadata: { reason: params.reason, targetProviderId: params.targetProviderId }
    });

    return rel;
  }

  public static async completeTransfer(
    params: CompleteTransferParams
  ): Promise<{ previousRelationship: CareRelationship; newRelationship: CareRelationship }> {
    const prevRel = await CareTransferService.repository.findRelationshipById(params.relationshipId);
    if (!prevRel) {
      throw new NotFoundError(`CareRelationship ${params.relationshipId} not found.`);
    }

    if (prevRel.status !== CareRelationshipState.TRANSFER_PENDING) {
      throw new DomainInvariantError(
        `Relationship ${prevRel.id} is in state ${prevRel.status}, not TRANSFER_PENDING.`
      );
    }

    const targetProviderId = prevRel.transfer_target_provider_id;
    if (!targetProviderId) {
      throw new DomainInvariantError('No target provider specified on transfer.');
    }

    // 1. Terminate previous relationship
    validateStateTransition(
      'CareRelationshipState',
      prevRel.status,
      CareRelationshipState.TERMINATED,
      prevRel.id,
      params.actorId
    );

    const now = new Date().toISOString();
    prevRel.status = CareRelationshipState.TERMINATED;
    prevRel.state = CareRelationshipState.TERMINATED;
    prevRel.ended_at = now;
    prevRel.updated_at = now;
    prevRel.version += 1;
    await CareTransferService.repository.saveRelationship(prevRel);

    // 2. Establish new relationship for target provider
    const newRel = await CareRelationshipService.createRelationship({
      subjectUserId: prevRel.subject_user_id,
      primaryProviderId: targetProviderId,
      organizationId: prevRel.organization_id,
      relationshipType: prevRel.relationship_type,
      originType: CareRelationshipOriginType.ADMINISTRATIVE_TRANSFER,
      originReference: prevRel.id,
      jurisdiction: prevRel.jurisdiction,
      purpose: prevRel.purpose,
      allowedDataDomains: prevRel.scope.allowed_data_domains,
      allowedActions: prevRel.scope.allowed_actions,
      consentReference: params.userConsentReference,
      activateImmediately: true,
      actorId: params.actorId
    });

    EventBus.enqueue(
      'care_relationship.transferred',
      'care_relationships',
      newRel.id,
      DataClassification.RESTRICTED,
      {
        previous_relationship_id: prevRel.id,
        new_relationship_id: newRel.id,
        patient_id: prevRel.subject_user_id,
        new_provider_id: targetProviderId
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CARE_RELATIONSHIP.TRANSFER_COMPLETED',
      resource_type: 'care_relationship',
      resource_id: newRel.id,
      purpose: 'Transfer of Care Completed',
      authorization_basis: { previousRelationshipId: prevRel.id },
      result: 'ALLOWED',
      metadata: {
        previousRelationshipId: prevRel.id,
        newRelationshipId: newRel.id,
        targetProviderId
      }
    });

    return {
      previousRelationship: prevRel,
      newRelationship: newRel
    };
  }

  public static async cancelTransfer(
    relationshipId: string,
    reason: string,
    actorId: string
  ): Promise<CareRelationship> {
    const rel = await CareTransferService.repository.findRelationshipById(relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${relationshipId} not found.`);
    }

    if (rel.status !== CareRelationshipState.TRANSFER_PENDING) {
      throw new DomainInvariantError(`Relationship ${rel.id} is not in TRANSFER_PENDING status.`);
    }

    validateStateTransition(
      'CareRelationshipState',
      rel.status,
      CareRelationshipState.ACTIVE,
      rel.id,
      actorId
    );

    rel.status = CareRelationshipState.ACTIVE;
    rel.state = CareRelationshipState.ACTIVE;
    rel.transfer_target_provider_id = undefined;
    rel.updated_at = new Date().toISOString();
    rel.version += 1;

    await CareTransferService.repository.saveRelationship(rel);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CARE_RELATIONSHIP.TRANSFER_CANCELLED',
      resource_type: 'care_relationship',
      resource_id: rel.id,
      purpose: 'Transfer Cancellation',
      authorization_basis: { reason },
      result: 'ALLOWED',
      metadata: { reason }
    });

    return rel;
  }
}
