/**
 * MindOS Canonical Governance Evidence Domain Model
 * Authority: Master Architecture Index Section 14, Volumes III, XIV, XV, Appendix B & Q
 * ADR-022, ADR-025
 */

import { createHash } from 'node:crypto';
import { DataClassification } from '../../shared/data_classification.js';
import {
  GovernanceDomain,
  GovernanceEvidenceStatus,
  GovernanceEvidenceType
} from './taxonomy.js';

export interface GovernanceEvidence {
  id: string;
  evidence_type: GovernanceEvidenceType | string;
  title: string;
  description: string;
  domain: GovernanceDomain | string;
  related_resource_type: string;
  related_resource_id: string;
  version: string;
  status: GovernanceEvidenceStatus | string;
  source: string;
  created_by: string;
  created_at: string;
  classification: DataClassification | string;
  integrity_reference: string;
  storage_reference?: string;
  supersedes_id?: string;
  approved_by?: string;
  approved_at?: string;
  metadata: Record<string, unknown>;
}

export interface GovernanceEvidenceInput {
  id?: string;
  evidence_type: GovernanceEvidenceType | string;
  title: string;
  description: string;
  domain: GovernanceDomain | string;
  related_resource_type: string;
  related_resource_id: string;
  version?: string;
  status?: GovernanceEvidenceStatus | string;
  source?: string;
  created_by: string;
  classification?: DataClassification | string;
  integrity_reference?: string;
  storage_reference?: string;
  supersedes_id?: string;
  approved_by?: string;
  approved_at?: string;
  metadata?: Record<string, unknown>;
  content_to_hash?: string | Buffer;
}

export interface EvidenceLink {
  id: string;
  evidence_id: string;
  target_type: string;
  target_id: string;
  relationship_type: 'SUPPORTS' | 'VALIDATES' | 'GOVERNS' | 'REMEDIATES';
  created_at: string;
}

export interface EvidenceAttachment {
  id: string;
  evidence_id: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  storage_uri: string;
  content_hash: string;
  hash_algorithm: string;
  uploaded_by: string;
  uploaded_at: string;
  scan_status: 'PENDING' | 'CLEAN' | 'INFECTED';
}

export function computeEvidenceContentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
