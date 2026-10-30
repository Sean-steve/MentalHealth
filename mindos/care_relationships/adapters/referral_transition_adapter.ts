/**
 * MindOS Referral to Care Relationship Transition Adapter
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 * 
 * Invariants:
 * - Referral CREATED alone != Care Relationship.
 * - Referral ACCEPTED -> evaluate eligibility -> CareRelationship established.
 */

import { DomainInvariantError } from '../../platform/errors/index.js';
import { CareRelationship } from '../domain/entities.js';
import {
  CareRelationshipType,
  CareRelationshipOriginType,
  CareRelationshipEligibilityStatus
} from '../domain/types.js';
import { CareRelationshipService } from '../relationships/care_relationship_service.js';
import { CareRelationshipEligibilityService } from '../application/eligibility_service.js';

export interface TransitionReferralParams {
  referralId: string;
  userId: string;
  receivingProviderId: string;
  serviceType: string;
  jurisdiction?: string;
  actorId: string;
}

export class ReferralTransitionAdapter {
  public static async transitionAcceptedReferral(
    params: TransitionReferralParams
  ): Promise<CareRelationship> {
    // 1. Evaluate eligibility
    const eligibility = await CareRelationshipEligibilityService.evaluateEligibility({
      userId: params.userId,
      professionalId: params.receivingProviderId,
      serviceType: params.serviceType,
      jurisdiction: params.jurisdiction,
      referralId: params.referralId
    });

    const isEligible = eligibility.isEligible;

    // 2. Map service type to CareRelationshipType
    let relType = CareRelationshipType.OTHER_APPROVED;
    const stUpper = params.serviceType.toUpperCase();
    if (stUpper.includes('COUNSEL')) {
      relType = CareRelationshipType.COUNSELLING;
    } else if (stUpper.includes('PSYCHOLOG')) {
      relType = CareRelationshipType.PSYCHOLOGY;
    } else if (stUpper.includes('PSYCHIATR')) {
      relType = CareRelationshipType.PSYCHIATRY;
    } else if (stUpper.includes('PRIMARY')) {
      relType = CareRelationshipType.PRIMARY_CARE;
    } else if (stUpper.includes('COORDINATION')) {
      relType = CareRelationshipType.CARE_COORDINATION;
    }

    // 3. Establish Care Relationship
    const relationship = await CareRelationshipService.createRelationship({
      subjectUserId: params.userId,
      primaryProviderId: params.receivingProviderId,
      relationshipType: relType,
      originType: CareRelationshipOriginType.REFERRAL,
      originReference: params.referralId,
      jurisdiction: params.jurisdiction || 'KE',
      purpose: 'CARE_DELIVERY',
      activateImmediately: isEligible,
      actorId: params.actorId
    });

    return relationship;
  }
}
