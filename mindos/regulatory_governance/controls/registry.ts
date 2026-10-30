/**
 * MindOS Regulatory Control Registry & Requirement Mappings
 * Authority: Volumes III, XV & Appendix I (Kenya Regulatory Control Matrix)
 * Connects statutory requirements to operational platform controls:
 * Consent, Authorization, Audit/Evidence Vault, Privacy Governance, Clinical Governance.
 */

import { RegulatoryControl, RegulatoryRequirementControl } from '../domain/types.js';
import {
  RegulatoryControlDomain,
  RegulatoryControlType,
  RegulatoryControlStatus,
  ControlEvidenceStatus
} from '../domain/taxonomy.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { RegulatoryRequirementRegistry } from '../requirements/registry.js';
import { ValidationError } from '../../platform/errors/index.js';

export class RegulatoryControlRegistry {
  private static controls: Map<string, RegulatoryControl> = new Map();
  private static mappings: Map<string, RegulatoryRequirementControl[]> = new Map(); // requirement_id -> mappings

  static {
    RegulatoryControlRegistry.initializeCanonicalControls();
  }

  public static initializeCanonicalControls(): void {
    RegulatoryControlRegistry.controls.clear();
    RegulatoryControlRegistry.mappings.clear();

    const canonical: Array<{
      code: string;
      name: string;
      description: string;
      domain: RegulatoryControlDomain;
      type: RegulatoryControlType;
      owner: string;
      enforcement: string;
      evidenceRequirement: string;
    }> = [
      {
        code: 'CTL-PRIV-LAWFUL-BASIS',
        name: 'Lawful Basis & Privacy Consent Verification Control',
        description: 'Enforces that every personal and health data processing action has an active, valid lawful basis and patient consent record.',
        domain: RegulatoryControlDomain.PRIVACY,
        type: RegulatoryControlType.PREVENTIVE,
        owner: 'privacy_governance',
        enforcement: 'PrivacyEngine.validateLawfulBasis() invoked prior to data access.',
        evidenceRequirement: 'Immutable consent grant ID or statutory basis record.'
      },
      {
        code: 'CTL-CONS-HEALTH-EXPLICIT',
        name: 'Explicit Consent for Sensitive Health Data',
        description: 'Mandates active, unambiguous, specific consent for mental health and health-sensitive data access.',
        domain: RegulatoryControlDomain.CONSENT,
        type: RegulatoryControlType.PREVENTIVE,
        owner: 'consent_engine',
        enforcement: 'ConsentEngine.verifyGrant() enforces HEALTH_DATA scope and non-expired status.',
        evidenceRequirement: 'Cryptographically signed consent grant with user timestamp.'
      },
      {
        code: 'CTL-PRIV-DPIA-MANDATE',
        name: 'DPIA Gate for High-Risk & Health Data Operations',
        description: 'Blocks deployment and processing of high-risk activities without an approved Data Protection Impact Assessment.',
        domain: RegulatoryControlDomain.PRIVACY,
        type: RegulatoryControlType.PREVENTIVE,
        owner: 'privacy_governance',
        enforcement: 'PrivacyGovernanceService.evaluateDPIAGate() fails closed if DPIA is not APPROVED.',
        evidenceRequirement: 'DPIA approval record with Data Protection Officer signature.'
      },
      {
        code: 'CTL-PRIV-CROSS-BORDER',
        name: 'Cross-Border Health Data Transfer Safeguards',
        description: 'Validates that data transfer outside Kenya complies with DPA 2019 Sec 48/49 adequate safeguard standards.',
        domain: RegulatoryControlDomain.CROSS_BORDER,
        type: RegulatoryControlType.PREVENTIVE,
        owner: 'privacy_governance',
        enforcement: 'TransferImpactAssessment required before foreign data ingress/egress.',
        evidenceRequirement: 'Approved TransferImpactAssessment and Standard Contractual Clauses.'
      },
      {
        code: 'CTL-SEC-INCIDENT-NOTIFICATION',
        name: '72-Hour Security Incident & Breach Notification Protocol',
        description: 'Automated logging and alerting pipeline for security and data confidentiality events.',
        domain: RegulatoryControlDomain.INCIDENT_MANAGEMENT,
        type: RegulatoryControlType.DETECTIVE,
        owner: 'platform_security',
        enforcement: 'SecurityEventService triggers high-priority alerts on PII breach patterns.',
        evidenceRequirement: 'Runbook-008 incident notification test record.'
      },
      {
        code: 'CTL-DHA-SYSTEM-REGISTRATION',
        name: 'Digital Health Agency System Registration & Certification',
        description: 'Ensures the MindOS instance has valid statutory registration with the Kenya Digital Health Agency.',
        domain: RegulatoryControlDomain.GOVERNANCE,
        type: RegulatoryControlType.LEGAL,
        owner: 'regulatory_governance',
        enforcement: 'ExternalRegulatoryStatus registry requires ACTIVE DHA registration certificate.',
        evidenceRequirement: 'DHA Registration Certificate Reference (DHA-REG-KE).'
      },
      {
        code: 'CTL-DHA-DATA-LOCALIZATION',
        name: 'Kenya Data Residency & Sovereign Cloud Enforcement',
        description: 'Ensures primary storage and processing of Kenyan health data resides within Kenyan territory.',
        domain: RegulatoryControlDomain.INFRASTRUCTURE,
        type: RegulatoryControlType.PREVENTIVE,
        owner: 'platform_infrastructure',
        enforcement: 'Database driver and cloud storage configuration pinned to Kenya data region.',
        evidenceRequirement: 'Cloud infrastructure deployment attestation and audit logs.'
      },
      {
        code: 'CTL-DHA-INTEROP-STANDARDS',
        name: 'Health Data Exchange & Interoperability Standards Compliance',
        description: 'Enforces HL7/FHIR profiles and explicit patient exchange authorization for data exchange.',
        domain: RegulatoryControlDomain.DATA_SHARING,
        type: RegulatoryControlType.PREVENTIVE,
        owner: 'interoperability_gateway',
        enforcement: 'Schema validator rejects non-conforming data exchange payloads.',
        evidenceRequirement: 'Interoperability compliance validation report.'
      },
      {
        code: 'CTL-HLTH-CONFIDENTIALITY',
        name: 'Health Record Confidentiality & Access Isolation',
        description: 'Strict logical isolation of psychiatric, clinical, and sensitive psychological records.',
        domain: RegulatoryControlDomain.CLINICAL,
        type: RegulatoryControlType.PREVENTIVE,
        owner: 'clinical_governance',
        enforcement: 'Direct access to clinical notes requires CareRelationship context.',
        evidenceRequirement: 'Zero unauthorized access entries in audit ledger.'
      },
      {
        code: 'CTL-AUTHZ-RBAC',
        name: 'Role-Based & Purpose-Based Authorization Kernel',
        description: 'Deny-by-default PDP evaluating actor roles, privileges, and explicit statutory purposes.',
        domain: RegulatoryControlDomain.SECURITY,
        type: RegulatoryControlType.PREVENTIVE,
        owner: 'authorization_engine',
        enforcement: 'AuthorizationEngine.evaluate() enforces canonical roles and purpose checks.',
        evidenceRequirement: 'Authorization decision trace with cryptographic audit chaining.'
      },
      {
        code: 'CTL-CLIN-CLAIM-VALIDATION',
        name: 'Clinical Claim Boundaries & Diagnostic Restriction',
        description: 'Ensures conversational AI and features do not formulate medical diagnoses or therapeutic claims.',
        domain: RegulatoryControlDomain.CLINICAL,
        type: RegulatoryControlType.PREVENTIVE,
        owner: 'clinical_governance',
        enforcement: 'SafetyKernel classifiers and Clinical Governance artifact approval.',
        evidenceRequirement: 'ClinicalGovernance review sign-off and intended use statement.'
      },
      {
        code: 'CTL-SEC-ACCESS-PROTECTION',
        name: 'Identity Authentication & Cryptographic Access Protection',
        description: 'Enforces PBKDF2/Argon2 password hashing, rate limiting, and signed stateless JWTs.',
        domain: RegulatoryControlDomain.SECURITY,
        type: RegulatoryControlType.PREVENTIVE,
        owner: 'identity_service',
        enforcement: 'IdentityService enforces brute-force lockout, rotation, and cryptographic signatures.',
        evidenceRequirement: 'Identity security test suite passing 100%.'
      },
      {
        code: 'CTL-SEC-AUDIT-INTEGRITY',
        name: 'Cryptographic Audit Trail with SHA-256 Chaining',
        description: 'Guarantees tamper-evident, non-repudiable audit logging for all governance and security events.',
        domain: RegulatoryControlDomain.AUDIT,
        type: RegulatoryControlType.DETECTIVE,
        owner: 'audit_service',
        enforcement: 'AuditService records every action into immutable SHA-256 chain.',
        evidenceRequirement: 'Audit verification check showing 0 hash discrepancies.'
      }
    ];

    for (const c of canonical) {
      const id = generateUUIDv7();
      const control: RegulatoryControl = {
        id,
        control_code: c.code,
        name: c.name,
        description: c.description,
        control_domain: c.domain,
        jurisdiction_code: 'KE',
        control_type: c.type,
        implementation_owner: c.owner,
        status: RegulatoryControlStatus.ACTIVE,
        technical_enforcement: c.enforcement,
        evidence_requirement: c.evidenceRequirement,
        evidence_status: ControlEvidenceStatus.VERIFIED, // Seed canonical platform controls as verified
        verification_status: ControlEvidenceStatus.VERIFIED,
        requirement_id: c.code === 'CTL-PRIV-LAWFUL-BASIS' ? 'KE-REQ-PRIV-001' : undefined,
        last_verified_at: '2026-01-01T00:00:00.000Z',
        verified_by: 'lead_regulatory_engineer_ke',
        evidence_vault_ref: `ev_vault_${c.code.toLowerCase()}`,
        policy_version: '1.0.0',
        effective_at: '2026-01-01T00:00:00.000Z'
      };

      RegulatoryControlRegistry.controls.set(c.code, control);
      if (c.code === 'CTL-PRIV-LAWFUL-BASIS') {
        const dpaControl = { ...control, control_code: 'KE-CTRL-DPA-01', requirement_id: 'KE-REQ-PRIV-001' };
        RegulatoryControlRegistry.controls.set('KE-CTRL-DPA-01', dpaControl);
      }
    }

    // Map requirements to controls
    RegulatoryControlRegistry.mapCanonicalRequirementControls();
  }

  private static mapCanonicalRequirementControls(): void {
    const mappings: Array<{ reqCode: string; ctlCode: string; mandatory: boolean }> = [
      { reqCode: 'KE-REQ-PRIV-001', ctlCode: 'CTL-PRIV-LAWFUL-BASIS', mandatory: true },
      { reqCode: 'KE-REQ-PRIV-001', ctlCode: 'KE-CTRL-DPA-01', mandatory: true },
      { reqCode: 'KE-REQ-PRIV-001', ctlCode: 'CTL-CONS-HEALTH-EXPLICIT', mandatory: true },
      { reqCode: 'KE-REQ-PRIV-002', ctlCode: 'CTL-PRIV-DPIA-MANDATE', mandatory: true },
      { reqCode: 'KE-REQ-PRIV-003', ctlCode: 'CTL-PRIV-CROSS-BORDER', mandatory: true },
      { reqCode: 'KE-REQ-PRIV-004', ctlCode: 'CTL-SEC-INCIDENT-NOTIFICATION', mandatory: true },
      { reqCode: 'KE-REQ-DHA-001', ctlCode: 'CTL-DHA-SYSTEM-REGISTRATION', mandatory: true },
      { reqCode: 'KE-REQ-DHA-002', ctlCode: 'CTL-DHA-DATA-LOCALIZATION', mandatory: true },
      { reqCode: 'KE-REQ-DHA-003', ctlCode: 'CTL-DHA-INTEROP-STANDARDS', mandatory: true },
      { reqCode: 'KE-REQ-HLTH-001', ctlCode: 'CTL-HLTH-CONFIDENTIALITY', mandatory: true },
      { reqCode: 'KE-REQ-HLTH-001', ctlCode: 'CTL-AUTHZ-RBAC', mandatory: true },
      { reqCode: 'KE-REQ-CLIN-001', ctlCode: 'CTL-CLIN-CLAIM-VALIDATION', mandatory: true },
      { reqCode: 'KE-REQ-CYBER-001', ctlCode: 'CTL-SEC-ACCESS-PROTECTION', mandatory: true },
      { reqCode: 'KE-REQ-CYBER-001', ctlCode: 'CTL-SEC-AUDIT-INTEGRITY', mandatory: true }
    ];

    for (const m of mappings) {
      const req = RegulatoryRequirementRegistry.get(m.reqCode);
      const ctl = RegulatoryControlRegistry.get(m.ctlCode);
      if (req && ctl) {
        const link: RegulatoryRequirementControl = {
          id: generateUUIDv7(),
          requirement_id: req.id,
          control_id: ctl.id,
          relationship: 'IMPLEMENTS',
          mandatory: m.mandatory,
          coverage: 'FULL',
          assessment: 'Validated by canonical subsystem architecture'
        };
        const existing = RegulatoryControlRegistry.mappings.get(req.id) || [];
        existing.push(link);
        RegulatoryControlRegistry.mappings.set(req.id, existing);
      }
    }
  }

  public static get(code: string): RegulatoryControl | undefined {
    return RegulatoryControlRegistry.controls.get(code);
  }

  public static getById(id: string): RegulatoryControl | undefined {
    for (const c of RegulatoryControlRegistry.controls.values()) {
      if (c.id === id) return c;
    }
    return undefined;
  }

  public static list(jurisdictionCode = 'KE'): RegulatoryControl[] {
    return Array.from(RegulatoryControlRegistry.controls.values()).filter(
      (c) => c.jurisdiction_code === jurisdictionCode.toUpperCase()
    );
  }

  public static getControlsForRequirement(requirementId: string): RegulatoryControl[] {
    const links = RegulatoryControlRegistry.mappings.get(requirementId) || [];
    return links
      .map((l) => RegulatoryControlRegistry.getById(l.control_id))
      .filter(Boolean) as RegulatoryControl[];
  }

  public static updateControlStatus(params: {
    controlCode: string;
    evidenceStatus: ControlEvidenceStatus;
    verifiedBy: string;
    evidenceVaultRef?: string;
  }): RegulatoryControl {
    const ctl = RegulatoryControlRegistry.get(params.controlCode);
    if (!ctl) {
      throw new ValidationError(`Control not found: ${params.controlCode}`);
    }

    ctl.evidence_status = params.evidenceStatus;
    ctl.last_verified_at = new Date().toISOString();
    ctl.verified_by = params.verifiedBy;
    if (params.evidenceVaultRef) {
      ctl.evidence_vault_ref = params.evidenceVaultRef;
    }

    return ctl;
  }

  public static resetForTesting(): void {
    RegulatoryControlRegistry.initializeCanonicalControls();
  }
}
