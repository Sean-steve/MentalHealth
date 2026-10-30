/**
 * MindOS Care Relationship Management Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { DomainInvariantError, AuthorizationError, NotFoundError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import {
  CareRelationship,
  CareRelationshipScope
} from '../domain/entities.js';
import {
  CareRelationshipType,
  CareRelationshipState,
  CareRelationshipOriginType,
  CareTeamRole,
  CareTeamMembershipState,
  DataDomain,
  ActionPermission
} from '../domain/types.js';
import { CareRelationshipInvariants } from '../domain/invariants.js';
import { ICareRelationshipRepository } from '../repositories/interfaces.js';
import { CareTeamService } from '../memberships/care_team_service.js';
import { ProfessionalService } from '../../professionals/index.js';

export interface CreateCareRelationshipParams {
  subjectUserId: string;
  primaryProviderId?: string;
  organizationId?: string;
  relationshipType: CareRelationshipType;
  originType: CareRelationshipOriginType;
  originReference: string;
  jurisdiction?: string;
  purpose: string;
  allowedDataDomains?: DataDomain[];
  allowedActions?: ActionPermission[];
  consentReference?: string;
  activateImmediately?: boolean;
  actorId: string;
}

export class CareRelationshipService {
  private static repository: ICareRelationshipRepository;

  public static setRepository(repo: ICareRelationshipRepository): void {
    CareRelationshipService.repository = repo;
  }

  public static getRepository(): ICareRelationshipRepository {
    return CareRelationshipService.repository;
  }

  public static async createRelationship(
    params: CreateCareRelationshipParams
  ): Promise<CareRelationship> {
    // 1. Guard against invalid origin triggers (e.g. passive directory viewing)
    CareRelationshipInvariants.assertValidRelationshipCreationTrigger(params.originType);

    // 2. Validate primary provider if specified
    if (params.primaryProviderId) {
      const isVerified = ProfessionalService.isVerified(params.primaryProviderId);
      if (!isVerified) {
        throw new AuthorizationError(
          `Primary provider ${params.primaryProviderId} must be verified to establish a care relationship.`,
          { errorCode: 'AUTHZ_003' }
        );
      }
    }

    const relationshipId = generateUUIDv7();
    const now = new Date().toISOString();
    const jurisdiction = params.jurisdiction || 'KE';

    const defaultDomains: DataDomain[] = [
      DataDomain.CLINICAL_NOTES,
      DataDomain.ASSESSMENTS,
      DataDomain.SAFETY_ALERTS,
      DataDomain.DEMOGRAPHICS,
      DataDomain.APPOINTMENTS,
      DataDomain.CARE_PLANS,
      DataDomain.AI_SUMMARY,
      DataDomain.MESSAGING
    ];

    const defaultActions: ActionPermission[] = [
      ActionPermission.READ,
      ActionPermission.WRITE,
      ActionPermission.SIGN,
      ActionPermission.AMEND,
      ActionPermission.REFER,
      ActionPermission.MESSAGE
    ];

    const scope: CareRelationshipScope = {
      relationship_id: relationshipId,
      allowed_service_types: [params.relationshipType],
      allowed_data_domains: params.allowedDataDomains || defaultDomains,
      allowed_actions: params.allowedActions || defaultActions,
      jurisdiction,
      effective_at: now,
      policy_version: '1.0.0'
    };

    const initialStatus = params.activateImmediately
      ? CareRelationshipState.ACTIVE
      : CareRelationshipState.PROPOSED;

    const relationship: CareRelationship = {
      id: relationshipId,
      subject_user_id: params.subjectUserId,
      primary_provider_id: params.primaryProviderId,
      organization_id: params.organizationId,
      relationship_type: params.relationshipType,
      status: initialStatus,
      state: initialStatus,
      origin_type: params.originType,
      origin_reference: params.originReference,
      jurisdiction,
      started_at: now,
      purpose: params.purpose,
      scope,
      consent_reference: params.consentReference,
      created_at: now,
      updated_at: now,
      version: 1
    };

    await CareRelationshipService.repository.saveRelationship(relationship);

    // If primary provider is present, establish primary care team membership
    if (params.primaryProviderId) {
      await CareTeamService.addMember({
        relationshipId,
        professionalId: params.primaryProviderId,
        providerId: params.primaryProviderId,
        teamRole: CareTeamRole.PRIMARY_PROVIDER,
        addedBy: params.actorId,
        reasonCode: 'PRIMARY_PROVIDER_ASSIGNMENT',
        jurisdiction
      });
    }

    // Event & Audit
    EventBus.enqueue(
      params.activateImmediately ? 'care_relationship.activated' : 'care_relationship.proposed',
      'care_relationships',
      relationshipId,
      DataClassification.RESTRICTED,
      {
        relationship_id: relationshipId,
        subject_user_id: params.subjectUserId,
        primary_provider_id: params.primaryProviderId,
        status: initialStatus,
        origin_type: params.originType
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: params.activateImmediately ? 'CARE_RELATIONSHIP.ACTIVATED' : 'CARE_RELATIONSHIP.PROPOSED',
      resource_type: 'care_relationship',
      resource_id: relationshipId,
      purpose: params.purpose,
      authorization_basis: { originType: params.originType },
      result: 'ALLOWED',
      metadata: {
        subjectUserId: params.subjectUserId,
        primaryProviderId: params.primaryProviderId,
        status: initialStatus
      }
    });

    return relationship;
  }

  public static async activateRelationship(
    relationshipId: string,
    actorId: string
  ): Promise<CareRelationship> {
    const rel = await CareRelationshipService.repository.findRelationshipById(relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${relationshipId} not found.`);
    }

    validateStateTransition('CareRelationshipState', rel.status, CareRelationshipState.ACTIVE, rel.id, actorId);

    rel.status = CareRelationshipState.ACTIVE;
    rel.state = CareRelationshipState.ACTIVE;
    rel.updated_at = new Date().toISOString();
    rel.version += 1;

    await CareRelationshipService.repository.saveRelationship(rel);

    EventBus.enqueue(
      'care_relationship.activated',
      'care_relationships',
      rel.id,
      DataClassification.RESTRICTED,
      {
        relationship_id: rel.id,
        subject_user_id: rel.subject_user_id,
        primary_provider_id: rel.primary_provider_id
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CARE_RELATIONSHIP.ACTIVATED',
      resource_type: 'care_relationship',
      resource_id: rel.id,
      purpose: 'Care Activation',
      authorization_basis: { relationshipId: rel.id },
      result: 'ALLOWED'
    });

    return rel;
  }

  public static async pauseRelationship(
    relationshipId: string,
    reason: string,
    actorId: string
  ): Promise<CareRelationship> {
    const rel = await CareRelationshipService.repository.findRelationshipById(relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${relationshipId} not found.`);
    }

    validateStateTransition('CareRelationshipState', rel.status, CareRelationshipState.PAUSED, rel.id, actorId);

    rel.status = CareRelationshipState.PAUSED;
    rel.state = CareRelationshipState.PAUSED;
    rel.updated_at = new Date().toISOString();
    rel.version += 1;

    await CareRelationshipService.repository.saveRelationship(rel);

    EventBus.enqueue(
      'care_relationship.paused',
      'care_relationships',
      rel.id,
      DataClassification.RESTRICTED,
      {
        relationship_id: rel.id,
        reason,
        actor_id: actorId
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CARE_RELATIONSHIP.PAUSED',
      resource_type: 'care_relationship',
      resource_id: rel.id,
      purpose: 'Relationship Pause',
      authorization_basis: { reason },
      result: 'ALLOWED',
      metadata: { reason }
    });

    return rel;
  }

  public static async restrictRelationship(
    relationshipId: string,
    restrictedDataDomains: DataDomain[],
    restrictedActions: ActionPermission[],
    reason: string,
    actorId: string
  ): Promise<CareRelationship> {
    const rel = await CareRelationshipService.repository.findRelationshipById(relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${relationshipId} not found.`);
    }

    validateStateTransition('CareRelationshipState', rel.status, CareRelationshipState.RESTRICTED, rel.id, actorId);

    rel.status = CareRelationshipState.RESTRICTED;
    rel.state = CareRelationshipState.RESTRICTED;
    rel.scope.allowed_data_domains = restrictedDataDomains;
    rel.scope.allowed_actions = restrictedActions;
    rel.updated_at = new Date().toISOString();
    rel.version += 1;

    await CareRelationshipService.repository.saveRelationship(rel);

    EventBus.enqueue(
      'care_relationship.restricted',
      'care_relationships',
      rel.id,
      DataClassification.RESTRICTED,
      {
        relationship_id: rel.id,
        reason,
        restricted_domains: restrictedDataDomains,
        restricted_actions: restrictedActions
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CARE_RELATIONSHIP.RESTRICTED',
      resource_type: 'care_relationship',
      resource_id: rel.id,
      purpose: 'Relationship Scope Restriction',
      authorization_basis: { reason },
      result: 'ALLOWED',
      metadata: { reason, restrictedDataDomains, restrictedActions }
    });

    return rel;
  }

  public static async terminateRelationship(
    relationshipId: string,
    reason: string,
    actorId: string
  ): Promise<CareRelationship> {
    const rel = await CareRelationshipService.repository.findRelationshipById(relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${relationshipId} not found.`);
    }

    validateStateTransition('CareRelationshipState', rel.status, CareRelationshipState.TERMINATED, rel.id, actorId);

    const now = new Date().toISOString();
    rel.status = CareRelationshipState.TERMINATED;
    rel.state = CareRelationshipState.TERMINATED;
    rel.ended_at = now;
    rel.updated_at = now;
    rel.version += 1;

    // Restrict scope to READ only for post-termination archival compliance
    rel.scope.allowed_actions = [ActionPermission.READ];

    await CareRelationshipService.repository.saveRelationship(rel);

    EventBus.enqueue(
      'care_relationship.terminated',
      'care_relationships',
      rel.id,
      DataClassification.RESTRICTED,
      {
        relationship_id: rel.id,
        reason,
        terminated_at: now,
        terminated_by: actorId
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CARE_RELATIONSHIP.TERMINATED',
      resource_type: 'care_relationship',
      resource_id: rel.id,
      purpose: 'Relationship Termination',
      authorization_basis: { reason },
      result: 'ALLOWED',
      metadata: { reason, endedAt: now }
    });

    return rel;
  }

  public static async getRelationship(id: string): Promise<CareRelationship | null> {
    return CareRelationshipService.repository.findRelationshipById(id);
  }

  public static async listUserRelationships(
    userId: string,
    status?: CareRelationshipState
  ): Promise<CareRelationship[]> {
    return CareRelationshipService.repository.findRelationshipsByUserId(userId, status);
  }

  public static async listProfessionalRelationships(
    professionalId: string,
    status?: CareRelationshipState
  ): Promise<CareRelationship[]> {
    // Find where professional is primary provider or care team member
    const direct = await CareRelationshipService.repository.findRelationshipsByProviderId(professionalId, status);
    const memberships = await CareRelationshipService.repository.findMembershipsByProfessionalId(
      professionalId,
      CareTeamMembershipState.ACTIVE
    );

    const relMap = new Map<string, CareRelationship>();
    for (const r of direct) {
      relMap.set(r.id, r);
    }

    for (const m of memberships) {
      if (!relMap.has(m.relationship_id)) {
        const r = await CareRelationshipService.repository.findRelationshipById(m.relationship_id);
        if (r && (!status || r.status === status)) {
          relMap.set(r.id, r);
        }
      }
    }

    return Array.from(relMap.values());
  }

  public static async updateScope(
    relationshipId: string,
    newScope: Partial<CareRelationshipScope>,
    actorId: string
  ): Promise<CareRelationship> {
    const rel = await CareRelationshipService.repository.findRelationshipById(relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${relationshipId} not found.`);
    }

    if (rel.status === CareRelationshipState.TERMINATED || rel.status === CareRelationshipState.REVOKED) {
      throw new DomainInvariantError('Cannot modify scope of terminated or revoked relationship.');
    }

    if (newScope.allowed_data_domains) {
      rel.scope.allowed_data_domains = newScope.allowed_data_domains;
    }
    if (newScope.allowed_actions) {
      rel.scope.allowed_actions = newScope.allowed_actions;
    }
    rel.updated_at = new Date().toISOString();
    rel.version += 1;

    await CareRelationshipService.repository.saveRelationship(rel);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CARE_RELATIONSHIP.SCOPE_UPDATED',
      resource_type: 'care_relationship',
      resource_id: rel.id,
      purpose: 'Scope Update',
      authorization_basis: { relationshipId: rel.id },
      result: 'ALLOWED',
      metadata: { scope: rel.scope }
    });

    return rel;
  }
}
