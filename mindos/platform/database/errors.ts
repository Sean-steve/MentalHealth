/**
 * MindOS Database & Persistence Error Architecture
 * Authority: Master Architecture Index Section 7 & Volume III Section 8
 * 
 * Maps low-level PostgreSQL SQLSTATE codes into canonical MindOS application errors (Section 60)
 */

import {
  MindOSError,
  ConflictError,
  ValidationError,
  InfrastructureError,
  DomainInvariantError
} from '../errors/index.js';

export class ConcurrencyError extends ConflictError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(`CONCURRENCY_CONFLICT: ${message}`, details);
    this.name = 'ConcurrencyError';
  }
}

export class PostgresErrorMapper {
  /**
   * Maps a raw database/PostgreSQL error into a typed MindOS application error
   */
  public static mapError(err: unknown, queryContext?: string): MindOSError {
    if (err instanceof MindOSError) {
      return err;
    }

    const raw = err as { code?: string; detail?: string; message?: string; constraint?: string; table?: string };
    const code = raw?.code || '';
    const message = raw?.message || 'Database error occurred';
    const constraint = raw?.constraint;

    switch (code) {
      case '23505': // unique_violation
        return new ConflictError(
          `Unique constraint violation${constraint ? ` on [${constraint}]` : ''}: A record with these attributes already exists.`,
          { errorCode: 'DATA_002', internalContext: { code: '23505', constraint, table: raw?.table } }
        );

      case '23503': // foreign_key_violation
        return new ValidationError(
          `Referential integrity violation: The referenced foreign key does not exist or target record is referenced elsewhere.`,
          { internalContext: { code: '23503', constraint, table: raw?.table } }
        );

      case '23502': // not_null_violation
        return new ValidationError(
          `Required field missing: Column constraint requires a non-null value.`,
          { internalContext: { code: '23502', table: raw?.table } }
        );

      case '23514': // check_violation
        return new ValidationError(
          `Database check constraint violation${constraint ? ` on [${constraint}]` : ''}: Provided value violates column invariant.`,
          { internalContext: { code: '23514', constraint, table: raw?.table } }
        );

      case '40001': // serialization_failure
      case '40P01': // deadlock_detected
        return new ConcurrencyError(
          `Concurrent modification detected during transaction. Please retry operation.`,
          { code, table: raw?.table }
        );

      case '57014': // query_canceled / statement_timeout
        return new InfrastructureError(
          `Database statement timeout exceeded. Query was canceled to prevent connection starvation.`,
          { internalContext: { code: '57014' } }
        );

      case '08001': // unable_to_connect
      case '08006': // connection_failure
        return new InfrastructureError(
          `Database connection unavailable. Verify network connectivity and connection pool health.`,
          { internalContext: { code } }
        );

      default:
        return new InfrastructureError(
          `Database operation failed: ${message}`,
          { internalContext: { originalError: message, queryContext } }
        );
    }
  }
}
