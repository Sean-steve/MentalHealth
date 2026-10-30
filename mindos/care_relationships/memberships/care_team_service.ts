/**
 * MindOS Care Team Membership Management Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * 
 * Rules:
 * - Every team member must independently satisfy professional verification and active credential requirements.
 * - Membership is an ABAC attribute; it does NOT grant blanket authorization.
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { DomainInvariantError, AuthorizationError, NotFoundError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { CareTeamMembership } from '../domain/entities.js';
import {
  CareTeamRole,
  CareTeamMembershipState,
  DataDomain,
  ActionPermission
} from '../domain/types.js';
import { CareRelationshipInvariants } from '../domain/invariants.js';
import { ICareRelationshipRepository } from '../repositories/interfaces.js';
import { ProfessionalService } from '../../professionals/index.js';

export interface AddCareTeamMemberParams {
  relationshipId: string;
  professionalId: string;
  providerId: string;
  teamRole: CareTeamRole;
  scope?: {
    allowed_data_domains?: DataDomain[];
    allowed_actions?: ActionPermission[];
  };
  addedBy: string;
  reasonCode: string;
  jurisdiction?: string;
}

export class CareTeamService {
  private static repository: ICareRelationshipRepository;

  public static setRepository(repo: ICareRelationshipRepository): void {
    CareTeamService.repository = repo;
  }

  public static async addMember(params: AddCareTeamMemberParams): Promise<CareTeamMembership> {
    const rel = await CareTeamService.repository.findRelationshipById(params.relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${params.relationshipId} not found.`);
    }

    // Professional eligibility invariant check
    const isVerified = ProfessionalService.isVerified(params.professionalId);
    if (!isVerified) {
      throw new AuthorizationError(
        `Professional ${params.professionalId} must be verified to join a care team.`,
        { errorCode: 'AUTHZ_003' }
      );
    }

    // Check if professional is already a member
    const existing = await CareTeamService.repository.findMembership(
      params.relationshipId,
      params.professionalId
    );
    if (existing && existing.status === CareTeamMembershipState.ACTIVE) {
      throw new DomainInvariantError(
        `Professional ${params.professionalId} is already an active member of CareRelationship ${params.relationshipId}.`
      );
    }

    const membershipId = generateUUIDv7();
    const now = new Date().toISOString();

    const membership: CareTeamMembership = {
      id: membershipId,
      relationship_id: params.relationshipId,
      professional_id: params.professionalId,
      provider_id: params.providerId,
      team_role: params.teamRole,
      status: CareTeamMembershipState.ACTIVE,
      scope: {
        allowed_data_domains: params.scope?.allowed_data_domains || rel.scope.allowed_data_domains,
        allowed_actions: params.scope?.allowed_actions || rel.scope.allowed_actions
      },
      started_at: now,
      added_by: params.addedBy,
      reason_code: params.reasonCode,
      created_at: now,
      updated_at: now
    };

    await CareTeamService.repository.saveMembership(membership);

    // Event & Audit
    EventBus.enqueue(
      'care_team.member_added',
      'care_relationships',
      membershipId,
      DataClassification.RESTRICTED,
      {
        relationship_id: params.relationshipId,
        professional_id: params.professionalId,
        team_role: params.teamRole,
        added_by: params.addedBy
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.addedBy,
      action: 'CARE_TEAM.MEMBER_ADDED',
      resource_type: 'care_team_membership',
      resource_id: membershipId,
      purpose: 'Care Team Expansion',
      authorization_basis: { relationshipId: params.relationshipId },
      result: 'ALLOWED',
      metadata: {
        professionalId: params.professionalId,
        teamRole: params.teamRole
      }
    });

    return membership;
  }

  public static async removeMember(
    relationshipId: string,
    professionalId: string,
    removedBy: string,
    reason: string
  ): Promise<void> {
    const mem = await CareTeamService.repository.findMembership(relationshipId, professionalId);
    if (!mem) {
      throw new NotFoundError(
        `Membership for professional ${professionalId} in relationship ${relationshipId} not found.`
      );
    }

    validateStateTransition('CareTeamMembershipState', mem.status, CareTeamMembershipState.REMOVED, mem.id, removedBy);

    mem.status = CareTeamMembershipState.REMOVED;
    mem.ended_at = new Date().toISOString();
    mem.updated_at = new Date().toISOString();

    await CareTeamService.repository.saveMembership(mem);

    EventBus.enqueue(
      'care_team.member_removed',
      'care_relationships',
      mem.id,
      DataClassification.RESTRICTED,
      {
        relationship_id: relationshipId,
        professional_id: professionalId,
        removed_by: removedBy,
        reason
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: removedBy,
      action: 'CARE_TEAM.MEMBER_REMOVED',
      resource_type: 'care_team_membership',
      resource_id: mem.id,
      purpose: 'Care Team Member Removal',
      authorization_basis: { relationshipId },
      result: 'ALLOWED',
      metadata: { reason }
    });
  }

  public static async listMembers(
    relationshipId: string,
    status?: CareTeamMembershipState
  ): Promise<CareTeamMembership[]> {
    return CareTeamService.repository.findMembershipsByRelationshipId(relationshipId, status);
  }

  public static async getMembership(
    relationshipId: string,
    professionalId: string
  ): Promise<CareTeamMembership | null> {
    return CareTeamService.repository.findMembership(relationshipId, professionalId);
  }
}
