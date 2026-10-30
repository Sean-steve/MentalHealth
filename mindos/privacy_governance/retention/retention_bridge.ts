/**
 * MindOS Privacy Retention & Erasure Conflict Resolution Bridge
 * Authority: Master Architecture Index Section 8, Volume VIII & Appendix B / Q
 *            Kenya Data Protection Act 2019 Section 40 & Kenya Health Act 2017 Section 11
 */

import { DataCategory, ProcessingPurpose } from '../types.js';
import { DATA_CATEGORY_REGISTRY } from '../domain/taxonomy.js';
import { RetentionRegistry } from '../../platform/database/retention/registry.js';
import { DeletionStrategy } from '../../platform/database/types.js';

export interface RetentionLink {
  category: DataCategory;
  purpose: ProcessingPurpose;
  retention_policy_code: string;
  retention_period_days: number;
  action: DeletionStrategy;
  legal_basis: string;
}

export interface ErasureConflictResolution {
  deleted_categories: DataCategory[];
  retained_categories: Array<{
    category: DataCategory;
    retention_policy_code: string;
    statutory_hold_reason: string;
  }>;
}

export class PrivacyRetentionBridge {
  /**
   * Resolves retention policies for data categories in a processing activity
   */
  public static resolveRetentionPolicies(
    categories: DataCategory[],
    purpose: ProcessingPurpose
  ): RetentionLink[] {
    return categories.map((cat) => {
      const def = DATA_CATEGORY_REGISTRY[cat];
      if (def?.statutory_retention_required) {
        return {
          category: cat,
          purpose,
          retention_policy_code: cat === DataCategory.CLINICAL_RECORDS || cat === DataCategory.ASSESSMENT
            ? 'ret-pol-clinical-001'
            : cat === DataCategory.BILLING
              ? 'ret-pol-finance-001'
              : 'ret-pol-audit-001',
          retention_period_days: def.default_retention_days,
          action: DeletionStrategy.RETAIN_REQUIRED,
          legal_basis: cat === DataCategory.CLINICAL_RECORDS || cat === DataCategory.ASSESSMENT
            ? 'Kenya Health Act 2017 Sec 11'
            : 'Kenya Tax Procedures Act 2015'
        };
      }

      return {
        category: cat,
        purpose,
        retention_policy_code: `ret-pol-${cat.toLowerCase()}-default`,
        retention_period_days: def?.default_retention_days || 730,
        action: DeletionStrategy.HARD_DELETE,
        legal_basis: 'Kenya Data Protection Act 2019 Sec 39 & 40'
      };
    });
  }

  /**
   * Resolves conflicts when a user exercises their Right to Erasure (KDPA Section 40).
   * Invariant: Statutory legal retention (e.g. Kenya Health Act 2017) overrides erasure requests.
   */
  public static resolveErasureRequest(
    requestedCategories: DataCategory[]
  ): ErasureConflictResolution {
    const deleted: DataCategory[] = [];
    const retained: ErasureConflictResolution['retained_categories'] = [];

    for (const cat of requestedCategories) {
      const def = DATA_CATEGORY_REGISTRY[cat];
      if (def?.statutory_retention_required) {
        retained.push({
          category: cat,
          retention_policy_code: cat === DataCategory.CLINICAL_RECORDS || cat === DataCategory.ASSESSMENT
            ? 'ret-pol-clinical-001'
            : 'ret-pol-finance-001',
          statutory_hold_reason: `KDPA Section 40(3) statutory exception: retention required by ${
            cat === DataCategory.CLINICAL_RECORDS || cat === DataCategory.ASSESSMENT
              ? 'Kenya Health Act 2017 Section 11 (10 years minimum medical record retention)'
              : 'Kenya Tax Procedures Act 2015'
          }`
        });
      } else {
        deleted.push(cat);
      }
    }

    return {
      deleted_categories: deleted,
      retained_categories: retained
    };
  }
}
