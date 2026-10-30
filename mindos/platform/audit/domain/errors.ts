/**
 * MindOS Audit & Evidence Specific Errors
 * Authority: Master Architecture Index Section 14, Volume III, Error Catalogue
 * ADR-024
 */

import { MindOSError } from '../../errors/index.js';

export class AuditError extends MindOSError {
  public readonly errorCode: string = 'AUDIT_001';
  public readonly httpStatus: number = 500;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      internalContext: context,
      safeUserMessage: 'An audit subsystem error occurred.'
    });
  }
}

export class AuditWriteFailureError extends AuditError {
  public override readonly errorCode: string = 'AUDIT_WRITE_FAILED';
  public override readonly httpStatus: number = 500;

  constructor(message = 'Mandatory audit write failure in fail-closed transaction', context?: Record<string, unknown>) {
    super(message, context);
  }
}

export class AuditAccessDeniedError extends MindOSError {
  public readonly errorCode: string = 'AUDIT_ACCESS_DENIED';
  public readonly httpStatus: number = 403;

  constructor(message = 'Access to audit records denied. Role or purpose unauthorized.', context?: Record<string, unknown>) {
    super(message, {
      internalContext: context,
      safeUserMessage: 'Access to audit records denied.'
    });
  }
}

export class AuditTamperDetectedError extends MindOSError {
  public readonly errorCode: string = 'AUDIT_TAMPER_DETECTED';
  public readonly httpStatus: number = 500;

  constructor(message = 'Tamper detected: Audit ledger hash chain integrity verification failed', context?: Record<string, unknown>) {
    super(message, {
      internalContext: context,
      safeUserMessage: 'Audit integrity check failed.'
    });
  }
}

export class EvidenceIntegrityError extends MindOSError {
  public readonly errorCode: string = 'EVIDENCE_INTEGRITY_MISMATCH';
  public readonly httpStatus: number = 422;

  constructor(message = 'Governance evidence hash does not match content hash', context?: Record<string, unknown>) {
    super(message, {
      internalContext: context,
      safeUserMessage: 'Evidence integrity mismatch.'
    });
  }
}

export class EvidenceNotFoundError extends MindOSError {
  public readonly errorCode: string = 'EVIDENCE_NOT_FOUND';
  public readonly httpStatus: number = 404;

  constructor(message = 'Governance evidence record not found', context?: Record<string, unknown>) {
    super(message, {
      internalContext: context,
      safeUserMessage: 'Evidence not found.'
    });
  }
}
