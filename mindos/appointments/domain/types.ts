/**
 * MindOS Appointments Bounded Context - Domain Types
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 * Kenya Data Protection Act 2019, Digital Health Act 2023
 */

import {
  AppointmentState,
  WaitlistEntryState,
  WaitlistOfferState
} from '../../platform/shared/state_machines.js';

export enum AppointmentType {
  ROUTINE = 'ROUTINE',
  INTAKE = 'INTAKE',
  CRISIS_FOLLOW_UP = 'CRISIS_FOLLOW_UP',
  REFERRAL_CONSULT = 'REFERRAL_CONSULT',
  PSYCHOTHERAPY = 'PSYCHOTHERAPY',
  CARE_NAVIGATION = 'CARE_NAVIGATION'
}

export enum BookingSource {
  USER_SELF_SERVICE = 'USER_SELF_SERVICE',
  CARE_NAVIGATOR = 'CARE_NAVIGATOR',
  PROVIDER_DIRECT = 'PROVIDER_DIRECT',
  WAITLIST_OFFER = 'WAITLIST_OFFER',
  REFERRAL_ROUTING = 'REFERRAL_ROUTING'
}

export interface AppointmentEntity {
  id: string; // UUIDv7
  subject_user_id: string; // User/Patient ID
  provider_id: string;
  professional_id: string;
  service_offering_id: string;
  referral_id?: string;
  care_navigation_session_id?: string;
  care_relationship_id?: string;
  appointment_type: AppointmentType | string;
  start_at: string; // ISO8601 UTC
  end_at: string;   // ISO8601 UTC
  timezone_context: string; // 'Africa/Nairobi'
  delivery_mode: string; // 'TELEHEALTH' | 'IN_PERSON' | 'HYBRID'
  location_reference?: string;
  virtual_session_reference?: string;
  status: AppointmentState;
  booking_source: BookingSource | string;
  idempotency_key?: string;
  created_at: string;
  confirmed_at?: string;
  cancelled_at?: string;
  completed_at?: string;
  version: number;

  // Backward compatibility aliases
  client_id?: string;
  start_time?: string;
  end_time?: string;
  state?: AppointmentState;
}

export interface AppointmentRescheduleEntity {
  id: string;
  appointment_id: string;
  old_start_at: string;
  old_end_at: string;
  new_start_at: string;
  new_end_at: string;
  initiated_by: 'USER' | 'PROVIDER' | 'SYSTEM';
  reason_code: string;
  created_at: string;
}

export interface AppointmentAttendanceEntity {
  id: string;
  appointment_id: string;
  user_status: 'PENDING' | 'CHECKED_IN' | 'ATTENDED' | 'NO_SHOW';
  provider_status: 'PENDING' | 'CHECKED_IN' | 'ATTENDED' | 'NO_SHOW';
  user_checked_in_at?: string;
  provider_checked_in_at?: string;
  session_started_at?: string;
  session_ended_at?: string;
  recorded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AppointmentWaitlistEntryEntity {
  id: string;
  subject_user_id: string;
  provider_id?: string;
  service_offering_id: string;
  preferred_time_window?: {
    days_of_week?: number[];
    time_of_day?: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANY';
    earliest_date?: string;
    latest_date?: string;
  };
  timezone: string;
  status: WaitlistEntryState;
  created_at: string;
  expires_at?: string;
}

export interface WaitlistOfferEntity {
  id: string;
  waitlist_entry_id: string;
  slot_start: string;
  slot_end: string;
  offered_at: string;
  expires_at: string;
  status: WaitlistOfferState;
}

export interface AppointmentReminderEntity {
  id: string;
  appointment_id: string;
  reminder_type: 'BOOKING_CONFIRMATION' | 'UPCOMING_24H' | 'SAME_DAY_2H';
  scheduled_for: string;
  channel: 'PUSH' | 'SMS' | 'EMAIL' | 'IN_APP';
  status: 'SCHEDULED' | 'SENT' | 'CANCELLED';
  notification_id?: string;
  created_at: string;
}

export interface VirtualSessionEntity {
  id: string;
  appointment_id: string;
  provider: 'INTERNAL_WEBRTC' | 'TELEHEALTH_LINK';
  external_session_reference: string;
  join_window_start: string; // e.g. 10 minutes before start_at
  join_window_end: string;   // e.g. 15 minutes after end_at
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'EXPIRED';
  created_at: string;
  expires_at: string;
}
