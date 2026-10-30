/**
 * MindOS Clinical Encounter Management Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * 
 * Rules:
 * - Encounters require an ACTIVE care relationship and verified lead professional.
 * - Enforces state transitions via canonical state machine.
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { DomainInvariantError, AuthorizationError, NotFoundError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { ClinicalEncounter } from '../domain/entities.js';
import {
  EncounterType,
  EncounterModality,
  ClinicalEncounterState
} from '../domain/types.js';
import { IClinicalWorkspaceRepository } from '../repositories/interfaces.js';
import {
  RelationshipAccessEvaluator,
  CareRelationshipService,
  DataDomain,
  ActionPermission,
  CareRelationshipState
} from '../../care_relationships/index.js';
import { ProfessionalService } from '../../professionals/index.js';

export interface ScheduleEncounterParams {
  relationshipId: string;
  leadProfessionalId: string;
  encounterType: EncounterType;
  modality: EncounterModality;
  reasonForVisit: string;
  appointmentId?: string;
  participants?: Array<{ professional_id: string; role: string }>;
  jurisdiction?: string;
  actorId: string;
}

export interface StartEncounterParams {
  encounterId: string;
  actorId: string;
}

export interface CompleteEncounterParams {
  encounterId: string;
  clinicalSummary: string;
  actorId: string;
}

export class ClinicalEncounterService {
  private static repository: IClinicalWorkspaceRepository;

  public static setRepository(repo: IClinicalWorkspaceRepository): void {
    ClinicalEncounterService.repository = repo;
  }

  public static async scheduleEncounter(
    params: ScheduleEncounterParams
  ): Promise<ClinicalEncounter> {
    // 1. Authorize via RelationshipAccessEvaluator
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: params.relationshipId,
      professionalId: params.leadProfessionalId,
      dataDomain: DataDomain.APPOINTMENTS,
      action: ActionPermission.WRITE,
      purpose: 'CARE_DELIVERY'
    });

    const rel = await CareRelationshipService.getRelationship(params.relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${params.relationshipId} not found.`);
    }

    const encounterId = generateUUIDv7();
    const now = new Date().toISOString();

    const encounter: ClinicalEncounter = {
      id: encounterId,
      care_relationship_id: params.relationshipId,
      appointment_id: params.appointmentId,
      subject_user_id: rel.subject_user_id,
      lead_professional_id: params.leadProfessionalId,
      organization_id: rel.organization_id,
      encounter_type: params.encounterType,
      modality: params.modality,
      status: ClinicalEncounterState.SCHEDULED,
      reason_for_visit: params.reasonForVisit,
      participants: params.participants || [{ professional_id: params.leadProfessionalId, role: 'LEAD' }],
      jurisdiction: params.jurisdiction || rel.jurisdiction,
      created_at: now,
      updated_at: now,
      version: 1
    };

    await ClinicalEncounterService.repository.saveEncounter(encounter);

    EventBus.enqueue(
      'clinical_encounter.scheduled',
      'clinical_workspace',
      encounterId,
      DataClassification.RESTRICTED,
      {
        encounter_id: encounterId,
        relationship_id: params.relationshipId,
        lead_professional_id: params.leadProfessionalId,
        appointment_id: params.appointmentId
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CLINICAL_ENCOUNTER.SCHEDULED',
      resource_type: 'clinical_encounter',
      resource_id: encounterId,
      purpose: 'Care Session Scheduling',
      authorization_basis: { relationshipId: params.relationshipId },
      result: 'ALLOWED',
      metadata: {
        encounterType: params.encounterType,
        modality: params.modality
      }
    });

    return encounter;
  }

  public static async startEncounter(
    params: StartEncounterParams
  ): Promise<ClinicalEncounter> {
    const enc = await ClinicalEncounterService.repository.findEncounterById(params.encounterId);
    if (!enc) {
      throw new NotFoundError(`ClinicalEncounter ${params.encounterId} not found.`);
    }

    // Validate relationship active
    const rel = await CareRelationshipService.getRelationship(enc.care_relationship_id);
    if (!rel || rel.status !== CareRelationshipState.ACTIVE) {
      throw new DomainInvariantError('Encounter cannot start without an ACTIVE care relationship.');
    }

    validateStateTransition(
      'ClinicalEncounterState',
      enc.status,
      ClinicalEncounterState.IN_PROGRESS,
      enc.id,
      params.actorId
    );

    const now = new Date().toISOString();
    enc.status = ClinicalEncounterState.IN_PROGRESS;
    enc.started_at = now;
    enc.updated_at = now;
    enc.version += 1;

    await ClinicalEncounterService.repository.saveEncounter(enc);

    EventBus.enqueue(
      'clinical_encounter.started',
      'clinical_workspace',
      enc.id,
      DataClassification.RESTRICTED,
      {
        encounter_id: enc.id,
        relationship_id: enc.care_relationship_id,
        lead_professional_id: enc.lead_professional_id,
        started_at: now
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CLINICAL_ENCOUNTER.STARTED',
      resource_type: 'clinical_encounter',
      resource_id: enc.id,
      purpose: 'Care Session Delivery',
      authorization_basis: { relationshipId: enc.care_relationship_id },
      result: 'ALLOWED',
      metadata: { startedAt: now }
    });

    return enc;
  }

  public static async completeEncounter(
    params: CompleteEncounterParams
  ): Promise<ClinicalEncounter> {
    const enc = await ClinicalEncounterService.repository.findEncounterById(params.encounterId);
    if (!enc) {
      throw new NotFoundError(`ClinicalEncounter ${params.encounterId} not found.`);
    }

    validateStateTransition(
      'ClinicalEncounterState',
      enc.status,
      ClinicalEncounterState.COMPLETED,
      enc.id,
      params.actorId
    );

    const now = new Date().toISOString();
    enc.status = ClinicalEncounterState.COMPLETED;
    enc.ended_at = now;
    enc.clinical_summary = params.clinicalSummary;
    enc.updated_at = now;
    enc.version += 1;

    if (enc.started_at) {
      const diffMs = new Date(now).getTime() - new Date(enc.started_at).getTime();
      enc.duration_minutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
    }

    await ClinicalEncounterService.repository.saveEncounter(enc);

    EventBus.enqueue(
      'clinical_encounter.completed',
      'clinical_workspace',
      enc.id,
      DataClassification.RESTRICTED,
      {
        encounter_id: enc.id,
        relationship_id: enc.care_relationship_id,
        ended_at: now,
        duration_minutes: enc.duration_minutes
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CLINICAL_ENCOUNTER.COMPLETED',
      resource_type: 'clinical_encounter',
      resource_id: enc.id,
      purpose: 'Care Session Documentation & Close',
      authorization_basis: { relationshipId: enc.care_relationship_id },
      result: 'ALLOWED',
      metadata: { durationMinutes: enc.duration_minutes }
    });

    return enc;
  }

  public static async cancelEncounter(
    encounterId: string,
    reason: string,
    actorId: string
  ): Promise<ClinicalEncounter> {
    const enc = await ClinicalEncounterService.repository.findEncounterById(encounterId);
    if (!enc) {
      throw new NotFoundError(`ClinicalEncounter ${encounterId} not found.`);
    }

    validateStateTransition(
      'ClinicalEncounterState',
      enc.status,
      ClinicalEncounterState.CANCELLED,
      enc.id,
      actorId
    );

    enc.status = ClinicalEncounterState.CANCELLED;
    enc.updated_at = new Date().toISOString();
    enc.version += 1;

    await ClinicalEncounterService.repository.saveEncounter(enc);

    EventBus.enqueue(
      'clinical_encounter.cancelled',
      'clinical_workspace',
      enc.id,
      DataClassification.RESTRICTED,
      {
        encounter_id: enc.id,
        reason,
        cancelled_by: actorId
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CLINICAL_ENCOUNTER.CANCELLED',
      resource_type: 'clinical_encounter',
      resource_id: enc.id,
      purpose: 'Encounter Cancellation',
      authorization_basis: { reason },
      result: 'ALLOWED',
      metadata: { reason }
    });

    return enc;
  }

  public static async getEncounter(id: string): Promise<ClinicalEncounter | null> {
    return ClinicalEncounterService.repository.findEncounterById(id);
  }

  public static async listEncountersForRelationship(
    relationshipId: string,
    status?: ClinicalEncounterState
  ): Promise<ClinicalEncounter[]> {
    return ClinicalEncounterService.repository.findEncountersByRelationshipId(relationshipId, status);
  }

  public static async listEncountersForProfessional(
    professionalId: string,
    status?: ClinicalEncounterState
  ): Promise<ClinicalEncounter[]> {
    return ClinicalEncounterService.repository.findEncountersByProfessionalId(professionalId, status);
  }
}
