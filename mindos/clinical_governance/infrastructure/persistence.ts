/**
 * MindOS Clinical Governance Persistence Layer
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendix B
 * Handles durable relational storage in PostgreSQL with in-memory fallback for test isolation.
 */

import { DatabaseManager } from '../../platform/database/connection.js';
import { logger } from '../../platform/observability/logger.js';
import {
  ClinicalArtifact,
  ClinicalArtifactVersion,
  ClinicalClaim,
  ClinicalEvidenceMetadata,
  ClinicalClaimEvidenceLink,
  ClinicalContraindication,
  ClinicalReview,
  ClinicalApprovalRecord
} from '../types.js';

export class ClinicalGovernancePersistence {
  // In-memory backing stores for fast transactional unit testing and cache
  private static memoryArtifacts: Map<string, ClinicalArtifact> = new Map();
  private static memoryVersions: Map<string, ClinicalArtifactVersion[]> = new Map(); // artifact_id -> versions
  private static memoryClaims: Map<string, ClinicalClaim[]> = new Map(); // artifact_id -> claims
  private static memoryEvidence: Map<string, ClinicalEvidenceMetadata> = new Map();
  private static memoryClaimEvidence: Map<string, ClinicalClaimEvidenceLink[]> = new Map(); // claim_id -> links
  private static memoryContraindications: Map<string, ClinicalContraindication[]> = new Map();
  private static memoryReviews: Map<string, ClinicalReview> = new Map();
  private static memoryApprovals: Map<string, ClinicalApprovalRecord> = new Map();

  public static async saveArtifact(artifact: ClinicalArtifact): Promise<void> {
    ClinicalGovernancePersistence.memoryArtifacts.set(artifact.id, { ...artifact });

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO clinical_artifacts (
            id, artifact_code, artifact_type, name, description,
            owner_domain, owner_id, version, status, intended_use,
            intended_population, excluded_population, clinical_risk_class,
            risk_factors, jurisdiction_scope, data_classification,
            clinical_claim_level, governed_resource_id, supersedes_id,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          ON CONFLICT (id) DO UPDATE SET
            version = EXCLUDED.version,
            status = EXCLUDED.status,
            intended_use = EXCLUDED.intended_use,
            intended_population = EXCLUDED.intended_population,
            excluded_population = EXCLUDED.excluded_population,
            clinical_risk_class = EXCLUDED.clinical_risk_class,
            risk_factors = EXCLUDED.risk_factors,
            jurisdiction_scope = EXCLUDED.jurisdiction_scope,
            governed_resource_id = EXCLUDED.governed_resource_id,
            updated_at = NOW()`,
          [
            artifact.id,
            artifact.artifact_code,
            artifact.artifact_type,
            artifact.name,
            artifact.description,
            artifact.owner_domain,
            artifact.owner_id,
            artifact.version,
            artifact.status,
            artifact.intended_use,
            JSON.stringify(artifact.intended_population),
            JSON.stringify(artifact.excluded_population),
            artifact.clinical_risk_class,
            JSON.stringify(artifact.risk_factors),
            artifact.jurisdiction_scope,
            artifact.data_classification,
            artifact.clinical_claim_level,
            artifact.governed_resource_id || null,
            artifact.supersedes_id || null,
            artifact.created_at,
            artifact.updated_at
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist clinical artifact to PostgreSQL, falling back to memory store', { error: String(err) });
      }
    }
  }

  public static async getArtifact(id: string): Promise<ClinicalArtifact | undefined> {
    return ClinicalGovernancePersistence.memoryArtifacts.get(id);
  }

  public static async getArtifactById(id: string): Promise<ClinicalArtifact | undefined> {
    return this.getArtifact(id);
  }

  public static async getArtifactByCode(code: string): Promise<ClinicalArtifact | undefined> {
    for (const art of ClinicalGovernancePersistence.memoryArtifacts.values()) {
      if (art.artifact_code === code) return art;
    }
    return undefined;
  }

  public static async listArtifacts(): Promise<ClinicalArtifact[]> {
    return Array.from(ClinicalGovernancePersistence.memoryArtifacts.values());
  }

  public static async saveVersion(version: ClinicalArtifactVersion): Promise<void> {
    const list = ClinicalGovernancePersistence.memoryVersions.get(version.artifact_id) || [];
    const idx = list.findIndex(v => v.version === version.version);
    if (idx >= 0) {
      list[idx] = { ...version };
    } else {
      list.push({ ...version });
    }
    ClinicalGovernancePersistence.memoryVersions.set(version.artifact_id, list);

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO clinical_artifact_versions (
            id, artifact_id, version, status, content_hash, specification,
            intended_use, intended_population, excluded_population,
            clinical_risk_class, risk_factors, material_change_summary,
            is_material_change, supersedes_version, created_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (artifact_id, version) DO UPDATE SET
            status = EXCLUDED.status,
            content_hash = EXCLUDED.content_hash,
            specification = EXCLUDED.specification,
            material_change_summary = EXCLUDED.material_change_summary`,
          [
            version.id,
            version.artifact_id,
            version.version,
            version.status,
            version.content_hash,
            JSON.stringify(version.specification),
            version.intended_use,
            JSON.stringify(version.intended_population),
            JSON.stringify(version.excluded_population),
            version.clinical_risk_class,
            JSON.stringify(version.risk_factors),
            version.material_change_summary || null,
            version.is_material_change,
            version.supersedes_version || null,
            version.created_by,
            version.created_at
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist clinical artifact version to DB', { error: String(err) });
      }
    }
  }

  public static async getVersions(artifactId: string): Promise<ClinicalArtifactVersion[]> {
    return ClinicalGovernancePersistence.memoryVersions.get(artifactId) || [];
  }

  public static async saveClaim(claim: ClinicalClaim): Promise<void> {
    const list = ClinicalGovernancePersistence.memoryClaims.get(claim.artifact_id) || [];
    const idx = list.findIndex(c => c.id === claim.id);
    if (idx >= 0) {
      list[idx] = { ...claim };
    } else {
      list.push({ ...claim });
    }
    ClinicalGovernancePersistence.memoryClaims.set(claim.artifact_id, list);

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO clinical_claims (
            id, artifact_id, artifact_version, claim_code, claim_text,
            claim_type, strength, intended_population, context, status,
            supersedes_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            claim_text = EXCLUDED.claim_text,
            strength = EXCLUDED.strength,
            status = EXCLUDED.status`,
          [
            claim.id,
            claim.artifact_id,
            claim.artifact_version,
            claim.claim_code,
            claim.claim_text,
            claim.claim_type,
            claim.strength,
            claim.intended_population || null,
            claim.context || null,
            claim.status,
            claim.supersedes_id || null,
            claim.created_at
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist clinical claim', { error: String(err) });
      }
    }
  }

  public static async getClaims(artifactId: string, version?: number): Promise<ClinicalClaim[]> {
    const all = ClinicalGovernancePersistence.memoryClaims.get(artifactId) || [];
    if (version !== undefined) {
      return all.filter(c => c.artifact_version === version);
    }
    return all;
  }

  public static async saveEvidenceMetadata(evidence: ClinicalEvidenceMetadata): Promise<void> {
    ClinicalGovernancePersistence.memoryEvidence.set(evidence.id, { ...evidence });

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO clinical_evidence_metadata (
            id, evidence_record_id, evidence_type, title, source, citation,
            publication_date, population, methodology, sample_size, outcomes,
            evidence_quality, quality_factors, relevance, jurisdiction_applicability,
            status, reviewed_at, next_review_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            evidence_quality = EXCLUDED.evidence_quality,
            reviewed_at = EXCLUDED.reviewed_at,
            next_review_at = EXCLUDED.next_review_at`,
          [
            evidence.id,
            evidence.evidence_record_id || null,
            evidence.evidence_type,
            evidence.title,
            evidence.source,
            evidence.citation,
            evidence.publication_date || null,
            evidence.population || null,
            evidence.methodology || null,
            evidence.sample_size || null,
            evidence.outcomes || null,
            evidence.evidence_quality,
            JSON.stringify(evidence.quality_factors),
            evidence.relevance,
            evidence.jurisdiction_applicability,
            evidence.status,
            evidence.reviewed_at || null,
            evidence.next_review_at || null,
            evidence.created_at
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist clinical evidence metadata', { error: String(err) });
      }
    }
  }

  public static async getEvidenceMetadata(id: string): Promise<ClinicalEvidenceMetadata | undefined> {
    return ClinicalGovernancePersistence.memoryEvidence.get(id);
  }

  public static async listEvidenceMetadata(): Promise<ClinicalEvidenceMetadata[]> {
    return Array.from(ClinicalGovernancePersistence.memoryEvidence.values());
  }

  public static async saveClaimEvidenceLink(link: ClinicalClaimEvidenceLink): Promise<void> {
    const list = ClinicalGovernancePersistence.memoryClaimEvidence.get(link.claim_id) || [];
    const idx = list.findIndex(l => l.evidence_id === link.evidence_id);
    if (idx >= 0) {
      list[idx] = { ...link };
    } else {
      list.push({ ...link });
    }
    ClinicalGovernancePersistence.memoryClaimEvidence.set(link.claim_id, list);

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO clinical_claim_evidence (
            id, claim_id, evidence_id, relationship_type, support_strength, limitations, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (claim_id, evidence_id) DO UPDATE SET
            relationship_type = EXCLUDED.relationship_type,
            support_strength = EXCLUDED.support_strength,
            limitations = EXCLUDED.limitations`,
          [
            link.id,
            link.claim_id,
            link.evidence_id,
            link.relationship_type,
            link.support_strength,
            link.limitations || null,
            link.created_at
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist claim-evidence link', { error: String(err) });
      }
    }
  }

  public static async getClaimEvidenceLinks(claimId: string): Promise<ClinicalClaimEvidenceLink[]> {
    return ClinicalGovernancePersistence.memoryClaimEvidence.get(claimId) || [];
  }

  public static async getAllClaimEvidenceLinks(): Promise<ClinicalClaimEvidenceLink[]> {
    const all: ClinicalClaimEvidenceLink[] = [];
    for (const links of ClinicalGovernancePersistence.memoryClaimEvidence.values()) {
      all.push(...links);
    }
    return all;
  }

  public static async saveContraindication(ci: ClinicalContraindication): Promise<void> {
    const list = ClinicalGovernancePersistence.memoryContraindications.get(ci.artifact_id) || [];
    list.push({ ...ci });
    ClinicalGovernancePersistence.memoryContraindications.set(ci.artifact_id, list);

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO clinical_contraindications (
            id, artifact_id, artifact_version, condition_type, population,
            trigger, severity, required_behavior, user_message_reference, status, effective_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
          [
            ci.id,
            ci.artifact_id,
            ci.artifact_version,
            ci.condition_type,
            ci.population,
            ci.trigger,
            ci.severity,
            ci.required_behavior,
            ci.user_message_reference || null,
            ci.status,
            ci.effective_at
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist contraindication', { error: String(err) });
      }
    }
  }

  public static async getContraindications(artifactId: string, version?: number): Promise<ClinicalContraindication[]> {
    const all = ClinicalGovernancePersistence.memoryContraindications.get(artifactId) || [];
    if (version !== undefined) {
      return all.filter(c => c.artifact_version === version);
    }
    return all;
  }

  public static async saveReview(review: ClinicalReview): Promise<void> {
    ClinicalGovernancePersistence.memoryReviews.set(review.id, { ...review });

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO clinical_reviews (
            id, artifact_id, artifact_version, governance_case_id, governance_review_id,
            reviewer_id, review_level, required_specialty, status, decision,
            checklist, evidence_assessment, risk_assessment, claim_assessment,
            limitations_assessment, decision_reason, conditions, policy_version,
            started_at, completed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            decision = EXCLUDED.decision,
            checklist = EXCLUDED.checklist,
            evidence_assessment = EXCLUDED.evidence_assessment,
            risk_assessment = EXCLUDED.risk_assessment,
            claim_assessment = EXCLUDED.claim_assessment,
            limitations_assessment = EXCLUDED.limitations_assessment,
            decision_reason = EXCLUDED.decision_reason,
            conditions = EXCLUDED.conditions,
            completed_at = EXCLUDED.completed_at`,
          [
            review.id,
            review.artifact_id,
            review.artifact_version,
            review.governance_case_id || null,
            review.governance_review_id || null,
            review.reviewer_id,
            review.review_level,
            review.required_specialty || null,
            review.status,
            review.decision || null,
            JSON.stringify(review.checklist),
            JSON.stringify(review.evidence_assessment),
            JSON.stringify(review.risk_assessment),
            JSON.stringify(review.claim_assessment),
            JSON.stringify(review.limitations_assessment),
            review.decision_reason || null,
            review.conditions.map(c => JSON.stringify(c)),
            review.policy_version,
            review.started_at,
            review.completed_at || null
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist clinical review', { error: String(err) });
      }
    }
  }

  public static async getReview(id: string): Promise<ClinicalReview | undefined> {
    return ClinicalGovernancePersistence.memoryReviews.get(id);
  }

  public static async listReviews(artifactId?: string): Promise<ClinicalReview[]> {
    const all = Array.from(ClinicalGovernancePersistence.memoryReviews.values());
    if (artifactId) {
      return all.filter(r => r.artifact_id === artifactId);
    }
    return all;
  }

  public static async getReviewsForArtifact(artifactId: string, version?: number): Promise<ClinicalReview[]> {
    const all = Array.from(ClinicalGovernancePersistence.memoryReviews.values())
      .filter(r => r.artifact_id === artifactId);
    if (version !== undefined) {
      return all.filter(r => r.artifact_version === version);
    }
    return all;
  }

  public static async saveApprovalRecord(approval: ClinicalApprovalRecord): Promise<void> {
    if (approval.artifact_version === undefined && (approval as any).version !== undefined) {
      approval.artifact_version = (approval as any).version;
    }
    if ((approval as any).version === undefined && approval.artifact_version !== undefined) {
      (approval as any).version = approval.artifact_version;
    }
    if (!approval.evidence_ids) approval.evidence_ids = [];
    if (!approval.claim_ids) approval.claim_ids = [];
    if (!approval.policy_version) approval.policy_version = '1.0.0';
    if (approval.governance_release_authorized === undefined) approval.governance_release_authorized = true;
    ClinicalGovernancePersistence.memoryApprovals.set(approval.id, { ...approval });

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO clinical_approval_records (
            id, artifact_id, artifact_version, approval_code, status, review_ids,
            approver_ids, evidence_ids, claim_ids, conditions, policy_version,
            approved_at, expires_at, suspended_at, suspension_reason, revoked_at,
            revocation_reason, governance_release_authorized
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            suspended_at = EXCLUDED.suspended_at,
            suspension_reason = EXCLUDED.suspension_reason,
            revoked_at = EXCLUDED.revoked_at,
            revocation_reason = EXCLUDED.revocation_reason,
            governance_release_authorized = EXCLUDED.governance_release_authorized`,
          [
            approval.id,
            approval.artifact_id,
            approval.artifact_version,
            approval.approval_code,
            approval.status,
            approval.review_ids,
            approval.approver_ids,
            approval.evidence_ids,
            approval.claim_ids,
            JSON.stringify(approval.conditions),
            approval.policy_version,
            approval.approved_at,
            approval.expires_at,
            approval.suspended_at || null,
            approval.suspension_reason || null,
            approval.revoked_at || null,
            approval.revocation_reason || null,
            approval.governance_release_authorized
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist clinical approval record', { error: String(err) });
      }
    }
  }

  public static async getApprovalRecord(id: string): Promise<ClinicalApprovalRecord | undefined> {
    return ClinicalGovernancePersistence.memoryApprovals.get(id);
  }

  public static async getApprovalForArtifactVersion(artifactId: string, version: number): Promise<ClinicalApprovalRecord | undefined> {
    for (const app of ClinicalGovernancePersistence.memoryApprovals.values()) {
      if (app.artifact_id === artifactId && (app.artifact_version === version || (app as any).version === version)) {
        return app;
      }
    }
    return undefined;
  }

  public static async listApprovals(): Promise<ClinicalApprovalRecord[]> {
    return Array.from(ClinicalGovernancePersistence.memoryApprovals.values());
  }

  public static resetForTesting(): void {
    ClinicalGovernancePersistence.memoryArtifacts.clear();
    ClinicalGovernancePersistence.memoryVersions.clear();
    ClinicalGovernancePersistence.memoryClaims.clear();
    ClinicalGovernancePersistence.memoryEvidence.clear();
    ClinicalGovernancePersistence.memoryClaimEvidence.clear();
    ClinicalGovernancePersistence.memoryContraindications.clear();
    ClinicalGovernancePersistence.memoryReviews.clear();
    ClinicalGovernancePersistence.memoryApprovals.clear();
  }
}
