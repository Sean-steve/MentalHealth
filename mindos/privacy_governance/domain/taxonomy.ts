/**
 * MindOS Canonical Privacy Governance Taxonomy & Classification Engine
 * Authority: Master Architecture Index Section 7, Volumes I, III, VIII & Appendix B / Q
 *            Kenya Data Protection Act 2019, Sections 31, 41, 44, 48, 49
 */

import {
  DataCategory,
  DataSubjectCategory,
  ProcessingPurpose,
  LawfulBasis
} from '../types.js';

export interface DataCategoryDefinition {
  category: DataCategory;
  name: string;
  description: string;
  is_sensitive: boolean;
  is_health_related: boolean;
  is_exportable_for_dsar: boolean; // Data Subject Access Request
  default_retention_days: number;
  statutory_retention_required: boolean;
}

export const DATA_CATEGORY_REGISTRY: Record<DataCategory, DataCategoryDefinition> = {
  [DataCategory.IDENTITY]: {
    category: DataCategory.IDENTITY,
    name: 'Identity Data',
    description: 'Name, date of birth, national ID, gender, avatar',
    is_sensitive: false,
    is_health_related: false,
    is_exportable_for_dsar: true,
    default_retention_days: 730,
    statutory_retention_required: false
  },
  [DataCategory.CONTACT]: {
    category: DataCategory.CONTACT,
    name: 'Contact Information',
    description: 'Email, telephone, physical address, emergency contact numbers',
    is_sensitive: false,
    is_health_related: false,
    is_exportable_for_dsar: true,
    default_retention_days: 730,
    statutory_retention_required: false
  },
  [DataCategory.ACCOUNT_SECURITY]: {
    category: DataCategory.ACCOUNT_SECURITY,
    name: 'Account & Security Metadata',
    description: 'Password hashes, salts, MFA secrets, security logs',
    is_sensitive: true,
    is_health_related: false,
    is_exportable_for_dsar: false, // Strictly excluded from DSAR exports to prevent compromise
    default_retention_days: 365,
    statutory_retention_required: false
  },
  [DataCategory.CONSENT]: {
    category: DataCategory.CONSENT,
    name: 'Consent & Rights Ledger',
    description: 'Consent grants, withdrawals, policy versions, cryptographic receipts',
    is_sensitive: false,
    is_health_related: false,
    is_exportable_for_dsar: true,
    default_retention_days: 2555, // 7 years for compliance evidence
    statutory_retention_required: true
  },
  [DataCategory.ASSESSMENT]: {
    category: DataCategory.ASSESSMENT,
    name: 'Clinical & Behavioral Assessments',
    description: 'Validated psychometric instruments (PHQ-9, GAD-7), triage scores, safety assessments',
    is_sensitive: true,
    is_health_related: true,
    is_exportable_for_dsar: true,
    default_retention_days: 3650, // 10 years medical records under Kenya Health Act 2017
    statutory_retention_required: true
  },
  [DataCategory.JOURNAL]: {
    category: DataCategory.JOURNAL,
    name: 'User Private Journals',
    description: 'Free-form self-reflection, private thoughts, mood tracking entries',
    is_sensitive: true,
    is_health_related: true,
    is_exportable_for_dsar: true,
    default_retention_days: 730,
    statutory_retention_required: false
  },
  [DataCategory.AI_CONVERSATION]: {
    category: DataCategory.AI_CONVERSATION,
    name: 'AI Conversational Turns',
    description: 'Prompts, model responses, active working context during supportive dialogue',
    is_sensitive: true,
    is_health_related: true,
    is_exportable_for_dsar: true,
    default_retention_days: 90,
    statutory_retention_required: false
  },
  [DataCategory.AI_DERIVED_METADATA]: {
    category: DataCategory.AI_DERIVED_METADATA,
    name: 'AI Derived Metadata & Inferences',
    description: 'Sentiment indicators, extracted safety keywords, behavioral trends',
    is_sensitive: true,
    is_health_related: true,
    is_exportable_for_dsar: true,
    default_retention_days: 90,
    statutory_retention_required: false
  },
  [DataCategory.CLINICAL_RECORDS]: {
    category: DataCategory.CLINICAL_RECORDS,
    name: 'Formal Clinical Records',
    description: 'Consultation notes, diagnoses, treatment plans, clinical referrals, prescriptions',
    is_sensitive: true,
    is_health_related: true,
    is_exportable_for_dsar: true,
    default_retention_days: 3650, // 10 years Kenya Health Act 2017 Sec 11
    statutory_retention_required: true
  },
  [DataCategory.PROFESSIONAL]: {
    category: DataCategory.PROFESSIONAL,
    name: 'Licensed Professional Credentials',
    description: 'Medical license numbers, board certifications, specialization, clinic affiliation',
    is_sensitive: false,
    is_health_related: false,
    is_exportable_for_dsar: true,
    default_retention_days: 3650,
    statutory_retention_required: true
  },
  [DataCategory.CARE_RELATIONSHIP]: {
    category: DataCategory.CARE_RELATIONSHIP,
    name: 'Care Relationships & Allocations',
    description: 'Patient-provider assignments, care team memberships, supervisory links',
    is_sensitive: true,
    is_health_related: true,
    is_exportable_for_dsar: true,
    default_retention_days: 3650,
    statutory_retention_required: true
  },
  [DataCategory.COMMUNITY]: {
    category: DataCategory.COMMUNITY,
    name: 'Peer Community Content',
    description: 'Public posts, moderated comments, peer support messages',
    is_sensitive: false,
    is_health_related: false,
    is_exportable_for_dsar: true,
    default_retention_days: 730,
    statutory_retention_required: false
  },
  [DataCategory.BILLING]: {
    category: DataCategory.BILLING,
    name: 'Financial & Billing Data',
    description: 'Payment receipts, subscription invoices, M-Pesa transaction IDs',
    is_sensitive: true,
    is_health_related: false,
    is_exportable_for_dsar: true,
    default_retention_days: 2555, // 7 years Tax Procedures Act
    statutory_retention_required: true
  },
  [DataCategory.DEVICE_SECURITY_METADATA]: {
    category: DataCategory.DEVICE_SECURITY_METADATA,
    name: 'Device & Telemetry Metadata',
    description: 'IP address, user agent, session token IDs, authentication telemetry',
    is_sensitive: false,
    is_health_related: false,
    is_exportable_for_dsar: false, // Excluded to protect security infrastructure
    default_retention_days: 180,
    statutory_retention_required: false
  },
  [DataCategory.ANALYTICS]: {
    category: DataCategory.ANALYTICS,
    name: 'Aggregated & De-identified Analytics',
    description: 'Feature usage counts, latency metrics, non-identifying telemetry',
    is_sensitive: false,
    is_health_related: false,
    is_exportable_for_dsar: false,
    default_retention_days: 365,
    statutory_retention_required: false
  }
};

/**
 * Checks if a category is sensitive or health-related under KDPA Section 44
 */
export function isSpecialCategory(category: DataCategory | string): boolean {
  const catEnum = category as DataCategory;
  return Boolean(DATA_CATEGORY_REGISTRY[catEnum]?.is_sensitive || DATA_CATEGORY_REGISTRY[catEnum]?.is_health_related);
}

/**
 * Purpose limitation validator. Processing authorized for Purpose A must not be reused for Purpose B.
 */
export function validatePurposeLimitation(
  authorizedPurposes: ProcessingPurpose[],
  requestedPurpose: ProcessingPurpose
): boolean {
  return authorizedPurposes.includes(requestedPurpose);
}

/**
 * Evaluates whether a lawful basis is acceptable for a data category under Kenyan law.
 * In KDPA Section 44, processing of sensitive personal data (health data) requires EXPLICIT_CONSENT
 * or direct healthcare provision by licensed healthcare professional / vital interests.
 */
export function validateLawfulBasisForCategory(
  category: DataCategory,
  basis: LawfulBasis
): { valid: boolean; reason?: string } {
  const def = DATA_CATEGORY_REGISTRY[category];
  if (!def) {
    return { valid: false, reason: `Unknown data category: ${category}` };
  }

  if (def.is_health_related || def.is_sensitive) {
    const sensitiveBases = [
      LawfulBasis.EXPLICIT_CONSENT,
      LawfulBasis.HEALTHCARE_DIRECT,
      LawfulBasis.VITAL_INTERESTS,
      LawfulBasis.LEGAL_OBLIGATION
    ];
    if (!sensitiveBases.includes(basis)) {
      return {
        valid: false,
        reason: `KDPA Section 44 requires EXPLICIT_CONSENT, HEALTHCARE_DIRECT, or VITAL_INTERESTS for sensitive/health category ${category}. Basis ${basis} is insufficient.`
      };
    }
  }

  return { valid: true };
}
