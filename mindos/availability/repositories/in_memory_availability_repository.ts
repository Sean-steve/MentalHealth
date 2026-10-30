/**
 * MindOS Canonical Availability Repository Implementation
 */

import { IAvailabilityRepository } from './interfaces.js';
import {
  ProviderSchedulingProfile,
  AvailabilityRule,
  AvailabilityException,
  ScheduleBlock,
  AppointmentHold,
  CancellationPolicy
} from '../domain/types.js';
import { AppointmentHoldState, ScheduleBlockState } from '../../platform/shared/state_machines.js';

export class InMemoryAvailabilityRepository implements IAvailabilityRepository {
  private profiles: Map<string, ProviderSchedulingProfile> = new Map();
  private rules: Map<string, AvailabilityRule> = new Map();
  private exceptions: Map<string, AvailabilityException> = new Map();
  private scheduleBlocks: Map<string, ScheduleBlock> = new Map();
  private holds: Map<string, AppointmentHold> = new Map();
  private cancellationPolicies: Map<string, CancellationPolicy> = new Map();

  constructor() {
    this.seedDefaultCancellationPolicy();
  }

  private seedDefaultCancellationPolicy(): void {
    const defaultPolicy: CancellationPolicy = {
      id: 'cp-standard-24h',
      policy_code: 'STANDARD_24H',
      name: 'Standard 24-Hour Notice Policy',
      user_cancellation_cutoff_hours: 24,
      late_cancellation_fee_permitted: false,
      provider_cancellation_rules: {
        auto_reschedule_offered: true,
        continuity_alert: true
      },
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };
    this.cancellationPolicies.set(defaultPolicy.id, defaultPolicy);
  }

  // Profile methods
  public async getProfileByProviderId(providerId: string): Promise<ProviderSchedulingProfile | null> {
    for (const p of this.profiles.values()) {
      if (p.provider_id === providerId) {
        return { ...p };
      }
    }
    return null;
  }

  public async saveProfile(profile: ProviderSchedulingProfile): Promise<ProviderSchedulingProfile> {
    this.profiles.set(profile.id, { ...profile });
    return { ...profile };
  }

  // Rule methods
  public async getRulesByProviderId(providerId: string): Promise<AvailabilityRule[]> {
    return Array.from(this.rules.values())
      .filter(r => r.provider_id === providerId && r.status === 'ACTIVE')
      .map(r => ({ ...r }));
  }

  public async saveRule(rule: AvailabilityRule): Promise<AvailabilityRule> {
    this.rules.set(rule.id, { ...rule });
    return { ...rule };
  }

  public async deleteRule(id: string): Promise<void> {
    this.rules.delete(id);
  }

  // Exception methods
  public async getExceptionsByProvider(providerId: string, startRange: string, endRange: string): Promise<AvailabilityException[]> {
    const startMs = new Date(startRange).getTime();
    const endMs = new Date(endRange).getTime();

    return Array.from(this.exceptions.values())
      .filter(e => {
        if (e.provider_id !== providerId || e.status !== 'ACTIVE') return false;
        const eStart = new Date(e.start_at).getTime();
        const eEnd = new Date(e.end_at).getTime();
        return eStart < endMs && eEnd > startMs;
      })
      .map(e => ({ ...e }));
  }

  public async saveException(exception: AvailabilityException): Promise<AvailabilityException> {
    this.exceptions.set(exception.id, { ...exception });
    return { ...exception };
  }

  // Schedule Block methods
  public async getScheduleBlocksByProvider(providerId: string, startRange: string, endRange: string): Promise<ScheduleBlock[]> {
    const startMs = new Date(startRange).getTime();
    const endMs = new Date(endRange).getTime();

    return Array.from(this.scheduleBlocks.values())
      .filter(b => {
        if (b.provider_id !== providerId || b.status !== ScheduleBlockState.ACTIVE) return false;
        const bStart = new Date(b.start_at).getTime();
        const bEnd = new Date(b.end_at).getTime();
        return bStart < endMs && bEnd > startMs;
      })
      .map(b => ({ ...b }));
  }

  public async saveScheduleBlock(block: ScheduleBlock): Promise<ScheduleBlock> {
    this.scheduleBlocks.set(block.id, { ...block });
    return { ...block };
  }

  public async releaseScheduleBlockBySource(sourceReference: string): Promise<void> {
    for (const b of this.scheduleBlocks.values()) {
      if (b.source_reference === sourceReference && b.status === ScheduleBlockState.ACTIVE) {
        b.status = ScheduleBlockState.RELEASED;
      }
    }
  }

  // Hold methods
  public async getHoldById(id: string): Promise<AppointmentHold | null> {
    const h = this.holds.get(id);
    if (!h) return null;
    return { ...h };
  }

  public async getHoldByIdempotencyKey(key: string): Promise<AppointmentHold | null> {
    for (const h of this.holds.values()) {
      if (h.idempotency_key === key) {
        return { ...h };
      }
    }
    return null;
  }

  public async getActiveHoldsByProvider(providerId: string, startRange: string, endRange: string): Promise<AppointmentHold[]> {
    const nowMs = Date.now();
    const startMs = new Date(startRange).getTime();
    const endMs = new Date(endRange).getTime();

    return Array.from(this.holds.values())
      .filter(h => {
        if (h.provider_id !== providerId || h.status !== AppointmentHoldState.ACTIVE) return false;
        // Check if hold has expired
        if (new Date(h.expires_at).getTime() <= nowMs) {
          h.status = AppointmentHoldState.EXPIRED;
          return false;
        }
        const hStart = new Date(h.start_at).getTime();
        const hEnd = new Date(h.end_at).getTime();
        return hStart < endMs && hEnd > startMs;
      })
      .map(h => ({ ...h }));
  }

  public async saveHold(hold: AppointmentHold): Promise<AppointmentHold> {
    this.holds.set(hold.id, { ...hold });
    return { ...hold };
  }

  public async updateHold(hold: AppointmentHold): Promise<AppointmentHold> {
    this.holds.set(hold.id, { ...hold });
    return { ...hold };
  }

  // Cancellation Policy methods
  public async getCancellationPolicy(id: string): Promise<CancellationPolicy | null> {
    const p = this.cancellationPolicies.get(id);
    return p ? { ...p } : null;
  }

  public async getDefaultCancellationPolicy(): Promise<CancellationPolicy> {
    return { ...this.cancellationPolicies.get('cp-standard-24h')! };
  }

  public async saveCancellationPolicy(policy: CancellationPolicy): Promise<CancellationPolicy> {
    this.cancellationPolicies.set(policy.id, { ...policy });
    return { ...policy };
  }

  public clear(): void {
    this.profiles.clear();
    this.rules.clear();
    this.exceptions.clear();
    this.scheduleBlocks.clear();
    this.holds.clear();
    this.cancellationPolicies.clear();
    this.seedDefaultCancellationPolicy();
  }
}
