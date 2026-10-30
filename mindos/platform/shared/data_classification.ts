/**
 * MindOS Canonical Data Classification
 * Authority: Volume VIII & Appendix B / Q & ADR-004
 */

export enum DataClassification {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
  CONFIDENTIAL = 'CONFIDENTIAL',
  RESTRICTED = 'RESTRICTED',
  PERSONAL = 'PERSONAL',
  SENSITIVE = 'SENSITIVE',
  FINANCIAL = 'FINANCIAL',
  HEALTH_SENSITIVE = 'HEALTH_SENSITIVE',
  CLINICAL_RECORD = 'CLINICAL_RECORD',
  HEALTH_CRITICAL = 'HEALTH_CRITICAL',
  CRITICAL = 'CRITICAL'
}

export interface ClassifiableEntity {
  classification: DataClassification;
  purpose: string;
  retentionPolicy: string;
}

export const CLASSIFICATION_SENSITIVITY_RANK: Record<DataClassification, number> = {
  [DataClassification.PUBLIC]: 0,
  [DataClassification.INTERNAL]: 1,
  [DataClassification.CONFIDENTIAL]: 2,
  [DataClassification.RESTRICTED]: 3,
  [DataClassification.PERSONAL]: 4,
  [DataClassification.SENSITIVE]: 5,
  [DataClassification.FINANCIAL]: 5,
  [DataClassification.HEALTH_SENSITIVE]: 6,
  [DataClassification.CLINICAL_RECORD]: 7,
  [DataClassification.HEALTH_CRITICAL]: 8,
  [DataClassification.CRITICAL]: 9
};

/**
 * Returns true if the classification level is considered health or clinical data
 */
export function isHealthOrClinicalData(classification: DataClassification): boolean {
  return (
    classification === DataClassification.HEALTH_SENSITIVE ||
    classification === DataClassification.CLINICAL_RECORD ||
    classification === DataClassification.HEALTH_CRITICAL
  );
}

/**
 * Returns true if the classification strictly prohibits transmission in standard analytics payloads
 */
export function isProhibitedFromOrdinaryAnalytics(classification: DataClassification): boolean {
  return (
    classification === DataClassification.HEALTH_SENSITIVE ||
    classification === DataClassification.CLINICAL_RECORD ||
    classification === DataClassification.HEALTH_CRITICAL ||
    classification === DataClassification.CRITICAL
  );
}
