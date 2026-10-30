/**
 * MindOS Consent Integration Port (Sprint 5 Boundary)
 * Authority: Master Architecture Index Section 14, Volume VIII & Volume IV
 * ADR-006 & ADR-016
 * 
 * Defines the contract through which the Authorization Kernel checks consent.
 * The full Consent Engine will be canonicalized in Sprint 6.
 */

import { ConsentDecisionService } from '../../../consent/service/consent_decision_service.js';
import { ConsentService } from '../../../consent/index.js';

export interface ConsentDecision {
  hasConsent: boolean;
  reason: string;
  consentReceiptId?: string;
  expiresAt?: string;
}

export interface ConsentDecisionPort {
  evaluate(params: {
    dataSubjectId: string;
    actorId: string;
    resourceType: string;
    resourceId?: string;
    purpose: string;
    scope?: string;
    context?: Record<string, unknown>;
  }): Promise<ConsentDecision>;
}

export class DefaultConsentDecisionPort implements ConsentDecisionPort {
  private customService?: ConsentDecisionService;

  constructor(service?: ConsentDecisionService) {
    this.customService = service;
  }

  private getService(): ConsentDecisionService {
    if (this.customService) return this.customService;
    return ConsentService.getDecisionService();
  }

  public async evaluate(params: {
    dataSubjectId: string;
    actorId: string;
    resourceType: string;
    resourceId?: string;
    purpose: string;
    scope?: string;
    context?: Record<string, unknown>;
  }): Promise<ConsentDecision> {
    const ctx = params.context || {};

    // 1. Check if context contains explicit active consent grant (provided via token, verified session or parent grant)
    if (ctx.consentGrantActive === true || ctx.hasActiveConsent === true) {
      return {
        hasConsent: true,
        reason: 'Active consent grant confirmed in verified authorization context.',
        consentReceiptId: (ctx.consentReceiptId as string) || 'consent-grant-verified'
      };
    }

    // 2. Query Canonical ConsentDecisionService
    const result = this.getService().evaluate({
      subjectId: params.dataSubjectId,
      actorId: params.actorId,
      resourceType: params.resourceType,
      action: (ctx.action as string) || 'read',
      purpose: params.purpose,
      scope: params.scope || params.resourceId,
      recipientId: params.actorId !== params.dataSubjectId ? params.actorId : undefined,
      context: ctx
    });

    if (result.allowed) {
      return {
        hasConsent: true,
        reason: result.reason,
        consentReceiptId: result.grantId,
        expiresAt: result.expiresAt
      };
    }

    return {
      hasConsent: false,
      reason: result.reason
    };
  }
}
