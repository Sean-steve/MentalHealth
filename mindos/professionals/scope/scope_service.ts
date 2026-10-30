/**
 * MindOS Governed Scope of Practice Engine
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 * ADR-028: Scope of Practice is Explicitly Enforced
 */

import {
  ProfessionalProfileEntity,
  ProfessionalRegistrationEntity,
  ProfessionalScopeEntity
} from '../domain/entities.js';
import {
  ProfessionalType,
  ScopeType,
  ServiceType,
  TargetPopulation,
  DeliveryMode,
  ScopeEvaluationResult
} from '../domain/types.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export interface ScopeValidationRequest {
  professional: ProfessionalProfileEntity;
  scope?: ProfessionalScopeEntity | null;
  serviceType: ServiceType;
  population: TargetPopulation;
  deliveryMode: DeliveryMode;
  jurisdiction: string;
}

export class ProfessionalScopeService {
  /**
   * Derives governed Scope of Practice from verified credentials, registration, and professional type.
   * Invariant: A provider CANNOT self-declare Scope.
   */
  public static deriveScope(
    profile: ProfessionalProfileEntity,
    registrations: ProfessionalRegistrationEntity[]
  ): ProfessionalScopeEntity {
    const activeRegistrations = registrations.filter(
      r => r.status === 'ACTIVE' && new Date(r.expires_at).getTime() > Date.now()
    );

    let scopeType = ScopeType.PEER_SUPPORT;
    let allowedServices: ServiceType[] = [ServiceType.CARE_NAVIGATION_SUPPORT];
    let allowedPopulations: TargetPopulation[] = [TargetPopulation.ADULTS];
    let allowedModalities: DeliveryMode[] = [DeliveryMode.TELEHEALTH, DeliveryMode.VIDEO, DeliveryMode.AUDIO, DeliveryMode.CHAT];
    const restrictions: string[] = ['NON_PRESCRIBING'];

    switch (profile.professional_type) {
      case ProfessionalType.PSYCHIATRIST:
        scopeType = ScopeType.PSYCHIATRY;
        allowedServices = [
          ServiceType.INITIAL_CONSULTATION,
          ServiceType.PSYCHIATRY_CONSULTATION,
          ServiceType.FOLLOW_UP,
          ServiceType.CARE_NAVIGATION_SUPPORT
        ];
        allowedPopulations = [TargetPopulation.ADULTS, TargetPopulation.ADOLESCENTS, TargetPopulation.GERIATRIC];
        allowedModalities = [DeliveryMode.TELEHEALTH, DeliveryMode.IN_PERSON, DeliveryMode.VIDEO, DeliveryMode.AUDIO, DeliveryMode.HYBRID];
        // Psychiatrists have prescribing authority under statutory council
        break;

      case ProfessionalType.CLINICAL_PSYCHOLOGIST:
        scopeType = ScopeType.CLINICAL_PSYCHOLOGY;
        allowedServices = [
          ServiceType.INITIAL_CONSULTATION,
          ServiceType.PSYCHOLOGY_SESSION,
          ServiceType.COUNSELLING_SESSION,
          ServiceType.FOLLOW_UP,
          ServiceType.GROUP_SESSION,
          ServiceType.CARE_NAVIGATION_SUPPORT
        ];
        allowedPopulations = [TargetPopulation.ADULTS, TargetPopulation.ADOLESCENTS, TargetPopulation.COUPLES, TargetPopulation.GROUPS];
        allowedModalities = [DeliveryMode.TELEHEALTH, DeliveryMode.IN_PERSON, DeliveryMode.VIDEO, DeliveryMode.AUDIO, DeliveryMode.HYBRID];
        restrictions.push('NON_PRESCRIBING');
        break;

      case ProfessionalType.PSYCHOLOGIST:
      case ProfessionalType.COUNSELLOR:
        scopeType = ScopeType.GENERAL_COUNSELLING;
        allowedServices = [
          ServiceType.INITIAL_CONSULTATION,
          ServiceType.COUNSELLING_SESSION,
          ServiceType.FOLLOW_UP,
          ServiceType.GROUP_SESSION,
          ServiceType.CARE_NAVIGATION_SUPPORT
        ];
        allowedPopulations = [TargetPopulation.ADULTS, TargetPopulation.COUPLES, TargetPopulation.GROUPS];
        allowedModalities = [DeliveryMode.TELEHEALTH, DeliveryMode.IN_PERSON, DeliveryMode.VIDEO, DeliveryMode.AUDIO, DeliveryMode.CHAT, DeliveryMode.HYBRID];
        restrictions.push('NON_PRESCRIBING', 'NO_CHILDREN_UNDER_12');
        break;

      case ProfessionalType.MENTAL_HEALTH_NURSE:
      case ProfessionalType.SOCIAL_WORKER:
        scopeType = ScopeType.SPECIALIZED_THERAPY;
        allowedServices = [
          ServiceType.INITIAL_CONSULTATION,
          ServiceType.COUNSELLING_SESSION,
          ServiceType.FOLLOW_UP,
          ServiceType.CARE_NAVIGATION_SUPPORT
        ];
        allowedPopulations = [TargetPopulation.ADULTS];
        allowedModalities = [DeliveryMode.TELEHEALTH, DeliveryMode.IN_PERSON, DeliveryMode.VIDEO, DeliveryMode.AUDIO];
        restrictions.push('NON_PRESCRIBING');
        break;

      case ProfessionalType.COACH:
        scopeType = ScopeType.LOW_INTENSITY_COACHING;
        allowedServices = [ServiceType.CARE_NAVIGATION_SUPPORT, ServiceType.OTHER_APPROVED_SERVICE];
        allowedPopulations = [TargetPopulation.ADULTS];
        allowedModalities = [DeliveryMode.TELEHEALTH, DeliveryMode.VIDEO, DeliveryMode.AUDIO, DeliveryMode.CHAT];
        restrictions.push('NON_CLINICAL_ONLY', 'NON_PRESCRIBING', 'ADULTS_ONLY', 'NO_CRISIS_MANAGEMENT');
        break;

      case ProfessionalType.PEER_SUPPORT_PROVIDER:
      default:
        scopeType = ScopeType.PEER_SUPPORT;
        allowedServices = [ServiceType.CARE_NAVIGATION_SUPPORT];
        allowedPopulations = [TargetPopulation.ADULTS];
        allowedModalities = [DeliveryMode.TELEHEALTH, DeliveryMode.CHAT, DeliveryMode.AUDIO];
        restrictions.push('NON_CLINICAL_ONLY', 'NON_PRESCRIBING', 'ADULTS_ONLY', 'PEER_SUPPORT_ONLY');
        break;
    }

    // If there is no active statutory registration for regulated roles, restrict scope heavily
    if (activeRegistrations.length === 0 && (
      profile.professional_type === ProfessionalType.PSYCHIATRIST ||
      profile.professional_type === ProfessionalType.CLINICAL_PSYCHOLOGIST ||
      profile.professional_type === ProfessionalType.PSYCHOLOGIST ||
      profile.professional_type === ProfessionalType.COUNSELLOR
    )) {
      restrictions.push('PENDING_REGISTRATION_VERIFICATION');
    }

    const sourceRefs = activeRegistrations.map(r => r.id);

    return {
      id: generateUUIDv7(),
      professional_id: profile.id,
      jurisdiction: profile.jurisdictions[0] || 'KE',
      scope_type: scopeType,
      allowed_service_types: allowedServices,
      allowed_populations: allowedPopulations,
      allowed_modalities: allowedModalities,
      restrictions,
      effective_at: new Date().toISOString(),
      source_credential_refs: sourceRefs,
      status: restrictions.includes('PENDING_REGISTRATION_VERIFICATION') ? 'RESTRICTED' : 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Validates whether a proposed service delivery falls strictly within the verified scope.
   */
  public static validateScope(req: ScopeValidationRequest): ScopeEvaluationResult {
    const reasons: string[] = [];
    const restrictions: string[] = [];

    // 1. Jurisdiction check
    if (!req.professional.jurisdictions.includes(req.jurisdiction)) {
      reasons.push(`JURISDICTION_MISMATCH: Professional is not licensed or authorized for jurisdiction ${req.jurisdiction}`);
    }

    // 2. Scope existence
    if (!req.scope || req.scope.status !== 'ACTIVE') {
      reasons.push('NO_ACTIVE_SCOPE: Professional does not have an active governed scope of practice');
      return {
        allowed: false,
        reason_codes: reasons,
        restrictions: []
      };
    }

    // 3. Service type check
    if (!req.scope.allowed_service_types.includes(req.serviceType)) {
      reasons.push(`SERVICE_TYPE_OUT_OF_SCOPE: Service type ${req.serviceType} is not permitted under scope ${req.scope.scope_type}`);
    }

    // 4. Target population check
    if (!req.scope.allowed_populations.includes(req.population)) {
      reasons.push(`POPULATION_OUT_OF_SCOPE: Target population ${req.population} is not permitted under this scope`);
    }

    // 5. Minor protections
    if (req.population === TargetPopulation.CHILDREN || req.population === TargetPopulation.ADOLESCENTS) {
      if (req.scope.restrictions.includes('ADULTS_ONLY') || req.scope.restrictions.includes('NO_MINORS')) {
        reasons.push('MINOR_PATIENTS_RESTRICTED: Provider scope is explicitly restricted from treating minors');
      }
    }

    // 6. Delivery mode check
    if (!req.scope.allowed_modalities.includes(req.deliveryMode)) {
      reasons.push(`DELIVERY_MODE_OUT_OF_SCOPE: Delivery mode ${req.deliveryMode} is not permitted for this scope`);
    }

    return {
      allowed: reasons.length === 0,
      reason_codes: reasons,
      restrictions: req.scope.restrictions,
      effective_scope_id: req.scope.id
    };
  }
}
