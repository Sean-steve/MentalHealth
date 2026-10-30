/**
 * MindOS Canonical Consent Decision Service
 * Authority: Master Architecture Index Section 14, Volume III, IV, VIII
 * ADR-016, ADR-019, ADR-020, ADR-021
 */

import {
  ConsentDecisionEffect,
  ConsentDecisionResult,
  ConsentEvaluationRequest,
  ConsentCode,
  ConsentState,
  ConsentRequirementType
} from '../domain/types.js';
import { ConsentRepository } from '../persistence/consent_repository.js';
import { logger } from '../../platform/observability/logger.js';

export class ConsentDecisionService {
  private repository: ConsentRepository;

  constructor(repository?: ConsentRepository) {
    this.repository = repository || new ConsentRepository();
  }

  /**
   * Deterministically evaluates consent for a requested operation.
   * Fail-Closed: any failure or mismatch returns DENY.
   */
  public evaluate(request: ConsentEvaluationRequest): ConsentDecisionResult {
    try {
      // 1. Self-Service Identity & Emergency Resources do not require optional consent
      if (this.isExemptOperation(request)) {
        return {
          effect: ConsentDecisionEffect.NOT_REQUIRED,
          allowed: true,
          reason: 'Operation is exempt from optional user consent requirements (Essential Service / Emergency Care)',
          reasonCode: 'CONSENT_NOT_REQUIRED'
        };
      }

      // 2. Identify Applicable Consent Code based on purpose and resource
      const targetConsentCode = this.resolveConsentCode(request);
      if (!targetConsentCode) {
        // If operation does not fall under any known consent requirement
        return {
          effect: ConsentDecisionEffect.NOT_REQUIRED,
          allowed: true,
          reason: 'No consent requirement mapped for this operation',
          reasonCode: 'CONSENT_NOT_MAPPED'
        };
      }

      const definition = this.repository.getDefinitionByCode(targetConsentCode);
      if (!definition || definition.status !== 'ACTIVE') {
        return {
          effect: ConsentDecisionEffect.DENY,
          allowed: false,
          reason: `Consent definition ${targetConsentCode} is missing or inactive`,
          reasonCode: 'CONSENT_DEFINITION_INACTIVE',
          consentCode: targetConsentCode
        };
      }

      // 3. Retrieve Latest Grant for the Subject
      const latestGrant = this.repository.getLatestGrant(request.subjectId, targetConsentCode);
      if (!latestGrant || latestGrant.status === ConsentState.NOT_REQUESTED) {
        return {
          effect: ConsentDecisionEffect.REQUIRES_CONSENT,
          allowed: false,
          reason: `Explicit consent for ${definition.name} (${targetConsentCode}) has not been granted`,
          reasonCode: 'AUTHZ_CONSENT_REQUIRED',
          consentCode: targetConsentCode
        };
      }

      // Check for Declined, Withdrawn, Expired, or Superseded
      if (latestGrant.status === ConsentState.DECLINED) {
        return {
          effect: ConsentDecisionEffect.DENY,
          allowed: false,
          reason: `User explicitly declined consent for ${definition.name}`,
          reasonCode: 'AUTHZ_CONSENT_DECLINED',
          consentCode: targetConsentCode,
          grantId: latestGrant.id,
          policyVersion: latestGrant.policy_version
        };
      }

      if (latestGrant.status === ConsentState.WITHDRAWN) {
        return {
          effect: ConsentDecisionEffect.DENY,
          allowed: false,
          reason: `User withdrew consent for ${definition.name}`,
          reasonCode: 'AUTHZ_CONSENT_WITHDRAWN',
          consentCode: targetConsentCode,
          grantId: latestGrant.id,
          policyVersion: latestGrant.policy_version
        };
      }

      if (latestGrant.status === ConsentState.EXPIRED) {
        return {
          effect: ConsentDecisionEffect.DENY,
          allowed: false,
          reason: `Consent grant for ${definition.name} has expired`,
          reasonCode: 'AUTHZ_CONSENT_EXPIRED',
          consentCode: targetConsentCode,
          grantId: latestGrant.id,
          policyVersion: latestGrant.policy_version
        };
      }

      if (latestGrant.status !== ConsentState.GRANTED) {
        return {
          effect: ConsentDecisionEffect.DENY,
          allowed: false,
          reason: `Consent status ${latestGrant.status} does not permit processing`,
          reasonCode: 'AUTHZ_CONSENT_INVALID_STATE',
          consentCode: targetConsentCode,
          grantId: latestGrant.id,
          policyVersion: latestGrant.policy_version
        };
      }

      // 4. Time Expiry Verification
      const now = new Date();
      if (latestGrant.expires_at) {
        const expiry = new Date(latestGrant.expires_at);
        if (now >= expiry) {
          this.repository.saveGrant({
            ...latestGrant,
            status: ConsentState.EXPIRED,
            updated_at: now.toISOString()
          });

          return {
            effect: ConsentDecisionEffect.DENY,
            allowed: false,
            reason: `Consent grant has expired on ${latestGrant.expires_at} for ${definition.name}`,
            reasonCode: 'AUTHZ_CONSENT_EXPIRED',
            consentCode: targetConsentCode,
            grantId: latestGrant.id,
            policyVersion: latestGrant.policy_version
          };
        }
      }

      // 5. Policy Version & Re-consent Check
      const activePolicy = this.repository.getActivePolicyVersion(targetConsentCode);
      if (
        activePolicy &&
        activePolicy.version !== latestGrant.policy_version &&
        activePolicy.is_material_change &&
        definition.versioning_policy.requires_reconsent_on_material_change
      ) {
        return {
          effect: ConsentDecisionEffect.REQUIRES_CONSENT,
          allowed: false,
          reason: `Policy for ${definition.name} has been updated to ${activePolicy.version}. Material policy change requires re-consent before continuing.`,
          reasonCode: 'AUTHZ_RECONSENT_REQUIRED',
          consentCode: targetConsentCode,
          grantId: latestGrant.id,
          policyVersion: latestGrant.policy_version
        };
      }

      // 6. Purpose Limitation Check (Volume VIII Section 4)
      if (request.purpose && definition.purpose) {
        const allowedPurposes = [definition.purpose];
        if (definition.purpose === 'CARE_SHARING') {
          allowedPurposes.push('CARE_DELIVERY');
        }
        if (!allowedPurposes.includes(request.purpose)) {
          return {
            effect: ConsentDecisionEffect.DENY,
            allowed: false,
            reason: `Purpose ${request.purpose} not authorized for ${definition.name} (authorized purpose: '${definition.purpose}')`,
            reasonCode: 'AUTHZ_PURPOSE_MISMATCH',
            consentCode: targetConsentCode,
            grantId: latestGrant.id
          };
        }
      }

      // 7. Data Category & Scope Exclusions
      // Invariant: Private journals are strictly excluded from professional data sharing
      // unless explicitly opted in with a specific scope entry.
      if (
        targetConsentCode === ConsentCode.PROFESSIONAL_DATA_SHARING &&
        (request.resourceType === 'journal' || request.resourceType === 'personal_journal')
      ) {
        const scopes = latestGrant.scopes || this.repository.getScopeEntriesForGrant(latestGrant.id);
        const journalScope = scopes.find(s => s.target_type === 'journal' && s.is_allowed);
        if (!journalScope) {
          return {
            effect: ConsentDecisionEffect.DENY,
            allowed: false,
            reason: 'Private journal entries are strictly excluded from grant scope',
            reasonCode: 'AUTHZ_JOURNAL_EXCLUDED_FROM_CONSENT',
            consentCode: targetConsentCode,
            grantId: latestGrant.id
          };
        }
      }

      // Verify any general scope entry exclusion
      if (latestGrant.scopes || request.scope) {
        const scopes = latestGrant.scopes || this.repository.getScopeEntriesForGrant(latestGrant.id);
        const matchedScope = scopes.find(
          s => s.target_type === request.resourceType || (s.target_id && s.target_id === request.scope)
        );
        if (matchedScope && !matchedScope.is_allowed) {
          return {
            effect: ConsentDecisionEffect.DENY,
            allowed: false,
            reason: `Resource category '${request.resourceType}' is explicitly excluded from grant scope`,
            reasonCode: 'AUTHZ_SCOPE_EXCLUDED',
            consentCode: targetConsentCode,
            grantId: latestGrant.id
          };
        }
      }

      // 8. Recipient Verification for Data Sharing
      if (
        (targetConsentCode === ConsentCode.PROFESSIONAL_DATA_SHARING ||
          targetConsentCode === ConsentCode.TRUSTED_PERSON_SHARING) &&
        request.recipientId
      ) {
        const recipients = latestGrant.recipients || this.repository.getRecipientsForGrant(latestGrant.id);
        if (recipients.length > 0) {
          const authorizedRecipient = recipients.find(r => r.recipient_id === request.recipientId);
          if (!authorizedRecipient) {
            return {
              effect: ConsentDecisionEffect.DENY,
              allowed: false,
              reason: `Recipient is not authorized: actor '${request.recipientId}' is not authorized to receive shared data for subject '${request.subjectId}'`,
              reasonCode: 'AUTHZ_RECIPIENT_NOT_CONSENTED',
              consentCode: targetConsentCode,
              grantId: latestGrant.id
            };
          }
          if (authorizedRecipient.expires_at && now >= new Date(authorizedRecipient.expires_at)) {
            return {
              effect: ConsentDecisionEffect.DENY,
              allowed: false,
              reason: `Recipient authorization for '${request.recipientId}' expired on ${authorizedRecipient.expires_at}`,
              reasonCode: 'AUTHZ_RECIPIENT_EXPIRED',
              consentCode: targetConsentCode,
              grantId: latestGrant.id
            };
          }
        }
      }

      // All checks passed -> ALLOW
      return {
        effect: ConsentDecisionEffect.ALLOW,
        allowed: true,
        reason: `Valid active consent verified for ${definition.name} (Policy ${latestGrant.policy_version})`,
        reasonCode: 'AUTHZ_CONSENT_VALID',
        consentCode: targetConsentCode,
        grantId: latestGrant.id,
        policyVersion: latestGrant.policy_version,
        expiresAt: latestGrant.expires_at
      };
    } catch (err) {
      logger.error('Unexpected error in ConsentDecisionService, failing closed', {
        error: (err as Error).message,
        request
      });
      // Fail-Closed
      return {
        effect: ConsentDecisionEffect.DENY,
        allowed: false,
        reason: 'Consent evaluation encountered an unexpected system error; access denied',
        reasonCode: 'AUTHZ_CONSENT_EVALUATION_ERROR'
      };
    }
  }

  private isExemptOperation(request: ConsentEvaluationRequest): boolean {
    // Subject viewing their own core account settings
    if (request.subjectId === request.actorId && request.resourceType === 'account') {
      return true;
    }
    // Emergency crisis resources are public and safety-critical
    if (request.resourceType === 'crisis_resources' || request.purpose === 'EMERGENCY_OVERRIDE') {
      return true;
    }
    return false;
  }

  private resolveConsentCode(request: ConsentEvaluationRequest): string | null {
    // 1. AI processing & Companion
    if (request.purpose === 'AI_SUPPORT' || request.resourceType === 'chat_session') {
      return ConsentCode.AI_PROCESSING;
    }
    if (request.purpose === 'AI_PERSONALIZATION' || request.resourceType === 'ai_memory') {
      return ConsentCode.AI_PERSONALIZATION;
    }

    // 2. Community
    if (
      request.purpose === 'COMMUNITY_PARTICIPATION' ||
      request.resourceType === 'community_post' ||
      request.resourceType === 'community_comment'
    ) {
      return ConsentCode.COMMUNITY_PARTICIPATION;
    }

    // 3. Clinical Data Sharing & Care Delivery (when actor != subject)
    if (request.actorId !== request.subjectId) {
      if (
        request.purpose === 'CARE_DELIVERY' ||
        request.purpose === 'CARE_SHARING' ||
        request.resourceType === 'assessment_summary' ||
        request.resourceType === 'care_summary' ||
        request.resourceType === 'clinical_notes' ||
        request.resourceType === 'clinical_records' ||
        request.resourceType === 'clinical_record' ||
        request.resourceType === 'journal'
      ) {
        return ConsentCode.PROFESSIONAL_DATA_SHARING;
      }
    }

    // 4. Research
    if (request.purpose === 'RESEARCH' || request.resourceType === 'research_study') {
      return ConsentCode.RESEARCH;
    }

    // 5. Analytics
    if (request.purpose === 'PRODUCT_IMPROVEMENT' || request.resourceType === 'telemetry') {
      return ConsentCode.PRODUCT_ANALYTICS;
    }

    // 6. Marketing
    if (request.purpose === 'MARKETING' || request.resourceType === 'marketing_message') {
      return ConsentCode.MARKETING;
    }

    return null;
  }

  public getRepository(): ConsentRepository {
    return this.repository;
  }
}
