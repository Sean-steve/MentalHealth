/**
 * MindOS Regulatory Certification & External Regulator Readiness
 * Authority: Volumes III, XV & Appendix I
 * Tracks statutory registrations (DHA, ODPC, KMPDC) and certifications.
 * Anti-Fake Certification Safeguard: Requires verified evidence reference before marking certified.
 */

import { CertificationRequirement, ExternalRegulatoryStatus } from '../domain/types.js';
import { CertificationStatus } from '../domain/taxonomy.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { ValidationError } from '../../platform/errors/index.js';

export class RegulatoryCertificationService {
  private static certifications: Map<string, CertificationRequirement> = new Map();
  private static externalStatuses: Map<string, ExternalRegulatoryStatus> = new Map();

  static {
    RegulatoryCertificationService.initializeCanonicalStatuses();
  }

  public static initializeCanonicalStatuses(): void {
    RegulatoryCertificationService.certifications.clear();
    RegulatoryCertificationService.externalStatuses.clear();

    // Canonical authority requirements are registered as PENDING only.
    // MindOS MUST NOT fabricate or seed legal registration/certification success.
    const pending = [
      ['DHA','Digital Health Solution Statutory Registration'],
      ['ODPC','Data Controller / Processor Registration'],
      ['KMPDC','Telehealth / Professional Regulatory Applicability Review']
    ] as const;

    for (const [authority, registrationType] of pending) {
      RegulatoryCertificationService.externalStatuses.set(`KE_${authority}`, {
        id: generateUUIDv7(),
        authority_code: authority,
        jurisdiction_code: 'KE',
        registration_type: registrationType,
        status: 'PENDING',
        verified_at: '2026-09-04T00:00:00.000Z',
        verified_by: 'SYSTEM_BASELINE_NOT_LEGAL_APPROVAL'
      });
    }
  }

  public static getExternalStatus(authorityCode: string, jurisdictionCode = 'KE'): ExternalRegulatoryStatus | undefined {
    return RegulatoryCertificationService.externalStatuses.get(`${jurisdictionCode.toUpperCase()}_${authorityCode.toUpperCase()}`);
  }

  public static listExternalStatuses(jurisdictionCode = 'KE'): ExternalRegulatoryStatus[] {
    return Array.from(RegulatoryCertificationService.externalStatuses.values()).filter(
      (s) => s.jurisdiction_code === jurisdictionCode.toUpperCase()
    );
  }

  public static verifyExternalStatus(params: {
    authorityCode: string;
    jurisdictionCode: string;
    registrationType: string;
    registrationReference: string;
    verifiedBy: string;
    effectiveDate?: string;
    renewalDueDate?: string;
  }): ExternalRegulatoryStatus {
    if (!params.registrationReference || params.registrationReference.trim() === '') {
      throw new ValidationError('Registration reference document identifier is required (anti-fake certification safeguard).');
    }

    const key = `${params.jurisdictionCode.toUpperCase()}_${params.authorityCode.toUpperCase()}`;
    const record: ExternalRegulatoryStatus = {
      id: generateUUIDv7(),
      authority_code: params.authorityCode.toUpperCase(),
      jurisdiction_code: params.jurisdictionCode.toUpperCase(),
      registration_type: params.registrationType,
      registration_reference: params.registrationReference,
      status: 'REGISTERED',
      effective_date: params.effectiveDate || new Date().toISOString().slice(0, 10),
      renewal_due_date: params.renewalDueDate,
      verified_at: new Date().toISOString(),
      verified_by: params.verifiedBy
    };

    RegulatoryCertificationService.externalStatuses.set(key, record);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.verifiedBy,
      action: 'REGULATORY_GOVERNANCE.EXTERNAL_STATUS_VERIFIED',
      resource_type: 'external_regulatory_status',
      resource_id: record.id,
      purpose: `External Regulatory Status Verified: ${params.authorityCode}`,
      result: 'ALLOWED',
      authorization_basis: { registrationRef: params.registrationReference }
    });

    return record;
  }

  public static resetForTesting(): void {
    RegulatoryCertificationService.initializeCanonicalStatuses();
  }
}
