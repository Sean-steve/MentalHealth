/**
 * MindOS Canonical Privacy Data Flow Registry & Flow Graph Engine
 * Authority: Master Architecture Index Section 7, Volumes I, VIII & Appendix B / Q
 *            Kenya Data Protection Act 2019 Sections 41, 48, 49
 */

import { PrivacyDataFlow, DataCategory, ProcessingPurpose } from '../types.js';

export class PrivacyDataFlowRegistry {
  private static flows: Map<string, PrivacyDataFlow> = new Map();

  static {
    // Flow 1: Client to API Gateway (Ingress of user reflections & assessments)
    this.register({
      id: '01918d00-0001-7000-8000-000000000001',
      processing_activity_id: '01918a00-0001-7000-8000-000000000001',
      flow_code: 'DF-INGRESS-ASSESSMENT-001',
      source_system: 'MindOS Web / Mobile Client',
      source_domain: 'client',
      data_categories: [DataCategory.ASSESSMENT, DataCategory.JOURNAL, DataCategory.IDENTITY],
      destination_system: 'MindOS Core API (Cloud Run)',
      destination_domain: 'care',
      recipient_type: 'INTERNAL_SERVICE',
      purpose: ProcessingPurpose.CARE_DELIVERY,
      jurisdiction: 'KE',
      transfer_type: 'INTERNAL',
      encryption_requirement: 'TLS_1_3_AND_AES_256_GCM',
      retention_policy_ref: 'ret-pol-clinical-001',
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00Z'
    });

    // Flow 2: Core to AI Reasoning Pipeline (Gemini stateless inference)
    this.register({
      id: '01918d00-0002-7000-8000-000000000002',
      processing_activity_id: '01918a00-0002-7000-8000-000000000002',
      flow_code: 'DF-EGRESS-AI-GEMINI-001',
      source_system: 'MindOS Core API',
      source_domain: 'ai_support',
      data_categories: [DataCategory.AI_CONVERSATION, DataCategory.AI_DERIVED_METADATA],
      destination_system: 'Google Gemini API Endpoint',
      destination_domain: 'ai_provider',
      recipient_type: 'SUBPROCESSOR',
      processor_id: '01918c00-0002-7000-8000-000000000002',
      purpose: ProcessingPurpose.AI_SUPPORT,
      jurisdiction: 'US',
      transfer_type: 'CROSS_BORDER',
      encryption_requirement: 'TLS_1_3_ZERO_RETENTION',
      retention_policy_ref: 'EPHEMERAL_ZERO_RETENTION',
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00Z'
    });

    // Flow 3: Crisis Dispatch to Emergency SMS Gateway
    this.register({
      id: '01918d00-0003-7000-8000-000000000003',
      processing_activity_id: '01918a00-0003-7000-8000-000000000003',
      flow_code: 'DF-EGRESS-SMS-CRISIS-001',
      source_system: 'MindOS Safety Kernel',
      source_domain: 'safety',
      data_categories: [DataCategory.CONTACT],
      destination_system: "Africa's Talking SMS Dispatcher",
      destination_domain: 'telecom_provider',
      recipient_type: 'SUBPROCESSOR',
      processor_id: '01918c00-0004-7000-8000-000000000004',
      purpose: ProcessingPurpose.SAFETY_RESPONSE,
      jurisdiction: 'KE',
      transfer_type: 'INTERNAL',
      encryption_requirement: 'TLS_1_3',
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00Z'
    });
  }

  public static register(flow: PrivacyDataFlow): void {
    this.flows.set(flow.flow_code, flow);
  }

  public static listAll(): PrivacyDataFlow[] {
    return Array.from(this.flows.values());
  }

  public static getByCode(code: string): PrivacyDataFlow | undefined {
    return this.flows.get(code);
  }

  /**
   * Data Flow Graph Query: Answers "Where does Category X go?"
   */
  public static queryFlowGraphByCategory(category: DataCategory): PrivacyDataFlow[] {
    return Array.from(this.flows.values()).filter((f) =>
      f.data_categories.includes(category) && f.status === 'ACTIVE'
    );
  }

  /**
   * Data Flow Graph Query: Answers "What cross-border flows exist?"
   */
  public static queryCrossBorderFlows(): PrivacyDataFlow[] {
    return Array.from(this.flows.values()).filter((f) =>
      f.transfer_type === 'CROSS_BORDER' && f.status === 'ACTIVE'
    );
  }
}
