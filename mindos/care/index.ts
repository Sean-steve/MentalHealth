/**
 * MindOS Care & Clinical Record Bounded Context (Sprint 21 Facade & Entrypoint)
 * Authority: Volumes I, III & Appendix B / C / Q
 * Owns: care_relationships, clinical_encounters, clinical_notes, care_plans
 * Invariant: Clinical notes and records require verified professional role and active care consent.
 * Invariant: Platform Administrators and Moderators SHALL NOT have access to clinical records.
 */

import { CareRelationshipState, validateStateTransition } from '../platform/shared/state_machines.js';
import { generateUUIDv7 } from '../platform/database/uuid.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { EventBus } from '../platform/events/index.js';
import { AuditService } from '../platform/audit/index.js';
import { AuthorizationError, ValidationError } from '../platform/errors/index.js';
import { ProfessionalService } from '../professionals/index.js';

export * from '../care_relationships/index.js';
export * from '../clinical_workspace/index.js';
export * from '../clinical_record/index.js';
export * from '../outcomes/index.js';

export interface CareRelationshipEntity {
  id: string; // UUIDv7
  client_id: string;
  professional_id: string;
  state: CareRelationshipState;
  scopes: string[];
  created_at: string;
  updated_at: string;
  ended_at?: string;
}

export interface ClinicalNoteEntity {
  id: string; // UUIDv7
  care_relationship_id: string;
  author_professional_id: string;
  client_id: string;
  note_type: 'INTAKE' | 'PROGRESS' | 'SAFETY_REVIEW' | 'DISCHARGE';
  content_ciphertext: string; // Encrypted clinical content
  is_signed: boolean;
  signed_at?: string;
  created_at: string;
}

/**
 * Backward-compatible facade for early sprint tests
 */
export class CareService {
  private static relationships: Map<string, CareRelationshipEntity> = new Map();
  private static clinicalNotes: Map<string, ClinicalNoteEntity> = new Map();

  public static async establishRelationship(params: {
    clientId: string;
    professionalId: string;
    scopes?: string[];
  }): Promise<CareRelationshipEntity> {
    // Check professional is verified
    if (!ProfessionalService.isVerified(params.professionalId)) {
      throw new AuthorizationError('Professional must be verified to establish care relationship.', {
        errorCode: 'AUTHZ_003'
      });
    }

    const id = generateUUIDv7();
    const rel: CareRelationshipEntity = {
      id,
      client_id: params.clientId,
      professional_id: params.professionalId,
      state: CareRelationshipState.ACTIVE,
      scopes: params.scopes || ['CONSULTATION', 'NOTES'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    CareService.relationships.set(id, rel);

    EventBus.enqueue(
      'care.relationship_established',
      'care',
      id,
      DataClassification.SENSITIVE,
      {
        relationship_id: id,
        client_pseudonym: params.clientId.substring(0, 8),
        professional_id: params.professionalId
      }
    );

    return rel;
  }

  public static async recordClinicalNote(params: {
    relationshipId: string;
    professionalId: string;
    noteType: ClinicalNoteEntity['note_type'];
    ciphertext: string;
  }): Promise<ClinicalNoteEntity> {
    const rel = CareService.relationships.get(params.relationshipId);
    if (!rel || rel.state !== CareRelationshipState.ACTIVE) {
      throw new AuthorizationError('Active care relationship required to record clinical notes.', {
        errorCode: 'AUTHZ_003'
      });
    }

    if (rel.professional_id !== params.professionalId) {
      throw new AuthorizationError('Only assigned professional may author clinical notes.', {
        errorCode: 'AUTHZ_003'
      });
    }

    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const note: ClinicalNoteEntity = {
      id,
      care_relationship_id: params.relationshipId,
      author_professional_id: params.professionalId,
      client_id: rel.client_id,
      note_type: params.noteType,
      content_ciphertext: params.ciphertext,
      is_signed: true,
      signed_at: now,
      created_at: now
    };

    CareService.clinicalNotes.set(id, note);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.professionalId,
      action: 'CARE.CLINICAL_NOTE.CREATED',
      resource_type: 'clinical_notes',
      resource_id: id,
      purpose: 'Clinical Encounter Documentation',
      authorization_basis: { relationshipId: params.relationshipId },
      result: 'ALLOWED'
    });

    return note;
  }

  public static resetForTesting(): void {
    CareService.relationships.clear();
    CareService.clinicalNotes.clear();
  }
}
