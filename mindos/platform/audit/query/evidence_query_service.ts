/**
 * MindOS Governance Evidence Query Engine
 * Authority: Master Architecture Index Section 14, Volumes III, XIV, XV
 * ADR-025
 */

import {
  GovernanceEvidence,
  EvidenceLink,
  EvidenceAttachment
} from '../domain/governance_evidence.js';
import {
  GovernanceEvidenceFilter,
  GovernanceEvidenceRepository
} from '../repositories/governance_evidence_repository.js';
import { GovernanceEvidenceService } from '../application/governance_evidence_service.js';

export interface EvidenceDetailView {
  evidence: GovernanceEvidence;
  links: EvidenceLink[];
  attachments: EvidenceAttachment[];
  integrity: { valid: boolean; reason?: string };
}

export class EvidenceQueryService {
  public static async query(filter: GovernanceEvidenceFilter): Promise<{ evidence: GovernanceEvidence[]; total: number }> {
    return GovernanceEvidenceRepository.query(filter);
  }

  public static async getDetail(id: string): Promise<EvidenceDetailView | null> {
    const evidence = await GovernanceEvidenceRepository.findById(id);
    if (!evidence) return null;

    const links = GovernanceEvidenceRepository.getLinks(id);
    const attachments = GovernanceEvidenceRepository.getAttachments(id);
    const integrity = await GovernanceEvidenceService.verifyIntegrity(id);

    return {
      evidence,
      links,
      attachments,
      integrity: { valid: integrity.valid, reason: integrity.reason }
    };
  }
}
