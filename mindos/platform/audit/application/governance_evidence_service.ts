/**
 * MindOS Canonical Governance Evidence Service
 * Authority: Master Architecture Index Section 14, Volumes III, XIV, XV, Appendix B & Q
 * ADR-022, ADR-025
 */

import { v7 as uuidv7 } from 'uuid';
import { DataClassification } from '../../shared/data_classification.js';
import { DatabaseClient } from '../../database/connection.js';
import { metrics } from '../../observability/metrics.js';
import {
  GovernanceEvidence,
  GovernanceEvidenceInput,
  EvidenceLink,
  EvidenceAttachment,
  computeEvidenceContentHash
} from '../domain/governance_evidence.js';
import {
  GovernanceEvidenceStatus,
  AuditAction,
  AuditActorType,
  AuditResult
} from '../domain/taxonomy.js';
import { EvidenceIntegrityError, EvidenceNotFoundError } from '../domain/errors.js';
import { PrivateEvidenceStorage, SignedAccessGrant } from '../repositories/storage/private_evidence_storage.js';
import { GovernanceEvidenceRepository } from '../repositories/governance_evidence_repository.js';
import { CanonicalAuditService } from './audit_service.js';

export class GovernanceEvidenceService {
  /**
   * Registers a piece of governance evidence with verifiable integrity reference
   */
  public static async createEvidence(
    input: GovernanceEvidenceInput,
    rawContent?: string | Buffer,
    links: Array<{ target_type: string; target_id: string; relationship_type?: 'SUPPORTS' | 'VALIDATES' | 'GOVERNS' | 'REMEDIATES' }> = [],
    attachments: Array<{ file_name: string; content: string | Buffer; mime_type?: string }> = [],
    txClient?: DatabaseClient
  ): Promise<GovernanceEvidence> {
    const id = input.id || uuidv7();
    const version = input.version || '1.0.0';
    const status = input.status || GovernanceEvidenceStatus.ACTIVE;
    const classification = input.classification || DataClassification.SENSITIVE;
    const now = new Date().toISOString();

    let storage_reference = input.storage_reference;
    let integrity_reference = input.integrity_reference;

    // If raw content is provided, store in private evidence storage
    if (rawContent) {
      const storageResult = await PrivateEvidenceStorage.put(
        id,
        rawContent,
        'application/json',
        classification
      );
      storage_reference = storageResult.storage_reference;
      integrity_reference = storageResult.content_hash;
    } else if (!integrity_reference) {
      // Fallback hash computed over metadata title + description + related resource
      integrity_reference = computeEvidenceContentHash(`${input.title}:${input.related_resource_type}:${input.related_resource_id}:${now}`);
    }

    const evidenceRecord: GovernanceEvidence = {
      id,
      evidence_type: input.evidence_type,
      title: input.title,
      description: input.description,
      domain: input.domain,
      related_resource_type: input.related_resource_type,
      related_resource_id: input.related_resource_id,
      version,
      status,
      source: input.source || 'INTERNAL_REVIEW',
      created_by: input.created_by,
      created_at: now,
      classification,
      integrity_reference: integrity_reference!,
      storage_reference,
      supersedes_id: input.supersedes_id,
      approved_by: input.approved_by,
      approved_at: input.approved_at,
      metadata: input.metadata || {}
    };

    const evidenceLinks: EvidenceLink[] = links.map((link) => ({
      id: uuidv7(),
      evidence_id: id,
      target_type: link.target_type,
      target_id: link.target_id,
      relationship_type: link.relationship_type || 'SUPPORTS',
      created_at: now
    }));

    const evidenceAttachments: EvidenceAttachment[] = [];
    for (const att of attachments) {
      const buffer = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'utf-8');
      const attId = uuidv7();
      const storage = await PrivateEvidenceStorage.put(attId, buffer, att.mime_type || 'application/octet-stream', classification);

      evidenceAttachments.push({
        id: attId,
        evidence_id: id,
        file_name: att.file_name,
        file_size_bytes: buffer.length,
        mime_type: att.mime_type || 'application/octet-stream',
        storage_uri: storage.storage_reference,
        content_hash: storage.content_hash,
        hash_algorithm: 'SHA-256',
        uploaded_by: input.created_by,
        uploaded_at: now,
        scan_status: 'CLEAN'
      });
    }

    const created = await GovernanceEvidenceRepository.create(
      evidenceRecord,
      evidenceLinks,
      evidenceAttachments,
      txClient
    );

    metrics.increment('evidence_created_total', 1);

    // Audit the creation of governance evidence
    await CanonicalAuditService.record({
      actor_id: input.created_by,
      actor_type: AuditActorType.CLINICAL_REVIEWER,
      action: AuditAction.CREATE,
      resource_type: 'governance_evidence',
      resource_id: id,
      resource_classification: classification,
      purpose: `Governance Evidence Filed: ${input.title}`,
      authorization_basis: {
        evidence_type: input.evidence_type,
        domain: input.domain
      },
      result: AuditResult.SUCCESS,
      reason_code: 'EVIDENCE_RECORDED'
    });

    return created;
  }

  /**
   * Verifies the cryptographic integrity of an evidence item
   */
  public static async verifyIntegrity(evidenceId: string): Promise<{ valid: boolean; evidence: GovernanceEvidence; reason?: string }> {
    const evidence = await GovernanceEvidenceRepository.findById(evidenceId);
    if (!evidence) {
      throw new EvidenceNotFoundError(`Evidence item ${evidenceId} not found`);
    }

    if (!evidence.storage_reference) {
      return { valid: true, evidence };
    }

    const stored = PrivateEvidenceStorage.getByReference(evidence.storage_reference);
    if (!stored) {
      return { valid: false, evidence, reason: 'Physical storage object missing' };
    }

    const calculatedHash = computeEvidenceContentHash(stored.content);
    if (calculatedHash !== evidence.integrity_reference) {
      return {
        valid: false,
        evidence,
        reason: `Integrity hash mismatch. Expected ${evidence.integrity_reference}, calculated ${calculatedHash}`
      };
    }

    return { valid: true, evidence };
  }

  /**
   * Generates a signed, short-lived access token for an authorized reviewer, auditing the read event
   */
  public static async requestSignedAccess(params: {
    evidenceId: string;
    requesterId: string;
    requesterRole: string;
    purpose: string;
  }): Promise<SignedAccessGrant> {
    const evidence = await GovernanceEvidenceRepository.findById(params.evidenceId);
    if (!evidence) {
      throw new EvidenceNotFoundError(`Evidence item ${params.evidenceId} not found`);
    }

    if (!evidence.storage_reference) {
      throw new Error(`Evidence item ${params.evidenceId} has no attached storage content`);
    }

    const grant = PrivateEvidenceStorage.generateSignedAccess(evidence.storage_reference);
    metrics.increment('evidence_access_total', 1);

    // Sensitive read auditing
    await CanonicalAuditService.record({
      actor_id: params.requesterId,
      actor_type: params.requesterRole,
      action: AuditAction.READ,
      resource_type: 'governance_evidence',
      resource_id: params.evidenceId,
      resource_classification: evidence.classification,
      purpose: params.purpose,
      authorization_basis: {
        role: params.requesterRole,
        signed_token: grant.token.substring(0, 8) + '...'
      },
      result: AuditResult.SUCCESS,
      reason_code: 'EVIDENCE_ACCESS_GRANTED'
    });

    return grant;
  }

  public static async supersedeEvidence(
    supersededId: string,
    newParams: GovernanceEvidenceInput,
    rawContent?: string | Buffer
  ): Promise<GovernanceEvidence> {
    const existing = await GovernanceEvidenceRepository.findById(supersededId);
    if (!existing) {
      throw new EvidenceNotFoundError(`Evidence ${supersededId} to supersede not found`);
    }

    newParams.version = `${parseInt(existing.version.split('.')[0] || '1', 10) + 1}.0.0`;
    newParams.supersedes_id = supersededId;

    return this.createEvidence(newParams, rawContent);
  }

  public static async approveEvidence(evidenceId: string, approverId: string): Promise<GovernanceEvidence> {
    const updated = await GovernanceEvidenceRepository.updateStatus(
      evidenceId,
      GovernanceEvidenceStatus.ACTIVE,
      approverId
    );
    if (!updated) {
      throw new EvidenceNotFoundError(`Evidence ${evidenceId} not found`);
    }

    await CanonicalAuditService.record({
      actor_id: approverId,
      actor_type: AuditActorType.REGULATORY_REVIEWER,
      action: AuditAction.APPROVE,
      resource_type: 'governance_evidence',
      resource_id: evidenceId,
      resource_classification: updated.classification,
      purpose: `Governance Evidence Approved: ${updated.title}`,
      result: AuditResult.SUCCESS,
      reason_code: 'EVIDENCE_APPROVED'
    });

    return updated;
  }

  public static resetForTesting(): void {
    GovernanceEvidenceRepository.resetForTesting();
    PrivateEvidenceStorage.resetForTesting();
  }
}
