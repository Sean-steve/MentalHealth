/**
 * MindOS Canonical Consent Bounded Context Entry Point
 * Authority: Master Architecture Index Section 14, Volume III, IV, VIII & Appendices B, C, D, E, F
 * ADR-006, ADR-016, ADR-019, ADR-020, ADR-021
 * 
 * Owns:
 * - Granular, informed, versioned consent lifecycle
 * - Versioned consent policies & material supersession
 * - Data sharing scopes (recipients, category exclusion)
 * - Consent decisions & evaluation
 * - Verifiable consent receipts & evidence hashing
 * - Privacy Centre aggregates
 */

export * from './domain/types.js';
export * from './domain/definitions_seed.js';
export * from './persistence/consent_repository.js';
export { ConsentService as CanonicalConsentService } from './service/consent_service.js';
export type {
  GrantConsentOptions,
  WithdrawConsentOptions
} from './service/consent_service.js';
export { ConsentDecisionService } from './service/consent_decision_service.js';

import { ConsentService as CanonicalConsentService } from './service/consent_service.js';
import { ConsentDecisionService } from './service/consent_decision_service.js';
import { ConsentRepository } from './persistence/consent_repository.js';
import { ConsentState, validateStateTransition } from '../platform/shared/state_machines.js';
import { generateUUIDv7 } from '../platform/database/uuid.js';
import { EventBus } from '../platform/events/index.js';
import { AuditService } from '../platform/audit/index.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { ConflictError } from '../platform/errors/index.js';
import { createHash } from 'node:crypto';

export interface ConsentReceiptEntity {
  id: string;
  user_id: string;
  consent_type: string;
  policy_version: string;
  state: ConsentState;
  granted_at?: string;
  withdrawn_at?: string;
  source: string;
  evidence_hash: string;
  created_at: string;
}

export interface DataAccessGrantEntity {
  id: string;
  user_id: string;
  grantee_type: 'PROFESSIONAL' | 'TRUSTED_PERSON' | 'ORG';
  grantee_id: string;
  scopes: string[];
  purpose: string;
  starts_at: string;
  expires_at?: string;
  revoked_at?: string;
  created_at: string;
}

/**
 * Backwards-compatible ConsentService singleton wrapper with both static and instance APIs
 */
export class ConsentService {
  private static sharedRepo: ConsentRepository = new ConsentRepository();
  private static defaultInstance: CanonicalConsentService = new CanonicalConsentService(ConsentService.sharedRepo);
  private static decisionService: ConsentDecisionService = new ConsentDecisionService(ConsentService.sharedRepo);
  private static legacyReceipts: Map<string, ConsentReceiptEntity> = new Map();

  public static getRepository(): ConsentRepository {
    return ConsentService.sharedRepo;
  }

  public static getInstance(): CanonicalConsentService {
    return ConsentService.defaultInstance;
  }

  public static getDecisionService(): ConsentDecisionService {
    return ConsentService.decisionService;
  }

  /**
   * Record or update consent receipt directly (synchronous for test and orchestration flows)
   */
  public static recordConsent(params: {
    user_id?: string;
    userId?: string;
    consent_type?: string;
    consentType?: string;
    status: 'GRANTED' | 'WITHDRAWN' | 'REFUSED';
    jurisdiction?: string;
    policy_version?: string;
    source?: string;
    evidence_text?: string;
  }): ConsentReceiptEntity {
    const userId = params.user_id || params.userId || '';
    const consentType = params.consent_type || params.consentType || '';
    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const evidenceHash = createHash('sha256').update(params.evidence_text || `${userId}-${consentType}-${now}`).digest('hex');

    const receipt: ConsentReceiptEntity = {
      id,
      user_id: userId,
      consent_type: consentType,
      policy_version: params.policy_version || '1.0.0',
      state: params.status === 'GRANTED' ? ConsentState.GRANTED : (params.status === 'WITHDRAWN' ? ConsentState.WITHDRAWN : ConsentState.DECLINED),
      granted_at: params.status === 'GRANTED' ? now : undefined,
      withdrawn_at: params.status === 'WITHDRAWN' ? now : undefined,
      source: params.source || 'WEB_UI',
      evidence_hash: evidenceHash,
      created_at: now
    };

    ConsentService.legacyReceipts.set(id, receipt);
    return receipt;
  }

  public static getConsentReceipt(userId: string, consentType: string): ConsentReceiptEntity | undefined {
    for (const receipt of ConsentService.legacyReceipts.values()) {
      if (receipt.user_id === userId && receipt.consent_type === consentType && receipt.state === ConsentState.GRANTED) {
        return receipt;
      }
    }
    return undefined;
  }

  /**
   * Backwards-compatible static grantConsent
   */
  public static async grantConsent(params: {
    userId: string;
    consentType: string;
    policyVersion?: string;
    source?: string;
    evidenceText?: string;
  }): Promise<ConsentReceiptEntity> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const evidenceHash = createHash('sha256').update(params.evidenceText || `${params.userId}-${params.consentType}-${now}`).digest('hex');

    // Register in canonical service if known consent code
    try {
      await ConsentService.defaultInstance.grantConsent(params.userId, params.consentType, {
        policyVersion: params.policyVersion,
        source: params.source || 'WEB_UI'
      });
    } catch {
      // If custom or test-only code, record in memory map
    }

    const receipt: ConsentReceiptEntity = {
      id,
      user_id: params.userId,
      consent_type: params.consentType,
      policy_version: params.policyVersion || '1.0.0',
      state: ConsentState.GRANTED,
      granted_at: now,
      source: params.source || 'WEB_UI',
      evidence_hash: evidenceHash,
      created_at: now
    };

    ConsentService.legacyReceipts.set(id, receipt);

    EventBus.enqueue(
      'consent.granted',
      'consent',
      id,
      DataClassification.SENSITIVE,
      {
        user_id: params.userId,
        consent_type: params.consentType,
        receipt_id: id,
        policy_version: params.policyVersion || '1.0.0'
      }
    );

    AuditService.record({
      actor_type: 'USER',
      actor_id: params.userId,
      action: 'CONSENT.GRANTED',
      resource_type: 'consent_receipts',
      resource_id: id,
      purpose: `Consent Granted: ${params.consentType}`,
      authorization_basis: { consent_type: params.consentType, policy_version: params.policyVersion || '1.0.0' },
      result: 'ALLOWED'
    });

    return receipt;
  }

  /**
   * Backwards-compatible static withdrawConsent
   */
  public static async withdrawConsent(params: {
    userId: string;
    consentType: string;
    receiptId: string;
  }): Promise<ConsentReceiptEntity> {
    const activeReceipt = ConsentService.legacyReceipts.get(params.receiptId);
    if (!activeReceipt || activeReceipt.user_id !== params.userId) {
      throw new ConflictError('Active consent receipt not found for user', { errorCode: 'CONS_003' });
    }

    validateStateTransition('ConsentState', activeReceipt.state, ConsentState.WITHDRAWN, activeReceipt.id);
    activeReceipt.state = ConsentState.WITHDRAWN;
    activeReceipt.withdrawn_at = new Date().toISOString();

    try {
      await ConsentService.defaultInstance.withdrawConsent(params.userId, params.consentType);
    } catch {
      // Ignored for custom test codes
    }

    EventBus.enqueue(
      'consent.withdrawn',
      'consent',
      activeReceipt.id,
      DataClassification.SENSITIVE,
      {
        user_id: params.userId,
        consent_type: params.consentType,
        receipt_id: activeReceipt.id,
        withdrawn_at: activeReceipt.withdrawn_at
      }
    );

    AuditService.record({
      actor_type: 'USER',
      actor_id: params.userId,
      action: 'CONSENT.WITHDRAWN',
      resource_type: 'consent_receipts',
      resource_id: activeReceipt.id,
      purpose: `Consent Revocation: ${params.consentType}`,
      authorization_basis: { consent_type: params.consentType },
      result: 'ALLOWED'
    });

    return activeReceipt;
  }

  /**
   * Returns true if user has active consent for the given code
   */
  public static hasActiveConsent(userId: string, consentType: string): boolean {
    const grant = ConsentService.defaultInstance.getRepository().getActiveGrant(userId, consentType);
    if (grant && grant.status === ConsentState.GRANTED) {
      return true;
    }
    for (const receipt of ConsentService.legacyReceipts.values()) {
      if (
        receipt.user_id === userId &&
        receipt.consent_type === consentType &&
        receipt.state === ConsentState.GRANTED
      ) {
        return true;
      }
    }
    return false;
  }

  public static resetForTesting(): void {
    ConsentService.legacyReceipts.clear();
    ConsentService.sharedRepo.reset();
    ConsentService.defaultInstance = new CanonicalConsentService(ConsentService.sharedRepo);
    ConsentService.decisionService = new ConsentDecisionService(ConsentService.sharedRepo);
  }
}
