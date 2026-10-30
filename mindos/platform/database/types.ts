/**
 * MindOS Canonical Persistence Kernel Types & Standards
 * Authority: Master Architecture Index Section 8, Volume III, Appendices B, C & ADR-004/005/011/012/013
 */

import { DataClassification } from '../shared/data_classification.js';

// ==============================================================================
// 1. IDENTIFIERS & TIMESTAMPS
// ==============================================================================

export type UUID = string;

/**
 * All authoritative timestamps in MindOS must be ISO-8601 UTC strings
 */
export type UtcIsoTimestamp = string;

/**
 * Standard audit metadata fields for entities requiring provenance and accountability
 */
export interface AuditMetadata {
  created_by?: UUID;
  updated_by?: UUID;
  source: string;
  correlation_id: string;
  version: number;
}

// ==============================================================================
// 2. SOFT DELETE & DATA LIFECYCLE STRATEGIES
// ==============================================================================

/**
 * Explicit deletion strategy categories (Section 9)
 * 'deleted_at' is not a substitute for privacy deletion.
 */
export enum DeletionStrategy {
  HARD_DELETE = 'HARD_DELETE',
  SOFT_DELETE = 'SOFT_DELETE',
  ANONYMIZE = 'ANONYMIZE',
  RETAIN_REQUIRED = 'RETAIN_REQUIRED',
  ARCHIVE = 'ARCHIVE'
}

/**
 * Data Lifecycle States (Section 34)
 */
export enum DataLifecycleState {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  DELETION_PENDING = 'DELETION_PENDING',
  ANONYMIZED = 'ANONYMIZED',
  DELETED = 'DELETED',
  LEGAL_HOLD = 'LEGAL_HOLD'
}

// ==============================================================================
// 3. PROVENANCE & TRUTH LAYERS (ADR-005 & ADR-013)
// ==============================================================================

/**
 * Canonical Provenance Sources (Section 35)
 */
export enum ProvenanceSource {
  USER_REPORTED = 'USER_REPORTED',
  SYSTEM_OBSERVED = 'SYSTEM_OBSERVED',
  AI_INFERRED = 'AI_INFERRED',
  PROFESSIONAL_RECORDED = 'PROFESSIONAL_RECORDED',
  CLINICALLY_ASSESSED = 'CLINICALLY_ASSESSED',
  IMPORTED = 'IMPORTED'
}

/**
 * Truth Categories (Section 36)
 * Distinguishes subjective feelings, ML heuristics, and clinical diagnoses
 */
export enum TruthCategory {
  FACT = 'FACT',
  INTERPRETATION = 'INTERPRETATION',
  RECOMMENDATION = 'RECOMMENDATION',
  CLINICAL_FINDING = 'CLINICAL_FINDING',
  DIAGNOSIS = 'DIAGNOSIS'
}

// ==============================================================================
// 4. FINANCIAL AMOUNTS (Section 27)
// ==============================================================================

/**
 * Exact integer minor units for monetary values (never floating-point arithmetic)
 */
export interface Money {
  amountMinor: bigint;
  currency: string; // ISO 4217 (e.g. 'KES', 'USD', 'EUR')
  formatted?: string;
}

export class MoneyUtils {
  public static format(money: Money, decimals = 2): string {
    const factor = BigInt(Math.pow(10, decimals));
    const major = money.amountMinor / factor;
    const minorRemainder = (money.amountMinor % factor).toString().padStart(decimals, '0');
    const formattedNumber = Number(major).toLocaleString('en-US');
    return `${money.currency} ${formattedNumber}.${minorRemainder}`;
  }

  public static fromMinor(amountMinor: bigint | number | string, currency = 'KES'): Money {
    const money: Money = {
      amountMinor: BigInt(amountMinor),
      currency: currency.toUpperCase()
    };
    money.formatted = MoneyUtils.format(money);
    return money;
  }

  public static fromMajor(amountMajor: number, currency = 'KES', decimals = 2): Money {
    const factor = Math.pow(10, decimals);
    const minor = Math.round(amountMajor * factor);
    const money: Money = {
      amountMinor: BigInt(minor),
      currency: currency.toUpperCase()
    };
    money.formatted = MoneyUtils.format(money, decimals);
    return money;
  }

  public static toMajorString(money: Money, decimals = 2): string {
    const factor = BigInt(Math.pow(10, decimals));
    const major = money.amountMinor / factor;
    const minorRemainder = (money.amountMinor % factor).toString().padStart(decimals, '0');
    return `${major}.${minorRemainder} ${money.currency}`;
  }

  public static add(a: Money, b: Money): Money {
    if (a.currency !== b.currency) {
      throw new Error(`CURRENCY_MISMATCH: Cannot add ${a.currency} and ${b.currency}`);
    }
    return {
      amountMinor: a.amountMinor + b.amountMinor,
      currency: a.currency
    };
  }
}

// ==============================================================================
// 5. CONCURRENCY & VERSIONING (Section 10 & 12)
// ==============================================================================

export interface OptimisticLockable {
  version: number;
}

// ==============================================================================
// 6. FIELD NULLABILITY (Section 24)
// ==============================================================================

export enum FieldNullability {
  REQUIRED = 'REQUIRED',
  OPTIONAL = 'OPTIONAL',
  CONDITIONALLY_REQUIRED = 'CONDITIONALLY_REQUIRED'
}

// ==============================================================================
// 7. CANONICAL PAGINATION (Section 47)
// ==============================================================================

export interface CursorPaginationQuery {
  limit?: number;
  cursor?: string;
  direction?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  totalEstimate?: number;
}
