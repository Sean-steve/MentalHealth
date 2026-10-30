/**
 * MindOS Canonical Structured Logger
 * Authority: Master Architecture Index Section 27, Volume X & Appendix M
 */

import { CorrelationManager } from '../shared/correlation.js';
import { redactSensitiveData } from './redactor.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlation_id: string;
  request_id: string;
  causation_id?: string;
  domain?: string;
  context?: Record<string, unknown>;
}

export class Logger {
  constructor(private readonly domain?: string) {}

  private write(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
    const correlation = CorrelationManager.get();
    const cleanContext = context ? (redactSensitiveData(context) as Record<string, unknown>) : undefined;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlation_id: correlation.correlationId,
      request_id: correlation.requestId,
      ...(correlation.causationId ? { causation_id: correlation.causationId } : {}),
      ...(this.domain ? { domain: this.domain } : {}),
      ...(cleanContext ? { context: cleanContext } : {})
    };

    // Output strictly formatted JSON string to stdout/stderr
    const serialized = JSON.stringify(entry);
    if (level === 'error') {
      console.error(serialized);
    } else if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }

    return entry;
  }

  public debug(message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('debug', message, context);
  }

  public info(message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('info', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('warn', message, context);
  }

  public error(message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('error', message, context);
  }
}

export const logger = new Logger('platform');
