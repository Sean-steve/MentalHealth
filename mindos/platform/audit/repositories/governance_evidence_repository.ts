/**
 * MindOS Canonical Governance Evidence Repository
 * Authority: Master Architecture Index Section 14, Volumes III, XIV, XV, Appendix B & Q
 * ADR-025
 */

import { DatabaseManager, DatabaseClient } from '../../database/connection.js';
import {
  GovernanceEvidence,
  EvidenceLink,
  EvidenceAttachment
} from '../domain/governance_evidence.js';
import { GovernanceEvidenceStatus } from '../domain/taxonomy.js';

export interface GovernanceEvidenceFilter {
  evidence_type?: string;
  domain?: string;
  related_resource_type?: string;
  related_resource_id?: string;
  status?: string;
  created_by?: string;
  limit?: number;
  offset?: number;
}

export class GovernanceEvidenceRepository {
  private static inMemoryEvidence: Map<string, GovernanceEvidence> = new Map();
  private static inMemoryLinks: Map<string, EvidenceLink[]> = new Map();
  private static inMemoryAttachments: Map<string, EvidenceAttachment[]> = new Map();

  public static async create(
    evidence: GovernanceEvidence,
    links: EvidenceLink[] = [],
    attachments: EvidenceAttachment[] = [],
    txClient?: DatabaseClient
  ): Promise<GovernanceEvidence> {
    const client = txClient || DatabaseManager.getClient();

    await client.query(
      `INSERT INTO governance_evidence (
        id, evidence_type, title, description, domain,
        related_resource_type, related_resource_id, version, status,
        source, created_by, created_at, classification, integrity_reference,
        storage_reference, supersedes_id, approved_by, approved_at, metadata_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        evidence.id,
        evidence.evidence_type,
        evidence.title,
        evidence.description,
        evidence.domain,
        evidence.related_resource_type,
        evidence.related_resource_id,
        evidence.version,
        evidence.status,
        evidence.source,
        evidence.created_by,
        evidence.created_at,
        evidence.classification,
        evidence.integrity_reference,
        evidence.storage_reference || null,
        evidence.supersedes_id || null,
        evidence.approved_by || null,
        evidence.approved_at || null,
        JSON.stringify(evidence.metadata || {})
      ]
    );

    for (const link of links) {
      await client.query(
        `INSERT INTO evidence_links (id, evidence_id, target_type, target_id, relationship_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [link.id, link.evidence_id, link.target_type, link.target_id, link.relationship_type, link.created_at]
      );
    }

    for (const att of attachments) {
      await client.query(
        `INSERT INTO evidence_attachments (id, evidence_id, file_name, file_size_bytes, mime_type, storage_uri, content_hash, hash_algorithm, uploaded_by, uploaded_at, scan_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [att.id, att.evidence_id, att.file_name, att.file_size_bytes, att.mime_type, att.storage_uri, att.content_hash, att.hash_algorithm, att.uploaded_by, att.uploaded_at, att.scan_status]
      );
    }

    GovernanceEvidenceRepository.inMemoryEvidence.set(evidence.id, evidence);
    GovernanceEvidenceRepository.inMemoryLinks.set(evidence.id, links);
    GovernanceEvidenceRepository.inMemoryAttachments.set(evidence.id, attachments);

    return evidence;
  }

  public static async findById(id: string): Promise<GovernanceEvidence | null> {
    const memory = GovernanceEvidenceRepository.inMemoryEvidence.get(id);
    if (memory) return memory;

    const client = DatabaseManager.getClient();
    const rows = await client.query<Record<string, unknown>>(
      'SELECT * FROM governance_evidence WHERE id = $1',
      [id]
    );
    if (!rows || rows.length === 0) return null;
    return GovernanceEvidenceRepository.mapRow(rows[0]);
  }

  public static async findByResource(resourceType: string, resourceId: string): Promise<GovernanceEvidence[]> {
    return Array.from(GovernanceEvidenceRepository.inMemoryEvidence.values()).filter(
      (e) => e.related_resource_type === resourceType && e.related_resource_id === resourceId
    );
  }

  public static async updateStatus(
    id: string,
    status: GovernanceEvidenceStatus | string,
    approvedBy?: string
  ): Promise<GovernanceEvidence | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: GovernanceEvidence = {
      ...existing,
      status,
      ...(approvedBy ? { approved_by: approvedBy, approved_at: new Date().toISOString() } : {})
    };

    const client = DatabaseManager.getClient();
    await client.query(
      'UPDATE governance_evidence SET status = $1, approved_by = $2, approved_at = $3 WHERE id = $4',
      [updated.status, updated.approved_by || null, updated.approved_at || null, id]
    );

    GovernanceEvidenceRepository.inMemoryEvidence.set(id, updated);
    return updated;
  }

  public static async supersede(
    supersededId: string,
    newEvidence: GovernanceEvidence,
    links: EvidenceLink[] = [],
    attachments: EvidenceAttachment[] = []
  ): Promise<GovernanceEvidence> {
    await this.updateStatus(supersededId, GovernanceEvidenceStatus.SUPERSEDED);
    newEvidence.supersedes_id = supersededId;
    return this.create(newEvidence, links, attachments);
  }

  public static async query(filter: GovernanceEvidenceFilter): Promise<{ evidence: GovernanceEvidence[]; total: number }> {
    let list = Array.from(GovernanceEvidenceRepository.inMemoryEvidence.values());

    if (filter.evidence_type) {
      list = list.filter((e) => e.evidence_type === filter.evidence_type);
    }
    if (filter.domain) {
      list = list.filter((e) => e.domain === filter.domain);
    }
    if (filter.related_resource_type) {
      list = list.filter((e) => e.related_resource_type === filter.related_resource_type);
    }
    if (filter.related_resource_id) {
      list = list.filter((e) => e.related_resource_id === filter.related_resource_id);
    }
    if (filter.status) {
      list = list.filter((e) => e.status === filter.status);
    }
    if (filter.created_by) {
      list = list.filter((e) => e.created_by === filter.created_by);
    }

    const total = list.length;
    const offset = filter.offset || 0;
    const limit = filter.limit !== undefined ? filter.limit : 50;
    const paginated = list.slice(offset, offset + limit);

    return { evidence: paginated, total };
  }

  public static getLinks(evidenceId: string): EvidenceLink[] {
    return GovernanceEvidenceRepository.inMemoryLinks.get(evidenceId) || [];
  }

  public static getAttachments(evidenceId: string): EvidenceAttachment[] {
    return GovernanceEvidenceRepository.inMemoryAttachments.get(evidenceId) || [];
  }

  public static resetForTesting(): void {
    GovernanceEvidenceRepository.inMemoryEvidence.clear();
    GovernanceEvidenceRepository.inMemoryLinks.clear();
    GovernanceEvidenceRepository.inMemoryAttachments.clear();
  }

  private static mapRow(row: Record<string, unknown>): GovernanceEvidence {
    return {
      id: String(row.id),
      evidence_type: String(row.evidence_type),
      title: String(row.title),
      description: String(row.description),
      domain: String(row.domain),
      related_resource_type: String(row.related_resource_type),
      related_resource_id: String(row.related_resource_id),
      version: String(row.version || '1.0.0'),
      status: String(row.status || 'ACTIVE'),
      source: String(row.source || 'INTERNAL_REVIEW'),
      created_by: String(row.created_by),
      created_at: String(row.created_at),
      classification: String(row.classification || 'SENSITIVE'),
      integrity_reference: String(row.integrity_reference),
      storage_reference: row.storage_reference ? String(row.storage_reference) : undefined,
      supersedes_id: row.supersedes_id ? String(row.supersedes_id) : undefined,
      approved_by: row.approved_by ? String(row.approved_by) : undefined,
      approved_at: row.approved_at ? String(row.approved_at) : undefined,
      metadata: typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : (row.metadata_json as Record<string, unknown>) || {}
    };
  }
}
