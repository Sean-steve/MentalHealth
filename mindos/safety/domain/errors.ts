/**
 * MindOS Clinical Safety Kernel Canonical Errors
 * Authority: Master Architecture Index Section 6, Volume IX & Appendix J
 */

import { MindOSError } from '../../platform/errors/index.js';

export class SafetySignalInvalidError extends MindOSError {
  public readonly errorCode = 'SAFETY_SIGNAL_INVALID';
  public readonly httpStatus = 422;
  constructor(message = 'The provided safety signal data is invalid or missing required clinical taxonomy.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'The safety signal could not be processed due to invalid parameters.',
      details
    });
  }
}

export class SafetyRiskStateUnknownError extends MindOSError {
  public readonly errorCode = 'SAFETY_RISK_STATE_UNKNOWN';
  public readonly httpStatus = 404;
  constructor(message = 'Authoritative risk state could not be resolved for the subject.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Authoritative risk state could not be determined.',
      details
    });
  }
}

export class SafetyPolicyUnavailableError extends MindOSError {
  public readonly errorCode = 'SAFETY_POLICY_UNAVAILABLE';
  public readonly httpStatus = 503;
  constructor(message = 'Clinical safety policy is unavailable or has not received clinical governance sign-off.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Safety evaluation policy is temporarily unavailable.',
      details
    });
  }
}

export class SafetyActionFailedError extends MindOSError {
  public readonly errorCode = 'SAFETY_ACTION_FAILED';
  public readonly httpStatus = 500;
  constructor(message = 'Execution of a mandatory safety action failed.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Safety action dispatch failed.',
      details
    });
  }
}

export class SafetyEscalationRequiredError extends MindOSError {
  public readonly errorCode = 'SAFETY_ESCALATION_REQUIRED';
  public readonly httpStatus = 409;
  constructor(message = 'Human clinical review escalation is mandatory before completing this operation.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Human escalation review is required.',
      details
    });
  }
}

export class SafetyEscalationUnavailableError extends MindOSError {
  public readonly errorCode = 'SAFETY_ESCALATION_UNAVAILABLE';
  public readonly httpStatus = 503;
  constructor(message = 'Designated escalation review team is currently unreachable.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Human review escalation is temporarily unavailable.',
      details
    });
  }
}

export class SafetyResourceUnavailableError extends MindOSError {
  public readonly errorCode = 'SAFETY_RESOURCE_UNAVAILABLE';
  public readonly httpStatus = 404;
  constructor(message = 'No verified crisis resource found matching jurisdiction and clinical criteria.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Appropriate verified safety resources are currently unavailable.',
      details
    });
  }
}

export class SafetyResourceExpiredError extends MindOSError {
  public readonly errorCode = 'SAFETY_RESOURCE_EXPIRED';
  public readonly httpStatus = 410;
  constructor(message = 'The requested safety resource verification has expired and cannot be presented.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'The requested crisis resource verification has expired.',
      details
    });
  }
}

export class SafetyReviewRequiredError extends MindOSError {
  public readonly errorCode = 'SAFETY_REVIEW_REQUIRED';
  public readonly httpStatus = 403;
  constructor(message = 'A clinical reviewer must validate this risk state transition.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Clinical review authorization required for this risk change.',
      details
    });
  }
}

export class SafetyAccessDeniedError extends MindOSError {
  public readonly errorCode = 'SAFETY_ACCESS_DENIED';
  public readonly httpStatus = 403;
  constructor(message = 'Actor does not possess the requisite clinical safety review role or jurisdiction scope.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Access to clinical safety data or operations is denied.',
      details
    });
  }
}

export class SafetyBreakGlassExpiredError extends MindOSError {
  public readonly errorCode = 'SAFETY_BREAK_GLASS_EXPIRED';
  public readonly httpStatus = 403;
  constructor(message = 'The emergency break-glass authorization lease has expired.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Emergency access lease has expired.',
      details
    });
  }
}

export class SafetyBreakGlassUnauthorizedError extends MindOSError {
  public readonly errorCode = 'SAFETY_BREAK_GLASS_UNAUTHORIZED';
  public readonly httpStatus = 403;
  constructor(message = 'Actor is not eligible to invoke emergency break-glass protocols.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Unauthorized to initiate emergency break-glass.',
      details
    });
  }
}

export class IllegalRiskStateTransitionError extends MindOSError {
  public readonly errorCode = 'ILLEGAL_RISK_STATE_TRANSITION';
  public readonly httpStatus = 409;
  constructor(message = 'Illegal risk state transition forbidden by clinical safety policy.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Invalid clinical risk transition.',
      details
    });
  }
}
