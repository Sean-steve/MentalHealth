/**
 * MindOS Clinical Governance Bounded Context
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Sprint 10: Clinical Governance Engine, Clinical Artifact Lifecycle, Evidence Management,
 *            Review Workflows & Clinical Release Authorization
 */

export * from './types.js';
export * from './policies/risk_classifier.js';
export * from './policies/material_change.js';
export * from './policies/reviewer_eligibility.js';
export * from './evidence/adequacy.js';
export * from './reviews/workflow.js';
export * from './infrastructure/persistence.js';
export * from './infrastructure/reconciliation.js';
export * from './application/service.js';

// Backwards compatibility facade for legacy ClinicalGovernanceService
import { ClinicalGovernanceEngine } from './application/service.js';
import { ClinicalGovernancePersistence } from './infrastructure/persistence.js';
import { ClinicalArtifactState, GovernanceDecision } from './types.js';

export type ClinicalImpactClass = 'CR-0' | 'CR-1' | 'CR-2' | 'CR-3';

export interface ClinicalArtifactEntity {
  id: string;
  artifact_type: string;
  artifact_key: string;
  version: number;
  clinical_domain: string;
  impact_class: ClinicalImpactClass;
  evidence_level: string;
  state: ClinicalArtifactState;
  owner: string;
  created_at: string;
}

export class ClinicalGovernanceService {
  public static async registerArtifact(params: {
    artifact_key: string;
    artifact_type: string;
    clinical_domain: string;
    impact_class: ClinicalImpactClass;
    evidence_level: string;
    owner: string;
  }): Promise<ClinicalArtifactEntity> {
    const art = await ClinicalGovernanceEngine.registerArtifact({
      artifact_code: params.artifact_key,
      artifact_type: params.artifact_type as any,
      name: params.artifact_key,
      description: `Legacy registered clinical artifact ${params.artifact_key}`,
      owner_id: params.owner,
      intended_use: 'Clinical evaluation and intervention'
    });

    return {
      id: art.id,
      artifact_type: art.artifact_type,
      artifact_key: art.artifact_code,
      version: art.version,
      clinical_domain: params.clinical_domain,
      impact_class: art.clinical_risk_class as ClinicalImpactClass,
      evidence_level: params.evidence_level,
      state: art.status,
      owner: art.owner_id,
      created_at: art.created_at
    };
  }

  public static listArtifacts(): ClinicalArtifactEntity[] {
    return Array.from((ClinicalGovernancePersistence as any).memoryArtifacts.values()).map((art: any) => ({
      id: art.id,
      artifact_type: art.artifact_type,
      artifact_key: art.artifact_code,
      version: art.version,
      clinical_domain: 'mental_health',
      impact_class: art.clinical_risk_class as ClinicalImpactClass,
      evidence_level: 'LEVEL_II',
      state: art.status,
      owner: art.owner_id,
      created_at: art.created_at
    }));
  }

  public static resetForTesting(): void {
    ClinicalGovernancePersistence.resetForTesting();
  }
}
