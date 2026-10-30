/**
 * MindOS AI Safety Governance Canonical Errors
 * Authority: Master Architecture Index Section 6, Volume IX & Appendix J
 */

import { MindOSError } from '../../platform/errors/index.js';

export class AISystemNotApprovedError extends MindOSError {
  public readonly errorCode = 'AI_SYSTEM_NOT_APPROVED';
  public readonly httpStatus = 403;

  constructor(message = 'AI System is not approved for production use.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'The requested AI capability is not approved for use in this environment.',
      details
    });
  }
}

export class AIConfigurationNotApprovedError extends MindOSError {
  public readonly errorCode = 'AI_CONFIGURATION_NOT_APPROVED';
  public readonly httpStatus = 403;

  constructor(message = 'AI Configuration has not received formal approval.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'The AI system configuration is awaiting formal governance approval.',
      details
    });
  }
}

export class AIModelNotApprovedError extends MindOSError {
  public readonly errorCode = 'AI_MODEL_NOT_APPROVED';
  public readonly httpStatus = 403;

  constructor(message = 'The specified AI model is not approved in this jurisdiction or risk tier.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'The underlying AI model is not authorized for this platform workload.',
      details
    });
  }
}

export class AIProviderNotApprovedError extends MindOSError {
  public readonly errorCode = 'AI_PROVIDER_NOT_APPROVED';
  public readonly httpStatus = 403;

  constructor(message = 'AI Model provider does not have required privacy/security processor approval.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'The AI infrastructure provider is not certified under statutory data protection guidelines.',
      details
    });
  }
}

export class AIPromptNotApprovedError extends MindOSError {
  public readonly errorCode = 'AI_PROMPT_NOT_APPROVED';
  public readonly httpStatus = 403;

  constructor(message = 'Prompt version is not approved or has been modified without re-approval.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'The AI system prompt artifact is not approved or has tampered integrity.',
      details
    });
  }
}

export class AIToolNotApprovedError extends MindOSError {
  public readonly errorCode = 'AI_TOOL_NOT_APPROVED';
  public readonly httpStatus = 403;

  constructor(message = 'Tool invocation requested by AI is not in the approved toolset.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'The requested tool action is prohibited or not authorized for this AI agent.',
      details
    });
  }
}

export class AIDataScopeDeniedError extends MindOSError {
  public readonly errorCode = 'AI_DATA_SCOPE_DENIED';
  public readonly httpStatus = 403;

  constructor(message = 'AI context inclusion violates data access policy (minimum necessary / prohibited category).', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Access to the requested data category is restricted by AI privacy boundaries.',
      details
    });
  }
}

export class AIMemoryConsentRequiredError extends MindOSError {
  public readonly errorCode = 'AI_MEMORY_CONSENT_REQUIRED';
  public readonly httpStatus = 403;

  constructor(message = 'Persistent AI personalization/memory requires explicit user consent.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Explicit user consent for AI memory personalization is required.',
      details
    });
  }
}

export class AIEvaluationRequiredError extends MindOSError {
  public readonly errorCode = 'AI_EVALUATION_REQUIRED';
  public readonly httpStatus = 412;

  constructor(message = 'AI system configuration cannot be approved without completed evaluation suites.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Comprehensive safety and clinical boundary evaluations must be completed before release.',
      details
    });
  }
}

export class AIEvaluationFailedError extends MindOSError {
  public readonly errorCode = 'AI_EVALUATION_FAILED';
  public readonly httpStatus = 412;

  constructor(message = 'AI evaluation suite failed threshold policy.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'AI safety evaluations did not meet required quality thresholds.',
      details
    });
  }
}

export class AICriticalSafetyFailureError extends MindOSError {
  public readonly errorCode = 'AI_CRITICAL_SAFETY_FAILURE';
  public readonly httpStatus = 412;

  constructor(message = 'Hard-gate failure: AI system triggered zero-tolerance critical safety violation.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'The AI release is blocked due to critical safety scenario failures.',
      details
    });
  }
}

export class AIApprovalExpiredError extends MindOSError {
  public readonly errorCode = 'AI_APPROVAL_EXPIRED';
  public readonly httpStatus = 403;

  constructor(message = 'The formal approval for this AI configuration has expired.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'The authorization period for this AI system has lapsed. Re-evaluation is required.',
      details
    });
  }
}

export class AIApprovalRevokedError extends MindOSError {
  public readonly errorCode = 'AI_APPROVAL_REVOKED';
  public readonly httpStatus = 403;

  constructor(message = 'Approval for this AI configuration has been revoked.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'This AI capability has been suspended or revoked by clinical safety governance.',
      details
    });
  }
}

export class AIRuntimeDriftDetectedError extends MindOSError {
  public readonly errorCode = 'AI_RUNTIME_DRIFT_DETECTED';
  public readonly httpStatus = 409;

  constructor(message = 'Runtime configuration hash does not match the approved immutable configuration fingerprint.', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'Execution halted: Runtime configuration divergence detected against approved specification.',
      details
    });
  }
}

export class AIClinicalBoundaryViolationError extends MindOSError {
  public readonly errorCode = 'AI_CLINICAL_BOUNDARY_VIOLATION';
  public readonly httpStatus = 422;

  constructor(message = 'AI output or action attempted to diagnose, prescribe, or violate clinical boundaries (R-AI-002).', details?: Record<string, unknown>) {
    super(message, {
      safeUserMessage: 'AI assistance cannot provide definitive medical diagnosis or prescribe medications.',
      details
    });
  }
}
