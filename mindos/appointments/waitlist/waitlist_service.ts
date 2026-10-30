/**
 * MindOS Canonical Appointment Waitlist Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, II, III, XV & Appendices B / C / Q / J
 * Clinical Safety Policy Catalogue (R-SAFE-001, ADR-033..039)
 */

import { IAppointmentRepository } from '../repositories/interfaces.js';
import { AppointmentBookingService } from '../booking/booking_service.js';
import {
  AppointmentWaitlistEntryEntity,
  WaitlistOfferEntity,
  AppointmentEntity,
  BookingSource
} from '../domain/types.js';
import { WaitlistEntryState, WaitlistOfferState } from '../../platform/shared/state_machines.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AuditService } from '../../platform/audit/index.js';
import { NotFoundError, AppointmentInvalidStateError } from '../../platform/errors/index.js';

export class AppointmentWaitlistService {
  public static async joinWaitlist(params: {
    subjectUserId: string;
    providerId?: string;
    serviceOfferingId: string;
    preferredTimeWindow?: AppointmentWaitlistEntryEntity['preferred_time_window'];
    timezone?: string;
  }): Promise<AppointmentWaitlistEntryEntity> {
    const repo = AppointmentBookingService.getRepository();

    const entry: AppointmentWaitlistEntryEntity = {
      id: generateUUIDv7(),
      subject_user_id: params.subjectUserId,
      provider_id: params.providerId,
      service_offering_id: params.serviceOfferingId,
      preferred_time_window: params.preferredTimeWindow || {},
      timezone: params.timezone || 'Africa/Nairobi',
      status: WaitlistEntryState.ACTIVE,
      created_at: new Date().toISOString()
    };

    return await repo.saveWaitlistEntry(entry);
  }

  public static async respondToOffer(params: {
    offerId: string;
    accept: boolean;
    actorId: string;
  }): Promise<{ offer: WaitlistOfferEntity; appointment?: AppointmentEntity }> {
    const repo = AppointmentBookingService.getRepository();
    const offer = await repo.getWaitlistOfferById(params.offerId);
    if (!offer) {
      throw new NotFoundError('Waitlist offer not found.');
    }

    if (offer.status !== WaitlistOfferState.PENDING) {
      throw new AppointmentInvalidStateError(`Waitlist offer is in state: ${offer.status}`);
    }

    if (new Date(offer.expires_at).getTime() <= Date.now()) {
      offer.status = WaitlistOfferState.EXPIRED;
      await repo.updateWaitlistOffer(offer);
      throw new AppointmentInvalidStateError('Waitlist offer has expired.');
    }

    const entry = await repo.getWaitlistEntryById(offer.waitlist_entry_id);
    if (!entry) {
      throw new NotFoundError('Associated waitlist entry not found.');
    }

    if (params.accept) {
      offer.status = WaitlistOfferState.ACCEPTED;
      await repo.updateWaitlistOffer(offer);

      entry.status = WaitlistEntryState.ACCEPTED;
      await repo.updateWaitlistEntry(entry);

      // Book the appointment
      const appointment = await AppointmentBookingService.book({
        subjectUserId: entry.subject_user_id,
        providerId: entry.provider_id!,
        serviceOfferingId: entry.service_offering_id,
        startAt: offer.slot_start,
        endAt: offer.slot_end,
        bookingSource: BookingSource.WAITLIST_OFFER,
        actorId: params.actorId
      });

      return { offer, appointment };
    } else {
      offer.status = WaitlistOfferState.DECLINED;
      await repo.updateWaitlistOffer(offer);

      entry.status = WaitlistEntryState.ACTIVE;
      await repo.updateWaitlistEntry(entry);

      return { offer };
    }
  }
}
