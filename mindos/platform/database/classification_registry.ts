/**
 * MindOS Canonical Data Classification Metadata Registry
 * Authority: ADR-004, Master Architecture Index Section 8, Volume VIII & Appendix B
 */

import { DataClassification, isHealthOrClinicalData } from '../shared/data_classification.js';
import { FieldNullability, DeletionStrategy } from './types.js';

export interface FieldClassificationMetadata {
  fieldName: string;
  classification: DataClassification;
  nullability: FieldNullability;
  encrypted: boolean;
  purpose: string;
  pii: boolean;
}

export interface EntityClassificationMetadata {
  entityName: string;
  tableName: string;
  domain: string;
  defaultClassification: DataClassification;
  deletionStrategy: DeletionStrategy;
  versioned: boolean;
  fields: Record<string, FieldClassificationMetadata>;
}

export class ClassificationRegistry {
  private static entities: Map<string, EntityClassificationMetadata> = new Map();

  static {
    // 1. Identity Domain: Users
    ClassificationRegistry.register({
      entityName: 'User',
      tableName: 'users',
      domain: 'identity',
      defaultClassification: DataClassification.PERSONAL,
      deletionStrategy: DeletionStrategy.ANONYMIZE,
      versioned: true,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Primary key identifier', pii: false },
        email_normalized: { fieldName: 'email_normalized', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Authentication and notifications', pii: true },
        account_state: { fieldName: 'account_state', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Account lifecycle status', pii: false },
        email_verification_status: { fieldName: 'email_verification_status', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Email verification status', pii: false },
        security_version: { fieldName: 'security_version', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Token invalidation epoch', pii: false },
        last_authenticated_at: { fieldName: 'last_authenticated_at', classification: DataClassification.INTERNAL, nullability: FieldNullability.OPTIONAL, encrypted: false, purpose: 'Last login timestamp', pii: false },
        version: { fieldName: 'version', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Optimistic concurrency', pii: false }
      }
    });

    // 1b. Identity Domain: Identity Credentials (Cryptographic hashes & salts)
    ClassificationRegistry.register({
      entityName: 'IdentityCredential',
      tableName: 'identity_credentials',
      domain: 'identity',
      defaultClassification: DataClassification.CRITICAL,
      deletionStrategy: DeletionStrategy.HARD_DELETE,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Credential identifier', pii: false },
        account_id: { fieldName: 'account_id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Account reference', pii: false },
        credential_type: { fieldName: 'credential_type', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Credential mechanism', pii: false },
        password_hash: { fieldName: 'password_hash', classification: DataClassification.CRITICAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'One-way PBKDF2 hash', pii: false },
        salt: { fieldName: 'salt', classification: DataClassification.CRITICAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Cryptographic salt', pii: false }
      }
    });

    // 1c. Identity Domain: Identity Sessions (Server-authoritative session state)
    ClassificationRegistry.register({
      entityName: 'IdentitySession',
      tableName: 'identity_sessions',
      domain: 'identity',
      defaultClassification: DataClassification.CONFIDENTIAL,
      deletionStrategy: DeletionStrategy.HARD_DELETE,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Session identifier', pii: false },
        account_id: { fieldName: 'account_id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Account reference', pii: false },
        token_family_id: { fieldName: 'token_family_id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Refresh token rotation group', pii: false },
        current_token_hash: { fieldName: 'current_token_hash', classification: DataClassification.CONFIDENTIAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Active refresh token hash', pii: false },
        session_status: { fieldName: 'session_status', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Session state', pii: false },
        ip_address: { fieldName: 'ip_address', classification: DataClassification.PERSONAL, nullability: FieldNullability.OPTIONAL, encrypted: false, purpose: 'Session origin', pii: true }
      }
    });

    // 1d. Identity Domain: Verification Challenges
    ClassificationRegistry.register({
      entityName: 'VerificationChallenge',
      tableName: 'verification_challenges',
      domain: 'identity',
      defaultClassification: DataClassification.CONFIDENTIAL,
      deletionStrategy: DeletionStrategy.HARD_DELETE,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Challenge identifier', pii: false },
        account_id: { fieldName: 'account_id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Account reference', pii: false },
        token_hash: { fieldName: 'token_hash', classification: DataClassification.CONFIDENTIAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Token SHA-256 hash', pii: false }
      }
    });

    // 1e. Identity Domain: Password Reset Challenges
    ClassificationRegistry.register({
      entityName: 'PasswordResetChallenge',
      tableName: 'password_reset_challenges',
      domain: 'identity',
      defaultClassification: DataClassification.CONFIDENTIAL,
      deletionStrategy: DeletionStrategy.HARD_DELETE,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Reset challenge identifier', pii: false },
        account_id: { fieldName: 'account_id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Account reference', pii: false },
        token_hash: { fieldName: 'token_hash', classification: DataClassification.CONFIDENTIAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Token SHA-256 hash', pii: false }
      }
    });

    // 1f. Identity Domain: Authentication Attempts
    ClassificationRegistry.register({
      entityName: 'AuthenticationAttempt',
      tableName: 'authentication_attempts',
      domain: 'identity',
      defaultClassification: DataClassification.INTERNAL,
      deletionStrategy: DeletionStrategy.ARCHIVE,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Attempt identifier', pii: false },
        identifier_hash: { fieldName: 'identifier_hash', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Masked login target', pii: false },
        result: { fieldName: 'result', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Outcome', pii: false }
      }
    });

    // 1g. Identity Domain: Security Events
    ClassificationRegistry.register({
      entityName: 'SecurityEvent',
      tableName: 'security_events',
      domain: 'identity',
      defaultClassification: DataClassification.INTERNAL,
      deletionStrategy: DeletionStrategy.RETAIN_REQUIRED,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Security event identifier', pii: false },
        account_id: { fieldName: 'account_id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Account reference', pii: false },
        event_type: { fieldName: 'event_type', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Event category', pii: false }
      }
    });

    // 2. Users Domain: User Profiles
    ClassificationRegistry.register({
      entityName: 'UserProfile',
      tableName: 'user_profiles',
      domain: 'users',
      defaultClassification: DataClassification.PERSONAL,
      deletionStrategy: DeletionStrategy.ANONYMIZE,
      versioned: false,
      fields: {
        user_id: { fieldName: 'user_id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Foreign key to user', pii: false },
        display_name: { fieldName: 'display_name', classification: DataClassification.PERSONAL, nullability: FieldNullability.OPTIONAL, encrypted: false, purpose: 'User greeting', pii: true },
        country_code: { fieldName: 'country_code', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Jurisdiction selection', pii: false },
        timezone: { fieldName: 'timezone', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Local appointment display', pii: false }
      }
    });

    // 3. Consent Domain: Consent Receipts
    ClassificationRegistry.register({
      entityName: 'ConsentReceipt',
      tableName: 'consent_receipts',
      domain: 'consent',
      defaultClassification: DataClassification.SENSITIVE,
      deletionStrategy: DeletionStrategy.RETAIN_REQUIRED,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Receipt identifier', pii: false },
        user_id: { fieldName: 'user_id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Data subject reference', pii: false },
        consent_type: { fieldName: 'consent_type', classification: DataClassification.SENSITIVE, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Processing scope category', pii: false },
        evidence_hash: { fieldName: 'evidence_hash', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Cryptographic proof', pii: false }
      }
    });

    // 4. Assessments Domain: Assessment Responses & Results
    ClassificationRegistry.register({
      entityName: 'AssessmentResponse',
      tableName: 'assessment_responses',
      domain: 'assessments',
      defaultClassification: DataClassification.HEALTH_SENSITIVE,
      deletionStrategy: DeletionStrategy.SOFT_DELETE,
      versioned: true,
      fields: {
        session_id: { fieldName: 'session_id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Session grouping', pii: false },
        item_key: { fieldName: 'item_key', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Assessment scale item', pii: false },
        answer_json: { fieldName: 'answer_json', classification: DataClassification.HEALTH_SENSITIVE, nullability: FieldNullability.REQUIRED, encrypted: true, purpose: 'User psychometric response', pii: false }
      }
    });

    // 5. Care Domain: Clinical Notes (Statutory retention & highest clinical confidentiality)
    ClassificationRegistry.register({
      entityName: 'ClinicalNote',
      tableName: 'clinical_notes',
      domain: 'care',
      defaultClassification: DataClassification.CLINICAL_RECORD,
      deletionStrategy: DeletionStrategy.RETAIN_REQUIRED, // Kenya Health Act requires 10 yr retention
      versioned: true,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Note identifier', pii: false },
        care_relationship_id: { fieldName: 'care_relationship_id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Care relationship linkage', pii: false },
        ciphertext: { fieldName: 'ciphertext', classification: DataClassification.CLINICAL_RECORD, nullability: FieldNullability.REQUIRED, encrypted: true, purpose: 'Full clinical narrative (encrypted)', pii: true },
        signed_at: { fieldName: 'signed_at', classification: DataClassification.INTERNAL, nullability: FieldNullability.OPTIONAL, encrypted: false, purpose: 'Clinician signature timestamp', pii: false }
      }
    });

    // 6. Care Domain: Journal Entries
    ClassificationRegistry.register({
      entityName: 'JournalEntry',
      tableName: 'journal_entries',
      domain: 'care',
      defaultClassification: DataClassification.HEALTH_SENSITIVE,
      deletionStrategy: DeletionStrategy.HARD_DELETE,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Journal identifier', pii: false },
        user_id: { fieldName: 'user_id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Author reference', pii: false },
        ciphertext: { fieldName: 'ciphertext', classification: DataClassification.HEALTH_SENSITIVE, nullability: FieldNullability.REQUIRED, encrypted: true, purpose: 'Free-text personal reflection', pii: true }
      }
    });

    // 7. Safety Domain: Safety Plans
    ClassificationRegistry.register({
      entityName: 'SafetyPlan',
      tableName: 'safety_plans',
      domain: 'safety',
      defaultClassification: DataClassification.HEALTH_CRITICAL,
      deletionStrategy: DeletionStrategy.ARCHIVE,
      versioned: true,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Plan identifier', pii: false },
        user_id: { fieldName: 'user_id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Owner reference', pii: false },
        encrypted_content: { fieldName: 'encrypted_content', classification: DataClassification.HEALTH_CRITICAL, nullability: FieldNullability.REQUIRED, encrypted: true, purpose: 'Crisis coping strategies and contacts', pii: true },
        version: { fieldName: 'version', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Plan revision version', pii: false }
      }
    });

    // 8. Appointments Domain: Appointments
    ClassificationRegistry.register({
      entityName: 'Appointment',
      tableName: 'appointments',
      domain: 'appointments',
      defaultClassification: DataClassification.SENSITIVE,
      deletionStrategy: DeletionStrategy.ARCHIVE,
      versioned: true,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Appointment identifier', pii: false },
        subject_user_id: { fieldName: 'subject_user_id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Patient reference', pii: false },
        provider_id: { fieldName: 'provider_id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Provider reference', pii: false },
        professional_id: { fieldName: 'professional_id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Practitioner reference', pii: false },
        idempotency_key: { fieldName: 'idempotency_key', classification: DataClassification.INTERNAL, nullability: FieldNullability.OPTIONAL, encrypted: false, purpose: 'Booking idempotency guard', pii: false },
        version: { fieldName: 'version', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Concurrency lock', pii: false }
      }
    });

    // 8b. Availability Domain: Provider Scheduling Profiles
    ClassificationRegistry.register({
      entityName: 'ProviderSchedulingProfile',
      tableName: 'provider_scheduling_profiles',
      domain: 'availability',
      defaultClassification: DataClassification.INTERNAL,
      deletionStrategy: DeletionStrategy.ARCHIVE,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Profile identifier', pii: false },
        provider_id: { fieldName: 'provider_id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Provider linkage', pii: false }
      }
    });

    // 8c. Availability Domain: Schedule Blocks & Holds
    ClassificationRegistry.register({
      entityName: 'ScheduleBlock',
      tableName: 'schedule_blocks',
      domain: 'availability',
      defaultClassification: DataClassification.INTERNAL,
      deletionStrategy: DeletionStrategy.ARCHIVE,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Block identifier', pii: false },
        provider_id: { fieldName: 'provider_id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Provider linkage', pii: false }
      }
    });

    ClassificationRegistry.register({
      entityName: 'AppointmentHold',
      tableName: 'appointment_holds',
      domain: 'availability',
      defaultClassification: DataClassification.SENSITIVE,
      deletionStrategy: DeletionStrategy.HARD_DELETE,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Hold identifier', pii: false },
        subject_user_id: { fieldName: 'subject_user_id', classification: DataClassification.PERSONAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'User reference', pii: false }
      }
    });

    // 9. Billing Domain: Ledger Entries (Append-only financial records)
    ClassificationRegistry.register({
      entityName: 'LedgerEntry',
      tableName: 'ledger_entries',
      domain: 'billing',
      defaultClassification: DataClassification.FINANCIAL,
      deletionStrategy: DeletionStrategy.RETAIN_REQUIRED, // 7 yr statutory financial retention
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Ledger entry identifier', pii: false },
        account_code: { fieldName: 'account_code', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Chart of accounts code', pii: false },
        amount_minor: { fieldName: 'amount_minor', classification: DataClassification.FINANCIAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Exact integer minor units', pii: false },
        currency: { fieldName: 'currency', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Currency ISO 4217', pii: false }
      }
    });

    // 10. Audit Domain: Audit Events (Immutable append-only)
    ClassificationRegistry.register({
      entityName: 'AuditEvent',
      tableName: 'audit_events',
      domain: 'audit',
      defaultClassification: DataClassification.INTERNAL,
      deletionStrategy: DeletionStrategy.RETAIN_REQUIRED,
      versioned: false,
      fields: {
        id: { fieldName: 'id', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Audit event identifier', pii: false },
        action: { fieldName: 'action', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Audited action', pii: false },
        integrity_hash: { fieldName: 'integrity_hash', classification: DataClassification.INTERNAL, nullability: FieldNullability.REQUIRED, encrypted: false, purpose: 'Hash chain verification', pii: false }
      }
    });
  }

  public static register(metadata: EntityClassificationMetadata): void {
    ClassificationRegistry.entities.set(metadata.entityName.toLowerCase(), metadata);
    ClassificationRegistry.entities.set(metadata.tableName.toLowerCase(), metadata);
  }

  public static getEntity(nameOrTable: string): EntityClassificationMetadata | undefined {
    return ClassificationRegistry.entities.get(nameOrTable.toLowerCase());
  }

  public static getField(nameOrTable: string, fieldName: string): FieldClassificationMetadata | undefined {
    const entity = ClassificationRegistry.getEntity(nameOrTable);
    return entity?.fields[fieldName];
  }

  public static isFieldEncrypted(nameOrTable: string, fieldName: string): boolean {
    const field = ClassificationRegistry.getField(nameOrTable, fieldName);
    return !!field?.encrypted;
  }

  public static isFieldHealthSensitive(nameOrTable: string, fieldName: string): boolean {
    const field = ClassificationRegistry.getField(nameOrTable, fieldName);
    if (!field) return false;
    return isHealthOrClinicalData(field.classification);
  }

  public static getAllEntities(): EntityClassificationMetadata[] {
    const seen = new Set<string>();
    const result: EntityClassificationMetadata[] = [];
    for (const entity of ClassificationRegistry.entities.values()) {
      if (!seen.has(entity.entityName)) {
        seen.add(entity.entityName);
        result.push(entity);
      }
    }
    return result;
  }
}
