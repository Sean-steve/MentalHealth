/**
 * MindOS Canonical Appointment Hold Service
 * Authority: ADR-034 Concurrency & Two-Phase Booking
 */

import { IAvailabilityRepository } from '../repositories/interfaces.js';
import { AvailabilitySlotService } from '../slots/slot_service.js';
import {
  AppointmentHold,
  DEFAULT_HOLD_DURATION_MINUTES
} from '../domain/types.js';
import { AppointmentHoldState } from '../../platform/shared/state_machines.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import {
  AppointmentSlotUnavailableError,
  AppointmentHoldExpiredError
} from '../../platform/errors/index.js';

export interface CreateHoldParams {
  providerId: string;
  serviceOfferingId: string;
  subjectUserId: string;
  startAt: string;
  endAt: string;
  idempotencyKey: string;
  holdDurationMinutes?: number;
}

export class AppointmentHoldService {
  public static async createHold(params: CreateHoldParams): Promise<AppointmentHold> {
    const repo = AvailabilitySlotService.getRepository();

    // 1. Idempotency Check
    const existing = await repo.getHoldByIdempotencyKey(params.idempotencyKey);
    if (existing) {
      if (existing.status === AppointmentHoldState.ACTIVE && new Date(existing.expires_at).getTime() > Date.now()) {
        return existing;
      }
    }

    const now = new Date();
    const durationMinutes = params.holdDurationMinutes || DEFAULT_HOLD_DURATION_MINUTES;
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();

    // 2. Conflict Check against active holds
    const activeHolds = await repo.getActiveHoldsByProvider(params.providerId, params.startAt, params.endAt);
    const startMs = new Date(params.startAt).getTime();
    const endMs = new Date(params.endAt).getTime();

    const hasConflict = activeHolds.some(h => {
      const hStart = new Date(h.start_at).getTime();
      const hEnd = new Date(h.end_at).getTime();
      return startMs < hEnd && endMs > hStart;
    });

    if (hasConflict) {
      throw new AppointmentSlotUnavailableError('Appointment slot is currently held by another user or session.');
    }

    // 3. Create Hold
    const hold: AppointmentHold = {
      id: generateUUIDv7(),
      provider_id: params.providerId,
      service_offering_id: params.serviceOfferingId,
      subject_user_id: params.subjectUserId,
      start_at: params.startAt,
      end_at: params.endAt,
      status: AppointmentHoldState.ACTIVE,
      idempotency_key: params.idempotencyKey,
      created_at: now.toISOString(),
      expires_at: expiresAt
    };

    const saved = await repo.saveHold(hold);

    EventBus.enqueue(
      'appointment.hold_created',
      'availability',
      saved.id,
      DataClassification.SENSITIVE,
      {
        provider_id: saved.provider_id,
        service_offering_id: saved.service_offering_id,
        subject_user_id: saved.subject_user_id,
        start_at: saved.start_at,
        expires_at: saved.expires_at
      }
    );

    return saved;
  }

  public static async releaseHold(holdId: string): Promise<void> {
    const repo = AvailabilitySlotService.getRepository();
    const hold = await repo.getHoldById(holdId);
    if (hold && hold.status === AppointmentHoldState.ACTIVE) {
      hold.status = AppointmentHoldState.RELEASED;
      await repo.updateHold(hold);
    }
  }

  public static async consumeHold(holdId: string): Promise<AppointmentHold> {
    const repo = AvailabilitySlotService.getRepository();
    const hold = await repo.getHoldById(holdId);
    if (!hold) {
      throw new AppointmentHoldExpiredError('Hold not found.');
    }

    if (hold.status !== AppointmentHoldState.ACTIVE || new Date(hold.expires_at).getTime() <= Date.now()) {
      hold.status = AppointmentHoldState.EXPIRED;
      await repo.updateHold(hold);
      throw new AppointmentHoldExpiredError('Appointment hold has expired or is no longer active.');
    }

    hold.status = AppointmentHoldState.CONSUMED;
    return await repo.updateHold(hold);
  }
}
