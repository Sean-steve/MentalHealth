/**
 * MindOS Canonical Privacy Governance Fingerprinting & Configuration Drift Engine
 * Authority: Master Architecture Index Section 7, Volume I, III, VIII & Appendix B / Q
 */

import { createHash } from 'node:crypto';
import { ProcessingActivity } from '../types.js';

export class PrivacyFingerprintEngine {
  /**
   * Computes a deterministic SHA256 fingerprint of a Processing Activity's governed attributes.
   * Any change in data categories, purposes, processors, recipients, jurisdictions,
   * AI involvement, or retention changes the fingerprint.
   */
  public static computeFingerprint(activity: Partial<ProcessingActivity>): string {
    const canonicalPayload = {
      code: activity.code || '',
      data_subject_categories: [...(activity.data_subject_categories || [])].sort(),
      data_categories: [...(activity.data_categories || [])].sort(),
      special_categories: [...(activity.special_categories || [])].sort(),
      purposes: [...(activity.purposes || [])].sort(),
      lawful_basis: [...(activity.lawful_basis || [])].sort(),
      sources: [...(activity.sources || [])].sort(),
      recipients: [...(activity.recipients || [])].sort(),
      processors: [...(activity.processors || [])].sort(),
      storage_locations: [...(activity.storage_locations || [])].sort(),
      processing_locations: [...(activity.processing_locations || [])].sort(),
      transfer_locations: [...(activity.transfer_locations || [])].sort(),
      retention_policy_refs: [...(activity.retention_policy_refs || [])].sort(),
      automated_processing: Boolean(activity.automated_processing),
      profiling: Boolean(activity.profiling),
      ai_involvement: Boolean(activity.ai_involvement),
      clinical_relevance: Boolean(activity.clinical_relevance),
      security_classification: activity.security_classification || 'CONFIDENTIAL',
      jurisdictions: [...(activity.jurisdictions || [])].sort()
    };

    const serialized = JSON.stringify(canonicalPayload);
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Verifies if an active runtime execution matches the approved fingerprint
   */
  public static verifyFingerprintMatch(
    current: Partial<ProcessingActivity>,
    approvedFingerprint: string
  ): { matches: boolean; currentFingerprint: string } {
    const currentFingerprint = this.computeFingerprint(current);
    return {
      matches: currentFingerprint === approvedFingerprint,
      currentFingerprint
    };
  }
}
