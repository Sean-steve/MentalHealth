/**
 * MindOS Canonical Privacy Control Catalogue
 * Authority: Master Architecture Index Section 7, Volumes I, VIII & Appendix B / Q
 *            Kenya Data Protection Act 2019 Section 41
 */

import { PrivacyControl, ControlType } from '../types.js';

export const CANONICAL_PRIVACY_CONTROLS: PrivacyControl[] = [
  {
    id: '01918b00-0001-7000-8000-000000000001',
    code: 'PC-TECH-001',
    name: 'Field-Level Encryption at Rest',
    description: 'Cryptographic protection of sensitive health, journal, and assessment data using AES-256-GCM with envelope key management.',
    control_type: ControlType.TECHNICAL,
    owner_domain: 'security',
    implementation_reference: 'mindos/platform/security/kms.ts',
    status: 'IMPLEMENTED',
    evidence_requirement: 'KMS key policy and cipher validation proof',
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: '01918b00-0002-7000-8000-000000000002',
    code: 'PC-TECH-002',
    name: 'TLS 1.3 In-Transit Encryption',
    description: 'Mandatory transport layer security enforcing forward secrecy for all external client and subprocessor communications.',
    control_type: ControlType.TECHNICAL,
    owner_domain: 'infrastructure',
    implementation_reference: 'nginx / Cloud Run ingress TLS configuration',
    status: 'IMPLEMENTED',
    evidence_requirement: 'SSL/TLS cipher suite audit report',
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: '01918b00-0003-7000-8000-000000000003',
    code: 'PC-TECH-003',
    name: 'Automated Pseudonymization & De-identification',
    description: 'Removes direct identifiers (names, contacts, national IDs) prior to transmission to downstream analytics or research domains.',
    control_type: ControlType.TECHNICAL,
    owner_domain: 'privacy_governance',
    implementation_reference: 'mindos/privacy_governance/processing/pseudonymizer.ts',
    status: 'IMPLEMENTED',
    evidence_requirement: 'De-identification validation test suite',
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: '01918b00-0004-7000-8000-000000000004',
    code: 'PC-TECH-004',
    name: 'Stateless AI Ephemeral Retention Policy',
    description: 'Ensures external LLM providers (e.g. Gemini) operate with zero retention and do not train on user conversation payload.',
    control_type: ControlType.TECHNICAL,
    owner_domain: 'ai_governance',
    implementation_reference: 'server/gemini.ts ephemeral payload scrub',
    status: 'IMPLEMENTED',
    evidence_requirement: 'Vendor enterprise zero-data-retention DPA',
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: '01918b00-0005-7000-8000-000000000005',
    code: 'PC-ORG-001',
    name: 'Separation of Duties (DPO Independence)',
    description: 'Activity owners and development teams cannot approve their own processing activities or DPIA assessments.',
    control_type: ControlType.ORGANIZATIONAL,
    owner_domain: 'governance',
    implementation_reference: 'mindos/privacy_governance/policies/reviewer_eligibility.ts',
    status: 'IMPLEMENTED',
    evidence_requirement: 'Access control matrix & DPO appointment record',
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: '01918b00-0006-7000-8000-000000000006',
    code: 'PC-LEG-001',
    name: 'Data Protection Addendum & Subprocessor Binding',
    description: 'Standard contractual terms binding processors and subprocessors under KDPA Section 42 requirements.',
    control_type: ControlType.LEGAL,
    owner_domain: 'legal',
    implementation_reference: 'Contract Vault / DPA Archive',
    status: 'IMPLEMENTED',
    evidence_requirement: 'Executed DPA document reference',
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: '01918b00-0007-7000-8000-000000000007',
    code: 'PC-LEG-002',
    name: 'KDPA Cross-Border Statutory Transfer Safeguards',
    description: 'Appropriate safeguards under KDPA Section 48/49 (Adequacy, SCCs, or Explicit Consent) before transborder flow.',
    control_type: ControlType.LEGAL,
    owner_domain: 'privacy_governance',
    implementation_reference: 'mindos/privacy_governance/transfers/cross_border.ts',
    status: 'IMPLEMENTED',
    evidence_requirement: 'ODPC Cross-border filing / Transfer Risk Assessment',
    created_at: '2026-01-01T00:00:00Z'
  },
  {
    id: '01918b00-0008-7000-8000-000000000008',
    code: 'PC-OPS-001',
    name: 'Continuous Privacy Reconciliation & Drift Daemon',
    description: 'Daemon running every 60 seconds detecting unapproved processors, expired approvals, and unauthorized data flows.',
    control_type: ControlType.OPERATIONAL,
    owner_domain: 'privacy_governance',
    implementation_reference: 'mindos/privacy_governance/infrastructure/reconciliation.ts',
    status: 'IMPLEMENTED',
    evidence_requirement: 'Reconciliation log telemetry',
    created_at: '2026-01-01T00:00:00Z'
  }
];
