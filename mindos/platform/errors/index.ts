/**
 * MindOS Canonical Error Architecture
 * Authority: Master Architecture Index Section 6, Volume IX & Appendix J
 */

import { CorrelationManager } from '../shared/correlation.js';

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    request_id: string;
    details?: Record<string, unknown>;
  };
}

export abstract class MindOSError extends Error {
  public abstract readonly errorCode: string;
  public abstract readonly httpStatus: number;
  public readonly correlationId: string;
  public readonly safeUserMessage: string;
  public readonly internalContext?: Record<string, unknown>;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      safeUserMessage?: string;
      internalContext?: Record<string, unknown>;
      details?: Record<string, unknown>;
      correlationId?: string;
      errorCode?: string;
      statusCode?: number;
      httpStatus?: number;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.correlationId = options.correlationId || CorrelationManager.get().correlationId;
    this.safeUserMessage = options.safeUserMessage || 'An unexpected operational error occurred.';
    this.internalContext = options.internalContext;
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get statusCode(): number {
    return this.httpStatus;
  }

  public toEnvelope(requestId?: string): ErrorEnvelope {
    const activeRequestId = requestId || CorrelationManager.get().requestId;
    return {
      error: {
        code: this.errorCode,
        message: this.safeUserMessage,
        request_id: activeRequestId,
        ...(this.details && Object.keys(this.details).length > 0 ? { details: this.details } : {})
      }
    };
  }

  public toRFC7807(instancePath?: string): Record<string, unknown> {
    const activeRequestId = CorrelationManager.get().requestId;
    return {
      type: `https://mindos.dev/errors/${this.errorCode}`,
      title: this.name,
      status: this.httpStatus,
      detail: this.safeUserMessage,
      instance: instancePath || undefined,
      correlation_id: this.correlationId,
      request_id: activeRequestId,
      ...(this.details && Object.keys(this.details).length > 0 ? { invalid_params: this.details } : {})
    };
  }
}

export class ValidationError extends MindOSError {
  public readonly errorCode = 'VAL_001';
  public readonly httpStatus = 422;
  constructor(message: string, options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown>; safeUserMessage?: string } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'The provided request data failed validation.'
    });
  }
}

export class AuthenticationError extends MindOSError {
  public readonly errorCode: string;
  public readonly httpStatus: number;
  constructor(
    message: string,
    options: {
      errorCode?: 'AUTH_001' | 'AUTH_002' | 'AUTH_003' | 'AUTH_004' | 'AUTH_005' | 'AUTH_006';
      safeUserMessage?: string;
      internalContext?: Record<string, unknown>;
      httpStatus?: number;
    } = {}
  ) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'Authentication credentials invalid or session expired.'
    });
    this.errorCode = options.errorCode || 'AUTH_001';
    this.httpStatus = options.httpStatus || (this.errorCode === 'AUTH_002' ? 423 : 401);
  }
}

export class AuthorizationError extends MindOSError {
  public readonly errorCode: string;
  public readonly httpStatus = 403;
  constructor(
    message: string,
    options: {
      errorCode?: 'AUTHZ_001' | 'AUTHZ_002' | 'AUTHZ_003' | 'AUTHZ_004';
      safeUserMessage?: string;
      internalContext?: Record<string, unknown>;
    } = {}
  ) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'Access to this resource is denied.'
    });
    this.errorCode = options.errorCode || 'AUTHZ_001';
  }
}

export class SecurityError extends MindOSError {
  public readonly errorCode: string;
  public readonly httpStatus = 403;
  constructor(
    message: string,
    options: {
      errorCode?: string;
      safeUserMessage?: string;
      internalContext?: Record<string, unknown>;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'A security policy violation occurred.'
    });
    this.errorCode = options.errorCode || 'SEC_001';
  }
}

export class NotFoundError extends MindOSError {
  public readonly errorCode = 'RES_001';
  public readonly httpStatus = 404;
  constructor(message: string = 'Resource not found', options: { safeUserMessage?: string; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'The requested resource does not exist.'
    });
  }
}

export class ConflictError extends MindOSError {
  public readonly errorCode: string;
  public readonly httpStatus = 409;
  constructor(
    message: string,
    options: {
      errorCode?: string;
      safeUserMessage?: string;
      details?: Record<string, unknown>;
      internalContext?: Record<string, unknown>;
    } = {}
  ) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'The requested operation conflicts with current resource state.'
    });
    this.errorCode = options.errorCode || 'DATA_002';
  }
}

export class DomainInvariantError extends MindOSError {
  public override readonly errorCode: string = 'SAFE_004';
  public override readonly httpStatus: number = 409;
  constructor(
    message: string,
    options: {
      safeUserMessage?: string;
      internalContext?: Record<string, unknown>;
      details?: Record<string, unknown>;
      errorCode?: string;
      statusCode?: number;
      httpStatus?: number;
      correlationId?: string;
    } = {}
  ) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'Domain invariant rule violation.'
    });
    if (options.errorCode) this.errorCode = options.errorCode;
    if (options.httpStatus) this.httpStatus = options.httpStatus;
    else if (options.statusCode) this.httpStatus = options.statusCode;
  }
}

// Canonical Aliases for domain & authorization compatibility
export { AuthorizationError as ForbiddenError };
export { DomainInvariantError as DomainError };

export class ConsentRequiredError extends MindOSError {
  public readonly errorCode: string;
  public readonly httpStatus = 403;
  constructor(message: string = 'Explicit user consent required for this operation', options: { errorCode?: string; safeUserMessage?: string; details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'Explicit user consent is required before performing this action.'
    });
    this.errorCode = options.errorCode || 'CONS_001';
  }
}

export class ConsentNotFoundError extends MindOSError {
  public readonly errorCode = 'CONS_002';
  public readonly httpStatus = 404;
  constructor(message: string = 'Consent record or definition not found', options: { safeUserMessage?: string; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'The requested consent definition or record was not found.'
    });
  }
}

export class ConsentAlreadyWithdrawnError extends MindOSError {
  public readonly errorCode = 'CONS_003';
  public readonly httpStatus = 409;
  constructor(message: string = 'Consent has already been withdrawn', options: { safeUserMessage?: string; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'This consent has already been withdrawn.'
    });
  }
}

export class ConsentScopeInvalidError extends MindOSError {
  public readonly errorCode = 'CONS_004';
  public readonly httpStatus = 400;
  constructor(message: string = 'Consent scope or category is invalid for the requested operation', options: { safeUserMessage?: string; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'The requested resource is outside the authorized consent scope.'
    });
  }
}

export class ConsentRecipientInvalidError extends MindOSError {
  public readonly errorCode = 'CONS_005';
  public readonly httpStatus = 403;
  constructor(message: string = 'Recipient actor is not authorized under this consent grant', options: { safeUserMessage?: string; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'You are not an authorized recipient for this shared data.'
    });
  }
}

export class GovernanceBlockedError extends MindOSError {
  public readonly errorCode: string;
  public readonly httpStatus = 409;
  constructor(message: string, options: { errorCode?: string; safeUserMessage?: string; details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'Action blocked by mandatory governance gate.'
    });
    this.errorCode = options.errorCode || 'GOV_001';
  }
}

export class RateLimitError extends MindOSError {
  public readonly errorCode = 'RATE_001';
  public readonly httpStatus = 429;
  constructor(message: string = 'Rate limit exceeded', options: { safeUserMessage?: string; details?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'Request rate limit exceeded. Please try again later.'
    });
  }
}

export class ExternalServiceError extends MindOSError {
  public readonly errorCode: string;
  public readonly httpStatus = 503;
  constructor(message: string, options: { errorCode?: string; safeUserMessage?: string; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'The requested external service is temporarily unavailable.'
    });
    this.errorCode = options.errorCode || 'PAY_001';
  }
}

export class InfrastructureError extends MindOSError {
  public readonly errorCode = 'SAFE_003';
  public readonly httpStatus = 503;
  constructor(message: string, options: { safeUserMessage?: string; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'Internal infrastructure service unavailable.'
    });
  }
}

export class PrivacyGovernanceError extends MindOSError {
  public readonly errorCode: string = 'PRIV_001';
  public readonly httpStatus: number = 403;
  constructor(message: string, options: { errorCode?: string; httpStatus?: number; safeUserMessage?: string; internalContext?: Record<string, unknown>; details?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'Privacy governance policy blocked this operation.'
    });
    if (options.errorCode) this.errorCode = options.errorCode;
    if (options.httpStatus) this.httpStatus = options.httpStatus;
  }
}

export class PrivacyDPIARequiredError extends PrivacyGovernanceError {
  public override readonly errorCode = 'PRIV_001';
  public override readonly httpStatus = 403;
  constructor(message = 'DPIA required before processing this high-risk data category', options = {}) {
    super(message, {
      ...options,
      errorCode: 'PRIV_001',
      httpStatus: 403,
      safeUserMessage: 'Data Protection Impact Assessment (DPIA) required prior to activating this processing activity.'
    });
  }
}

export class PrivacyDPIANotApprovedError extends PrivacyGovernanceError {
  public override readonly errorCode = 'PRIV_002';
  public override readonly httpStatus = 403;
  constructor(message = 'DPIA has not been approved by Data Protection Officer', options = {}) {
    super(message, {
      ...options,
      errorCode: 'PRIV_002',
      httpStatus: 403,
      safeUserMessage: 'Processing activity blocked: Data Protection Officer approval is required.'
    });
  }
}

export class PrivacyHighResidualRiskError extends PrivacyGovernanceError {
  public override readonly errorCode = 'PRIV_003';
  public override readonly httpStatus = 403;
  constructor(message = 'DPIA residual risk remains HIGH or CRITICAL; sign-off blocked', options = {}) {
    super(message, {
      ...options,
      errorCode: 'PRIV_003',
      httpStatus: 403,
      safeUserMessage: 'High residual privacy risk identified; mandatory mitigation controls required.'
    });
  }
}

export class PrivacyProcessingNotRegisteredError extends PrivacyGovernanceError {
  public override readonly errorCode = 'PRIV_004';
  public override readonly httpStatus = 404;
  constructor(message = 'Processing activity is not registered in the Processing Activity Registry', options = {}) {
    super(message, {
      ...options,
      errorCode: 'PRIV_004',
      httpStatus: 404,
      safeUserMessage: 'Unregistered data processing activity cannot be executed.'
    });
  }
}

export class PrivacyProcessingVersionNotApprovedError extends PrivacyGovernanceError {
  public override readonly errorCode = 'PRIV_005';
  public override readonly httpStatus = 403;
  constructor(message = 'Current processing activity version does not have valid privacy approval', options = {}) {
    super(message, {
      ...options,
      errorCode: 'PRIV_005',
      httpStatus: 403,
      safeUserMessage: 'The active version of this processing activity has not received privacy approval.'
    });
  }
}

export class PrivacyControlRequiredError extends PrivacyGovernanceError {
  public override readonly errorCode = 'PRIV_006';
  public override readonly httpStatus = 403;
  constructor(message = 'Mandatory privacy control not implemented or verified', options = {}) {
    super(message, {
      ...options,
      errorCode: 'PRIV_006',
      httpStatus: 403,
      safeUserMessage: 'Required privacy technical safeguard has not been verified.'
    });
  }
}

export class PrivacyTransferNotApprovedError extends PrivacyGovernanceError {
  public override readonly errorCode = 'PRIV_007';
  public override readonly httpStatus = 403;
  constructor(message = 'Cross-border data transfer lacks statutory safeguards under KDPA Section 48/49', options = {}) {
    super(message, {
      ...options,
      errorCode: 'PRIV_007',
      httpStatus: 403,
      safeUserMessage: 'Cross-border data transfer not authorized under statutory privacy safeguards.'
    });
  }
}

export class PrivacyProcessorNotApprovedError extends PrivacyGovernanceError {
  public override readonly errorCode = 'PRIV_008';
  public override readonly httpStatus = 403;
  constructor(message = 'Processor or subprocessor is not approved for this data category', options = {}) {
    super(message, {
      ...options,
      errorCode: 'PRIV_008',
      httpStatus: 403,
      safeUserMessage: 'External processor is not approved for this data category.'
    });
  }
}

export class PrivacyApprovalExpiredError extends PrivacyGovernanceError {
  public override readonly errorCode = 'PRIV_009';
  public override readonly httpStatus = 403;
  constructor(message = 'Privacy approval certificate has expired; mandatory re-assessment required', options = {}) {
    super(message, {
      ...options,
      errorCode: 'PRIV_009',
      httpStatus: 403,
      safeUserMessage: 'Privacy approval certificate has expired. Periodic re-assessment required.'
    });
  }
}

export class PrivacyApprovalRevokedError extends PrivacyGovernanceError {
  public override readonly errorCode = 'PRIV_010';
  public override readonly httpStatus = 403;
  constructor(message = 'Privacy approval certificate has been revoked', options = {}) {
    super(message, {
      ...options,
      errorCode: 'PRIV_010',
      httpStatus: 403,
      safeUserMessage: 'Privacy approval has been revoked. Processing is suspended.'
    });
  }
}

export class RegulatoryGovernanceError extends MindOSError {
  public readonly errorCode: string = 'REG_001';
  public readonly httpStatus: number = 403;
  constructor(message: string, options: { errorCode?: string; httpStatus?: number; safeUserMessage?: string; internalContext?: Record<string, unknown>; details?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: options.safeUserMessage || 'Regulatory governance policy blocked this operation.'
    });
    if (options.errorCode) this.errorCode = options.errorCode;
    if (options.httpStatus) this.httpStatus = options.httpStatus;
  }
}

export class RegulatoryClassificationRequiredError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_001';
  public override readonly httpStatus = 403;
  constructor(message = 'Regulatory classification required before resource activation', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_001',
      httpStatus: 403,
      safeUserMessage: 'Resource requires formal regulatory classification for the target jurisdiction.'
    });
  }
}

export class RegulatoryReviewRequiredError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_002';
  public override readonly httpStatus = 403;
  constructor(message = 'Regulatory review required by authorized regulatory counsel', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_002',
      httpStatus: 403,
      safeUserMessage: 'Regulatory review is mandatory before activating this governed capability.'
    });
  }
}

export class RegulatoryApprovalRequiredError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_003';
  public override readonly httpStatus = 403;
  constructor(message = 'Active regulatory approval required in target jurisdiction', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_003',
      httpStatus: 403,
      safeUserMessage: 'Governed capability lacks valid regulatory approval in the target jurisdiction.'
    });
  }
}

export class RegulatoryRequirementUnresolvedError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_004';
  public override readonly httpStatus = 403;
  constructor(message = 'Mandatory regulatory requirement remains unresolved', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_004',
      httpStatus: 403,
      safeUserMessage: 'Mandatory statutory or regulatory requirement has not been satisfied.'
    });
  }
}

export class RegulatoryControlFailedError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_005';
  public override readonly httpStatus = 403;
  constructor(message = 'Regulatory control verification failed or has expired', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_005',
      httpStatus: 403,
      safeUserMessage: 'Verification of required regulatory control failed.'
    });
  }
}

export class RegulatoryBlockingGapError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_006';
  public override readonly httpStatus = 403;
  constructor(message = 'Blocking regulatory gap prevents production activation', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_006',
      httpStatus: 403,
      safeUserMessage: 'Release blocked due to outstanding critical regulatory compliance gap.'
    });
  }
}

export class RegulatoryCertificationRequiredError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_007';
  public override readonly httpStatus = 403;
  constructor(message = 'Mandatory statutory certification or registration missing', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_007',
      httpStatus: 403,
      safeUserMessage: 'Operation requires valid regulatory authority registration or certification.'
    });
  }
}

export class RegulatoryApprovalExpiredError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_008';
  public override readonly httpStatus = 403;
  constructor(message = 'Regulatory approval has expired and requires reassessment', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_008',
      httpStatus: 403,
      safeUserMessage: 'Regulatory approval period has expired. Re-assessment is required.'
    });
  }
}

export class RegulatoryApprovalRevokedError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_009';
  public override readonly httpStatus = 403;
  constructor(message = 'Regulatory approval has been suspended or revoked', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_009',
      httpStatus: 403,
      safeUserMessage: 'Regulatory approval has been suspended or revoked.'
    });
  }
}

export class RegulatoryJurisdictionNotApprovedError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_010';
  public override readonly httpStatus = 403;
  constructor(message = 'Governed resource not approved for deployment in requested jurisdiction', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_010',
      httpStatus: 403,
      safeUserMessage: 'Jurisdiction-specific regulatory approval not found for the specified country.'
    });
  }
}

export class RegulatorySourceReviewRequiredError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_011';
  public override readonly httpStatus = 403;
  constructor(message = 'Underlying statutory source amended: regulatory reassessment required', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_011',
      httpStatus: 403,
      safeUserMessage: 'Regulatory baseline change detected. Reassessment is mandated before release.'
    });
  }
}

export class RegulatoryReviewerUnauthorizedError extends RegulatoryGovernanceError {
  public override readonly errorCode = 'REG_012';
  public override readonly httpStatus = 403;
  constructor(message = 'Reviewer not authorized for regulatory legal assessment in jurisdiction', options = {}) {
    super(message, {
      ...options,
      errorCode: 'REG_012',
      httpStatus: 403,
      safeUserMessage: 'Reviewer is not authorized to sign off on statutory regulatory assessments.'
    });
  }
}

export abstract class AssessmentError extends MindOSError {}

export class AssessmentNotAvailableError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_001';
  public override readonly httpStatus = 404;
  constructor(message = 'Assessment instrument is not available or inactive', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The requested assessment instrument is currently unavailable.'
    });
  }
}

export class AssessmentNotEligibleError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_002';
  public override readonly httpStatus = 403;
  constructor(message = 'Subject is not eligible for this assessment', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'You are currently not eligible to complete this assessment.'
    });
  }
}

export class AssessmentConsentRequiredError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_003';
  public override readonly httpStatus = 403;
  constructor(message = 'Mandatory assessment consent is required before starting', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Informed clinical screening consent is required to begin this assessment.'
    });
  }
}

export class AssessmentSessionExpiredError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_004';
  public override readonly httpStatus = 410;
  constructor(message = 'Assessment session has expired', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This assessment session has expired. Please start a new session.'
    });
  }
}

export class AssessmentAlreadyCompletedError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_005';
  public override readonly httpStatus = 409;
  constructor(message = 'Assessment session has already been completed and submitted', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This assessment has already been completed and submitted.'
    });
  }
}

export class AssessmentResponseInvalidError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_006';
  public override readonly httpStatus = 400;
  constructor(message = 'Response validation failed against question schema', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'One or more of your responses are invalid or out of allowed range.'
    });
  }
}

export class AssessmentIncompleteError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_007';
  public override readonly httpStatus = 422;
  constructor(message = 'Cannot submit incomplete assessment; required questions unanswered', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'All required questions must be answered before submitting.'
    });
  }
}

export class AssessmentScoringFailedError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_008';
  public override readonly httpStatus = 500;
  constructor(message = 'Deterministic scoring calculation failed', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'An error occurred while scoring your responses. Please retry.'
    });
  }
}

export class AssessmentResultInvalidatedError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_009';
  public override readonly httpStatus = 410;
  constructor(message = 'Assessment result has been invalidated by clinical review or governance defect', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This assessment result is no longer valid due to a clinical update.'
    });
  }
}

export class AssessmentVersionRevokedError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_010';
  public override readonly httpStatus = 403;
  constructor(message = 'Assessment version has been revoked or suspended under clinical governance', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This assessment version has been withdrawn by clinical governance.'
    });
  }
}

export class AssessmentRetakeNotAllowedError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_011';
  public override readonly httpStatus = 429;
  constructor(message = 'Assessment retake interval cooldown has not elapsed', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The recommended retake waiting period has not yet elapsed.'
    });
  }
}

export class AssessmentSessionNotFoundError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_012';
  public override readonly httpStatus = 404;
  constructor(message = 'Assessment session not found', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The specified assessment session could not be found.'
    });
  }
}

export class AssessmentBranchViolationError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_013';
  public override readonly httpStatus = 400;
  constructor(message = 'Response submitted for hidden or non-applicable branched question', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Invalid response for a non-applicable question.'
    });
  }
}

export class AssessmentIdorViolationError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_014';
  public override readonly httpStatus = 403;
  constructor(message = 'Access to assessment session or result forbidden for current user', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'You are not authorized to view or modify this assessment.'
    });
  }
}

export class AssessmentDriftDetectedError extends AssessmentError {
  public override readonly errorCode = 'ASSESS_015';
  public override readonly httpStatus = 500;
  constructor(message = 'Assessment version or scoring model drift detected against clinical governance baseline', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'A clinical governance integrity check failed. New executions halted.'
    });
  }
}

// ==========================================
// CANONICAL CONTENT & PSYCHOEDUCATION ERRORS (SPRINT 16 - APPENDIX J)
// ==========================================

export abstract class ContentError extends MindOSError {
  public override readonly httpStatus: number = 400;
}

export class ContentNotFoundError extends ContentError {
  public override readonly errorCode = 'CONTENT_001';
  public override readonly httpStatus = 404;
  constructor(message = 'Requested content definition or version not found', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The requested mental health content or guide could not be found.'
    });
  }
}

export class ContentNotAvailableError extends ContentError {
  public override readonly errorCode = 'CONTENT_002';
  public override readonly httpStatus = 403;
  constructor(message = 'Content item is currently unavailable in this jurisdiction or channel', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This content is not currently available for delivery in your jurisdiction.'
    });
  }
}

export class ContentNotEligibleError extends ContentError {
  public override readonly errorCode = 'CONTENT_003';
  public override readonly httpStatus = 403;
  constructor(message = 'Subject is not eligible for this guided exercise or content item based on age, risk, or consent', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'You are not currently eligible to access this guided exercise.'
    });
  }
}

export class ContentVersionNotApprovedError extends ContentError {
  public override readonly errorCode = 'CONTENT_004';
  public override readonly httpStatus = 400;
  constructor(message = 'Content version has not received the required clinical and editorial governance approvals', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This content version is still undergoing governance review and cannot be delivered.'
    });
  }
}

export class ContentVersionSuspendedError extends ContentError {
  public override readonly errorCode = 'CONTENT_005';
  public override readonly httpStatus = 403;
  constructor(message = 'Content version is suspended due to clinical safety or regulatory review', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This content is temporarily suspended pending safety review.'
    });
  }
}

export class ContentVersionExpiredError extends ContentError {
  public override readonly errorCode = 'CONTENT_006';
  public override readonly httpStatus = 410;
  constructor(message = 'Content version has expired and requires clinical re-validation', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This content version has expired and is undergoing periodic re-validation.'
    });
  }
}

export class ContentLocalizationUnavailableError extends ContentError {
  public override readonly errorCode = 'CONTENT_007';
  public override readonly httpStatus = 404;
  constructor(message = 'Requested localization is not available or has not completed clinical review', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The requested translation is not available in an approved format.'
    });
  }
}

export class ContentPublicationBlockedError extends ContentError {
  public override readonly errorCode = 'CONTENT_008';
  public override readonly httpStatus = 400;
  constructor(message = 'Content publication blocked by governance, privacy, or safety preconditions', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Cannot publish content due to outstanding governance preconditions.'
    });
  }
}

export class ContentClinicalApprovalRequiredError extends ContentError {
  public override readonly errorCode = 'CONTENT_009';
  public override readonly httpStatus = 400;
  constructor(message = 'Content contains clinical claims or psychoeducational guidance requiring Clinical Governance approval', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Clinical content requires formal Clinical Governance approval prior to publication.'
    });
  }
}

export class ContentResourceExpiredError extends ContentError {
  public override readonly errorCode = 'CONTENT_010';
  public override readonly httpStatus = 400;
  constructor(message = 'Crisis or external safety resource reference has expired and must be updated from registry', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'A referenced crisis safety resource is out of date.'
    });
  }
}

export class ContentExerciseInvalidStateError extends ContentError {
  public override readonly errorCode = 'CONTENT_011';
  public override readonly httpStatus = 400;
  constructor(message = 'Invalid state transition or action for guided exercise session', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The exercise session is not in a valid state for this action.'
    });
  }
}

export class ContentIdorViolationError extends ContentError {
  public override readonly errorCode = 'CONTENT_012';
  public override readonly httpStatus = 403;
  constructor(message = 'Access to exercise session, bookmark, or user progress forbidden for current user', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'You are not authorized to view or modify this resource.'
    });
  }
}

export class ContentClaimTamperingError extends ContentError {
  public override readonly errorCode = 'CONTENT_013';
  public override readonly httpStatus = 400;
  constructor(message = 'Clinical claim has been tampered with or does not match approved evidence reference', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Content integrity error: clinical claim validation failed.'
    });
  }
}

export class ContentPrerequisiteNotMetError extends ContentError {
  public override readonly errorCode = 'CONTENT_014';
  public override readonly httpStatus = 400;
  constructor(message = 'Prerequisite content item has not been completed', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'You must complete the prerequisite content before accessing this item.'
    });
  }
}

// ==============================================================================
// Professional Network & Provider Verification Errors (Sprint 19, Appendix J)
// ==============================================================================

export abstract class ProfessionalError extends MindOSError {}

export class ProfessionalProfileRequiredError extends ProfessionalError {
  public override readonly errorCode = 'PROFESSIONAL_PROFILE_REQUIRED';
  public override readonly httpStatus = 404;
  constructor(message = 'A verified professional profile is required for this operation', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Professional profile was not found or is required for this action.'
    });
  }
}

export class ProfessionalNotVerifiedError extends ProfessionalError {
  public override readonly errorCode = 'PROFESSIONAL_NOT_VERIFIED';
  public override readonly httpStatus = 403;
  constructor(message = 'Professional is not currently in a verified status', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This action requires a fully verified professional credential.'
    });
  }
}

export class ProfessionalSuspendedError extends ProfessionalError {
  public override readonly errorCode = 'PROFESSIONAL_SUSPENDED';
  public override readonly httpStatus = 403;
  constructor(message = 'Professional is currently suspended from clinical care and network delivery', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Provider is suspended from active service delivery.'
    });
  }
}

export class ProfessionalCredentialRequiredError extends ProfessionalError {
  public override readonly errorCode = 'PROFESSIONAL_CREDENTIAL_REQUIRED';
  public override readonly httpStatus = 400;
  constructor(message = 'Mandatory professional credential or license document is required', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'A valid credential document or registration is required.'
    });
  }
}

export class ProfessionalCredentialExpiredError extends ProfessionalError {
  public override readonly errorCode = 'PROFESSIONAL_CREDENTIAL_EXPIRED';
  public override readonly httpStatus = 400;
  constructor(message = 'Professional credential or regulatory registration has expired', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Professional credential or license has expired and must be renewed.'
    });
  }
}

export class ProfessionalScopeDeniedError extends ProfessionalError {
  public override readonly errorCode = 'PROFESSIONAL_SCOPE_DENIED';
  public override readonly httpStatus = 403;
  constructor(message = 'Requested service, population, or modality falls outside verified scope of practice', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The requested action falls outside the verified scope of clinical practice.'
    });
  }
}

export class ProviderNotDiscoverableError extends ProfessionalError {
  public override readonly errorCode = 'PROVIDER_NOT_DISCOVERABLE';
  public override readonly httpStatus = 404;
  constructor(message = 'Provider does not meet current discoverability policy requirements', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Provider is not available in public directory search.'
    });
  }
}

export class ProviderServiceNotAvailableError extends ProfessionalError {
  public override readonly errorCode = 'PROVIDER_SERVICE_NOT_AVAILABLE';
  public override readonly httpStatus = 404;
  constructor(message = 'Provider service offering is not active or available', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The requested provider service is currently unavailable.'
    });
  }
}

export class ProviderJurisdictionDeniedError extends ProfessionalError {
  public override readonly errorCode = 'PROVIDER_JURISDICTION_DENIED';
  public override readonly httpStatus = 403;
  constructor(message = 'Provider is not licensed or authorized to practice in the requested jurisdiction', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Provider is not licensed to deliver care in this jurisdiction.'
    });
  }
}

export class ProviderVerificationRequiredError extends ProfessionalError {
  public override readonly errorCode = 'PROVIDER_VERIFICATION_REQUIRED';
  public override readonly httpStatus = 403;
  constructor(message = 'Action requires formal provider verification', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Provider verification is required.'
    });
  }
}

export class SelfVerificationProhibitedError extends ProfessionalError {
  public override readonly errorCode = 'SELF_VERIFICATION_PROHIBITED';
  public override readonly httpStatus = 403;
  constructor(message = 'Applicant cannot verify or approve their own professional credentials (separation of duties)', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Self-verification is strictly prohibited by governance policy.'
    });
  }
}

export class SeparationOfDutiesViolationError extends ProfessionalError {
  public override readonly errorCode = 'SEPARATION_OF_DUTIES_VIOLATION';
  public override readonly httpStatus = 403;
  constructor(message = 'Action violates clinical or regulatory separation of duties', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Action cannot be performed due to separation of duties conflict.'
    });
  }
}

export class DuplicateProfessionalRegistrationError extends ProfessionalError {
  public override readonly errorCode = 'DUPLICATE_REGISTRATION_NUMBER';
  public override readonly httpStatus = 409;
  constructor(message = 'A verified registration with this authority and license number is already attached to another profile', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Registration number is already registered to an existing professional profile.'
    });
  }
}

export class ClinicalAccessRelationshipRequiredError extends ProfessionalError {
  public override readonly errorCode = 'CLINICAL_ACCESS_RELATIONSHIP_REQUIRED';
  public override readonly httpStatus = 403;
  constructor(message = 'Provider verification does not confer user data access without an active referral handoff or care relationship', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Access denied. Clinical data access requires an active referral or care relationship.'
    });
  }
}

export class EvidenceTamperingDetectedError extends ProfessionalError {
  public override readonly errorCode = 'EVIDENCE_TAMPERING_DETECTED';
  public override readonly httpStatus = 400;
  constructor(message = 'Credential evidence integrity hash does not match Evidence Vault tamper-evident record', options = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Evidence integrity verification failed. Document may have been modified.'
    });
  }
}

// ============================================================================
// Sprint 20 Canonical Appointment & Availability Error Codes (Appendix J)
// ============================================================================

export class AppointmentSlotUnavailableError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_SLOT_UNAVAILABLE';
  public readonly httpStatus = 409;
  constructor(message = 'The requested appointment slot is no longer available.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'That appointment time is no longer available. Please select another slot.'
    });
  }
}

export class AppointmentHoldExpiredError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_HOLD_EXPIRED';
  public readonly httpStatus = 410;
  constructor(message = 'The temporary hold on this appointment slot has expired.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Your hold on this appointment time has expired. Please select a new slot.'
    });
  }
}

export class AppointmentProviderNotEligibleError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_PROVIDER_NOT_ELIGIBLE';
  public readonly httpStatus = 422;
  constructor(message = 'The selected provider is not eligible to deliver this service.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This provider is currently unavailable for new bookings. Please select an eligible provider.'
    });
  }
}

export class AppointmentServiceNotEligibleError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_SERVICE_NOT_ELIGIBLE';
  public readonly httpStatus = 422;
  constructor(message = 'The service offering is not active or not bookable.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The selected service is currently not bookable.'
    });
  }
}

export class AppointmentUserNotEligibleError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_USER_NOT_ELIGIBLE';
  public readonly httpStatus = 422;
  constructor(message = 'The user is not eligible for this appointment type or jurisdiction.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'You are not eligible to book this specific service.'
    });
  }
}

export class AppointmentReferralRequiredError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_REFERRAL_REQUIRED';
  public readonly httpStatus = 422;
  constructor(message = 'An active referral is required to book this clinical service.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'A valid clinical referral is required before scheduling this service.'
    });
  }
}

export class AppointmentInvalidStateError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_INVALID_STATE';
  public readonly httpStatus = 409;
  constructor(message = 'The requested operation is not allowed in the current appointment state.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This appointment cannot be updated in its current status.'
    });
  }
}

export class AppointmentRescheduleNotAllowedError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_RESCHEDULE_NOT_ALLOWED';
  public readonly httpStatus = 409;
  constructor(message = 'Rescheduling is not allowed under the current policy or timeframe.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This appointment cannot be rescheduled under the cancellation and rescheduling policy.'
    });
  }
}

export class AppointmentCancellationNotAllowedError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_CANCELLATION_NOT_ALLOWED';
  public readonly httpStatus = 409;
  constructor(message = 'Cancellation is not allowed under the current policy.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This appointment cannot be cancelled at this time.'
    });
  }
}

export class AppointmentAlreadyCancelledError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_ALREADY_CANCELLED';
  public readonly httpStatus = 409;
  constructor(message = 'The appointment has already been cancelled.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This appointment has already been cancelled.'
    });
  }
}

export class AppointmentAlreadyCompletedError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_ALREADY_COMPLETED';
  public readonly httpStatus = 409;
  constructor(message = 'The appointment has already been completed.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'This appointment has already been marked completed.'
    });
  }
}

export class AppointmentJoinNotAllowedError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_JOIN_NOT_ALLOWED';
  public readonly httpStatus = 403;
  constructor(message = 'You are not authorized to join this session or the join window is closed.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Session access is available only during the scheduled appointment window.'
    });
  }
}

export class AppointmentConflictError extends MindOSError {
  public readonly errorCode = 'APPOINTMENT_CONFLICT';
  public readonly httpStatus = 409;
  constructor(message = 'Conflicting appointment schedule detected.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'A conflicting appointment exists for this provider or subject.'
    });
  }
}

// --- Sprint 23 Canonical Outcome & Clinical Record Errors ---

export class OutcomeMeasureNotFoundError extends MindOSError {
  public readonly errorCode = 'OUTCOME_MEASURE_NOT_FOUND';
  public readonly httpStatus = 404;
  constructor(message = 'The specified outcome measure definition was not found.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The requested clinical outcome measure is not registered.'
    });
  }
}

export class OutcomeMeasurementInvalidError extends MindOSError {
  public readonly errorCode = 'OUTCOME_MEASUREMENT_INVALID';
  public readonly httpStatus = 422;
  constructor(message = 'The outcome measurement payload is invalid.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The outcome measurement value or unit is invalid for this measure.'
    });
  }
}

export class OutcomeMeasurementNotComparableError extends MindOSError {
  public readonly errorCode = 'OUTCOME_MEASUREMENT_NOT_COMPARABLE';
  public readonly httpStatus = 409;
  constructor(message = 'The measurements cannot be compared due to instrument version or unit incompatibility.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'These outcome measurements are not directly comparable.'
    });
  }
}

export class OutcomeInsufficientDataError extends MindOSError {
  public readonly errorCode = 'OUTCOME_INSUFFICIENT_DATA';
  public readonly httpStatus = 422;
  constructor(message = 'Insufficient measurement data to compute a clinical trend.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'Additional measurements are required before a clinical trend can be determined.'
    });
  }
}

export class OutcomeReviewRequiredError extends MindOSError {
  public readonly errorCode = 'OUTCOME_REVIEW_REQUIRED';
  public readonly httpStatus = 428;
  constructor(message = 'A clinical review is required before this action or care plan progression can proceed.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'A clinician review of outcome progress is required.'
    });
  }
}

export class OutcomeAccessDeniedError extends MindOSError {
  public readonly errorCode = 'OUTCOME_ACCESS_DENIED';
  public readonly httpStatus = 403;
  constructor(message = 'Access to this outcome record or measurement is denied.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'You do not have authorization to access this outcome record.'
    });
  }
}

export class OutcomeBaselineInvalidError extends MindOSError {
  public readonly errorCode = 'OUTCOME_BASELINE_INVALID';
  public readonly httpStatus = 422;
  constructor(message = 'The specified baseline is invalid or belongs to another subject/measure.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The selected outcome baseline is invalid.'
    });
  }
}

export class OutcomeSourceInvalidError extends MindOSError {
  public readonly errorCode = 'OUTCOME_SOURCE_INVALID';
  public readonly httpStatus = 422;
  constructor(message = 'The referenced source record is invalid, missing, or invalidated.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'The outcome measurement source record could not be validated.'
    });
  }
}

export class ClinicalTimelineAccessDeniedError extends MindOSError {
  public readonly errorCode = 'CLINICAL_TIMELINE_ACCESS_DENIED';
  public readonly httpStatus = 403;
  constructor(message = 'Access to this clinical timeline or entry is denied.', options: { details?: Record<string, unknown>; internalContext?: Record<string, unknown> } = {}) {
    super(message, {
      ...options,
      safeUserMessage: 'You do not have permission to view this clinical timeline.'
    });
  }
}

/**
 * Format any error into a canonical user-safe error envelope.
 * Invariant: Never leak stack traces, database schemas, or raw internal context to the client.
 */
export function formatErrorResponse(err: unknown, requestId?: string): { status: number; envelope: ErrorEnvelope } {
  if (err instanceof MindOSError) {
    return {
      status: err.httpStatus,
      envelope: err.toEnvelope(requestId)
    };
  }

  const activeRequestId = requestId || CorrelationManager.get().requestId;
  return {
    status: 500,
    envelope: {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'A system error occurred. Our engineering team has been notified.',
        request_id: activeRequestId
      }
    }
  };
}
