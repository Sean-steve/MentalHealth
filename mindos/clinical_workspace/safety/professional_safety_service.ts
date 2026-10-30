/**
 * MindOS Professional Safety Concern Submission Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-SAFE-001)
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { NotFoundError } from '../../platform/errors/index.js';
import { ProfessionalSafetyConcern } from '../domain/entities.js';
import { ProfessionalSafetySeverity } from '../domain/types.js';
import { IClinicalWorkspaceRepository } from '../repositories/interfaces.js';
import {
  RelationshipAccessEvaluator,
  CareRelationshipService,
  DataDomain,
  ActionPermission
} from '../../care_relationships/index.js';

export interface SubmitSafetyConcernParams {
  relationshipId: string;
  reportingProfessionalId: string;
  concernType: string;
  severity: ProfessionalSafetySeverity;
  narrative: string;
  recommendedAction: string;
  actorId: string;
}

export class ProfessionalSafetyService {
  private static repository: IClinicalWorkspaceRepository;

  public static setRepository(repo: IClinicalWorkspaceRepository): void {
    ProfessionalSafetyService.repository = repo;
  }

  public static async submitSafetyConcern(
    params: SubmitSafetyConcernParams
  ): Promise<ProfessionalSafetyConcern> {
    // 1. Authorize professional access
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: params.relationshipId,
      professionalId: params.reportingProfessionalId,
      dataDomain: DataDomain.SAFETY_ALERTS,
      action: ActionPermission.WRITE,
      purpose: 'SAFETY_MONITORING'
    });

    const rel = await CareRelationshipService.getRelationship(params.relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${params.relationshipId} not found.`);
    }

    const concernId = generateUUIDv7();
    const now = new Date().toISOString();

    const concern: ProfessionalSafetyConcern = {
      id: concernId,
      care_relationship_id: params.relationshipId,
      subject_user_id: rel.subject_user_id,
      reporting_professional_id: params.reportingProfessionalId,
      concern_type: params.concernType,
      severity: params.severity,
      narrative: params.narrative,
      recommended_action: params.recommendedAction,
      created_at: now
    };

    await ProfessionalSafetyService.repository.saveSafetyConcern(concern);

    // Event & Audit
    EventBus.enqueue(
      'professional_safety_concern.submitted',
      'clinical_workspace',
      concernId,
      DataClassification.RESTRICTED,
      {
        concern_id: concernId,
        relationship_id: params.relationshipId,
        subject_user_id: rel.subject_user_id,
        reporter_id: params.reportingProfessionalId,
        severity: params.severity,
        concern_type: params.concernType
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'PROFESSIONAL_SAFETY_CONCERN.SUBMITTED',
      resource_type: 'professional_safety_concern',
      resource_id: concernId,
      purpose: 'Clinical Safety Protocol Execution',
      authorization_basis: { relationshipId: params.relationshipId },
      result: 'ALLOWED',
      metadata: {
        severity: params.severity,
        concernType: params.concernType
      }
    });

    return concern;
  }

  public static async listConcernsForRelationship(
    relationshipId: string,
    professionalId: string
  ): Promise<ProfessionalSafetyConcern[]> {
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId,
      professionalId,
      dataDomain: DataDomain.SAFETY_ALERTS,
      action: ActionPermission.READ,
      purpose: 'SAFETY_MONITORING'
    });

    return ProfessionalSafetyService.repository.findSafetyConcernsByRelationshipId(relationshipId);
  }
}
