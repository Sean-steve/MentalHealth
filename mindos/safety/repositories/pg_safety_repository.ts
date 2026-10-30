/**
 * MindOS PostgreSQL Safety Repository
 * Authority: Volumes I, V, IX & Appendix G
 */

import { ISafetyRepository } from './safety_repository.js';
import {
  SafetySignalEntity,
  RiskFactorEntity,
  ProtectiveFactorEntity,
  RiskStateEntity,
  SafetyActionEntity,
  SafetyEscalationEntity,
  SafetyReviewEntity,
  SafetyResourceEntity,
  SafetyIncidentEntity,
  SafetyBreakGlassSessionEntity
} from '../domain/types.js';
import { getPool } from '../../platform/database/index.js';

export class PgSafetyRepository implements ISafetyRepository {
  public async saveSignal(signal: SafetySignalEntity): Promise<void> {
    const pool = getPool();
    const query = `
      INSERT INTO safety_signals (
        id, subject_user_id, signal_type, signal_code, source_type, source_reference,
        provenance, severity, confidence, observed_at, received_at, raw_evidence_reference,
        normalized_evidence, jurisdiction, status, dismissal_reason, dismissed_by, dismissed_at,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        dismissal_reason = EXCLUDED.dismissal_reason,
        dismissed_by = EXCLUDED.dismissed_by,
        dismissed_at = EXCLUDED.dismissed_at,
        updated_at = EXCLUDED.updated_at;
    `;

    await pool.query(query, [
      signal.id,
      signal.subject_user_id,
      signal.signal_type,
      signal.signal_code,
      signal.source_type,
      signal.source_reference || null,
      signal.provenance,
      signal.severity,
      signal.confidence,
      signal.observed_at,
      signal.received_at,
      signal.raw_evidence_reference || null,
      JSON.stringify(signal.normalized_evidence || {}),
      signal.jurisdiction,
      signal.status,
      signal.dismissal_reason || null,
      signal.dismissed_by || null,
      signal.dismissed_at || null,
      signal.created_at,
      signal.updated_at
    ]);
  }

  public async getSignalsByUser(userId: string): Promise<SafetySignalEntity[]> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM safety_signals WHERE subject_user_id = $1 ORDER BY observed_at DESC`,
      [userId]
    );
    return res.rows.map(r => ({
      ...r,
      normalized_evidence: typeof r.normalized_evidence === 'string' ? JSON.parse(r.normalized_evidence) : r.normalized_evidence
    }));
  }

  public async saveRiskState(riskState: RiskStateEntity): Promise<void> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Supersede any current state
      await client.query(
        `UPDATE risk_states SET status = 'SUPERSEDED', updated_at = NOW() WHERE subject_user_id = $1 AND status = 'CURRENT'`,
        [riskState.subject_user_id]
      );

      const query = `
        INSERT INTO risk_states (
          id, subject_user_id, level, state_version, effective_at, previous_state,
          reason_codes, evidence_refs, policy_version, clinical_artifact_ref,
          source_summary, last_reviewed_at, next_review_at, fresh_until, status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17);
      `;

      await client.query(query, [
        riskState.id,
        riskState.subject_user_id,
        riskState.level,
        riskState.state_version,
        riskState.effective_at,
        riskState.previous_state || null,
        riskState.reason_codes,
        riskState.evidence_refs,
        riskState.policy_version,
        riskState.clinical_artifact_ref,
        JSON.stringify(riskState.source_summary || {}),
        riskState.last_reviewed_at || null,
        riskState.next_review_at || null,
        riskState.fresh_until,
        riskState.status,
        riskState.created_at,
        riskState.updated_at
      ]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getCurrentRiskState(userId: string): Promise<RiskStateEntity | null> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM risk_states WHERE subject_user_id = $1 AND status = 'CURRENT' LIMIT 1`,
      [userId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      source_summary: typeof r.source_summary === 'string' ? JSON.parse(r.source_summary) : r.source_summary
    };
  }

  public async saveRiskFactor(factor: RiskFactorEntity): Promise<void> {
    const pool = getPool();
    const query = `
      INSERT INTO risk_factors (
        id, subject_user_id, factor_type, source_signal_id, severity, confidence,
        effective_at, expires_at, status, provenance, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
    `;
    await pool.query(query, [
      factor.id,
      factor.subject_user_id,
      factor.factor_type,
      factor.source_signal_id || null,
      factor.severity,
      factor.confidence,
      factor.effective_at,
      factor.expires_at || null,
      factor.status,
      factor.provenance,
      factor.created_at
    ]);
  }

  public async getActiveRiskFactors(userId: string): Promise<RiskFactorEntity[]> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM risk_factors WHERE subject_user_id = $1 AND status = 'ACTIVE'`,
      [userId]
    );
    return res.rows;
  }

  public async saveProtectiveFactor(factor: ProtectiveFactorEntity): Promise<void> {
    const pool = getPool();
    const query = `
      INSERT INTO protective_factors (
        id, subject_user_id, factor_type, source_reference, confidence, effective_at,
        expires_at, status, provenance, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
    `;
    await pool.query(query, [
      factor.id,
      factor.subject_user_id,
      factor.factor_type,
      factor.source_reference || null,
      factor.confidence,
      factor.effective_at,
      factor.expires_at || null,
      factor.status,
      factor.provenance,
      JSON.stringify(factor.details || {}),
      factor.created_at
    ]);
  }

  public async getActiveProtectiveFactors(userId: string): Promise<ProtectiveFactorEntity[]> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM protective_factors WHERE subject_user_id = $1 AND status = 'ACTIVE'`,
      [userId]
    );
    return res.rows.map(r => ({
      ...r,
      details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details
    }));
  }

  public async saveAction(action: SafetyActionEntity): Promise<void> {
    const pool = getPool();
    const query = `
      INSERT INTO safety_actions (
        id, subject_user_id, risk_state_id, action_type, priority, status,
        required_by_policy, generated_at, due_at, started_at, completed_at,
        assigned_actor_id, resource_reference, policy_version, outcome, failure_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at,
        assigned_actor_id = EXCLUDED.assigned_actor_id,
        outcome = EXCLUDED.outcome,
        failure_reason = EXCLUDED.failure_reason;
    `;
    await pool.query(query, [
      action.id,
      action.subject_user_id,
      action.risk_state_id || null,
      action.action_type,
      action.priority,
      action.status,
      action.required_by_policy,
      action.generated_at,
      action.due_at,
      action.started_at || null,
      action.completed_at || null,
      action.assigned_actor_id || null,
      action.resource_reference || null,
      action.policy_version,
      action.outcome || null,
      action.failure_reason || null
    ]);
  }

  public async getActionsByUser(userId: string): Promise<SafetyActionEntity[]> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM safety_actions WHERE subject_user_id = $1 ORDER BY due_at ASC`,
      [userId]
    );
    return res.rows;
  }

  public async getActionById(id: string): Promise<SafetyActionEntity | null> {
    const pool = getPool();
    const res = await pool.query(`SELECT * FROM safety_actions WHERE id = $1`, [id]);
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  public async saveEscalation(escalation: SafetyEscalationEntity): Promise<void> {
    const pool = getPool();
    const query = `
      INSERT INTO safety_escalations (
        id, subject_user_id, risk_state_id, escalation_type, priority, status,
        reason_codes, created_at, assigned_at, acknowledged_at, resolved_at,
        assigned_team, assigned_actor_id, escalation_target, outcome, policy_version,
        sla_acknowledgement_due_at, sla_resolution_due_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        assigned_at = EXCLUDED.assigned_at,
        acknowledged_at = EXCLUDED.acknowledged_at,
        resolved_at = EXCLUDED.resolved_at,
        assigned_actor_id = EXCLUDED.assigned_actor_id,
        outcome = EXCLUDED.outcome;
    `;
    await pool.query(query, [
      escalation.id,
      escalation.subject_user_id,
      escalation.risk_state_id || null,
      escalation.escalation_type,
      escalation.priority,
      escalation.status,
      escalation.reason_codes,
      escalation.created_at,
      escalation.assigned_at || null,
      escalation.acknowledged_at || null,
      escalation.resolved_at || null,
      escalation.assigned_team,
      escalation.assigned_actor_id || null,
      escalation.escalation_target || null,
      escalation.outcome || null,
      escalation.policy_version,
      escalation.sla_acknowledgement_due_at,
      escalation.sla_resolution_due_at
    ]);
  }

  public async getEscalationById(id: string): Promise<SafetyEscalationEntity | null> {
    const pool = getPool();
    const res = await pool.query(`SELECT * FROM safety_escalations WHERE id = $1`, [id]);
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  public async getActiveEscalations(team?: string): Promise<SafetyEscalationEntity[]> {
    const pool = getPool();
    let query = `SELECT * FROM safety_escalations WHERE status NOT IN ('RESOLVED', 'CANCELLED')`;
    const params: unknown[] = [];
    if (team) {
      query += ` AND assigned_team = $1`;
      params.push(team);
    }
    query += ` ORDER BY sla_acknowledgement_due_at ASC`;
    const res = await pool.query(query, params);
    return res.rows;
  }

  public async saveReview(review: SafetyReviewEntity): Promise<void> {
    const pool = getPool();
    const query = `
      INSERT INTO safety_reviews (
        id, subject_user_id, escalation_id, risk_state_id, reviewer_id, reviewer_role,
        qualification_reference, decision, proposed_risk_level, rationale, evidence_refs,
        clinical_artifact_ref, policy_version, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);
    `;
    await pool.query(query, [
      review.id,
      review.subject_user_id,
      review.escalation_id || null,
      review.risk_state_id || null,
      review.reviewer_id,
      review.reviewer_role,
      review.qualification_reference || null,
      review.decision,
      review.proposed_risk_level || null,
      review.rationale,
      review.evidence_refs,
      review.clinical_artifact_ref,
      review.policy_version,
      review.created_at
    ]);
  }

  public async getReviewsByUser(userId: string): Promise<SafetyReviewEntity[]> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM safety_reviews WHERE subject_user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  public async saveResource(resource: SafetyResourceEntity): Promise<void> {
    const pool = getPool();
    const query = `
      INSERT INTO safety_resources (
        id, resource_code, resource_type, name, description, jurisdiction, region,
        contact_method, phone, sms, web, physical_reference, availability_json,
        languages, population, risk_applicability, verification_status, verified_at,
        expires_at, status, source_reference, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      ON CONFLICT (id) DO UPDATE SET
        verification_status = EXCLUDED.verification_status,
        verified_at = EXCLUDED.verified_at,
        expires_at = EXCLUDED.expires_at,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at;
    `;
    await pool.query(query, [
      resource.id,
      resource.resource_code,
      resource.resource_type,
      resource.name,
      resource.description || null,
      resource.jurisdiction,
      resource.region || null,
      resource.contact_method,
      resource.phone || null,
      resource.sms || null,
      resource.web || null,
      resource.physical_reference || null,
      JSON.stringify(resource.availability_json || {}),
      resource.languages,
      resource.population,
      resource.risk_applicability,
      resource.verification_status,
      resource.verified_at,
      resource.expires_at,
      resource.status,
      resource.source_reference,
      resource.created_at,
      resource.updated_at
    ]);
  }

  public async getResources(jurisdiction?: string): Promise<SafetyResourceEntity[]> {
    const pool = getPool();
    let query = `SELECT * FROM safety_resources WHERE status = 'ACTIVE'`;
    const params: unknown[] = [];
    if (jurisdiction) {
      query += ` AND (jurisdiction = $1 OR jurisdiction = 'GLOBAL_FALLBACK')`;
      params.push(jurisdiction.toUpperCase());
    }
    const res = await pool.query(query, params);
    return res.rows.map(r => ({
      ...r,
      availability_json: typeof r.availability_json === 'string' ? JSON.parse(r.availability_json) : r.availability_json
    }));
  }

  public async saveIncident(incident: SafetyIncidentEntity): Promise<void> {
    const pool = getPool();
    const query = `
      INSERT INTO safety_incidents (
        id, incident_type, severity, affected_component, detected_at, status,
        description_reference, governance_impact, release_action, resolved_at,
        resolution_notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        resolved_at = EXCLUDED.resolved_at,
        resolution_notes = EXCLUDED.resolution_notes;
    `;
    await pool.query(query, [
      incident.id,
      incident.incident_type,
      incident.severity,
      incident.affected_component,
      incident.detected_at,
      incident.status,
      incident.description_reference,
      incident.governance_impact || null,
      incident.release_action || null,
      incident.resolved_at || null,
      incident.resolution_notes || null,
      incident.created_at
    ]);
  }

  public async getIncidents(status?: string): Promise<SafetyIncidentEntity[]> {
    const pool = getPool();
    let query = `SELECT * FROM safety_incidents`;
    const params: unknown[] = [];
    if (status) {
      query += ` WHERE status = $1`;
      params.push(status);
    }
    query += ` ORDER BY detected_at DESC`;
    const res = await pool.query(query, params);
    return res.rows;
  }

  public async saveBreakGlassSession(session: SafetyBreakGlassSessionEntity): Promise<void> {
    const pool = getPool();
    const query = `
      INSERT INTO safety_break_glass_sessions (
        id, subject_user_id, actor_id, actor_role, justification, purpose,
        started_at, expires_at, terminated_at, post_review_required, post_review_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        terminated_at = EXCLUDED.terminated_at,
        post_review_id = EXCLUDED.post_review_id;
    `;
    await pool.query(query, [
      session.id,
      session.subject_user_id,
      session.actor_id,
      session.actor_role,
      session.justification,
      session.purpose,
      session.started_at,
      session.expires_at,
      session.terminated_at || null,
      session.post_review_required,
      session.post_review_id || null,
      session.created_at
    ]);
  }

  public async getActiveBreakGlassSession(userId: string, actorId: string): Promise<SafetyBreakGlassSessionEntity | null> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM safety_break_glass_sessions
       WHERE subject_user_id = $1 AND actor_id = $2 AND terminated_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [userId, actorId]
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }
}
