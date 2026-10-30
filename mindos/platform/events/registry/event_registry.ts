/**
 * MindOS Canonical Event Schema Registry
 * Authority: Master Architecture Index Section 12, Volume IX & Appendix E
 */

import {
  EventPriority,
  DeliverySemantics,
  RetentionClass,
  EventRegistrationStatus,
  EventRegistrationDefinition
} from '../types.js';
import { DataClassification } from '../../shared/data_classification.js';
import { DomainInvariantError, NotFoundError } from '../../errors/index.js';

export class CanonicalEventRegistry {
  private static events: Map<string, EventRegistrationDefinition> = new Map();

  static {
    CanonicalEventRegistry.initializeDefaults();
  }

  public static initializeDefaults(): void {
    CanonicalEventRegistry.events.clear();

    // ==========================================
    // ACTIVE CANONICAL EVENTS (Sprints 1–7 Domains)
    // ==========================================

    // 1. identity.user_registered
    CanonicalEventRegistry.register({
      event_type: 'identity.user_registered',
      domain: 'identity',
      producer: 'identity',
      schema_version: 1,
      description: 'Emitted when a new user account is successfully registered in the identity store.',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.NORMAL,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['notification_worker', 'audit_worker', 'analytics_worker'],
      payload_validator: (payload: any) => {
        const errors: string[] = [];
        const userId = payload?.user_id || payload?.userId || payload?.accountId;
        if (!userId) errors.push('user_id is required');
        if (!payload?.occurred_at && !payload?.occurredAt) errors.push('occurred_at is required');
        if (payload?.email || payload?.email_normalized) {
          errors.push('email must not be included in user_registered event payload');
        }
        return { valid: errors.length === 0, errors };
      }
    });

    // 2. identity.account_state_changed
    CanonicalEventRegistry.register({
      event_type: 'identity.account_state_changed',
      domain: 'identity',
      producer: 'identity',
      schema_version: 1,
      description: 'Emitted when user account status changes (e.g. pending -> active, active -> locked).',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['session_manager', 'audit_worker', 'notification_worker'],
      payload_validator: (payload: any) => {
        const errors: string[] = [];
        const userId = payload?.user_id || payload?.userId || payload?.accountId;
        if (!userId) errors.push('user_id is required');
        if (!payload?.from_state && !payload?.fromState) errors.push('from_state is required');
        if (!payload?.to_state && !payload?.toState) errors.push('to_state is required');
        if (!payload?.reason_code && !payload?.reasonCode && !payload?.reason) errors.push('reason_code is required');
        return { valid: errors.length === 0, errors };
      }
    });

    // 3. identity.session_revoked
    CanonicalEventRegistry.register({
      event_type: 'identity.session_revoked',
      domain: 'identity',
      producer: 'identity',
      schema_version: 1,
      description: 'Emitted when an active user authentication session is explicitly terminated or invalidated.',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['token_revocation_cache', 'audit_worker'],
      payload_validator: (payload: any) => {
        const errors: string[] = [];
        const userId = payload?.user_id || payload?.userId || payload?.accountId;
        const sessionId = payload?.session_id || payload?.sessionId;
        if (!userId) errors.push('user_id is required');
        if (!sessionId) errors.push('session_id is required');
        if (!payload?.reason) errors.push('reason is required');
        return { valid: errors.length === 0, errors };
      }
    });

    // 4. consent.granted
    CanonicalEventRegistry.register({
      event_type: 'consent.granted',
      domain: 'consent',
      producer: 'consent',
      schema_version: 1,
      description: 'Emitted when a user grants affirmative explicit consent for a processing purpose.',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.NORMAL,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['enforcement_cache', 'audit_worker'],
      payload_validator: (payload: any) => {
        const errors: string[] = [];
        const userId = payload?.user_id || payload?.subject_user_id;
        const consentType = payload?.consent_type || payload?.consent_code;
        const receiptId = payload?.receipt_id || payload?.evidence_hash || payload?.grant_id;
        if (!userId) errors.push('user_id is required');
        if (!consentType) errors.push('consent_type is required');
        if (!receiptId) errors.push('receipt_id is required');
        if (payload?.policy_version === undefined || payload?.policy_version === null) errors.push('policy_version is required');
        return { valid: errors.length === 0, errors };
      }
    });

    // 5. consent.withdrawn
    CanonicalEventRegistry.register({
      event_type: 'consent.withdrawn',
      domain: 'consent',
      producer: 'consent',
      schema_version: 1,
      description: 'Emitted when a user withdraws consent, triggering immediate downstream cessation.',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['enforcement_cache', 'audit_worker', 'data_lifecycle_worker'],
      payload_validator: (payload: any) => {
        const errors: string[] = [];
        const userId = payload?.user_id || payload?.subject_user_id;
        const consentType = payload?.consent_type || payload?.consent_code;
        const receiptId = payload?.receipt_id || payload?.grant_id || payload?.evidence_hash;
        if (!userId) errors.push('user_id is required');
        if (!consentType) errors.push('consent_type is required');
        if (!receiptId) errors.push('receipt_id is required');
        if (payload?.policy_version === undefined || payload?.policy_version === null) errors.push('policy_version is required');
        return { valid: errors.length === 0, errors };
      }
    });

    // 6. consent.declined
    CanonicalEventRegistry.register({
      event_type: 'consent.declined',
      domain: 'consent',
      producer: 'consent',
      schema_version: 1,
      description: 'Emitted when a user actively declines an optional consent.',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.NORMAL,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['audit_worker'],
      payload_validator: (payload: any) => {
        const errors: string[] = [];
        const userId = payload?.user_id || payload?.subject_user_id;
        const consentType = payload?.consent_type || payload?.consent_code;
        if (!userId) errors.push('user_id is required');
        if (!consentType) errors.push('consent_type is required');
        return { valid: errors.length === 0, errors };
      }
    });

    // 7. consent.policy_superseded
    CanonicalEventRegistry.register({
      event_type: 'consent.policy_superseded',
      domain: 'consent',
      producer: 'consent',
      schema_version: 1,
      description: 'Emitted when a consent definition or policy version is superseded.',
      classification: DataClassification.SENSITIVE,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*'],
      payload_validator: (payload: any) => {
        const errors: string[] = [];
        if (!payload?.consent_code) errors.push('consent_code is required');
        if (payload?.new_version === undefined && payload?.version === undefined) errors.push('new_version is required');
        return { valid: errors.length === 0, errors };
      }
    });

    // 8. consent.reconsent_required
    CanonicalEventRegistry.register({
      event_type: 'consent.reconsent_required',
      domain: 'consent',
      producer: 'consent',
      schema_version: 1,
      description: 'Emitted when a material policy change mandates re-consent from subjects.',
      classification: DataClassification.SENSITIVE,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*'],
      payload_validator: (payload: any) => {
        const errors: string[] = [];
        if (!payload?.consent_code) errors.push('consent_code is required');
        if (payload?.new_version === undefined && payload?.version === undefined) errors.push('new_version is required');
        return { valid: errors.length === 0, errors };
      }
    });

    // 6. authorization.role_assigned
    CanonicalEventRegistry.register({
      event_type: 'authorization.role_assigned',
      domain: 'authorization',
      producer: 'authorization',
      schema_version: 1,
      description: 'Emitted when an RBAC role is assigned to an actor.',
      classification: DataClassification.INTERNAL,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.NORMAL,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['auth_cache', 'audit_worker'],
      payload_validator: (payload: any) => {
        const errors: string[] = [];
        if (!payload?.actor_id) errors.push('actor_id is required');
        if (!payload?.role_id) errors.push('role_id is required');
        return { valid: errors.length === 0, errors };
      }
    });

    // ==========================================
    // BACKWARD-COMPATIBLE SPRINT 4 ALIASES
    // ==========================================
    CanonicalEventRegistry.register({
      event_type: 'identity.account_registered',
      domain: 'identity',
      producer: 'identity',
      schema_version: 1,
      description: 'Legacy Sprint 4 event alias for identity.user_registered',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.NORMAL,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.DEPRECATED,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'identity.email_verified',
      domain: 'identity',
      producer: 'identity',
      schema_version: 1,
      description: 'Legacy Sprint 4 event alias for email verification',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.NORMAL,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.DEPRECATED,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'identity.authenticated',
      domain: 'identity',
      producer: 'identity',
      schema_version: 1,
      description: 'Legacy Sprint 4 event alias for user authentication',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.NORMAL,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'identity.all_sessions_revoked',
      domain: 'identity',
      producer: 'identity',
      schema_version: 1,
      description: 'Legacy Sprint 4 event alias for global session revocation',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'identity.password_reset',
      domain: 'identity',
      producer: 'identity',
      schema_version: 1,
      description: 'Legacy Sprint 4 event alias for password reset',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'identity.password_changed',
      domain: 'identity',
      producer: 'identity',
      schema_version: 1,
      description: 'Legacy Sprint 4 event alias for password change',
      classification: DataClassification.RESTRICTED,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    // ==========================================
    // ASSESSMENT CANONICAL EVENTS (SPRINT 15 - ACTIVE)
    // ==========================================
    CanonicalEventRegistry.register({
      event_type: 'assessment.started',
      domain: 'assessments',
      producer: 'assessments',
      schema_version: 1,
      description: 'Clinical assessment session initiated',
      classification: DataClassification.HEALTH_SENSITIVE,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.NORMAL,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'assessment.completed',
      domain: 'assessments',
      producer: 'assessments',
      schema_version: 1,
      description: 'Clinical assessment scoring completed',
      classification: DataClassification.HEALTH_SENSITIVE,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'assessment.result_invalidated',
      domain: 'assessments',
      producer: 'assessments',
      schema_version: 1,
      description: 'Assessment score invalidated',
      classification: DataClassification.HEALTH_SENSITIVE,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    // ==========================================
    // CONTENT & PSYCHOEDUCATION CANONICAL EVENTS (SPRINT 16 - ACTIVE)
    // ==========================================
    CanonicalEventRegistry.register({
      event_type: 'content.published',
      domain: 'content',
      producer: 'content',
      schema_version: 1,
      description: 'Content version published to catalog',
      classification: DataClassification.PUBLIC,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'content.suspended',
      domain: 'content',
      producer: 'content',
      schema_version: 1,
      description: 'Content version suspended from delivery',
      classification: DataClassification.INTERNAL,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.CRITICAL,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'content.retired',
      domain: 'content',
      producer: 'content',
      schema_version: 1,
      description: 'Content definition or version permanently retired',
      classification: DataClassification.INTERNAL,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'content.version_superseded',
      domain: 'content',
      producer: 'content',
      schema_version: 1,
      description: 'Content version superseded by newer active version',
      classification: DataClassification.INTERNAL,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.NORMAL,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'content.completed',
      domain: 'content',
      producer: 'content',
      schema_version: 1,
      description: 'User completed psychoeducational content or guided exercise',
      classification: DataClassification.HEALTH_SENSITIVE,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.NORMAL,
      retention_class: RetentionClass.OPERATIONAL,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    CanonicalEventRegistry.register({
      event_type: 'content.issue_reported',
      domain: 'content',
      producer: 'content',
      schema_version: 1,
      description: 'Clinical or quality issue reported against content version',
      classification: DataClassification.INTERNAL,
      delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
      priority: EventPriority.HIGH,
      retention_class: RetentionClass.AUDIT,
      status: EventRegistrationStatus.ACTIVE,
      allowed_consumers: ['*']
    });

    // ==========================================
    // FUTURE CANONICAL EVENTS (APPENDIX E CATALOGUE - INACTIVE)
    // ==========================================

    const futureEvents: Array<{
      type: string;
      domain: string;
      priority: EventPriority;
      retention: RetentionClass;
      desc: string;
    }> = [
      { type: 'safety.risk_signal_detected', domain: 'safety', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Clinical safety risk indicator identified' },
      { type: 'safety.state_changed', domain: 'safety', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Safety triage status changed' },
      { type: 'safety.action_required', domain: 'safety', priority: EventPriority.HIGH, retention: RetentionClass.OPERATIONAL, desc: 'Safety intervention required' },
      { type: 'safety.escalation_created', domain: 'safety', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Emergency human escalation dispatched' },
      { type: 'safety.resource_expired', domain: 'safety', priority: EventPriority.HIGH, retention: RetentionClass.OPERATIONAL, desc: 'Crisis hotline resource lease expired' },
      { type: 'governance.review_required', domain: 'governance', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Governance review mandated' },
      { type: 'governance.review_decided', domain: 'governance', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Governance review decision reached' },
      { type: 'governance.release_authorized', domain: 'governance', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Release authorization signed' },
      { type: 'governance.release_revoked', domain: 'governance', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Release authorization revoked' },
      { type: 'clinical.artifact_created', domain: 'clinical', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical artifact created' },
      { type: 'clinical.artifact_review_required', domain: 'clinical', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical review mandated' },
      { type: 'clinical.review_assigned', domain: 'clinical', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical reviewer assigned' },
      { type: 'clinical.artifact_approved', domain: 'clinical', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical approval granted' },
      { type: 'clinical.artifact_conditionally_approved', domain: 'clinical', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical conditional approval granted' },
      { type: 'clinical.artifact_rejected', domain: 'clinical', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical approval rejected' },
      { type: 'clinical.artifact_suspended', domain: 'clinical', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Clinical artifact suspended for safety' },
      { type: 'clinical.artifact_reinstated', domain: 'clinical', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical artifact reinstated' },
      { type: 'clinical.artifact_revoked', domain: 'clinical', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Clinical artifact revoked' },
      { type: 'clinical.artifact_expired', domain: 'clinical', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical artifact approval expired' },
      { type: 'clinical.review_due', domain: 'clinical', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical review renewal due' },
      { type: 'clinical.evidence_invalidated', domain: 'clinical', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Clinical evidence invalidated or retracted' },
      { type: 'privacy.processing_activity_created', domain: 'privacy', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'New processing activity registered in canonical registry' },
      { type: 'privacy.processing_activity_changed', domain: 'privacy', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Material change detected in processing activity' },
      { type: 'privacy.dpia_required', domain: 'privacy', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Mandatory data protection impact assessment triggered' },
      { type: 'privacy.dpia_review_due', domain: 'privacy', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Data protection impact assessment review due' },
      { type: 'privacy.dpia_decided', domain: 'privacy', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'DPIA decision rendered by Data Protection Officer' },
      { type: 'privacy.approval_expired', domain: 'privacy', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Privacy approval validity period elapsed' },
      { type: 'privacy.approval_revoked', domain: 'privacy', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Privacy approval revoked for cause' },
      { type: 'privacy.processing_suspended', domain: 'privacy', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Governed data processing halted' },
      { type: 'regulatory.source_changed', domain: 'regulatory', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Kenyan regulatory baseline updated' },
      { type: 'regulatory.source_registered', domain: 'regulatory', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'New regulatory source registered' },
      { type: 'regulatory.classification_created', domain: 'regulatory', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Regulatory classification performed' },
      { type: 'regulatory.assessment_started', domain: 'regulatory', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Regulatory assessment initiated' },
      { type: 'regulatory.assessment_decided', domain: 'regulatory', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Regulatory assessment decision rendered' },
      { type: 'regulatory.approval_granted', domain: 'regulatory', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Regulatory approval granted' },
      { type: 'regulatory.approval_conditionally_granted', domain: 'regulatory', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Regulatory approval granted with conditions' },
      { type: 'regulatory.approval_rejected', domain: 'regulatory', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Regulatory approval rejected' },
      { type: 'regulatory.approval_suspended', domain: 'regulatory', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Regulatory approval suspended' },
      { type: 'regulatory.approval_revoked', domain: 'regulatory', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Regulatory approval revoked' },
      { type: 'regulatory.approval_expired', domain: 'regulatory', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Regulatory approval validity expired' },
      { type: 'regulatory.gap_created', domain: 'regulatory', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Regulatory non-compliance gap identified' },
      { type: 'regulatory.gap_resolved', domain: 'regulatory', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Regulatory gap resolved and verified' },
      { type: 'regulatory.certification_status_changed', domain: 'regulatory', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'External regulatory certification status changed' },
      { type: 'regulatory.impact_assessment_created', domain: 'regulatory', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Regulatory source change impact assessment created' },
      // AI Safety Governance Events (Sprint 13)
      { type: 'ai.system_registered', domain: 'ai_safety_governance', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'AI System registered in canonical registry' },
      { type: 'ai.system_state_changed', domain: 'ai_safety_governance', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'AI System lifecycle state transitioned' },
      { type: 'ai.system_paused', domain: 'ai_safety_governance', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'AI System paused' },
      { type: 'ai.configuration_created', domain: 'ai_safety_governance', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'AI Configuration created with cryptographic fingerprint' },
      { type: 'ai.evaluation_completed', domain: 'ai_safety_governance', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'AI Evaluation suite run completed' },
      { type: 'ai.review_completed', domain: 'ai_safety_governance', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'AI Safety Review decision recorded' },
      { type: 'ai.approval_granted', domain: 'ai_safety_governance', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'AI Release Approval granted' },
      { type: 'ai.approval_revoked', domain: 'ai_safety_governance', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'AI Release Approval revoked' },
      { type: 'ai.incident_reported', domain: 'ai_safety_governance', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'AI safety incident reported' },
      // AI Runtime & Conversational Companion Events (Sprint 17)
      { type: 'ai.memory_created', domain: 'ai', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'AI user memory created' },
      { type: 'ai.memory_deleted', domain: 'ai', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'AI user memory deleted' },
      { type: 'ai.safety_intervened', domain: 'ai', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'AI companion safety intervention triggered' },
      { type: 'ai.safety_intervention', domain: 'ai', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'AI runtime safety intervention triggered' },
      { type: 'ai.turn_completed', domain: 'ai', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'AI companion conversational turn completed' },
      { type: 'ai.response_generated', domain: 'ai', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'AI response generated under governed contract' },
      // Care Navigation & Referral Engine Events (Sprint 18)
      { type: 'care_navigation.session_started', domain: 'care_navigation', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Care navigation session initiated' },
      { type: 'care_navigation.pathway_recommended', domain: 'care_navigation', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Support pathway recommended based on assessed need' },
      { type: 'care_navigation.pathway_selected', domain: 'care_navigation', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'User selected a recommended support pathway' },
      { type: 'care_navigation.support_need_classified', domain: 'care_navigation', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'User support need level and acuity classified' },
      { type: 'care_navigation.escalated_to_safety', domain: 'care_navigation', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Care navigation identified acute crisis and escalated to Safety Kernel' },
      { type: 'referral.created', domain: 'referrals', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Referral draft created' },
      { type: 'referral.status_changed', domain: 'referrals', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Referral transitioned to new state' },
      { type: 'referral.submitted', domain: 'referrals', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Referral submitted to target provider or service' },
      { type: 'referral.accepted', domain: 'referrals', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Referral accepted by receiving provider' },
      { type: 'referral.declined', domain: 'referrals', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Referral declined by receiving provider' },
      { type: 'referral.cancelled', domain: 'referrals', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Referral cancelled' },
      { type: 'referral.handoff_accessed', domain: 'referrals', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Referral minimum-necessary handoff package accessed by authorized provider' },
      { type: 'referral.handoff_revoked', domain: 'referrals', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Referral handoff package access revoked by user or system' },
      // Care Context
      { type: 'care.relationship_established', domain: 'care', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Care relationship established between client and verified professional' },
      // Professional Network & Provider Verification (Sprint 19)
      { type: 'professional.profile_created', domain: 'professionals', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Professional profile registered' },
      { type: 'professional.verification_requested', domain: 'professionals', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Professional submitted credentials for verification review' },
      { type: 'professional.verified', domain: 'professionals', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Professional credentials and scope verified by authorized reviewer' },
      { type: 'professional.restricted', domain: 'professionals', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Professional practice scope or services restricted' },
      { type: 'professional.suspended', domain: 'professionals', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Professional suspended from service delivery and discoverability' },
      { type: 'professional.credential_expiring', domain: 'professionals', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Professional credential or registration nearing expiration' },
      { type: 'professional.credential_expired', domain: 'professionals', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Professional credential expired, triggering eligibility recalculation' },
      { type: 'professional.service_activated', domain: 'professionals', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Professional service offering activated within verified scope' },
      { type: 'professional.service_suspended', domain: 'professionals', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Professional service offering suspended' },
      // Availability & Appointments (Sprint 20)
      { type: 'appointment.created', domain: 'appointments', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Appointment created in held or requested state' },
      { type: 'appointment.confirmed', domain: 'appointments', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Appointment confirmed with locked provider slot' },
      { type: 'appointment.rescheduled', domain: 'appointments', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Appointment rescheduled to new slot with previous schedule archived' },
      { type: 'appointment.cancelled', domain: 'appointments', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Appointment cancelled with slot released' },
      { type: 'appointment.started', domain: 'appointments', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Appointment clinical encounter started' },
      { type: 'appointment.completed', domain: 'appointments', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Appointment successfully completed by authorized professional' },
      { type: 'appointment.no_show', domain: 'appointments', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Appointment recorded as user or provider no-show' },
      { type: 'appointment.waitlist_offer_created', domain: 'appointments', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Waitlist offer generated for opened slot' },
      { type: 'appointment.hold_created', domain: 'availability', priority: EventPriority.NORMAL, retention: RetentionClass.OPERATIONAL, desc: 'Temporary slot hold created' },
      { type: 'appointment.hold_expired', domain: 'availability', priority: EventPriority.LOW, retention: RetentionClass.OPERATIONAL, desc: 'Slot hold expired and reclaimed' },
      { type: 'appointment.reminder_scheduled', domain: 'appointments', priority: EventPriority.LOW, retention: RetentionClass.OPERATIONAL, desc: 'Appointment notification reminder scheduled' },
      { type: 'notifications.dispatched', domain: 'notifications', priority: EventPriority.LOW, retention: RetentionClass.OPERATIONAL, desc: 'Notification dispatched to delivery channel' },
      // Care Relationships & Continuity Events (Sprint 21)
      { type: 'care_relationship.proposed', domain: 'care_relationships', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Care relationship proposed' },
      { type: 'care_relationship.created', domain: 'care_relationships', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Care relationship created' },
      { type: 'care_relationship.activated', domain: 'care_relationships', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care relationship activated with defined scope' },
      { type: 'care_relationship.paused', domain: 'care_relationships', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care relationship temporarily paused' },
      { type: 'care_relationship.restricted', domain: 'care_relationships', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care relationship practice scope restricted' },
      { type: 'care_relationship.transfer_initiated', domain: 'care_relationships', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care relationship transfer initiated' },
      { type: 'care_relationship.transferred', domain: 'care_relationships', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care relationship transfer completed' },
      { type: 'care_relationship.terminated', domain: 'care_relationships', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care relationship terminated' },
      { type: 'care_relationship.expired', domain: 'care_relationships', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care relationship expired' },
      { type: 'care_relationship.revoked', domain: 'care_relationships', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Care relationship revoked' },
      { type: 'care_team.member_added', domain: 'care_relationships', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Professional added to care team' },
      { type: 'care_team.member_removed', domain: 'care_relationships', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Professional removed from care team' },
      { type: 'care_team.member_status_changed', domain: 'care_relationships', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care team member status changed' },
      { type: 'care_continuity.impact_reconciled', domain: 'care_relationships', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care continuity reconciled following provider suspension or credential change' },
      // Clinical Workspace & Encounters (Sprint 21)
      { type: 'clinical_encounter.scheduled', domain: 'clinical_workspace', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical encounter scheduled' },
      { type: 'clinical_encounter.started', domain: 'clinical_workspace', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical encounter commenced by lead professional' },
      { type: 'clinical_encounter.completed', domain: 'clinical_workspace', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical encounter documented and completed' },
      { type: 'clinical_encounter.cancelled', domain: 'clinical_workspace', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical encounter cancelled' },
      { type: 'clinical_note.created', domain: 'clinical_workspace', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical note created in draft' },
      { type: 'clinical_note.signed', domain: 'clinical_workspace', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical note digitally signed and locked as immutable record' },
      { type: 'clinical_note.amended', domain: 'clinical_workspace', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical note amended via attached addendum' },
      { type: 'clinical_workspace.context_accessed', domain: 'clinical_workspace', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Patient clinical context accessed within authorized scope' },
      { type: 'professional_safety_concern.submitted', domain: 'clinical_workspace', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Clinician submitted clinical safety concern' },
      // Care Planning, Clinical Tasks & Messaging (Sprint 22)
      { type: 'care.plan_created', domain: 'care_plans', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Care plan draft created' },
      { type: 'care.plan_activated', domain: 'care_plans', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care plan activated with approved version' },
      { type: 'care.plan_updated', domain: 'care_plans', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care plan updated with new version' },
      { type: 'care.plan_paused', domain: 'care_plans', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care plan paused' },
      { type: 'care.plan_completed', domain: 'care_plans', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care plan successfully completed' },
      { type: 'care.plan_terminated', domain: 'care_plans', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care plan terminated' },
      { type: 'care.goal_updated', domain: 'care_plans', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Care goal status or progress updated' },
      { type: 'care.plan_review_completed', domain: 'care_plans', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Care plan formal periodic review completed' },
      { type: 'care.assignment_created', domain: 'care_plans', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Content or assessment resource assigned' },
      { type: 'care.task_created', domain: 'clinical_tasks', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical task created' },
      { type: 'care.task_ready', domain: 'clinical_tasks', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical task ready for action' },
      { type: 'care.task_completed', domain: 'clinical_tasks', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical task completed by owning authority' },
      { type: 'care.task_overdue', domain: 'clinical_tasks', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical task marked overdue' },
      { type: 'care.task_cancelled', domain: 'clinical_tasks', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical task cancelled' },
      { type: 'care.thread_opened', domain: 'professional_messaging', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Professional message thread opened' },
      { type: 'care.thread_closed', domain: 'professional_messaging', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Professional message thread closed' },
      { type: 'care.thread_participant_added', domain: 'professional_messaging', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Participant added to thread' },
      { type: 'care.thread_participant_removed', domain: 'professional_messaging', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Participant removed from thread' },
      { type: 'care.message_sent', domain: 'professional_messaging', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Professional care message sent' },
      { type: 'care.message_delivered', domain: 'professional_messaging', priority: EventPriority.LOW, retention: RetentionClass.AUDIT, desc: 'Professional message delivered' },
      { type: 'care.message_safety_escalated', domain: 'professional_messaging', priority: EventPriority.CRITICAL, retention: RetentionClass.AUDIT, desc: 'Message safety signal escalated to Safety Kernel' },
      // Longitudinal Clinical Record & Outcomes (Sprint 23)
      { type: 'clinical.timeline_entry_created', domain: 'clinical_record', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical timeline entry projected' },
      { type: 'outcome.measurement_recorded', domain: 'outcomes', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Clinical outcome measurement recorded' },
      { type: 'outcome.trend_changed', domain: 'outcomes', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Outcome trend calculation updated' },
      { type: 'outcome.review_required', domain: 'outcomes', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Measurement-based care review required' },
      { type: 'outcome.review_completed', domain: 'outcomes', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Measurement-based care review completed by clinician' },
      { type: 'outcome.measurement_invalidated', domain: 'outcomes', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Outcome measurement invalidated' },
      { type: 'outcome.alert_raised', domain: 'outcomes', priority: EventPriority.HIGH, retention: RetentionClass.AUDIT, desc: 'Clinical outcome deterioration or threshold alert raised' },
      { type: 'outcome.alert_resolved', domain: 'outcomes', priority: EventPriority.NORMAL, retention: RetentionClass.AUDIT, desc: 'Outcome alert resolved' }
    ];

    for (const f of futureEvents) {
      const isActiveDomain = f.type !== 'privacy.dpia_review_due' && (
        f.domain === 'safety' ||
        f.domain === 'governance' ||
        f.domain === 'clinical' ||
        f.domain === 'privacy' ||
        f.domain === 'regulatory' ||
        f.domain === 'ai_safety_governance' ||
        f.domain === 'ai' ||
        f.domain === 'care_navigation' ||
        f.domain === 'referrals' ||
        f.domain === 'care' ||
        f.domain === 'care_relationships' ||
        f.domain === 'care_plans' ||
        f.domain === 'clinical_tasks' ||
        f.domain === 'professional_messaging' ||
        f.domain === 'clinical_workspace' ||
        f.domain === 'professionals' ||
        f.domain === 'appointments' ||
        f.domain === 'availability' ||
        f.domain === 'notifications' ||
        f.domain === 'outcomes' ||
        f.domain === 'clinical_record'
      );
      CanonicalEventRegistry.register({
        event_type: f.type,
        domain: f.domain,
        producer: f.domain,
        schema_version: 1,
        description: f.desc,
        classification: DataClassification.RESTRICTED,
        delivery_semantics: DeliverySemantics.AT_LEAST_ONCE,
        priority: f.priority,
        retention_class: f.retention,
        status: isActiveDomain ? EventRegistrationStatus.ACTIVE : EventRegistrationStatus.INACTIVE,
        allowed_consumers: isActiveDomain ? ['*'] : []
      });
    }
  }

  public static register(def: EventRegistrationDefinition): void {
    const key = `${def.event_type}:v${def.schema_version}`;
    CanonicalEventRegistry.events.set(key, def);
    // Also index without version as latest
    CanonicalEventRegistry.events.set(def.event_type, def);
  }

  public static get(eventType: string, schemaVersion?: number): EventRegistrationDefinition | undefined {
    if (schemaVersion) {
      return CanonicalEventRegistry.events.get(`${eventType}:v${schemaVersion}`);
    }
    return CanonicalEventRegistry.events.get(eventType);
  }

  public static require(eventType: string, schemaVersion?: number): EventRegistrationDefinition {
    const def = CanonicalEventRegistry.get(eventType, schemaVersion);
    if (!def) {
      throw new NotFoundError(`CANONICAL_EVENT_NOT_FOUND: Event type "${eventType}" is not registered in the MindOS Event Registry.`);
    }
    return def;
  }

  public static validatePayload(eventType: string, payload: unknown, schemaVersion = 1): void {
    const def = CanonicalEventRegistry.get(eventType, schemaVersion);
    if (!def) {
      // If unregistered, enforce strict registration requirement
      throw new DomainInvariantError(`UNREGISTERED_DOMAIN_EVENT: Event type "${eventType}" must be registered in Event Registry before emitting.`);
    }

    if (def.status === EventRegistrationStatus.INACTIVE) {
      throw new DomainInvariantError(
        `INACTIVE_DOMAIN_EVENT: Event type "${eventType}" belongs to a future domain not yet activated. Only domains that actually exist may emit their events.`
      );
    }

    if (def.payload_validator) {
      const result = def.payload_validator(payload);
      if (!result.valid) {
        throw new DomainInvariantError(
          `EVENT_PAYLOAD_VALIDATION_FAILED for "${eventType}": ${(result.errors || []).join('; ')}`
        );
      }
    }
  }

  public static listAll(): EventRegistrationDefinition[] {
    const unique = new Map<string, EventRegistrationDefinition>();
    for (const [key, val] of CanonicalEventRegistry.events.entries()) {
      if (!key.includes(':v')) {
        unique.set(key, val);
      }
    }
    return Array.from(unique.values());
  }

  public static resetForTesting(): void {
    CanonicalEventRegistry.initializeDefaults();
  }
}

export const CanonicalEventTypes = {
  SAFETY_RISK_SIGNAL_DETECTED: 'safety.risk_signal_detected',
  SAFETY_STATE_CHANGED: 'safety.state_changed',
  SAFETY_ACTION_REQUIRED: 'safety.action_required',
  SAFETY_ESCALATION_CREATED: 'safety.escalation_created',
  SAFETY_RESOURCE_EXPIRED: 'safety.resource_expired'
} as const;

export type CanonicalEventType = typeof CanonicalEventTypes[keyof typeof CanonicalEventTypes];

export { EventPriority } from '../types.js';
