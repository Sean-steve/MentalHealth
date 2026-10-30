/**
 * MindOS Availability Repository Interfaces
 */

import {
  ProviderSchedulingProfile,
  AvailabilityRule,
  AvailabilityException,
  ScheduleBlock,
  AppointmentHold,
  CancellationPolicy
} from '../domain/types.js';

export interface IAvailabilityRepository {
  // Profiles
  getProfileByProviderId(providerId: string): Promise<ProviderSchedulingProfile | null>;
  saveProfile(profile: ProviderSchedulingProfile): Promise<ProviderSchedulingProfile>;

  // Rules
  getRulesByProviderId(providerId: string): Promise<AvailabilityRule[]>;
  saveRule(rule: AvailabilityRule): Promise<AvailabilityRule>;
  deleteRule(id: string): Promise<void>;

  // Exceptions
  getExceptionsByProvider(providerId: string, startRange: string, endRange: string): Promise<AvailabilityException[]>;
  saveException(exception: AvailabilityException): Promise<AvailabilityException>;

  // Schedule Blocks
  getScheduleBlocksByProvider(providerId: string, startRange: string, endRange: string): Promise<ScheduleBlock[]>;
  saveScheduleBlock(block: ScheduleBlock): Promise<ScheduleBlock>;
  releaseScheduleBlockBySource(sourceReference: string): Promise<void>;

  // Holds
  getHoldById(id: string): Promise<AppointmentHold | null>;
  getHoldByIdempotencyKey(key: string): Promise<AppointmentHold | null>;
  getActiveHoldsByProvider(providerId: string, startRange: string, endRange: string): Promise<AppointmentHold[]>;
  saveHold(hold: AppointmentHold): Promise<AppointmentHold>;
  updateHold(hold: AppointmentHold): Promise<AppointmentHold>;

  // Cancellation Policies
  getCancellationPolicy(id: string): Promise<CancellationPolicy | null>;
  getDefaultCancellationPolicy(): Promise<CancellationPolicy>;
  saveCancellationPolicy(policy: CancellationPolicy): Promise<CancellationPolicy>;
}
