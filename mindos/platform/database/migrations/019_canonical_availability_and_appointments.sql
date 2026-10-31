-- ==============================================================================
-- MINDOS CANONICAL MIGRATION: 019_canonical_availability_and_appointments.sql
-- ==============================================================================
-- Purpose: Provider Scheduling Profiles, Recurring Availability Rules,
--          Exceptions, Schedule Blocks, Appointment Holds, Appointments,
--          Rescheduling, Cancellation Policies, Attendance, Waitlists,
--          Reminders & Virtual Sessions.
-- Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
--            Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
--            Kenya Data Protection Act 2019, Digital Health Act 2023
-- Sprint 20: Availability & Appointment Scheduling Engine
-- Strategy: Additive expand phase (100% backwards compatible).
-- ==============================================================================

-- UP --

-- 1. Cancellation Policies
CREATE TABLE IF NOT EXISTS cancellation_policies (
  id UUID PRIMARY KEY,
  policy_code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  user_cancellation_cutoff_hours INTEGER NOT NULL DEFAULT 24,
  late_cancellation_fee_permitted BOOLEAN NOT NULL DEFAULT FALSE,
  provider_cancellation_rules JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Provider Scheduling Profiles
CREATE TABLE IF NOT EXISTS provider_scheduling_profiles (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  default_timezone VARCHAR(60) NOT NULL DEFAULT 'Africa/Nairobi',
  booking_horizon_days INTEGER NOT NULL DEFAULT 30,
  minimum_booking_notice_hours INTEGER NOT NULL DEFAULT 2,
  default_buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
  default_buffer_after_minutes INTEGER NOT NULL DEFAULT 15,
  cancellation_policy_id UUID REFERENCES cancellation_policies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduling_profile_provider ON provider_scheduling_profiles(provider_id);

-- 3. Availability Rules (Recurring weekly schedule)
CREATE TABLE IF NOT EXISTS availability_rules (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  service_offering_id UUID,
  timezone VARCHAR(60) NOT NULL DEFAULT 'Africa/Nairobi',
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time VARCHAR(10) NOT NULL, -- '09:00'
  end_time VARCHAR(10) NOT NULL,   -- '17:00'
  recurrence_rule JSONB,
  effective_from DATE NOT NULL,
  effective_until DATE,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_provider ON availability_rules(provider_id, status);

-- 4. Availability Exceptions (Overrides, Leave, Holidays)
CREATE TABLE IF NOT EXISTS availability_exceptions (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  service_offering_id UUID,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  exception_type VARCHAR(60) NOT NULL,
  reason_code VARCHAR(60) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_exceptions_provider ON availability_exceptions(provider_id, start_at, end_at);

-- 5. Schedule Blocks (Occupied intervals)
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  block_type VARCHAR(60) NOT NULL,
  source_type VARCHAR(60) NOT NULL,
  source_reference VARCHAR(120),
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_provider ON schedule_blocks(provider_id, start_at, end_at, status);

-- 6. Appointment Holds (Temporary slot reservations)
CREATE TABLE IF NOT EXISTS appointment_holds (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
  service_offering_id UUID NOT NULL,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  idempotency_key VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointment_holds_expiry ON appointment_holds(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_appointment_holds_provider ON appointment_holds(provider_id, start_at, end_at, status);

-- 7. Appointments (Canonical Scheduled Care Encounters)
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE RESTRICT,
  professional_id UUID NOT NULL REFERENCES professional_profiles(id) ON DELETE RESTRICT,
  service_offering_id UUID NOT NULL,
  referral_id UUID,
  care_navigation_session_id UUID,
  care_relationship_id UUID,
  appointment_type VARCHAR(60) NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone_context VARCHAR(60) NOT NULL DEFAULT 'Africa/Nairobi',
  delivery_mode VARCHAR(40) NOT NULL DEFAULT 'TELEHEALTH',
  location_reference VARCHAR(200),
  virtual_session_reference VARCHAR(200),
  status VARCHAR(40) NOT NULL DEFAULT 'CONFIRMED',
  booking_source VARCHAR(60) NOT NULL DEFAULT 'USER_SELF_SERVICE',
  idempotency_key VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1
);


-- Legacy Sprint-1 compatibility: expand appointments in place.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS subject_user_id UUID,
  ADD COLUMN IF NOT EXISTS provider_id UUID,
  ADD COLUMN IF NOT EXISTS service_offering_id UUID,
  ADD COLUMN IF NOT EXISTS referral_id UUID,
  ADD COLUMN IF NOT EXISTS care_navigation_session_id UUID,
  ADD COLUMN IF NOT EXISTS care_relationship_id UUID,
  ADD COLUMN IF NOT EXISTS appointment_type VARCHAR(60) NOT NULL DEFAULT 'CARE_SESSION',
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timezone_context VARCHAR(60) NOT NULL DEFAULT 'Africa/Nairobi',
  ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(40) NOT NULL DEFAULT 'TELEHEALTH',
  ADD COLUMN IF NOT EXISTS location_reference VARCHAR(200),
  ADD COLUMN IF NOT EXISTS virtual_session_reference VARCHAR(200),
  ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN IF NOT EXISTS booking_source VARCHAR(60) NOT NULL DEFAULT 'USER_SELF_SERVICE',
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

UPDATE appointments
SET subject_user_id = COALESCE(subject_user_id, user_id),
    provider_id = COALESCE(provider_id, professional_id),
    start_at = COALESCE(start_at, starts_at),
    end_at = COALESCE(end_at, ends_at),
    timezone_context = COALESCE(timezone_context, timezone_snapshot),
    status = COALESCE(status, state::text)
WHERE subject_user_id IS NULL
   OR provider_id IS NULL
   OR start_at IS NULL
   OR end_at IS NULL;

ALTER TABLE appointments
  ALTER COLUMN subject_user_id SET NOT NULL,
  ALTER COLUMN provider_id SET NOT NULL,
  ALTER COLUMN start_at SET NOT NULL,
  ALTER COLUMN end_at SET NOT NULL,
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN service_id DROP NOT NULL,
  ALTER COLUMN starts_at DROP NOT NULL,
  ALTER COLUMN ends_at DROP NOT NULL,
  ALTER COLUMN timezone_snapshot DROP NOT NULL,
  ALTER COLUMN idempotency_key DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(provider_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_subject ON appointments(subject_user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_referral ON appointments(referral_id);

-- 8. Appointment Reschedules (Audit log of slot swaps)
CREATE TABLE IF NOT EXISTS appointment_reschedules (
  id UUID PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  old_start_at TIMESTAMPTZ NOT NULL,
  old_end_at TIMESTAMPTZ NOT NULL,
  new_start_at TIMESTAMPTZ NOT NULL,
  new_end_at TIMESTAMPTZ NOT NULL,
  initiated_by VARCHAR(60) NOT NULL,
  reason_code VARCHAR(60) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_reschedules_apt ON appointment_reschedules(appointment_id);

-- 9. Appointment Attendance & Check-in
CREATE TABLE IF NOT EXISTS appointment_attendance (
  id UUID PRIMARY KEY,
  appointment_id UUID UNIQUE NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  user_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  provider_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  user_checked_in_at TIMESTAMPTZ,
  provider_checked_in_at TIMESTAMPTZ,
  session_started_at TIMESTAMPTZ,
  session_ended_at TIMESTAMPTZ,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Appointment Waitlist Entries
CREATE TABLE IF NOT EXISTS appointment_waitlist_entries (
  id UUID PRIMARY KEY,
  subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES professional_profiles(id) ON DELETE CASCADE,
  service_offering_id UUID NOT NULL,
  preferred_time_window JSONB NOT NULL DEFAULT '{}',
  timezone VARCHAR(60) NOT NULL DEFAULT 'Africa/Nairobi',
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_waitlist_provider ON appointment_waitlist_entries(provider_id, status);

-- 11. Waitlist Offers
CREATE TABLE IF NOT EXISTS waitlist_offers (
  id UUID PRIMARY KEY,
  waitlist_entry_id UUID NOT NULL REFERENCES appointment_waitlist_entries(id) ON DELETE CASCADE,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING'
);

CREATE INDEX IF NOT EXISTS idx_waitlist_offers_expiry ON waitlist_offers(expires_at, status);

-- 12. Appointment Reminders
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id UUID PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_type VARCHAR(60) NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  channel VARCHAR(40) NOT NULL DEFAULT 'IN_APP',
  status VARCHAR(40) NOT NULL DEFAULT 'SCHEDULED',
  notification_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_sched ON appointment_reminders(scheduled_for, status);

-- 13. Virtual Sessions (Secure ephemeral tokens)
CREATE TABLE IF NOT EXISTS virtual_sessions (
  id UUID PRIMARY KEY,
  appointment_id UUID UNIQUE NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  provider VARCHAR(60) NOT NULL DEFAULT 'INTERNAL_WEBRTC',
  external_session_reference VARCHAR(120) NOT NULL,
  join_window_start TIMESTAMPTZ NOT NULL,
  join_window_end TIMESTAMPTZ NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_virtual_sessions_apt ON virtual_sessions(appointment_id);

-- DOWN --
DROP TABLE IF EXISTS virtual_sessions CASCADE;
DROP TABLE IF EXISTS appointment_reminders CASCADE;
DROP TABLE IF EXISTS waitlist_offers CASCADE;
DROP TABLE IF EXISTS appointment_waitlist_entries CASCADE;
DROP TABLE IF EXISTS appointment_attendance CASCADE;
DROP TABLE IF EXISTS appointment_reschedules CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS appointment_holds CASCADE;
DROP TABLE IF EXISTS schedule_blocks CASCADE;
DROP TABLE IF EXISTS availability_exceptions CASCADE;
DROP TABLE IF EXISTS availability_rules CASCADE;
DROP TABLE IF EXISTS provider_scheduling_profiles CASCADE;
DROP TABLE IF EXISTS cancellation_policies CASCADE;
