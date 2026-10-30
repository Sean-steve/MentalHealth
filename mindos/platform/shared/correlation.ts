/**
 * MindOS Correlation Context
 * Authority: Master Architecture Index, Volume IX, Appendix D
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { v4 as uuidv4 } from 'uuid';

export interface CorrelationContextData {
  requestId: string;
  correlationId: string;
  causationId?: string;
  actorId?: string;
  actorType?: string;
  jurisdiction?: string;
  sessionId?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<CorrelationContextData>();

export class CorrelationManager {
  public static run<R>(context: CorrelationContextData, fn: () => R): R {
    return asyncLocalStorage.run(context, fn);
  }

  public static runWithContext<R>(
    options: { requestId?: string; correlationId?: string; causationId?: string },
    fn: () => R
  ): R {
    const ctx = CorrelationManager.create(options.requestId, options.correlationId, options.causationId);
    return CorrelationManager.run(ctx, fn);
  }

  public static withCorrelation<R>(
    correlationId: string,
    requestId: string | undefined,
    causationId: string | undefined,
    fn: () => R
  ): R {
    const ctx = CorrelationManager.create(requestId, correlationId, causationId);
    return CorrelationManager.run(ctx, fn);
  }

  public static get(): CorrelationContextData {
    const current = asyncLocalStorage.getStore();
    if (current) {
      return current;
    }
    // Safe default if accessed outside explicit request pipeline
    const generatedId = uuidv4();
    return {
      requestId: generatedId,
      correlationId: generatedId
    };
  }

  public static getCorrelationId(): string {
    return CorrelationManager.get().correlationId;
  }

  public static getRequestId(): string {
    return CorrelationManager.get().requestId;
  }

  public static create(
    incomingRequestId?: string,
    incomingCorrelationId?: string,
    causationId?: string
  ): CorrelationContextData {
    const requestId = incomingRequestId && incomingRequestId.trim().length > 0 
      ? incomingRequestId 
      : uuidv4();
    const correlationId = incomingCorrelationId && incomingCorrelationId.trim().length > 0 
      ? incomingCorrelationId 
      : requestId;

    return {
      requestId,
      correlationId,
      causationId: causationId || undefined
    };
  }
}
