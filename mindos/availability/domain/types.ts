/**
 * MindOS Availability Bounded Context - Domain Types
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 * Kenya Data Protection Act 2019, Digital Health Act 2023
 */

import { AppointmentHoldState, ScheduleBlockState } from '../../platform/shared/state_machines.js';

export const KENYA_TIMEZONE = 'Africa/Nairobi';
export const DEFAULT_BOOKING_HORIZON_DAYS = 30;
export const DEFAULT_MINIMUM_NOTICE_HOURS = 2;
export const DEFAULT_BUFFER_BEFORE_MINUTES = 0;
export const DEFAULT_BUFFER_AFTER_MINUTES = 15;
export const DEFAULT_HOLD_DURATION_MINUTES = 5;

export enum DayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6
}

export enum AvailabilityExceptionType {
  AVAILABLE_OVERRIDE = 'AVAILABLE_OVERRIDE',
  UNAVAILABLE = 'UNAVAILABLE',
  LEAVE = 'LEAVE',
  HOLIDAY = 'HOLIDAY',
  TRAINING = 'TRAINING',
  PERSONAL_BLOCK = 'PERSONAL_BLOCK'
}

export enum ScheduleBlockType {
  APPOINTMENT = 'APPOINTMENT',
  MANUAL = 'MANUAL',
  ORGANIZATION = 'ORGANIZATION',
  LEAVE = 'LEAVE',
  EXTERNAL_CALENDAR = 'EXTERNAL_CALENDAR'
}

export enum ScheduleBlockSource {
  APPOINTMENT = 'APPOINTMENT',
  MANUAL_BLOCK = 'MANUAL_BLOCK',
  LEAVE_RECORD = 'LEAVE_RECORD',
  SYSTEM_MAINTENANCE = 'SYSTEM_MAINTENANCE'
}

export interface ProviderSchedulingProfile {
  id: string; // UUIDv7
  provider_id: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  default_timezone: string; // e.g. 'Africa/Nairobi'
  booking_horizon_days: number; // e.g. 30
  minimum_booking_notice_hours: number; // e.g. 2
  default_buffer_before_minutes: number; // e.g. 0
  default_buffer_after_minutes: number; // e.g. 15
  cancellation_policy_id?: string;
  created_at: string;
  updated_at: string;
}

export interface RecurrenceRule {
  frequency: 'WEEKLY' | 'DAILY';
  interval?: number;
  days_of_week?: DayOfWeek[];
  until?: string;
}

export interface AvailabilityRule {
  id: string; // UUIDv7
  provider_id: string;
  service_offering_id?: string; // Optional: specific service or null for all
  timezone: string;
  day_of_week: DayOfWeek;
  start_time: string; // "09:00"
  end_time: string;   // "17:00"
  recurrence_rule?: RecurrenceRule;
  effective_from: string; // "YYYY-MM-DD"
  effective_until?: string; // "YYYY-MM-DD"
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface AvailabilityException {
  id: string; // UUIDv7
  provider_id: string;
  service_offering_id?: string;
  start_at: string; // ISO8601 UTC
  end_at: string;   // ISO8601 UTC
  exception_type: AvailabilityExceptionType;
  reason_code: string;
  status: 'ACTIVE' | 'CANCELLED';
  created_at: string;
}

export interface ScheduleBlock {
  id: string; // UUIDv7
  provider_id: string;
  start_at: string; // ISO8601 UTC
  end_at: string;   // ISO8601 UTC
  block_type: ScheduleBlockType;
  source_type: ScheduleBlockSource;
  source_reference?: string;
  status: ScheduleBlockState;
  created_at: string;
}

export interface AppointmentHold {
  id: string; // UUIDv7
  provider_id: string;
  service_offering_id: string;
  subject_user_id: string;
  start_at: string;
  end_at: string;
  status: AppointmentHoldState;
  idempotency_key: string;
  created_at: string;
  expires_at: string;
}

export interface BookableSlot {
  slot_id: string;
  provider_id: string;
  service_offering_id: string;
  start_at: string; // ISO8601 UTC
  end_at: string;   // ISO8601 UTC
  duration_minutes: number;
  timezone: string;
  delivery_mode: string;
  slot_token: string; // Signed HMAC token preventing tampering
  pricing_amount?: number;
  pricing_currency?: string;
}

export interface SlotTokenPayload {
  provider_id: string;
  service_offering_id: string;
  start_at: string;
  end_at: string;
  generated_at: number;
}

export interface CancellationPolicy {
  id: string;
  policy_code: string;
  name: string;
  user_cancellation_cutoff_hours: number;
  late_cancellation_fee_permitted: boolean;
  provider_cancellation_rules: Record<string, unknown>;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}
