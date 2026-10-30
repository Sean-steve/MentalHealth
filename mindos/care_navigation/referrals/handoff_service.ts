/**
 * MindOS Safety-Aware Handoff Service (Minimum-Necessary Sharing)
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-SAFE-001, R-NAV-002, R-NAV-003, R-NAV-010)
 * Legal: Kenya Data Protection Act 2019 (Sections 29-35), Digital Health Act 2023
 */

import { createHash } from 'node:crypto';
import {
  ReferralHandoffPackageEntity,
  ReferralHandoffPackagePayload,
  HandoffPackageState,
  ReferralEntity,
  CareLevel,
  SupportNeedDomain,
  NeedAcuity,
  ReferralUrgency
} from '../domain/types.js';
import { HandoffPackageExpiredOrRevokedError } from '../domain/errors.js';
import { CareNavigationInvariants } from '../domain/invariants.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AuditService } from '../../platform/audit/index.js';
import { NotFoundError, AuthorizationError } from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';

export class HandoffService {
  private static packages: Map<string, ReferralHandoffPackageEntity> = new Map();
  private static referralToPackageMap: Map<string, string> = new Map();

  /**
   * Generates a tamper-evident minimum-necessary handoff package
   */
  public static createHandoffPackage(params: {
    referral?: ReferralEntity;
    referralId?: string;
    userId?: string;
    receivingProviderId?: string;
    primaryNeed?: SupportNeedDomain;
    acuity?: any;
    clinicalSummaryNotes?: string;
    screeningSummaries?: any[];
    payloadData?: Omit<ReferralHandoffPackagePayload, 'non_diagnostic_disclaimer'>;
    ttlDays?: number;
  }): ReferralHandoffPackageEntity {
    const id = generateUUIDv7();
    const now = new Date();
    const ttlDays = params.ttlDays || 14;
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

    const referralId = params.referral?.id || params.referralId || generateUUIDv7();
    const userId = params.referral?.user_id || params.userId || '';

    let payload: ReferralHandoffPackagePayload;
    if (params.payloadData) {
      payload = {
        ...params.payloadData,
        non_diagnostic_disclaimer: CareNavigationInvariants.STATUTORY_DISCLAIMER
      };
    } else {
      payload = {
        patient_pseudonym: `PT-${userId.substring(0, 8).toUpperCase()}`,
        care_level: (params.referral?.care_level || CareLevel.LEVEL_2) as CareLevel,
        primary_need: params.primaryNeed || SupportNeedDomain.GENERAL_WELLBEING,
        acuity: params.acuity || NeedAcuity.MODERATE,
        urgency: params.referral?.urgency || ReferralUrgency.ROUTINE,
        screening_summaries: (params.screeningSummaries || []).map((s: any) => ({
          instrument: s.instrument_code || s.instrument || 'CLINICAL_SCREEN',
          band: s.band || 'MODERATE',
          score: s.score || 0,
          disclaimer: CareNavigationInvariants.STATUTORY_DISCLAIMER
        })),
        non_diagnostic_disclaimer: CareNavigationInvariants.STATUTORY_DISCLAIMER,
        referral_reason: params.clinicalSummaryNotes || 'Stepped-care support referral'
      };
    }

    // Calculate SHA-256 evidence hash of the deterministic payload
    const serialized = JSON.stringify(payload, Object.keys(payload).sort());
    const evidenceHash = createHash('sha256').update(serialized).digest('hex');

    const minimumNecessaryFields = [
      'patient_pseudonym',
      'care_level',
      'primary_need',
      'acuity',
      'urgency',
      'screening_summaries',
      'non_diagnostic_disclaimer',
      'referral_reason'
    ];

    const entity: ReferralHandoffPackageEntity = {
      id,
      referral_id: referralId,
      user_id: userId,
      state: HandoffPackageState.ACTIVE,
      status: HandoffPackageState.ACTIVE,
      evidence_hash: evidenceHash,
      evidence_sha256: evidenceHash,
      data_classification: 'HEALTH_SENSITIVE',
      access_purpose: 'CARE_REFERRAL_COORDINATION',
      payload,
      minimum_necessary_fields: minimumNecessaryFields,
      access_count: 0,
      expires_at: expiresAt,
      created_at: now.toISOString()
    };

    HandoffService.packages.set(id, entity);
    HandoffService.referralToPackageMap.set(referralId, id);

    AuditService.record({
      actor_type: 'SYSTEM',
      action: 'REFERRAL.HANDOFF_PACKAGE.CREATED',
      resource_type: 'handoff_package',
      resource_id: id,
      purpose: 'Care Transition Documentation',
      authorization_basis: { referral_id: referralId, user_id: userId },
      result: 'ALLOWED'
    });

    return entity;
  }

  /**
   * Accesses a handoff package under authorized clinical context
   */
  public static accessHandoffPackage(params: {
    packageIdOrReferralId: string;
    requestingActorId: string;
  }): ReferralHandoffPackageEntity {
    const pkg = HandoffService.getPackage(params.packageIdOrReferralId);
    if (!pkg) {
      throw new NotFoundError(`Referral handoff package "${params.packageIdOrReferralId}" not found.`);
    }

    const now = Date.now();
    if (new Date(pkg.expires_at).getTime() <= now) {
      if (pkg.state !== HandoffPackageState.EXPIRED) {
        pkg.state = HandoffPackageState.EXPIRED;
      }
      throw new HandoffPackageExpiredOrRevokedError(pkg.id, 'EXPIRED');
    }

    if (pkg.state === HandoffPackageState.REVOKED) {
      throw new HandoffPackageExpiredOrRevokedError(pkg.id, 'REVOKED');
    }

    if (pkg.state === HandoffPackageState.ACTIVE) {
      validateStateTransition('HandoffPackageState', pkg.state, HandoffPackageState.ACCESSED, pkg.id, params.requestingActorId);
      pkg.state = HandoffPackageState.ACCESSED;
      pkg.status = HandoffPackageState.ACCESSED;
    }

    pkg.access_count += 1;
    pkg.last_accessed_at = new Date().toISOString();

    EventBus.enqueue(
      'referral.handoff_accessed',
      'referrals',
      pkg.referral_id,
      DataClassification.SENSITIVE,
      {
        package_id: pkg.id,
        referral_id: pkg.referral_id,
        actor_id: params.requestingActorId,
        access_count: pkg.access_count
      }
    );

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.requestingActorId,
      action: 'REFERRAL.HANDOFF_PACKAGE.ACCESSED',
      resource_type: 'handoff_package',
      resource_id: pkg.id,
      purpose: 'Clinical Referral Evaluation',
      authorization_basis: { referral_id: pkg.referral_id },
      result: 'ALLOWED'
    });

    return pkg;
  }

  /**
   * Allows the user or system to revoke a handoff package immediately
   */
  public static revokeHandoffPackage(params: {
    packageIdOrReferralId: string;
    actorId: string;
    reason?: string;
  }): ReferralHandoffPackageEntity {
    const pkg = HandoffService.getPackage(params.packageIdOrReferralId);
    if (!pkg) {
      throw new NotFoundError(`Referral handoff package "${params.packageIdOrReferralId}" not found.`);
    }

    if (pkg.state !== HandoffPackageState.REVOKED) {
      validateStateTransition('HandoffPackageState', pkg.state, HandoffPackageState.REVOKED, pkg.id, params.actorId);
      pkg.state = HandoffPackageState.REVOKED;
      pkg.status = HandoffPackageState.REVOKED;
      pkg.revoked_at = new Date().toISOString();

      EventBus.enqueue(
        'referral.handoff_revoked',
        'referrals',
        pkg.referral_id,
        DataClassification.SENSITIVE,
        {
          package_id: pkg.id,
          referral_id: pkg.referral_id,
          revoked_by: params.actorId,
          reason: params.reason || 'User consent withdrawn or referral cancelled'
        }
      );

      AuditService.record({
        actor_type: 'USER',
        actor_id: params.actorId,
        action: 'REFERRAL.HANDOFF_PACKAGE.REVOKED',
        resource_type: 'handoff_package',
        resource_id: pkg.id,
        purpose: 'Consent Withdrawal / Data Revocation',
        authorization_basis: { referral_id: pkg.referral_id },
        result: 'ALLOWED'
      });
    }

    return pkg;
  }

  public static getPackage(packageIdOrReferralId: string): ReferralHandoffPackageEntity | undefined {
    let pkg = HandoffService.packages.get(packageIdOrReferralId);
    if (!pkg) {
      const packageId = HandoffService.referralToPackageMap.get(packageIdOrReferralId);
      if (packageId) {
        pkg = HandoffService.packages.get(packageId);
      }
    }
    return pkg;
  }

  public static verifyPackageIntegrity(pkg: ReferralHandoffPackageEntity): boolean {
    const serialized = JSON.stringify(pkg.payload, Object.keys(pkg.payload).sort());
    const hash = createHash('sha256').update(serialized).digest('hex');
    return hash === pkg.evidence_hash;
  }

  public static verifyEvidenceIntegrity(packageIdOrReferralId: string | ReferralHandoffPackageEntity): boolean {
    let pkg: ReferralHandoffPackageEntity | undefined;
    if (typeof packageIdOrReferralId === 'object' && packageIdOrReferralId !== null) {
      pkg = packageIdOrReferralId;
    } else {
      pkg = HandoffService.getPackage(packageIdOrReferralId as string);
    }
    if (!pkg) return false;
    const serialized = JSON.stringify(pkg.payload, Object.keys(pkg.payload).sort());
    const hash = createHash('sha256').update(serialized).digest('hex');
    return hash === pkg.evidence_hash || hash === (pkg as any).evidence_sha256;
  }

  public static reset(): void {
    HandoffService.packages.clear();
    HandoffService.referralToPackageMap.clear();
  }

  public static resetForTesting(): void {
    HandoffService.packages.clear();
    HandoffService.referralToPackageMap.clear();
  }
}
