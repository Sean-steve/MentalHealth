/**
 * MindOS Governed AI Companion Canonical Domain Errors
 * Authority: Master Architecture Index, Volumes I, IV, XV & Appendices B / H / Q
 */

import { DomainError } from '../../platform/errors/index.js';

export class AISystemUnavailableError extends DomainError {
  constructor(message = 'The AI Companion service is currently unavailable under governance policy.', details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_SYS_001',
      statusCode: 503,
      safeUserMessage: 'Our AI wellbeing companion is temporarily unavailable while undergoing routine safety and governance verification.',
      details
    });
  }
}

export class AIConfigurationResolutionError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_CONF_001',
      statusCode: 500,
      safeUserMessage: 'Unable to resolve an approved AI companion configuration.',
      details
    });
  }
}

export class AIRuntimeDriftError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_DRIFT_001',
      statusCode: 500,
      safeUserMessage: 'AI execution blocked due to unapproved runtime configuration drift.',
      details
    });
  }
}

export class AIContextPolicyViolationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_CTX_001',
      statusCode: 400,
      safeUserMessage: 'Context assembly contains restricted clinical or personal data.',
      details
    });
  }
}

export class AISafetyInterventionError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_SAFE_001',
      statusCode: 422,
      safeUserMessage: 'Conversational interaction has been redirected to urgent verified crisis support.',
      details
    });
  }
}

export class AIToolNotAuthorizedError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_TOOL_001',
      statusCode: 403,
      safeUserMessage: 'The requested AI tool is not authorized or approved for execution.',
      details
    });
  }
}

export class AIToolExecutionError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_TOOL_002',
      statusCode: 500,
      safeUserMessage: 'An error occurred while executing the authorized companion tool.',
      details
    });
  }
}

export class AIMemoryConsentRequiredError extends DomainError {
  constructor(message = 'Active user consent is required for AI memory storage.', details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_MEM_001',
      statusCode: 403,
      safeUserMessage: 'Personalized memory requires your explicit consent under privacy governance.',
      details
    });
  }
}

export class AIMemoryViolationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_MEM_002',
      statusCode: 400,
      safeUserMessage: 'Prohibited clinical, diagnostic, or sensitive crisis data cannot be recorded into AI memory.',
      details
    });
  }
}

export class AIClinicalBoundaryViolationError extends DomainError {
  constructor(message = 'AI model attempted to violate clinical boundaries (e.g. diagnosis or prescription).', details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_CLIN_001',
      statusCode: 422,
      safeUserMessage: 'MindOS Companion cannot diagnose conditions or prescribe medications.',
      details
    });
  }
}

export class AIPostcheckViolationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      errorCode: 'AI_POST_001',
      statusCode: 422,
      safeUserMessage: 'The generated AI response did not meet canonical safety and clinical standards.',
      details
    });
  }
}
