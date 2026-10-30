/**
 * MindOS Regulatory Requirement Registry
 * Authority: Volumes III, XV & Appendix I (Kenya Regulatory Control Matrix)
 * Invariant: Human-in-the-loop validation for material interpretations affecting health data,
 * clinical functionality, and regulatory classification.
 */

import { RegulatoryRequirement } from '../domain/types.js';
import {
  RegulatoryRequirementType,
  RegulatoryObligationType,
  RegulatoryInterpretationStatus
} from '../domain/taxonomy.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { RegulatorySourceRegistry } from '../sources/registry.js';
import { ValidationError } from '../../platform/errors/index.js';

export class RegulatoryRequirementRegistry {
  private static requirements: Map<string, RegulatoryRequirement> = new Map();

  static {
    RegulatoryRequirementRegistry.initializeCanonicalRequirements();
  }

  public static initializeCanonicalRequirements(): void {
    RegulatoryRequirementRegistry.requirements.clear();

    const canonical: Array<{
      code: string;
      sourceCode: string;
      sourceVersion: string;
      title: string;
      description: string;
      type: RegulatoryRequirementType;
      obligation: RegulatoryObligationType;
      appliesTo: string[];
      triggerConditions: Record<string, unknown>;
      requiredControls: string[];
      evidenceRequirements: string[];
      interpretation: RegulatoryInterpretationStatus;
    }> = [
      {
        code: 'KE-REQ-PRIV-001',
        sourceCode: 'KE-SRC-DPA-2019',
        sourceVersion: '1.0.0',
        title: 'Lawful Basis & Explicit Consent for Sensitive Health Data Processing',
        description: 'Mandates lawful, fair and transparent processing under DPA 2019 Sections 25 & 26. Processing sensitive health or mental health data requires explicit informed consent or statutory justification (Sec 44).',
        type: RegulatoryRequirementType.CONSENT,
        obligation: RegulatoryObligationType.MANDATORY,
        appliesTo: ['feature', 'processing_activity', 'ai_system'],
        triggerConditions: { processes_health_data: true },
        requiredControls: ['CTL-PRIV-LAWFUL-BASIS', 'CTL-CONS-HEALTH-EXPLICIT'],
        evidenceRequirements: ['consent_audit_record', 'privacy_notice_hash'],
        interpretation: RegulatoryInterpretationStatus.CONFIRMED
      },
      {
        code: 'KE-REQ-PRIV-002',
        sourceCode: 'KE-SRC-DPA-2019',
        sourceVersion: '1.0.0',
        title: 'Mandatory Data Protection Impact Assessment (DPIA) for Health Data',
        description: 'DPA 2019 Section 31: Where a processing operation is likely to result in high risk to rights, including health data or automated profiling, a formal DPIA must be conducted prior to processing.',
        type: RegulatoryRequirementType.DATA_PROTECTION,
        obligation: RegulatoryObligationType.MANDATORY,
        appliesTo: ['processing_activity', 'feature', 'ai_system'],
        triggerConditions: { has_high_risk: true, processes_health_data: true },
        requiredControls: ['CTL-PRIV-DPIA-MANDATE'],
        evidenceRequirements: ['dpia_approval_record', 'dpo_signoff'],
        interpretation: RegulatoryInterpretationStatus.CONFIRMED
      },
      {
        code: 'KE-REQ-PRIV-003',
        sourceCode: 'KE-SRC-DPA-2019',
        sourceVersion: '1.0.0',
        title: 'Safeguards & Conditions for Cross-Border Health Data Transfers',
        description: 'DPA 2019 Sections 48 & 49: Cross-border transfer of health data outside Kenya requires proof of adequate safeguards, legal basis, and consent or ODPC authorization.',
        type: RegulatoryRequirementType.DATA_LOCALIZATION,
        obligation: RegulatoryObligationType.CONDITIONAL,
        appliesTo: ['processing_activity', 'vendor_service'],
        triggerConditions: { is_cross_border: true },
        requiredControls: ['CTL-PRIV-CROSS-BORDER'],
        evidenceRequirements: ['transfer_impact_assessment', 'standard_contractual_clauses'],
        interpretation: RegulatoryInterpretationStatus.CONFIRMED
      },
      {
        code: 'KE-REQ-PRIV-004',
        sourceCode: 'KE-SRC-DPA-2019',
        sourceVersion: '1.0.0',
        title: '72-Hour Breach Notification to ODPC and Affected Individuals',
        description: 'DPA 2019 Section 43: Requires notifying the Data Protection Commissioner within 72 hours of becoming aware of a breach involving personal data.',
        type: RegulatoryRequirementType.BREACH_RESPONSE,
        obligation: RegulatoryObligationType.REPORTING,
        appliesTo: ['platform', 'infrastructure'],
        triggerConditions: { security_incident: true },
        requiredControls: ['CTL-SEC-INCIDENT-NOTIFICATION'],
        evidenceRequirements: ['incident_response_playbook', 'audit_ledger_evidence'],
        interpretation: RegulatoryInterpretationStatus.CONFIRMED
      },
      {
        code: 'KE-REQ-DHA-001',
        sourceCode: 'KE-SRC-DHA-2023',
        sourceVersion: '1.0.0',
        title: 'Digital Health System Registration with Digital Health Agency (DHA)',
        description: 'Digital Health Act 2023 Sections 15–18: All digital health solutions operating in Kenya must be registered with and certified by the Digital Health Agency.',
        type: RegulatoryRequirementType.DIGITAL_HEALTH,
        obligation: RegulatoryObligationType.REGISTRATION,
        appliesTo: ['platform', 'feature'],
        triggerConditions: { digital_health_service: true },
        requiredControls: ['CTL-DHA-SYSTEM-REGISTRATION'],
        evidenceRequirements: ['dha_registration_certificate', 'compliance_filing'],
        interpretation: RegulatoryInterpretationStatus.CONFIRMED
      },
      {
        code: 'KE-REQ-DHA-002',
        sourceCode: 'KE-SRC-DHA-2023',
        sourceVersion: '1.0.0',
        title: 'Health Data Sovereignty & Localization Requirements',
        description: 'Digital Health Act 2023 Sections 35–38: Sensitive personal health data generated within Kenya shall be retained, managed, and stored on servers located within the territory of Kenya unless specific regulatory exemptions apply.',
        type: RegulatoryRequirementType.DATA_LOCALIZATION,
        obligation: RegulatoryObligationType.MANDATORY,
        appliesTo: ['infrastructure', 'database', 'processing_activity'],
        triggerConditions: { processes_health_data: true },
        requiredControls: ['CTL-DHA-DATA-LOCALIZATION'],
        evidenceRequirements: ['hosting_attestation', 'residency_architecture_document'],
        interpretation: RegulatoryInterpretationStatus.CONFIRMED
      },
      {
        code: 'KE-REQ-DHA-003',
        sourceCode: 'KE-SRC-DHA-2023',
        sourceVersion: '1.0.0',
        title: 'Health Information Exchange Interoperability & Consent Standards',
        description: 'Digital Health Act 2023 Sections 42–45: Interoperability with the Kenya National Health Data Exchange requires adherence to HL7/FHIR profiles and patient consent for transmission.',
        type: RegulatoryRequirementType.DATA_EXCHANGE,
        obligation: RegulatoryObligationType.CONDITIONAL,
        appliesTo: ['integration', 'data_exchange'],
        triggerConditions: { data_exchange_active: true },
        requiredControls: ['CTL-DHA-INTEROP-STANDARDS'],
        evidenceRequirements: ['fhir_profile_validation', 'exchange_consent_record'],
        interpretation: RegulatoryInterpretationStatus.CONFIRMED
      },
      {
        code: 'KE-REQ-HLTH-001',
        sourceCode: 'KE-SRC-HA-2017',
        sourceVersion: '1.0.0',
        title: 'Confidentiality of Patient Health Records & Role-Based Access Enforcement',
        description: 'Health Act 2017 Sections 10–14: Strict duty of confidentiality on all medical, health, and psychiatric records. Information can only be disclosed with patient consent, court order, or statutory necessity.',
        type: RegulatoryRequirementType.HEALTH_INFORMATION,
        obligation: RegulatoryObligationType.MANDATORY,
        appliesTo: ['feature', 'clinical_artifact', 'care_relationship'],
        triggerConditions: { processes_health_data: true },
        requiredControls: ['CTL-HLTH-CONFIDENTIALITY', 'CTL-AUTHZ-RBAC'],
        evidenceRequirements: ['rbac_policy_snapshot', 'audit_record'],
        interpretation: RegulatoryInterpretationStatus.CONFIRMED
      },
      {
        code: 'KE-REQ-CLIN-001',
        sourceCode: 'KE-SRC-HA-2017',
        sourceVersion: '1.0.0',
        title: 'Clinical Claim Substantiation & Prohibition of Unauthorized Medical Practice',
        description: 'Health Act 2017 & KMPDC Standards: Non-licensed software systems must not make formal clinical diagnoses or prescribe treatment without licensed human clinician oversight.',
        type: RegulatoryRequirementType.CLINICAL,
        obligation: RegulatoryObligationType.PROHIBITION,
        appliesTo: ['clinical_artifact', 'ai_system', 'feature'],
        triggerConditions: { makes_clinical_claim: true },
        requiredControls: ['CTL-CLIN-CLAIM-VALIDATION'],
        evidenceRequirements: ['clinical_governance_signoff', 'intended_use_statement'],
        interpretation: RegulatoryInterpretationStatus.CONFIRMED
      },
      {
        code: 'KE-REQ-CYBER-001',
        sourceCode: 'KE-SRC-CMCA-2018',
        sourceVersion: '1.0.0',
        title: 'Critical Information Infrastructure Security & Cryptographic Safeguards',
        description: 'CMCA 2018 Sections 14–20: Requires robust technical and cryptographic security measures to protect critical systems and confidential data against unauthorized access.',
        type: RegulatoryRequirementType.CYBERSECURITY,
        obligation: RegulatoryObligationType.MANDATORY,
        appliesTo: ['platform', 'infrastructure', 'feature'],
        triggerConditions: {},
        requiredControls: ['CTL-SEC-ACCESS-PROTECTION', 'CTL-SEC-AUDIT-INTEGRITY'],
        evidenceRequirements: ['penetration_test_report', 'kms_cryptographic_attestation'],
        interpretation: RegulatoryInterpretationStatus.CONFIRMED
      }
    ];

    for (const item of canonical) {
      const src = RegulatorySourceRegistry.get(item.sourceCode);
      const sourceId = src ? src.id : generateUUIDv7();
      const id = generateUUIDv7();

      let legalRef = 'Statutory Source';
      if (item.code === 'KE-REQ-PRIV-001') legalRef = 'DPA 2019 Sections 25 & 26';
      else if (item.code === 'KE-REQ-PRIV-002') legalRef = 'DPA 2019 Section 44';
      else if (item.code === 'KE-REQ-PRIV-003') legalRef = 'DPA 2019 Sections 48 & 49';
      else if (item.code === 'KE-REQ-PRIV-004') legalRef = 'DPA 2019 Section 43';
      else if (item.code === 'KE-REQ-DHA-001') legalRef = 'DHA 2023 Sections 15–18';
      else if (item.code === 'KE-REQ-DHA-002') legalRef = 'DHA 2023 Section 47';
      else if (item.code === 'KE-REQ-HLTH-001') legalRef = 'Health Act 2017 Section 10';
      else if (item.code === 'KE-REQ-CLIN-001') legalRef = 'Health Act 2017 & KMPDC Standards';
      else if (item.code === 'KE-REQ-CYBER-001') legalRef = 'CMCA 2018 Sections 14–20';

      const req: RegulatoryRequirement = {
        id,
        requirement_code: item.code,
        source_id: sourceId,
        source_version: item.sourceVersion,
        jurisdiction_code: 'KE',
        title: item.title,
        description: item.description,
        requirement_type: item.type,
        obligation_type: item.obligation,
        legal_reference: legalRef,
        mandatory: item.obligation === RegulatoryObligationType.MANDATORY,
        applies_to: item.appliesTo,
        trigger_conditions: item.triggerConditions,
        required_controls: item.requiredControls,
        evidence_requirements: item.evidenceRequirements,
        effective_at: '2026-01-01T00:00:00.000Z',
        status: 'ACTIVE',
        interpretation_status: item.interpretation,
        reviewed_by: 'legal_regulatory_officer_ke',
        reviewed_at: '2026-01-01T00:00:00.000Z'
      };

      RegulatoryRequirementRegistry.requirements.set(item.code, req);
    }
  }

  public static get(code: string): RegulatoryRequirement | undefined {
    return RegulatoryRequirementRegistry.requirements.get(code);
  }

  public static getById(id: string): RegulatoryRequirement | undefined {
    for (const r of RegulatoryRequirementRegistry.requirements.values()) {
      if (r.id === id) return r;
    }
    return undefined;
  }

  public static list(jurisdictionCode = 'KE'): RegulatoryRequirement[] {
    return Array.from(RegulatoryRequirementRegistry.requirements.values()).filter(
      (r) => r.jurisdiction_code === jurisdictionCode.toUpperCase()
    );
  }

  public static registerRequirement(req: RegulatoryRequirement): void {
    if (RegulatoryRequirementRegistry.requirements.has(req.requirement_code)) {
      throw new ValidationError(`Regulatory requirement ${req.requirement_code} already registered`);
    }
    RegulatoryRequirementRegistry.requirements.set(req.requirement_code, req);
  }

  public static updateInterpretation(params: {
    requirementCode: string;
    newStatus: RegulatoryInterpretationStatus;
    reviewerId: string;
    notes?: string;
  }): RegulatoryRequirement {
    const req = RegulatoryRequirementRegistry.get(params.requirementCode);
    if (!req) {
      throw new ValidationError(`Requirement not found: ${params.requirementCode}`);
    }

    // AI cannot confirm high-risk regulatory interpretation
    if (params.reviewerId.startsWith('ai_') || params.reviewerId.includes('bot')) {
      throw new ValidationError('Autonomous AI cannot confirm authoritative legal interpretations.');
    }

    req.interpretation_status = params.newStatus;
    req.reviewed_by = params.reviewerId;
    req.reviewed_at = new Date().toISOString();

    return req;
  }

  public static resetForTesting(): void {
    RegulatoryRequirementRegistry.initializeCanonicalRequirements();
  }
}
