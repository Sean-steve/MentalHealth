/**
 * MindOS Canonical Privacy Governance Errors
 * Authority: Master Architecture Index Section 6, Volume IX & Appendix J
 * ADR-006, ADR-016, Kenya Data Protection Act 2019
 */

export {
  PrivacyGovernanceError,
  PrivacyDPIARequiredError,
  PrivacyDPIANotApprovedError,
  PrivacyHighResidualRiskError,
  PrivacyProcessingNotRegisteredError,
  PrivacyProcessingVersionNotApprovedError,
  PrivacyControlRequiredError,
  PrivacyTransferNotApprovedError,
  PrivacyProcessorNotApprovedError,
  PrivacyApprovalExpiredError,
  PrivacyApprovalRevokedError
} from '../../platform/errors/index.js';
