/**
 * MindOS Appointment to Care Relationship Association Adapter
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 */

import { CareRelationship } from '../domain/entities.js';
import {
  CareRelationshipType,
  CareRelationshipState,
  CareRelationshipOriginType
} from '../domain/types.js';
import { CareRelationshipService } from '../relationships/care_relationship_service.js';

export interface AssociateAppointmentParams {
  appointmentId: string;
  userId: string;
  providerId: string;
  serviceType: string;
  jurisdiction?: string;
  actorId: string;
}

export class AppointmentLifecycleAdapter {
  public static async associateOrEstablishRelationship(
    params: AssociateAppointmentParams
  ): Promise<CareRelationship> {
    const existing = await CareRelationshipService.listUserRelationships(
      params.userId,
      CareRelationshipState.ACTIVE
    );

    const match = existing.find(r => r.primary_provider_id === params.providerId);
    if (match) {
      return match;
    }

    // Map service type
    let relType = CareRelationshipType.PSYCHOLOGY;
    const st = params.serviceType.toUpperCase();
    if (st.includes('COUNSEL')) relType = CareRelationshipType.COUNSELLING;
    if (st.includes('PSYCHIATR')) relType = CareRelationshipType.PSYCHIATRY;

    return CareRelationshipService.createRelationship({
      subjectUserId: params.userId,
      primaryProviderId: params.providerId,
      relationshipType: relType,
      originType: CareRelationshipOriginType.APPOINTMENT,
      originReference: params.appointmentId,
      jurisdiction: params.jurisdiction || 'KE',
      purpose: 'CARE_DELIVERY',
      activateImmediately: true,
      actorId: params.actorId
    });
  }
}
