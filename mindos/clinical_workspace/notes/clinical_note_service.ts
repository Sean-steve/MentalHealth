/**
 * MindOS Clinical Note Management Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * 
 * Rules:
 * - Immutability: Once SIGNED, note content is permanently immutable.
 * - Modifications require a signed ADDENDUM referencing amendment_of_id and explicit amendment_reason.
 * - Note author must have an active relationship and WRITE/SIGN permission.
 */

import crypto from 'node:crypto';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { DomainInvariantError, AuthorizationError, NotFoundError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import {
  ClinicalNote,
  StructuredNoteContent
} from '../domain/entities.js';
import {
  ClinicalNoteType,
  ClinicalNoteState
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

export interface DraftNoteParams {
  relationshipId: string;
  encounterId?: string;
  authorProfessionalId: string;
  authorRole: string;
  noteType: ClinicalNoteType;
  structuredContent: StructuredNoteContent;
  ciphertext?: string;
  actorId: string;
}

export interface SignNoteParams {
  noteId: string;
  signerProfessionalId: string;
  actorId: string;
}

export interface CreateAddendumParams {
  originalNoteId: string;
  authorProfessionalId: string;
  authorRole: string;
  structuredContent: StructuredNoteContent;
  amendmentReason: string;
  actorId: string;
}

export class ClinicalNoteService {
  private static repository: IClinicalWorkspaceRepository;

  public static setRepository(repo: IClinicalWorkspaceRepository): void {
    ClinicalNoteService.repository = repo;
  }

  private static computeContentHash(content: StructuredNoteContent, ciphertext?: string): string {
    const raw = JSON.stringify({ content, ciphertext: ciphertext || '' });
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  public static async draftNote(params: DraftNoteParams): Promise<ClinicalNote> {
    // 1. Authorize via RelationshipAccessEvaluator
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: params.relationshipId,
      professionalId: params.authorProfessionalId,
      dataDomain: DataDomain.CLINICAL_NOTES,
      action: ActionPermission.WRITE,
      purpose: 'CLINICAL_DOCUMENTATION'
    });

    const rel = await CareRelationshipService.getRelationship(params.relationshipId);
    if (!rel) {
      throw new NotFoundError(`CareRelationship ${params.relationshipId} not found.`);
    }

    const noteId = generateUUIDv7();
    const now = new Date().toISOString();
    const contentHash = ClinicalNoteService.computeContentHash(params.structuredContent, params.ciphertext);

    const note: ClinicalNote = {
      id: noteId,
      encounter_id: params.encounterId,
      care_relationship_id: params.relationshipId,
      subject_user_id: rel.subject_user_id,
      author_professional_id: params.authorProfessionalId,
      author_role: params.authorRole,
      note_type: params.noteType,
      status: ClinicalNoteState.DRAFT,
      structured_content: params.structuredContent,
      ciphertext: params.ciphertext,
      content_hash: contentHash,
      is_signed: false,
      version: 1,
      created_at: now,
      updated_at: now
    };

    await ClinicalNoteService.repository.saveNote(note);

    EventBus.enqueue(
      'clinical_note.created',
      'clinical_workspace',
      noteId,
      DataClassification.RESTRICTED,
      {
        note_id: noteId,
        relationship_id: params.relationshipId,
        author_id: params.authorProfessionalId,
        note_type: params.noteType
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CLINICAL_NOTE.DRAFT_CREATED',
      resource_type: 'clinical_note',
      resource_id: noteId,
      purpose: 'Clinical Encounter Documentation',
      authorization_basis: { relationshipId: params.relationshipId },
      result: 'ALLOWED',
      metadata: {
        noteType: params.noteType,
        encounterId: params.encounterId
      }
    });

    return note;
  }

  public static async signNote(params: SignNoteParams): Promise<ClinicalNote> {
    const note = await ClinicalNoteService.repository.findNoteById(params.noteId);
    if (!note) {
      throw new NotFoundError(`ClinicalNote ${params.noteId} not found.`);
    }

    if (note.is_signed || note.status === ClinicalNoteState.SIGNED) {
      throw new DomainInvariantError(
        `R-NOTE-001: ClinicalNote ${params.noteId} is already signed and locked.`
      );
    }

    // 1. Authorize signing privilege
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: note.care_relationship_id,
      professionalId: params.signerProfessionalId,
      dataDomain: DataDomain.CLINICAL_NOTES,
      action: ActionPermission.SIGN,
      purpose: 'CLINICAL_DOCUMENTATION'
    });

    validateStateTransition(
      'ClinicalNoteState',
      note.status,
      ClinicalNoteState.SIGNED,
      note.id,
      params.actorId
    );

    const now = new Date().toISOString();
    const signatureHash = crypto
      .createHash('sha256')
      .update(`${note.id}:${note.content_hash}:${params.signerProfessionalId}:${now}`)
      .digest('hex');

    note.status = ClinicalNoteState.SIGNED;
    note.is_signed = true;
    note.signed_at = now;
    note.signed_by = params.signerProfessionalId;
    note.signature_hash = signatureHash;
    note.updated_at = now;
    note.version += 1;

    await ClinicalNoteService.repository.saveNote(note);

    EventBus.enqueue(
      'clinical_note.signed',
      'clinical_workspace',
      note.id,
      DataClassification.RESTRICTED,
      {
        note_id: note.id,
        relationship_id: note.care_relationship_id,
        signed_by: params.signerProfessionalId,
        signed_at: now,
        signature_hash: signatureHash
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CLINICAL_NOTE.SIGNED',
      resource_type: 'clinical_note',
      resource_id: note.id,
      purpose: 'Clinical Record Finalization',
      authorization_basis: { relationshipId: note.care_relationship_id },
      result: 'ALLOWED',
      metadata: {
        signedBy: params.signerProfessionalId,
        signatureHash
      }
    });

    return note;
  }

  public static async updateDraftNote(
    noteId: string,
    structuredContent: StructuredNoteContent,
    actorId: string
  ): Promise<ClinicalNote> {
    const note = await ClinicalNoteService.repository.findNoteById(noteId);
    if (!note) {
      throw new NotFoundError(`ClinicalNote ${noteId} not found.`);
    }

    // IMMUTABILITY GUARD
    if (note.is_signed || note.status === ClinicalNoteState.SIGNED || note.status === ClinicalNoteState.AMENDED) {
      throw new DomainInvariantError(
        `R-NOTE-002: Cannot edit signed clinical note ${noteId} in place. Modifications must use addendum workflow.`,
        { safeUserMessage: 'Signed clinical notes are immutable. Please create an addendum.' }
      );
    }

    note.structured_content = structuredContent;
    note.content_hash = ClinicalNoteService.computeContentHash(structuredContent, note.ciphertext);
    note.updated_at = new Date().toISOString();
    note.version += 1;

    await ClinicalNoteService.repository.saveNote(note);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CLINICAL_NOTE.DRAFT_UPDATED',
      resource_type: 'clinical_note',
      resource_id: note.id,
      purpose: 'Draft Note Editing',
      authorization_basis: { relationshipId: note.care_relationship_id },
      result: 'ALLOWED',
      metadata: { newVersion: note.version }
    });

    return note;
  }

  public static async createAddendum(params: CreateAddendumParams): Promise<ClinicalNote> {
    const original = await ClinicalNoteService.repository.findNoteById(params.originalNoteId);
    if (!original) {
      throw new NotFoundError(`Original ClinicalNote ${params.originalNoteId} not found.`);
    }

    if (!original.is_signed && original.status !== ClinicalNoteState.SIGNED && original.status !== ClinicalNoteState.AMENDED) {
      throw new DomainInvariantError(
        'Addendums can only be attached to already signed clinical notes.'
      );
    }

    // Authorize AMEND permission
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: original.care_relationship_id,
      professionalId: params.authorProfessionalId,
      dataDomain: DataDomain.CLINICAL_NOTES,
      action: ActionPermission.AMEND,
      purpose: 'CLINICAL_DOCUMENTATION'
    });

    const addendumId = generateUUIDv7();
    const now = new Date().toISOString();
    const contentHash = ClinicalNoteService.computeContentHash(params.structuredContent);

    // Addendum is immediately signed upon authoring
    const signatureHash = crypto
      .createHash('sha256')
      .update(`${addendumId}:${contentHash}:${params.authorProfessionalId}:${now}:ADDENDUM`)
      .digest('hex');

    const addendum: ClinicalNote = {
      id: addendumId,
      encounter_id: original.encounter_id,
      care_relationship_id: original.care_relationship_id,
      subject_user_id: original.subject_user_id,
      author_professional_id: params.authorProfessionalId,
      author_role: params.authorRole,
      note_type: ClinicalNoteType.ADDENDUM,
      status: ClinicalNoteState.SIGNED,
      structured_content: params.structuredContent,
      content_hash: contentHash,
      is_signed: true,
      signed_at: now,
      signed_by: params.authorProfessionalId,
      signature_hash: signatureHash,
      amendment_of_id: params.originalNoteId,
      amendment_reason: params.amendmentReason,
      version: 1,
      created_at: now,
      updated_at: now
    };

    await ClinicalNoteService.repository.saveNote(addendum);

    // Mark original note as AMENDED
    original.status = ClinicalNoteState.AMENDED;
    original.updated_at = now;
    original.version += 1;
    await ClinicalNoteService.repository.saveNote(original);

    EventBus.enqueue(
      'clinical_note.amended',
      'clinical_workspace',
      addendumId,
      DataClassification.RESTRICTED,
      {
        addendum_id: addendumId,
        original_note_id: params.originalNoteId,
        author_id: params.authorProfessionalId,
        amendment_reason: params.amendmentReason
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CLINICAL_NOTE.ADDENDUM_ATTACHED',
      resource_type: 'clinical_note',
      resource_id: addendumId,
      purpose: 'Clinical Correction / Addendum',
      authorization_basis: { originalNoteId: params.originalNoteId },
      result: 'ALLOWED',
      metadata: {
        originalNoteId: params.originalNoteId,
        amendmentReason: params.amendmentReason
      }
    });

    return addendum;
  }

  public static async getNoteById(
    noteId: string,
    requestingProfessionalId: string
  ): Promise<{ note: ClinicalNote; amendments: ClinicalNote[] }> {
    const note = await ClinicalNoteService.repository.findNoteById(noteId);
    if (!note) {
      throw new NotFoundError(`ClinicalNote ${noteId} not found.`);
    }

    // Verify READ access
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId: note.care_relationship_id,
      professionalId: requestingProfessionalId,
      dataDomain: DataDomain.CLINICAL_NOTES,
      action: ActionPermission.READ,
      purpose: 'CARE_DELIVERY'
    });

    const amendments = await ClinicalNoteService.repository.findAmendments(noteId);

    return { note, amendments };
  }

  public static async listNotesForRelationship(
    relationshipId: string,
    requestingProfessionalId: string,
    status?: ClinicalNoteState
  ): Promise<ClinicalNote[]> {
    await RelationshipAccessEvaluator.assertAccess({
      relationshipId,
      professionalId: requestingProfessionalId,
      dataDomain: DataDomain.CLINICAL_NOTES,
      action: ActionPermission.READ,
      purpose: 'CARE_DELIVERY'
    });

    return ClinicalNoteService.repository.findNotesByRelationshipId(relationshipId, status);
  }
}
