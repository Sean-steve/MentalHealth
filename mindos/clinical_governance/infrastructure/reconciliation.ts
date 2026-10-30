/**
 * MindOS Clinical Governance Reconciliation Engine
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendix B
 * Audits alignment between active clinical artifacts, valid clinical approvals,
 * underlying evidence status, and aggregate release authorizations.
 */

import { ClinicalGovernancePersistence } from './persistence.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { logger } from '../../platform/observability/logger.js';
import {
  ClinicalArtifactState,
  ClinicalReconciliationReport,
  ClinicalReconciliationIssue
} from '../types.js';

export class ClinicalReconciliationEngine {
  /**
   * Runs clinical reconciliation across all registered artifacts and approvals.
   */
  public static async reconcile(nowDate: Date = new Date()): Promise<ClinicalReconciliationReport> {
    const artifacts = await ClinicalGovernancePersistence.listArtifacts();
    const approvals = await ClinicalGovernancePersistence.listApprovals();
    const allEvidence = await ClinicalGovernancePersistence.listEvidenceMetadata();
    const allLinks = await ClinicalGovernancePersistence.getAllClaimEvidenceLinks();

    const issues: ClinicalReconciliationIssue[] = [];
    const nowIso = nowDate.toISOString();

    for (const art of artifacts) {
      const approval = await ClinicalGovernancePersistence.getApprovalForArtifactVersion(art.id, art.version);

      // 1. Check Approved State vs Approval Record
      if (art.status === ClinicalArtifactState.APPROVED || art.status === ClinicalArtifactState.CONDITIONALLY_APPROVED) {
        if (!approval) {
          issues.push({
            artifact_id: art.id,
            artifact_code: art.artifact_code,
            version: art.version,
            issue_type: 'MISSING_MANDATED_REVIEWS',
            severity: 'CRITICAL',
            details: `Artifact is in ${art.status} state but has no valid ClinicalApprovalRecord.`
          });
          continue;
        }

        // 2. Check Expiry
        if (new Date(approval.expires_at) < nowDate) {
          approval.status = 'EXPIRED';
          art.status = ClinicalArtifactState.EXPIRED;
          await ClinicalGovernancePersistence.saveApprovalRecord(approval);
          await ClinicalGovernancePersistence.saveArtifact(art);

          issues.push({
            artifact_id: art.id,
            artifact_code: art.artifact_code,
            version: art.version,
            issue_type: 'EXPIRED_APPROVAL',
            severity: 'CRITICAL',
            details: `Clinical approval ${approval.approval_code} expired on ${approval.expires_at}. Artifact automatically moved to EXPIRED.`
          });

          await EventBus.publish({
            type: 'clinical.artifact_expired',
            payload: {
              artifact_id: art.id,
              artifact_code: art.artifact_code,
              version: art.version,
              approval_code: approval.approval_code,
              expired_at: approval.expires_at
            }
          });

          AuditService.record({
            actor_type: 'SYSTEM',
            actor_id: 'clinical_reconciliation_daemon',
            action: 'CLINICAL_GOVERNANCE.APPROVAL_EXPIRED',
            resource_type: 'clinical_artifact',
            resource_id: art.id,
            purpose: 'Clinical Reconciliation Expiry Enforcement',
            result: 'ALLOWED',
            authorization_basis: { approval_id: approval.id }
          });
        }

        // 3. Check Review Due (within 30 days of expiry)
        const expiryDate = new Date(approval.expires_at);
        const daysToExpiry = (expiryDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysToExpiry > 0 && daysToExpiry <= 30) {
          await EventBus.publish({
            type: 'clinical.review_due',
            payload: {
              artifact_id: art.id,
              artifact_code: art.artifact_code,
              version: art.version,
              days_to_expiry: Math.round(daysToExpiry),
              expires_at: approval.expires_at
            }
          });
        }

        // 4. Check for Invalidated / Retracted Evidence linked to this version
        const claims = await ClinicalGovernancePersistence.getClaims(art.id, art.version);
        for (const claim of claims) {
          const links = allLinks.filter(l => l.claim_id === claim.id);
          for (const link of links) {
            const ev = allEvidence.find(e => e.id === link.evidence_id);
            if (ev && (ev.status === 'RETRACTED' || ev.status === 'INVALIDATED' || ev.is_retracted)) {
              issues.push({
                artifact_id: art.id,
                artifact_code: art.artifact_code,
                version: art.version,
                issue_type: 'INVALIDATED_EVIDENCE',
                severity: 'CRITICAL',
                details: `Claim ${claim.claim_code} relies on evidence ${ev.id} which has been ${ev.status}. Mandatory clinical review required.`
              });

              // Flag artifact for immediate clinical review
              if ((art.status as any) !== ClinicalArtifactState.ACTION_REQUIRED && (art.status as any) !== ClinicalArtifactState.SUSPENDED) {
                art.status = ClinicalArtifactState.ACTION_REQUIRED;
                await ClinicalGovernancePersistence.saveArtifact(art);

                await EventBus.publish({
                  type: 'clinical.evidence_invalidated',
                  payload: {
                    artifact_id: art.id,
                    artifact_code: art.artifact_code,
                    version: art.version,
                    claim_id: claim.id,
                    evidence_id: ev.id,
                    evidence_status: ev.status
                  }
                });
              }
            }
          }
        }
      }
    }

    const report: ClinicalReconciliationReport = {
      timestamp: nowIso,
      total_artifacts: artifacts.length,
      active_approved_artifacts: artifacts.filter(
        a => a.status === ClinicalArtifactState.APPROVED || a.status === ClinicalArtifactState.CONDITIONALLY_APPROVED
      ).length,
      issues_found: issues.length,
      issues
    };

    logger.info('Clinical governance reconciliation audit completed', {
      total_artifacts: report.total_artifacts,
      issues_found: report.issues_found
    });

    return report;
  }

  /**
   * Verifies if a runtime artifact reference matches the approved version.
   * Blocks execution and raises an alert if version drift is detected.
   */
  public static async verifyRuntimeVersion(params: {
    artifactCode: string;
    requestedVersion: number;
  }): Promise<{ allowed: boolean; approvedVersion?: number; reason?: string }> {
    const artifact = await ClinicalGovernancePersistence.getArtifactByCode(params.artifactCode);
    if (!artifact) {
      return {
        allowed: false,
        reason: `CLINICAL_ARTIFACT_NOT_FOUND: Artifact code "${params.artifactCode}" is not registered in Clinical Governance.`
      };
    }

    const approval = await ClinicalGovernancePersistence.getApprovalForArtifactVersion(artifact.id, params.requestedVersion);
    if (!approval || approval.status !== 'ACTIVE') {
      return {
        allowed: false,
        approvedVersion: artifact.version,
        reason: `CLINICAL_VERSION_DRIFT: Runtime requested version ${params.requestedVersion} of "${params.artifactCode}", but only approved versions with ACTIVE status are permitted. Current active version: ${artifact.version}.`
      };
    }

    return { allowed: true, approvedVersion: params.requestedVersion };
  }
}

export class ClinicalGovernanceReconciliationDaemon {
  public static async runAudit(nowDate: Date = new Date()): Promise<ClinicalReconciliationReport> {
    return ClinicalReconciliationEngine.reconcile(nowDate);
  }
}
