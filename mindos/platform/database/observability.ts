/**
 * MindOS Persistence Observability & Profiling Engine
 * Authority: Master Architecture Index Section 8 & Volume X Section 4
 * 
 * Rules (Section 41 & 61):
 * - Records query duration, slow query logging, and connection pool metrics.
 * - Raw parameters containing passwords, PII, or clinical text are strictly redacted.
 */

import { logger } from '../observability/logger.js';
import { sensitiveRedactor } from '../observability/redactor.js';

export interface DatabaseMetricsSnapshot {
  pool: {
    total: number;
    active: number;
    idle: number;
    waiting: number;
  };
  queries: {
    totalExecuted: number;
    slowQueriesCount: number;
    avgDurationMs: number;
    errorsCount: number;
  };
  transactions: {
    totalStarted: number;
    totalCommitted: number;
    totalRolledBack: number;
    avgDurationMs: number;
  };
}

export class DatabaseObservability {
  private static totalExecuted = 0;
  private static slowQueriesCount = 0;
  private static totalQueryDurationMs = 0;
  private static errorsCount = 0;

  private static totalTxStarted = 0;
  private static totalTxCommitted = 0;
  private static totalTxRolledBack = 0;
  private static totalTxDurationMs = 0;

  private static activeConnections = 0;
  private static idleConnections = 0;
  private static poolTotal = 0;
  private static poolWaiting = 0;

  public static readonly SLOW_QUERY_THRESHOLD_MS = 250;

  public static updatePoolStats(active: number, idle: number, total: number, waiting = 0): void {
    DatabaseObservability.activeConnections = active;
    DatabaseObservability.idleConnections = idle;
    DatabaseObservability.poolTotal = total;
    DatabaseObservability.poolWaiting = waiting;
  }

  public static recordQuery(sql: string, durationMs: number, params: unknown[] = [], error?: Error): void {
    DatabaseObservability.totalExecuted++;
    DatabaseObservability.totalQueryDurationMs += durationMs;

    if (error) {
      DatabaseObservability.errorsCount++;
    }

    if (durationMs >= DatabaseObservability.SLOW_QUERY_THRESHOLD_MS) {
      DatabaseObservability.slowQueriesCount++;

      // Sanitize parameters: Never log raw passwords, clinical notes, or tokens
      const sanitizedParams = params.map(p => {
        if (typeof p === 'string') {
          return sensitiveRedactor.redactText(p);
        }
        if (typeof p === 'object' && p !== null) {
          return sensitiveRedactor.redactObject(p as Record<string, unknown>);
        }
        return p;
      });

      logger.warn('SLOW_DATABASE_QUERY_DETECTED', {
        queryShape: sql.substring(0, 300),
        durationMs,
        sanitizedParamsCount: sanitizedParams.length,
        domain: 'platform.database'
      });
    }
  }

  public static recordTxStart(): void {
    DatabaseObservability.totalTxStarted++;
  }

  public static recordTxCommit(durationMs: number): void {
    DatabaseObservability.totalTxCommitted++;
    DatabaseObservability.totalTxDurationMs += durationMs;
  }

  public static recordTxRollback(durationMs: number): void {
    DatabaseObservability.totalTxRolledBack++;
    DatabaseObservability.totalTxDurationMs += durationMs;
  }

  public static getMetrics(): DatabaseMetricsSnapshot {
    const avgQueryDuration = DatabaseObservability.totalExecuted > 0
      ? DatabaseObservability.totalQueryDurationMs / DatabaseObservability.totalExecuted
      : 0;

    const completedTx = DatabaseObservability.totalTxCommitted + DatabaseObservability.totalTxRolledBack;
    const avgTxDuration = completedTx > 0
      ? DatabaseObservability.totalTxDurationMs / completedTx
      : 0;

    return {
      pool: {
        total: DatabaseObservability.poolTotal,
        active: DatabaseObservability.activeConnections,
        idle: DatabaseObservability.idleConnections,
        waiting: DatabaseObservability.poolWaiting
      },
      queries: {
        totalExecuted: DatabaseObservability.totalExecuted,
        slowQueriesCount: DatabaseObservability.slowQueriesCount,
        avgDurationMs: Math.round(avgQueryDuration * 100) / 100,
        errorsCount: DatabaseObservability.errorsCount
      },
      transactions: {
        totalStarted: DatabaseObservability.totalTxStarted,
        totalCommitted: DatabaseObservability.totalTxCommitted,
        totalRolledBack: DatabaseObservability.totalTxRolledBack,
        avgDurationMs: Math.round(avgTxDuration * 100) / 100
      }
    };
  }

  public static resetForTesting(): void {
    DatabaseObservability.totalExecuted = 0;
    DatabaseObservability.slowQueriesCount = 0;
    DatabaseObservability.totalQueryDurationMs = 0;
    DatabaseObservability.errorsCount = 0;
    DatabaseObservability.totalTxStarted = 0;
    DatabaseObservability.totalTxCommitted = 0;
    DatabaseObservability.totalTxRolledBack = 0;
    DatabaseObservability.totalTxDurationMs = 0;
    DatabaseObservability.activeConnections = 0;
    DatabaseObservability.idleConnections = 0;
    DatabaseObservability.poolTotal = 0;
    DatabaseObservability.poolWaiting = 0;
  }
}
