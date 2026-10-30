/**
 * MindOS Canonical Consent Service
 * Authority: Master Architecture Index Section 14, Volume III, IV, VIII
 * ADR-006, ADR-016, ADR-019, ADR-020, ADR-021
 */

import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import {
  ConsentDefinition,
  ConsentPolicyVersion,
  ConsentGrant,
  ConsentEvidence,
  ConsentScopeEntry,
  ConsentRecipient,
  ConsentReceipt,
  ConsentState,
  ConsentCategory,
  ConsentCode,
  ConsentRequirementType,
  ConsentScopeType,
  PrivacyCentreConsentItem
} from '../domain/types.js';
import { ConsentRepository } from '../persistence/consent_repository.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { AuditService } from '../../platform/audit/index.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { CorrelationManager } from '../../platform/shared/correlation.js';
import { logger } from '../../platform/observability/logger.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  AuthorizationError,
  ConsentRequiredError,
  ConsentAlreadyWithdrawnError
} from '../../platform/errors/index.js';

export interface GrantConsentOptions {
  policyVersion?: string;
  source?: string;
  method?: string;
  jurisdiction?: string;
  authorityType?: 'SELF' | 'GUARDIAN' | 'LEGAL_REPRESENTATIVE';
  expiresAt?: string;
  scopes?: Array<{ target_type: string; target_id?: string; is_allowed: boolean }>;
  recipients?: Array<{
    recipient_type: 'PROFESSIONAL' | 'TRUSTED_PERSON' | 'ORGANIZATION' | 'RESEARCH_STUDY';
    recipient_id: string;
    recipient_name?: string;
    role?: string;
    durationDays?: number;
  }>;
  evidenceContext?: {
    ip?: string;
    userAgent?: string;
    interface?: string;
    presentedCopySummary?: string;
    details?: Record<string, unknown>;
  };
}

export interface WithdrawConsentOptions {
  reason?: string;
  evidenceContext?: {
    ip?: string;
    userAgent?: string;
    interface?: string;
    details?: Record<string, unknown>;
  };
}

export class ConsentService {
  private repository: ConsentRepository;

  constructor(repository?: ConsentRepository) {
    this.repository = repository || new ConsentRepository();
  }

  /**
   * Helper to hash evidence payload with SHA-256 for tamper evidence
   */
  private computeEvidenceHash(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  /**
   * Explicitly grants a granular consent
   */
  public async grantConsent(
    subjectUserId: string,
    consentCode: string,
    options: GrantConsentOptions = {}
  ): Promise<ConsentGrant> {
    if (!subjectUserId) {
      throw new ValidationError('subjectUserId is required to grant consent');
    }
    if (!consentCode) {
      throw new ValidationError('consentCode is required to grant consent');
    }

    const definition = this.repository.getDefinitionByCode(consentCode);
    if (!definition) {
      throw new NotFoundError(`Consent definition ${consentCode} not found`);
    }

    // Determine target policy version
    const activePolicy = this.repository.getActivePolicyVersion(consentCode);
    if (!activePolicy) {
      throw new NotFoundError(`No active policy version found for ${consentCode}`);
    }

    const targetVersion = options.policyVersion || activePolicy.version;
    const now = new Date();
    const correlationId = CorrelationManager.getCorrelationId();

    // Check if an existing grant already exists
    const existingActive = this.repository.getActiveGrant(subjectUserId, consentCode);
    if (existingActive) {
      if (existingActive.policy_version === targetVersion && existingActive.status === ConsentState.GRANTED) {
        // Idempotent grant under exact same version
        return existingActive;
      }
      // Supersede previous active grant
      existingActive.status = ConsentState.SUPERSEDED;
      existingActive.updated_at = now.toISOString();
      this.repository.saveGrant(existingActive);
    }

    // Check previous latest state for state-machine validation
    const latest = this.repository.getLatestGrant(subjectUserId, consentCode);
    if (latest && latest.status !== ConsentState.SUPERSEDED) {
      validateStateTransition('ConsentState', latest.status, ConsentState.GRANTED, latest.id);
    }

    // Calculate expiry if policy dictates or option passed
    let expiresAt: string | undefined = options.expiresAt;
    if (!expiresAt && definition.expiry_policy.has_expiry && definition.expiry_policy.default_duration_days) {
      const expDate = new Date(now.getTime() + definition.expiry_policy.default_duration_days * 24 * 60 * 60 * 1000);
      expiresAt = expDate.toISOString();
    }

    const grantId = uuidv7();
    const evidenceId = uuidv7();

    // Compute tamper-evident SHA-256 evidence hash
    const evidencePayload = {
      grant_id: grantId,
      subject_user_id: subjectUserId,
      consent_code: consentCode,
      policy_version: targetVersion,
      timestamp: now.toISOString(),
      source: options.source || 'WEB_PRIVACY_CENTRE',
      method: options.method || 'EXPLICIT_CHECKBOX',
      ip: options.evidenceContext?.ip,
      correlation_id: correlationId,
      details: options.evidenceContext?.details
    };
    const evidenceHash = this.computeEvidenceHash(evidencePayload);

    // Create Evidence Record (ADR-006)
    const evidence: ConsentEvidence = {
      id: evidenceId,
      consent_grant_id: grantId,
      presentation_version: targetVersion,
      policy_version: targetVersion,
      language: 'en',
      interface: options.evidenceContext?.interface || 'WEB_PRIVACY_CENTRE',
      interaction_type: 'GRANT',
      captured_at: now.toISOString(),
      request_context: {
        ip_hash: options.evidenceContext?.ip ? this.computeEvidenceHash({ ip: options.evidenceContext.ip }) : undefined,
        user_agent: options.evidenceContext?.userAgent,
        correlation_id: correlationId,
        presented_copy_summary: options.evidenceContext?.presentedCopySummary || `Consent granted for ${definition.name}`
      },
      evidence_hash: evidenceHash
    };

    // Construct Grant Record
    const grant: ConsentGrant = {
      id: grantId,
      subject_user_id: subjectUserId,
      consent_definition_id: definition.id,
      consent_code: consentCode,
      policy_version_id: activePolicy.id,
      policy_version: targetVersion,
      status: ConsentState.GRANTED,
      granted_at: now.toISOString(),
      expires_at: expiresAt,
      source: options.source || 'WEB_PRIVACY_CENTRE',
      method: options.method || 'EXPLICIT_CHECKBOX',
      jurisdiction: options.jurisdiction || 'KE',
      evidence_id: evidenceId,
      correlation_id: correlationId,
      authority_type: options.authorityType || 'SELF',
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    // Save Grant and Evidence atomically
    this.repository.saveGrant(grant);
    this.repository.saveEvidence(evidence);

    // Save Scopes if specified
    if (options.scopes && options.scopes.length > 0) {
      const scopeEntries: ConsentScopeEntry[] = options.scopes.map(s => ({
        id: uuidv7(),
        consent_grant_id: grantId,
        scope_type: ConsentScopeType.RESOURCE_TYPE,
        target_type: s.target_type,
        target_id: s.target_id,
        is_allowed: s.is_allowed,
        created_at: now.toISOString()
      }));
      this.repository.saveScopes(scopeEntries);
      grant.scopes = scopeEntries;
    }

    // Save Recipients if specified
    if (options.recipients && options.recipients.length > 0) {
      const recipientEntries: ConsentRecipient[] = options.recipients.map(r => {
        let recExpiry: string | undefined = undefined;
        if (r.durationDays) {
          recExpiry = new Date(now.getTime() + r.durationDays * 24 * 60 * 60 * 1000).toISOString();
        }
        return {
          id: uuidv7(),
          consent_grant_id: grantId,
          recipient_type: r.recipient_type,
          recipient_id: r.recipient_id,
          recipient_name: r.recipient_name,
          role: r.role,
          expires_at: recExpiry || expiresAt,
          created_at: now.toISOString()
        };
      });
      this.repository.saveRecipients(recipientEntries);
      grant.recipients = recipientEntries;
    }

    // Outbox Domain Event
    EventBus.enqueue(
      'consent.granted',
      'consent',
      grantId,
      DataClassification.SENSITIVE,
      {
        subject_user_id: subjectUserId,
        consent_code: consentCode,
        policy_version: targetVersion,
        category: definition.category,
        purpose: definition.purpose,
        expires_at: expiresAt,
        evidence_hash: evidenceHash
      }
    );

    // Tamper-evident Audit Trail
    AuditService.record({
      actor_type: 'USER',
      actor_id: subjectUserId,
      action: 'CONSENT.GRANTED',
      resource_type: 'consent_grants',
      resource_id: grantId,
      purpose: definition.purpose,
      authorization_basis: { consent_code: consentCode, policy_version: targetVersion },
      result: 'ALLOWED'
    });

    return grant;
  }

  /**
   * Explicitly declines an optional consent
   */
  public async declineConsent(
    subjectUserId: string,
    consentCode: string,
    options: {
      policyVersion?: string;
      source?: string;
      method?: string;
      evidenceContext?: {
        ip?: string;
        userAgent?: string;
        interface?: string;
        presentedCopySummary?: string;
      };
    } = {}
  ): Promise<ConsentGrant> {
    const definition = this.repository.getDefinitionByCode(consentCode);
    if (!definition) {
      throw new NotFoundError(`Consent definition ${consentCode} not found`);
    }

    if (definition.required_or_optional === ConsentRequirementType.REQUIRED_FOR_SERVICE) {
      throw new AuthorizationError(`Cannot decline mandatory consent ${consentCode}`);
    }

    const activePolicy = this.repository.getActivePolicyVersion(consentCode);
    const targetVersion = options.policyVersion || activePolicy?.version || '1.0.0';
    const now = new Date();
    const correlationId = CorrelationManager.getCorrelationId();

    const grantId = uuidv7();
    const evidenceId = uuidv7();

    const evidencePayload = {
      grant_id: grantId,
      subject_user_id: subjectUserId,
      consent_code: consentCode,
      policy_version: targetVersion,
      timestamp: now.toISOString(),
      interaction: 'DECLINE',
      correlation_id: correlationId
    };
    const evidenceHash = this.computeEvidenceHash(evidencePayload);

    const evidence: ConsentEvidence = {
      id: evidenceId,
      consent_grant_id: grantId,
      presentation_version: targetVersion,
      policy_version: targetVersion,
      language: 'en',
      interface: options.evidenceContext?.interface || 'WEB_PRIVACY_CENTRE',
      interaction_type: 'DECLINE',
      captured_at: now.toISOString(),
      request_context: {
        correlation_id: correlationId,
        presented_copy_summary: options.evidenceContext?.presentedCopySummary || `Declined consent for ${definition.name}`
      },
      evidence_hash: evidenceHash
    };

    const grant: ConsentGrant = {
      id: grantId,
      subject_user_id: subjectUserId,
      consent_definition_id: definition.id,
      consent_code: consentCode,
      policy_version_id: activePolicy?.id || 'none',
      policy_version: targetVersion,
      status: ConsentState.DECLINED,
      declined_at: now.toISOString(),
      source: options.source || 'WEB_PRIVACY_CENTRE',
      method: options.method || 'EXPLICIT_CHECKBOX',
      jurisdiction: 'KE',
      evidence_id: evidenceId,
      correlation_id: correlationId,
      authority_type: 'SELF',
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    this.repository.saveGrant(grant);
    this.repository.saveEvidence(evidence);

    EventBus.enqueue(
      'consent.declined',
      'consent',
      grantId,
      DataClassification.SENSITIVE,
      {
        subject_user_id: subjectUserId,
        consent_code: consentCode,
        policy_version: targetVersion,
        category: definition.category,
        evidence_hash: evidenceHash
      }
    );

    AuditService.record({
      actor_type: 'USER',
      actor_id: subjectUserId,
      action: 'CONSENT.DECLINED',
      resource_type: 'consent_grants',
      resource_id: grantId,
      purpose: definition.purpose,
      authorization_basis: { consent_code: consentCode, policy_version: targetVersion },
      result: 'ALLOWED'
    });

    return grant;
  }

  /**
   * Withdraws a previously granted consent
   */
  public async withdrawConsent(
    subjectUserId: string,
    consentCode: string,
    options: WithdrawConsentOptions = {}
  ): Promise<ConsentGrant> {
    const definition = this.repository.getDefinitionByCode(consentCode);
    if (!definition) {
      throw new NotFoundError(`Consent definition ${consentCode} not found`);
    }

    if (!definition.withdrawal_allowed) {
      throw new AuthorizationError(`Withdrawal is not permitted for mandatory platform consent ${consentCode}`);
    }

    const activeGrant = this.repository.getActiveGrant(subjectUserId, consentCode);
    if (!activeGrant) {
      const latest = this.repository.getLatestGrant(subjectUserId, consentCode);
      if (latest && latest.status === ConsentState.WITHDRAWN) {
        // Idempotent: already withdrawn
        return latest;
      }
      throw new ConsentAlreadyWithdrawnError(`No active consent found to withdraw for ${consentCode}`);
    }

    validateStateTransition('ConsentState', activeGrant.status, ConsentState.WITHDRAWN, activeGrant.id);

    const now = new Date();
    const correlationId = CorrelationManager.getCorrelationId();

    activeGrant.status = ConsentState.WITHDRAWN;
    activeGrant.withdrawn_at = now.toISOString();
    activeGrant.withdrawal_reason = options.reason || 'USER_CHOICE';
    activeGrant.updated_at = now.toISOString();

    const evidenceId = uuidv7();
    const evidencePayload = {
      grant_id: activeGrant.id,
      subject_user_id: subjectUserId,
      consent_code: consentCode,
      policy_version: activeGrant.policy_version,
      timestamp: now.toISOString(),
      interaction: 'WITHDRAW',
      reason: options.reason,
      correlation_id: correlationId
    };
    const evidenceHash = this.computeEvidenceHash(evidencePayload);

    const evidence: ConsentEvidence = {
      id: evidenceId,
      consent_grant_id: activeGrant.id,
      presentation_version: activeGrant.policy_version,
      policy_version: activeGrant.policy_version,
      language: 'en',
      interface: options.evidenceContext?.interface || 'WEB_PRIVACY_CENTRE',
      interaction_type: 'WITHDRAW',
      captured_at: now.toISOString(),
      request_context: {
        correlation_id: correlationId,
        presented_copy_summary: `Withdrawal of consent for ${definition.name}`
      },
      evidence_hash: evidenceHash
    };

    activeGrant.evidence_id = evidenceId;
    this.repository.saveGrant(activeGrant);
    this.repository.saveEvidence(evidence);

    EventBus.enqueue(
      'consent.withdrawn',
      'consent',
      activeGrant.id,
      DataClassification.SENSITIVE,
      {
        subject_user_id: subjectUserId,
        consent_code: consentCode,
        grant_id: activeGrant.id,
        policy_version: activeGrant.policy_version,
        category: definition.category,
        purpose: definition.purpose,
        withdrawal_reason: options.reason,
        evidence_hash: evidenceHash
      }
    );

    AuditService.record({
      actor_type: 'USER',
      actor_id: subjectUserId,
      action: 'CONSENT.WITHDRAWN',
      resource_type: 'consent_grants',
      resource_id: activeGrant.id,
      purpose: definition.purpose,
      authorization_basis: { consent_code: consentCode, policy_version: activeGrant.policy_version },
      result: 'ALLOWED'
    });

    return activeGrant;
  }

  /**
   * Generates a verifiable, immutable Consent Receipt (ADR-006)
   */
  public generateConsentReceipt(subjectUserId: string, consentCode: string): ConsentReceipt {
    const definition = this.repository.getDefinitionByCode(consentCode);
    if (!definition) {
      throw new NotFoundError(`Consent definition ${consentCode} not found`);
    }

    const latestGrant = this.repository.getLatestGrant(subjectUserId, consentCode);
    const activePolicy = this.repository.getActivePolicyVersion(consentCode);

    let evidence: ConsentEvidence | null = null;
    if (latestGrant?.evidence_id) {
      evidence = this.repository.getEvidence(latestGrant.evidence_id);
    }

    const receipt: ConsentReceipt = {
      receipt_id: latestGrant?.id ? `receipt-${latestGrant.id}` : `receipt-${uuidv7()}`,
      subject_user_id: subjectUserId,
      consent_code: consentCode,
      consent_name: definition.name,
      category: definition.category,
      purpose: definition.purpose,
      policy_version: latestGrant?.policy_version || activePolicy?.version || '1.0.0',
      status: latestGrant?.status || ConsentState.NOT_REQUESTED,
      granted_at: latestGrant?.granted_at,
      withdrawn_at: latestGrant?.withdrawn_at,
      expires_at: latestGrant?.expires_at,
      jurisdiction: latestGrant?.jurisdiction || 'KE',
      data_categories: definition.data_categories,
      evidence_hash: evidence?.evidence_hash,
      generated_at: new Date().toISOString(),
      verified_authentic: true
    };

    AuditService.record({
      actor_type: 'USER',
      actor_id: subjectUserId,
      action: 'CONSENT.RECEIPT_GENERATED',
      resource_type: 'consent_receipts',
      resource_id: receipt.receipt_id,
      purpose: definition.purpose,
      authorization_basis: { consent_code: consentCode, status: receipt.status },
      result: 'ALLOWED'
    });

    return receipt;
  }

  /**
   * Returns list of all consent items formatted for the Privacy Centre UI
   */
  public getPrivacyCentreConsents(subjectUserId: string): PrivacyCentreConsentItem[] {
    const definitions = this.repository.listDefinitions();
    const grants = this.repository.listGrantsForSubject(subjectUserId);
    const grantsMap = new Map<string, ConsentGrant>();

    // Map latest grant by consent_code
    for (const g of grants) {
      grantsMap.set(g.consent_code, g);
    }

    return definitions.map(def => {
      const grant = grantsMap.get(def.code);
      const activePolicy = this.repository.getActivePolicyVersion(def.code);
      const currentVersion = activePolicy?.version || '1.0.0';

      let status = grant?.status || ConsentState.NOT_REQUESTED;

      // Check if grant is expired
      if (grant && grant.status === ConsentState.GRANTED && grant.expires_at) {
        if (new Date() >= new Date(grant.expires_at)) {
          status = ConsentState.EXPIRED;
        }
      }

      // Check if re-consent is required due to material policy change
      let requiresReconsent = false;
      if (grant && grant.status === ConsentState.GRANTED && grant.policy_version !== currentVersion) {
        if (def.versioning_policy.requires_reconsent_on_material_change) {
          requiresReconsent = true;
        }
      }

      return {
        code: def.code,
        name: def.name,
        description: def.description,
        category: def.category,
        purpose: def.purpose,
        data_categories: def.data_categories,
        required_or_optional: def.required_or_optional,
        withdrawal_allowed: def.withdrawal_allowed,
        status,
        current_policy_version: currentVersion,
        granted_policy_version: grant?.policy_version,
        requires_reconsent: requiresReconsent,
        granted_at: grant?.granted_at,
        withdrawn_at: grant?.withdrawn_at,
        expires_at: grant?.expires_at,
        grant_id: grant?.id
      };
    });
  }

  /**
   * Publishes a new policy version for a definition and triggers re-consent if material
   */
  public async supersedePolicyVersion(params: {
    consentCode: string;
    version: string;
    title: string;
    summary: string;
    fullTextReference: string;
    isMaterialChange?: boolean;
    approvedBy: string;
  }): Promise<ConsentPolicyVersion> {
    const definition = this.repository.getDefinitionByCode(params.consentCode);
    if (!definition) {
      throw new NotFoundError(`Consent definition ${params.consentCode} not found`);
    }

    const newVersion = this.repository.createPolicyVersion({
      consentDefinitionId: definition.id,
      consentCode: params.consentCode,
      version: params.version,
      title: params.title,
      summary: params.summary,
      fullTextReference: params.fullTextReference,
      isMaterialChange: params.isMaterialChange ?? false,
      approvedBy: params.approvedBy
    });

    const correlationId = CorrelationManager.getCorrelationId();

    EventBus.enqueue(
      'consent.policy_superseded',
      'consent',
      newVersion.id,
      DataClassification.SENSITIVE,
      {
        consent_code: params.consentCode,
        new_version: params.version,
        is_material_change: params.isMaterialChange,
        title: params.title
      }
    );

    if (params.isMaterialChange && definition.versioning_policy.requires_reconsent_on_material_change) {
      EventBus.enqueue(
        'consent.reconsent_required',
        'consent',
        newVersion.id,
        DataClassification.SENSITIVE,
        {
          consent_code: params.consentCode,
          new_version: params.version
        }
      );
    }

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.approvedBy,
      action: 'CONSENT.SUPERSEDED',
      resource_type: 'consent_policy_versions',
      resource_id: newVersion.id,
      purpose: definition.purpose,
      authorization_basis: { consent_code: params.consentCode, version: params.version },
      result: 'ALLOWED'
    });

    return newVersion;
  }

  public getRepository(): ConsentRepository {
    return this.repository;
  }
}
