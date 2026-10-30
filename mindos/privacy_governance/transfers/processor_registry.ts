/**
 * MindOS Canonical Privacy Processor & Subprocessor Registry
 * Authority: Master Architecture Index Section 7, Volumes I, VIII & Appendix B / Q
 *            Kenya Data Protection Act 2019 Sections 41 & 42
 */

import {
  PrivacyProcessor,
  ProcessorType,
  DataCategory,
  ProcessingPurpose
} from '../types.js';

export class PrivacyProcessorRegistry {
  private static processors: Map<string, PrivacyProcessor> = new Map();

  static {
    // 1. Core Cloud Infrastructure (Google Cloud Platform / Cloud Run)
    this.register({
      id: '01918c00-0001-7000-8000-000000000001',
      processor_code: 'PROC-INFRA-GCP-001',
      name: 'Google Cloud Platform (Cloud Run & Cloud SQL)',
      processor_type: ProcessorType.CLOUD_INFRASTRUCTURE,
      service: 'Managed container hosting and encrypted relational database',
      jurisdictions: ['KE', 'EU', 'US'],
      processing_locations: ['europe-west1', 'me-central2', 'us-central1'],
      data_categories: [
        DataCategory.IDENTITY,
        DataCategory.CONTACT,
        DataCategory.ACCOUNT_SECURITY,
        DataCategory.CONSENT,
        DataCategory.ASSESSMENT,
        DataCategory.JOURNAL,
        DataCategory.CLINICAL_RECORDS,
        DataCategory.CARE_RELATIONSHIP,
        DataCategory.COMMUNITY,
        DataCategory.BILLING,
        DataCategory.DEVICE_SECURITY_METADATA
      ],
      approved_purposes: [
        ProcessingPurpose.PLATFORM_OPERATION,
        ProcessingPurpose.CARE_DELIVERY,
        ProcessingPurpose.SAFETY_RESPONSE,
        ProcessingPurpose.SECURITY
      ],
      contract_reference: 'GCP-ENTERPRISE-DPA-2026',
      security_review_reference: 'SEC-REV-GCP-2026-Q1',
      privacy_review_status: 'APPROVED',
      status: 'ACTIVE',
      effective_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z'
    });

    // 2. AI Model Provider (Google DeepMind / Gemini API)
    this.register({
      id: '01918c00-0002-7000-8000-000000000002',
      processor_code: 'PROC-AI-GEMINI-001',
      name: 'Google Gemini AI Services',
      processor_type: ProcessorType.AI_PROVIDER,
      service: 'Zero-retention real-time conversational mental health reasoning and triage support',
      jurisdictions: ['KE', 'US', 'EU'],
      processing_locations: ['us-central1', 'europe-west4'],
      data_categories: [
        DataCategory.AI_CONVERSATION,
        DataCategory.AI_DERIVED_METADATA
      ],
      approved_purposes: [
        ProcessingPurpose.AI_SUPPORT,
        ProcessingPurpose.AI_PERSONALIZATION,
        ProcessingPurpose.SAFETY_RESPONSE
      ],
      contract_reference: 'GEMINI-API-ENTERPRISE-TERMS-NO-TRAINING',
      security_review_reference: 'SEC-REV-GEMINI-2026-Q1',
      privacy_review_status: 'APPROVED',
      status: 'ACTIVE',
      effective_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z'
    });

    // 3. Domestic Payment Gateway (Safaricom M-Pesa Daraja)
    this.register({
      id: '01918c00-0003-7000-8000-000000000003',
      processor_code: 'PROC-PAY-MPESA-001',
      name: 'Safaricom M-Pesa Daraja API',
      processor_type: ProcessorType.PAYMENT_PROVIDER,
      service: 'Kenya domestic mobile money payment collection and verification',
      jurisdictions: ['KE'],
      processing_locations: ['Nairobi, Kenya'],
      data_categories: [
        DataCategory.IDENTITY,
        DataCategory.CONTACT,
        DataCategory.BILLING
      ],
      approved_purposes: [
        ProcessingPurpose.PLATFORM_OPERATION
      ],
      contract_reference: 'SAFARICOM-DARAJA-MERCHANT-AGREEMENT',
      security_review_reference: 'SEC-REV-SAFARICOM-2026',
      privacy_review_status: 'APPROVED',
      status: 'ACTIVE',
      effective_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z'
    });

    // 4. Domestic Telecom / SMS Gateway (Africa's Talking Ltd)
    this.register({
      id: '01918c00-0004-7000-8000-000000000004',
      processor_code: 'PROC-SMS-AFRICASTALKING-001',
      name: "Africa's Talking Communications",
      processor_type: ProcessorType.SMS_PROVIDER,
      service: 'Kenya domestic two-factor SMS and emergency crisis responder notification',
      jurisdictions: ['KE'],
      processing_locations: ['Nairobi, Kenya'],
      data_categories: [
        DataCategory.CONTACT
      ],
      approved_purposes: [
        ProcessingPurpose.PLATFORM_OPERATION,
        ProcessingPurpose.SAFETY_RESPONSE
      ],
      contract_reference: 'AFRICASTALKING-DPA-2026',
      security_review_reference: 'SEC-REV-AFT-2026',
      privacy_review_status: 'APPROVED',
      status: 'ACTIVE',
      effective_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z'
    });
  }

  public static register(processor: PrivacyProcessor): void {
    this.processors.set(processor.processor_code, processor);
  }

  public static getByCode(code: string): PrivacyProcessor | undefined {
    return this.processors.get(code);
  }

  public static listAll(): PrivacyProcessor[] {
    return Array.from(this.processors.values());
  }

  /**
   * Validates if a processor is permitted to handle a data category for a given purpose.
   */
  public static validateProcessorUsage(
    processorCode: string,
    dataCategory: DataCategory,
    purpose: ProcessingPurpose
  ): { authorized: boolean; reason?: string } {
    const proc = this.processors.get(processorCode);
    if (!proc) {
      return { authorized: false, reason: `Unregistered processor: ${processorCode}` };
    }

    if (proc.status !== 'ACTIVE' || proc.privacy_review_status !== 'APPROVED') {
      return {
        authorized: false,
        reason: `Processor ${processorCode} is not in ACTIVE & APPROVED status (current: ${proc.status}/${proc.privacy_review_status})`
      };
    }

    if (!proc.data_categories.includes(dataCategory)) {
      return {
        authorized: false,
        reason: `Processor ${processorCode} is not authorized for data category: ${dataCategory}`
      };
    }

    if (!proc.approved_purposes.includes(purpose)) {
      return {
        authorized: false,
        reason: `Processor ${processorCode} is not authorized for processing purpose: ${purpose}`
      };
    }

    return { authorized: true };
  }
}
