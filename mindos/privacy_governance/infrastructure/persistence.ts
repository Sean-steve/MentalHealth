/**
 * MindOS Canonical Privacy Governance Persistence Layer
 * Authority: Master Architecture Index Section 7, Volumes I, III, VIII, XV & Appendix B / Q
 * Handles durable relational storage in PostgreSQL with in-memory fallback for test isolation.
 */

import { DatabaseManager } from '../../platform/database/connection.js';
import { logger } from '../../platform/observability/logger.js';
import {
  ProcessingActivity,
  ProcessingActivityVersion,
  DPIAAssessment,
  PrivacyRisk,
  PrivacyRiskControl,
  PrivacyRemediation,
  PrivacyApproval,
  PrivacyDataFlow,
  PrivacyProcessor,
  DataTransferAssessment,
  PrivacyRetentionLink
} from '../types.js';

export class PrivacyGovernancePersistence {
  // In-memory stores for testing and caching
  private static memoryActivities: Map<string, ProcessingActivity> = new Map();
  private static memoryVersions: Map<string, ProcessingActivityVersion[]> = new Map();
  private static memoryDPIAs: Map<string, DPIAAssessment> = new Map();
  private static memoryRisks: Map<string, PrivacyRisk[]> = new Map(); // dpia_id -> risks
  private static memoryRiskControls: Map<string, PrivacyRiskControl[]> = new Map(); // risk_id -> controls
  private static memoryRemediations: Map<string, PrivacyRemediation[]> = new Map(); // dpia_id -> remediations
  private static memoryApprovals: Map<string, PrivacyApproval> = new Map(); // approval_id -> approval
  private static memoryActivityApprovals: Map<string, PrivacyApproval> = new Map(); // activity_id:version -> approval
  private static memoryDataFlows: Map<string, PrivacyDataFlow[]> = new Map(); // activity_id -> flows
  private static memoryProcessors: Map<string, PrivacyProcessor> = new Map();
  private static memoryTransfers: Map<string, DataTransferAssessment[]> = new Map();
  private static memoryRetentionLinks: Map<string, PrivacyRetentionLink[]> = new Map();

  // 1. Processing Activity
  public static async saveActivity(activity: ProcessingActivity): Promise<void> {
    this.memoryActivities.set(activity.id, { ...activity });

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO processing_activities (
            id, code, name, description, owner_domain, owner_id, version, status,
            data_subject_categories, data_categories, special_categories, purposes,
            lawful_basis, consent_dependencies, sources, recipients, processors,
            storage_locations, processing_locations, transfer_locations, retention_policy_refs,
            automated_processing, profiling, ai_involvement, clinical_relevance,
            security_classification, jurisdictions, fingerprint, governed_resource_id,
            supersedes_id, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
          )
          ON CONFLICT (id) DO UPDATE SET
            version = EXCLUDED.version,
            status = EXCLUDED.status,
            data_subject_categories = EXCLUDED.data_subject_categories,
            data_categories = EXCLUDED.data_categories,
            purposes = EXCLUDED.purposes,
            lawful_basis = EXCLUDED.lawful_basis,
            processors = EXCLUDED.processors,
            recipients = EXCLUDED.recipients,
            fingerprint = EXCLUDED.fingerprint,
            governed_resource_id = EXCLUDED.governed_resource_id,
            updated_at = NOW()`,
          [
            activity.id,
            activity.code,
            activity.name,
            activity.description,
            activity.owner_domain,
            activity.owner_id,
            activity.version,
            activity.status,
            activity.data_subject_categories,
            activity.data_categories,
            activity.special_categories,
            activity.purposes,
            activity.lawful_basis,
            JSON.stringify(activity.consent_dependencies),
            activity.sources,
            activity.recipients,
            activity.processors,
            activity.storage_locations,
            activity.processing_locations,
            activity.transfer_locations,
            activity.retention_policy_refs,
            activity.automated_processing,
            activity.profiling,
            activity.ai_involvement,
            activity.clinical_relevance,
            activity.security_classification,
            activity.jurisdictions,
            activity.fingerprint,
            activity.governed_resource_id || null,
            activity.supersedes_id || null,
            activity.created_at,
            activity.updated_at
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist processing activity to database; in-memory copy preserved', { error: (err as Error).message });
      }
    }
  }

  public static async getActivityById(id: string): Promise<ProcessingActivity | null> {
    const mem = this.memoryActivities.get(id);
    if (mem) return { ...mem };

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM processing_activities WHERE id = $1', [id]);
        const rows = Array.isArray(res) ? res : (res as any)?.rows || [];
        if (rows.length > 0) {
          const act = rows[0] as ProcessingActivity;
          this.memoryActivities.set(act.id, act);
          return act;
        }
      } catch (err) {
        logger.warn('Failed to fetch processing activity from database', { error: (err as Error).message });
      }
    }
    return null;
  }

  public static async getActivityByCode(code: string): Promise<ProcessingActivity | null> {
    for (const act of this.memoryActivities.values()) {
      if (act.code === code) return { ...act };
    }

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM processing_activities WHERE code = $1', [code]);
        const rows = Array.isArray(res) ? res : (res as any)?.rows || [];
        if (rows.length > 0) {
          const act = rows[0] as ProcessingActivity;
          this.memoryActivities.set(act.id, act);
          return act;
        }
      } catch (err) {
        logger.warn('Failed to fetch activity by code', { error: (err as Error).message });
      }
    }
    return null;
  }

  public static async listActivities(): Promise<ProcessingActivity[]> {
    const list = Array.from(this.memoryActivities.values());
    return list.map((a) => ({ ...a }));
  }

  // 2. Processing Activity Versions
  public static async saveVersion(version: ProcessingActivityVersion): Promise<void> {
    const list = this.memoryVersions.get(version.processing_activity_id) || [];
    list.push({ ...version });
    this.memoryVersions.set(version.processing_activity_id, list);

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO processing_activity_versions (
            id, processing_activity_id, version, status, fingerprint, specification,
            is_material_change, material_change_summary, supersedes_version, created_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (processing_activity_id, version) DO UPDATE SET
            status = EXCLUDED.status,
            specification = EXCLUDED.specification`,
          [
            version.id,
            version.processing_activity_id,
            version.version,
            version.status,
            version.fingerprint,
            JSON.stringify(version.specification),
            version.is_material_change,
            version.material_change_summary || null,
            version.supersedes_version || null,
            version.created_by,
            version.created_at
          ]
        );
      } catch (err) {
        logger.warn('Failed to save processing activity version', { error: (err as Error).message });
      }
    }
  }

  public static async getVersions(activityId: string): Promise<ProcessingActivityVersion[]> {
    return (this.memoryVersions.get(activityId) || []).map((v) => ({ ...v }));
  }

  // 3. DPIA Assessments
  public static async saveDPIA(dpia: DPIAAssessment): Promise<void> {
    this.memoryDPIAs.set(dpia.id, { ...dpia });

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO dpia_assessments (
            id, dpia_code, processing_activity_id, processing_activity_version,
            status, trigger_factors, scope, purpose, necessity_assessment,
            proportionality_assessment, risk_summary, residual_risk, requested_by,
            reviewer_id, decision, decision_reason, conditions, submitted_at,
            completed_at, next_review_at, expires_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22, $23
          )
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            residual_risk = EXCLUDED.residual_risk,
            reviewer_id = EXCLUDED.reviewer_id,
            decision = EXCLUDED.decision,
            decision_reason = EXCLUDED.decision_reason,
            conditions = EXCLUDED.conditions,
            completed_at = EXCLUDED.completed_at,
            next_review_at = EXCLUDED.next_review_at,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()`,
          [
            dpia.id,
            dpia.dpia_code,
            dpia.processing_activity_id,
            dpia.processing_activity_version,
            dpia.status,
            JSON.stringify(dpia.trigger_factors),
            dpia.scope,
            dpia.purpose,
            JSON.stringify(dpia.necessity_assessment),
            JSON.stringify(dpia.proportionality_assessment),
            JSON.stringify(dpia.risk_summary),
            dpia.residual_risk,
            dpia.requested_by,
            dpia.reviewer_id || null,
            dpia.decision || null,
            dpia.decision_reason || null,
            dpia.conditions,
            dpia.submitted_at || null,
            dpia.completed_at || null,
            dpia.next_review_at || null,
            dpia.expires_at || null,
            dpia.created_at,
            dpia.updated_at
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist DPIA assessment', { error: (err as Error).message });
      }
    }
  }

  public static async getDPIAById(id: string): Promise<DPIAAssessment | null> {
    const mem = this.memoryDPIAs.get(id);
    if (mem) return { ...mem };

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        const res = await client.query('SELECT * FROM dpia_assessments WHERE id = $1', [id]);
        const rows = Array.isArray(res) ? res : (res as any)?.rows || [];
        if (rows.length > 0) {
          const d = rows[0] as DPIAAssessment;
          this.memoryDPIAs.set(d.id, d);
          return d;
        }
      } catch (err) {
        logger.warn('Failed to fetch DPIA by ID', { error: (err as Error).message });
      }
    }
    return null;
  }

  public static async getDPIAForActivity(activityId: string, version: number): Promise<DPIAAssessment | null> {
    for (const d of this.memoryDPIAs.values()) {
      if (d.processing_activity_id === activityId && d.processing_activity_version === version) {
        return { ...d };
      }
    }
    return null;
  }

  public static async listDPIAs(): Promise<DPIAAssessment[]> {
    return Array.from(this.memoryDPIAs.values()).map((d) => ({ ...d }));
  }

  // 4. Privacy Risks & Controls
  public static async saveRisk(risk: PrivacyRisk): Promise<void> {
    const list = this.memoryRisks.get(risk.dpia_id) || [];
    list.push({ ...risk });
    this.memoryRisks.set(risk.dpia_id, list);
  }

  public static async getRisksByDPIA(dpiaId: string): Promise<PrivacyRisk[]> {
    return (this.memoryRisks.get(dpiaId) || []).map((r) => ({ ...r }));
  }

  public static async saveRiskControl(riskControl: PrivacyRiskControl): Promise<void> {
    const list = this.memoryRiskControls.get(riskControl.risk_id) || [];
    list.push({ ...riskControl });
    this.memoryRiskControls.set(riskControl.risk_id, list);
  }

  public static async getControlsForRisk(riskId: string): Promise<PrivacyRiskControl[]> {
    return (this.memoryRiskControls.get(riskId) || []).map((rc) => ({ ...rc }));
  }

  // 5. Privacy Remediations
  public static async saveRemediation(rem: PrivacyRemediation): Promise<void> {
    const list = this.memoryRemediations.get(rem.dpia_id) || [];
    const idx = list.findIndex((r) => r.id === rem.id);
    if (idx >= 0) {
      list[idx] = { ...rem };
    } else {
      list.push({ ...rem });
    }
    this.memoryRemediations.set(rem.dpia_id, list);
  }

  public static async getRemediationsByDPIA(dpiaId: string): Promise<PrivacyRemediation[]> {
    return (this.memoryRemediations.get(dpiaId) || []).map((r) => ({ ...r }));
  }

  // 6. Privacy Approvals
  public static async saveApproval(approval: PrivacyApproval): Promise<void> {
    this.memoryApprovals.set(approval.id, { ...approval });
    const key = `${approval.processing_activity_id}:${approval.processing_activity_version}`;
    this.memoryActivityApprovals.set(key, { ...approval });

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        await client.query(
          `INSERT INTO privacy_approvals (
            id, processing_activity_id, processing_activity_version, dpia_id,
            dpia_version, fingerprint, reviewer_id, reviewer_role, decision,
            conditions, policy_version, status, approved_at, expires_at,
            revoked_at, revoked_by, revocation_reason, evidence_vault_id, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          )
          ON CONFLICT (processing_activity_id, processing_activity_version) DO UPDATE SET
            status = EXCLUDED.status,
            revoked_at = EXCLUDED.revoked_at,
            revoked_by = EXCLUDED.revoked_by,
            revocation_reason = EXCLUDED.revocation_reason`,
          [
            approval.id,
            approval.processing_activity_id,
            approval.processing_activity_version,
            approval.dpia_id,
            approval.dpia_version,
            approval.fingerprint,
            approval.reviewer_id,
            approval.reviewer_role,
            approval.decision,
            approval.conditions,
            approval.policy_version,
            approval.status,
            approval.approved_at,
            approval.expires_at,
            approval.revoked_at || null,
            approval.revoked_by || null,
            approval.revocation_reason || null,
            approval.evidence_vault_id || null,
            approval.created_at
          ]
        );
      } catch (err) {
        logger.warn('Failed to persist privacy approval', { error: (err as Error).message });
      }
    }
  }

  public static async getApprovalForActivityVersion(activityId: string, version: number): Promise<PrivacyApproval | null> {
    const key = `${activityId}:${version}`;
    const mem = this.memoryActivityApprovals.get(key);
    if (mem) return { ...mem };

    const client = DatabaseManager.getClient();
    if (client) {
      try {
        const res = await client.query(
          'SELECT * FROM privacy_approvals WHERE processing_activity_id = $1 AND processing_activity_version = $2',
          [activityId, version]
        );
        const rows = Array.isArray(res) ? res : (res as any)?.rows || [];
        if (rows.length > 0) {
          const app = rows[0] as PrivacyApproval;
          this.memoryApprovals.set(app.id, app);
          this.memoryActivityApprovals.set(key, app);
          return app;
        }
      } catch (err) {
        logger.warn('Failed to query approval for activity version', { error: (err as Error).message });
      }
    }
    return null;
  }

  public static async listApprovals(): Promise<PrivacyApproval[]> {
    return Array.from(this.memoryApprovals.values()).map((a) => ({ ...a }));
  }

  // 7. Reset in-memory state (for test isolation)
  public static resetMemoryState(): void {
    this.memoryActivities.clear();
    this.memoryVersions.clear();
    this.memoryDPIAs.clear();
    this.memoryRisks.clear();
    this.memoryRiskControls.clear();
    this.memoryRemediations.clear();
    this.memoryApprovals.clear();
    this.memoryActivityApprovals.clear();
    this.memoryDataFlows.clear();
    this.memoryProcessors.clear();
    this.memoryTransfers.clear();
    this.memoryRetentionLinks.clear();
  }
}
