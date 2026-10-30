/**
 * MindOS Care Plan Management Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { NotFoundError } from '../../platform/errors/index.js';
import { CarePlan } from '../domain/entities.js';
import { CarePlanStatus } from '../domain/types.js';
import { IClinicalWorkspaceRepository } from '../repositories/interfaces.js';
import {
  RelationshipAccessEvaluator,
  CareRelationshipService,
  DataDomain,
  ActionPermission
} from '../../care_relationships/index.js';

export interface CreateCarePlanParams {
  relationshipId: string;
  authorProfessionalId: string;
  title: string;
  goals: string[];
  interventions: string[];
  reviewDate?: string;
  actorId: string;
}

export class CarePlanService {
  private static repository: IClinicalWorkspaceRepository;

  public static setRepository(repo: IClinicalWorkspaceRepository): void {
    CarePlanService.repository = repo;
  }

  public static async createCarePlan(params: CreateCarePlanParams): Promise<CarePlan> {
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: params.relationshipId,
      professionalId: params.authorProfessionalId,
      dataDomain: DataDomain.CARE_PLANS,
      action: ActionPermission.WRITE,
      purpose: 'CARE_DELIVERY'
    });

    const rel = await CareRelationshipService.getRelationship(params.relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${params.relationshipId} not found.`);
    }

    const planId = generateUUIDv7();
    const now = new Date().toISOString();

    const plan: CarePlan = {
      id: planId,
      care_relationship_id: params.relationshipId,
      subject_user_id: rel.subject_user_id,
      author_professional_id: params.authorProfessionalId,
      title: params.title,
      goals: params.goals,
      interventions: params.interventions,
      status: CarePlanStatus.ACTIVE,
      review_date: params.reviewDate,
      created_at: now,
      updated_at: now
    };

    await CarePlanService.repository.saveCarePlan(plan);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CARE_PLAN.CREATED',
      resource_type: 'care_plan',
      resource_id: planId,
      purpose: 'Care Plan Formulation',
      authorization_basis: { relationshipId: params.relationshipId },
      result: 'ALLOWED',
      metadata: { goalsCount: params.goals.length }
    });

    return plan;
  }

  public static async getCarePlanForRelationship(
    relationshipId: string,
    requestingProfessionalId: string
  ): Promise<CarePlan | null> {
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId,
      professionalId: requestingProfessionalId,
      dataDomain: DataDomain.CARE_PLANS,
      action: ActionPermission.READ,
      purpose: 'CARE_DELIVERY'
    });

    return CarePlanService.repository.findCarePlanByRelationshipId(relationshipId);
  }
}
