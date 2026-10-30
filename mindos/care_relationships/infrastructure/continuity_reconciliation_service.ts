/**
 * MindOS Care Continuity Reconciliation Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * 
 * Rules:
 * - Provider suspension cascades to PAUSED/RESTRICTED relationship status (R-REL-006).
 * - Suspended provider care team memberships are set to SUSPENDED.
 * - Credential expiry restricts write and signing capabilities until reverification.
 */

import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { CareRelationship } from '../domain/entities.js';
import {
  CareRelationshipState,
  CareTeamMembershipState,
  DataDomain,
  ActionPermission
} from '../domain/types.js';
import { ICareRelationshipRepository } from '../repositories/interfaces.js';
import { CareRelationshipService } from '../relationships/care_relationship_service.js';

export interface ReconcileSuspensionResult {
  providerId: string;
  affectedRelationshipsCount: number;
  affectedMembershipsCount: number;
  reconciledAt: string;
}

export class ContinuityReconciliationService {
  private static repository: ICareRelationshipRepository;

  public static setRepository(repo: ICareRelationshipRepository): void {
    ContinuityReconciliationService.repository = repo;
  }

  public static async handleProviderSuspension(
    providerId: string,
    reason: string,
    actorId: string
  ): Promise<ReconcileSuspensionResult> {
    const relationships = await ContinuityReconciliationService.repository.findRelationshipsByProviderId(
      providerId,
      CareRelationshipState.ACTIVE
    );

    let relCount = 0;
    for (const rel of relationships) {
      await CareRelationshipService.pauseRelationship(
        rel.id,
        `Care continuity safeguard: Primary provider suspended (${reason})`,
        actorId
      );
      relCount++;
    }

    // Also suspend any care team memberships for this professional
    const memberships = await ContinuityReconciliationService.repository.findMembershipsByProfessionalId(
      providerId,
      CareTeamMembershipState.ACTIVE
    );

    let memCount = 0;
    for (const mem of memberships) {
      mem.status = CareTeamMembershipState.SUSPENDED;
      mem.updated_at = new Date().toISOString();
      await ContinuityReconciliationService.repository.saveMembership(mem);
      memCount++;
    }

    EventBus.enqueue(
      'care_continuity.impact_reconciled',
      'care_relationships',
      providerId,
      DataClassification.RESTRICTED,
      {
        provider_id: providerId,
        paused_relationships_count: relCount,
        suspended_memberships_count: memCount,
        reason,
        reconciled_by: actorId
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CARE_CONTINUITY.PROVIDER_SUSPENSION_RECONCILED',
      resource_type: 'provider',
      resource_id: providerId,
      purpose: 'Care Continuity Protection',
      authorization_basis: { reason },
      result: 'ALLOWED',
      metadata: { pausedRelationships: relCount, suspendedMemberships: memCount }
    });

    return {
      providerId,
      affectedRelationshipsCount: relCount,
      affectedMembershipsCount: memCount,
      reconciledAt: new Date().toISOString()
    };
  }

  public static async handleCredentialExpiry(
    professionalId: string,
    actorId: string
  ): Promise<void> {
    const relationships = await ContinuityReconciliationService.repository.findRelationshipsByProviderId(
      professionalId,
      CareRelationshipState.ACTIVE
    );

    // Restrict write & signing actions
    for (const rel of relationships) {
      const allowedActions = rel.scope.allowed_actions.filter(
        a => a !== ActionPermission.SIGN && a !== ActionPermission.WRITE
      );
      await CareRelationshipService.restrictRelationship(
        rel.id,
        rel.scope.allowed_data_domains,
        allowedActions,
        'Credential expired: write and signing privileges suspended pending reverification',
        actorId
      );
    }
  }
}
