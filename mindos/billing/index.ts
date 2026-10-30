/**
 * MindOS Billing Bounded Context
 * Authority: Volumes I, III & Appendix B / C / Q
 * Owns: subscriptions, invoices, payment_intents
 * State machine: SubscriptionState
 * Invariant: SP-010: Immediate safety resources and emergency helplines SHALL NEVER be paywalled.
 */

import { SubscriptionState, validateStateTransition } from '../platform/shared/state_machines.js';
import { generateUUIDv7 } from '../platform/database/uuid.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { EventBus } from '../platform/events/index.js';
import { AuditService } from '../platform/audit/index.js';
import { ValidationError } from '../platform/errors/index.js';

export interface SubscriptionEntity {
  id: string; // UUIDv7
  user_id: string;
  plan_code: 'FREE_ESSENTIALS' | 'PLUS' | 'FAMILY' | 'ORG_SPONSORED';
  state: SubscriptionState;
  current_period_start: string;
  current_period_end: string;
  currency: string; // 'KES'
  payment_method_type: 'MPESA' | 'CARD';
  created_at: string;
  updated_at: string;
}

export class BillingService {
  private static subscriptions: Map<string, SubscriptionEntity> = new Map();

  public static async createSubscription(params: {
    userId: string;
    planCode: SubscriptionEntity['plan_code'];
    currency?: string;
    paymentMethodType?: SubscriptionEntity['payment_method_type'];
  }): Promise<SubscriptionEntity> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const sub: SubscriptionEntity = {
      id,
      user_id: params.userId,
      plan_code: params.planCode,
      state: SubscriptionState.ACTIVE,
      current_period_start: now,
      current_period_end: periodEnd,
      currency: params.currency || 'KES',
      payment_method_type: params.paymentMethodType || 'MPESA',
      created_at: now,
      updated_at: now
    };

    BillingService.subscriptions.set(id, sub);

    EventBus.enqueue(
      'billing.subscription_state_changed',
      'billing',
      id,
      DataClassification.FINANCIAL,
      {
        subscription_id: id,
        user_id: params.userId,
        from_state: SubscriptionState.TRIAL,
        to_state: SubscriptionState.ACTIVE,
        plan_code: params.planCode
      }
    );

    return sub;
  }

  public static getUserSubscription(userId: string): SubscriptionEntity | undefined {
    for (const sub of BillingService.subscriptions.values()) {
      if (sub.user_id === userId) {
        return sub;
      }
    }
    return undefined;
  }

  public static resetForTesting(): void {
    BillingService.subscriptions.clear();
  }
}
