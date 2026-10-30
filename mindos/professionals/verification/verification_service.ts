/**
 * MindOS Governed Professional Verification Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * ADR-026, ADR-027, ADR-028, ADR-029, ADR-030, ADR-031, ADR-032
 */

import { IProfessionalRepository } from '../repositories/interfaces.js';
import { ProfessionalInvariants } from '../domain/invariants.js';
import { ProfessionalScopeService } from '../scope/scope_service.js';
import {
  ProfessionalProfileEntity,
  ProfessionalCredentialEntity,
  ProfessionalRegistrationEntity,
  ProfessionalVerificationCaseEntity
} from '../domain/entities.js';
import {
  ProfessionalState,
  ProfessionalVerificationState,
  VerificationCaseStatus,
  VerificationDecision,
  VerificationType,
  VerificationCheck,
  CredentialStatus,
  DiscoverabilityStatus,
  ProviderStatus,
  ServiceOfferingStatus,
  SuspensionReasonCode
} from '../domain/types.js';
import {
  ProfessionalProfileRequiredError,
  SelfVerificationProhibitedError,
  SeparationOfDutiesViolationError,
  DuplicateProfessionalRegistrationError,
  EvidenceTamperingDetectedError,
  DomainInvariantError
} from '../../platform/errors/index.js';
import { validateStateTransition } from '../../platform/shared/state_machines.js';
import { EventBus } from '../../platform/events/index.js';
import { EventPriority } from '../../platform/events/types.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { GovernanceEvidenceService } from '../../platform/audit/application/governance_evidence_service.js';
import { AuthoritiesRegistry } from '../../regulatory_governance/authorities/registry.js';

export interface SubmitVerificationRequest {
  professionalId: string;
  applicantUserId: string;
  verificationType?: VerificationType;
  requiredEvidenceRefs?: string[];
}

export interface ReviewCheckRequest {
  caseId: string;
  reviewerUserId: string;
  reviewerRoles: string[];
  checkType: 'IDENTITY' | 'CREDENTIAL_VALIDITY' | 'REGULATORY_COUNCIL' | 'EXPIRY' | 'SCOPE_ADEQUACY' | 'DISCIPLINARY';
  status: 'PASSED' | 'FAILED' | 'PENDING' | 'INCONCLUSIVE';
  notes?: string;
  evidenceRef?: string;
}

export interface VerificationDecisionRequest {
  caseId: string;
  reviewerUserId: string;
  reviewerRoles: string[];
  decision: VerificationDecision;
  decisionReason: string;
  customRestrictions?: string[];
}

export class ProfessionalVerificationService {
  constructor(
    private readonly repo: IProfessionalRepository
  ) {}

  /**
   * Submits a verification case for formal governance review.
   */
  public async submitVerificationCase(req: SubmitVerificationRequest): Promise<ProfessionalVerificationCaseEntity> {
    const profile = await this.repo.findProfileById(req.professionalId);
    if (!profile) {
      throw new ProfessionalProfileRequiredError(`Profile ${req.professionalId} not found`);
    }

    if (profile.user_id !== req.applicantUserId) {
      throw new DomainInvariantError('Only the profile owner can submit their verification case');
    }

    const credentials = await this.repo.listCredentialsByProfessionalId(profile.id);
    const registrations = await this.repo.listRegistrationsByProfessionalId(profile.id);

    if (credentials.length === 0 && registrations.length === 0) {
      throw new DomainInvariantError('At least one credential or statutory registration must be attached before submission');
    }

    // Check for existing case
    let vCase = await this.repo.findVerificationCaseByProfessionalId(profile.id);
    const now = new Date().toISOString();

    if (!vCase) {
      vCase = {
        id: generateUUIDv7(),
        professional_id: profile.id,
        verification_type: req.verificationType || VerificationType.INITIAL_ONBOARDING,
        status: VerificationCaseStatus.SUBMITTED,
        submitted_at: now,
        required_evidence: req.requiredEvidenceRefs || [],
        verification_checks: [],
        policy_version: '1.0.0',
        created_at: now,
        updated_at: now
      };
    } else {
      validateStateTransition('VerificationCaseState', vCase.status, VerificationCaseStatus.SUBMITTED, vCase.id);
      vCase.status = VerificationCaseStatus.SUBMITTED;
      vCase.submitted_at = now;
      vCase.updated_at = now;
      if (req.requiredEvidenceRefs) {
        vCase.required_evidence = req.requiredEvidenceRefs;
      }
    }

    await this.repo.saveVerificationCase(vCase);

    // Update profile verification status
    profile.verification_status = ProfessionalVerificationState.SUBMITTED;
    profile.status = ProfessionalState.IN_VERIFICATION;
    profile.updated_at = now;
    await this.repo.saveProfile(profile);

    // Dispatch canonical event
    EventBus.enqueue(
      'professional.verification_requested',
      'professionals.verification_service',
      vCase.id,
      DataClassification.RESTRICTED,
      {
        verification_case_id: vCase.id,
        professional_id: profile.id,
        professional_type: profile.professional_type,
        verification_type: vCase.verification_type
      },
      { correlation_id: vCase.id, priority: EventPriority.NORMAL }
    );

    return vCase;
  }

  /**
   * Adds or updates an individual verification check on a verification case.
   */
  public async recordVerificationCheck(req: ReviewCheckRequest): Promise<ProfessionalVerificationCaseEntity> {
    const vCase = await this.repo.findVerificationCaseById(req.caseId);
    if (!vCase) {
      throw new DomainInvariantError(`Verification case ${req.caseId} not found`);
    }

    const profile = await this.repo.findProfileById(vCase.professional_id);
    if (!profile) {
      throw new ProfessionalProfileRequiredError('Associated professional profile not found');
    }

    // Separation of Duties
    ProfessionalInvariants.assertSeparationOfDuties(profile.user_id, req.reviewerUserId);
    ProfessionalInvariants.assertVerifierRole(req.reviewerRoles);

    // Transition case to IN_REVIEW if not already
    if (vCase.status === VerificationCaseStatus.SUBMITTED) {
      vCase.status = VerificationCaseStatus.IN_REVIEW;
      vCase.assigned_reviewer_id = req.reviewerUserId;
    }

    // If check is REGULATORY_COUNCIL, verify authority exists in canonical registry
    if (req.checkType === 'REGULATORY_COUNCIL') {
      const registrations = await this.repo.listRegistrationsByProfessionalId(profile.id);
      for (const reg of registrations) {
        const authority = AuthoritiesRegistry.getAuthority(reg.authority_id);
        if (!authority) {
          throw new DomainInvariantError(`Unrecognized regulatory authority: ${reg.authority_id}`);
        }
      }
    }

    const check: VerificationCheck = {
      id: generateUUIDv7(),
      check_type: req.checkType,
      status: req.status,
      notes: req.notes,
      evidence_ref: req.evidenceRef,
      checked_by: req.reviewerUserId,
      checked_at: new Date().toISOString()
    };

    // Replace existing check of same type or append
    const existingIndex = vCase.verification_checks.findIndex(c => c.check_type === req.checkType);
    if (existingIndex >= 0) {
      vCase.verification_checks[existingIndex] = check;
    } else {
      vCase.verification_checks.push(check);
    }

    vCase.updated_at = new Date().toISOString();
    await this.repo.saveVerificationCase(vCase);
    return vCase;
  }

  /**
   * Issues a formal verification decision (VERIFY, REJECT, ACTION_REQUIRED, RESTRICT).
   */
  public async issueDecision(req: VerificationDecisionRequest): Promise<ProfessionalVerificationCaseEntity> {
    const vCase = await this.repo.findVerificationCaseById(req.caseId);
    if (!vCase) {
      throw new DomainInvariantError(`Verification case ${req.caseId} not found`);
    }

    const profile = await this.repo.findProfileById(vCase.professional_id);
    if (!profile) {
      throw new ProfessionalProfileRequiredError('Associated professional profile not found');
    }

    // Separation of Duties & Verifier Role check
    ProfessionalInvariants.assertSeparationOfDuties(profile.user_id, req.reviewerUserId);
    ProfessionalInvariants.assertVerifierRole(req.reviewerRoles);

    const now = new Date().toISOString();
    vCase.decision = req.decision;
    vCase.decision_reason = req.decisionReason;
    vCase.assigned_reviewer_id = req.reviewerUserId;
    vCase.completed_at = now;
    vCase.updated_at = now;

    if (req.decision === VerificationDecision.VERIFY || req.decision === VerificationDecision.RESTRICT) {
      // Must have passed mandatory checks
      const checks = vCase.verification_checks;
      const hasFailedCheck = checks.some(c => c.status === 'FAILED');
      if (hasFailedCheck) {
        throw new DomainInvariantError('Cannot verify case with failed verification checks');
      }

      // Check unique registration numbers against duplicate attachments
      const registrations = await this.repo.listRegistrationsByProfessionalId(profile.id);
      for (const reg of registrations) {
        const existing = await this.repo.findRegistrationByAuthorityAndNumber(reg.authority_id, reg.registration_number);
        if (existing && existing.professional_id !== profile.id && existing.status === 'ACTIVE') {
          throw new DuplicateProfessionalRegistrationError(
            `Registration number ${reg.registration_number} under authority ${reg.authority_id} is already registered to another verified profile.`
          );
        }
      }

      // Check evidence tampering if hash is attached
      const credentials = await this.repo.listCredentialsByProfessionalId(profile.id);
      for (const cred of credentials) {
        if (cred.evidence_id) {
          const verificationResult = await GovernanceEvidenceService.verifyIntegrity(cred.evidence_id);
          if (!verificationResult.valid) {
            throw new EvidenceTamperingDetectedError(
              `Evidence vault tampering detected on credential document ${cred.id}: ${verificationResult.reason}`
            );
          }
        }
      }

      vCase.status = VerificationCaseStatus.VERIFIED;

      // Update credentials and registrations to ACTIVE/VERIFIED
      for (const cred of credentials) {
        cred.status = CredentialStatus.VERIFIED;
        cred.verified_at = now;
        cred.verified_by = req.reviewerUserId;
        cred.updated_at = now;
        await this.repo.saveCredential(cred);
      }

      for (const reg of registrations) {
        reg.status = 'ACTIVE';
        reg.last_verified_at = now;
        reg.updated_at = now;
        await this.repo.saveRegistration(reg);
      }

      // Derive Scope of Practice
      const derivedScope = ProfessionalScopeService.deriveScope(profile, registrations);
      if (req.decision === VerificationDecision.RESTRICT && req.customRestrictions) {
        derivedScope.status = 'RESTRICTED';
        derivedScope.restrictions.push(...req.customRestrictions);
      }
      await this.repo.saveScope(derivedScope);

      // Update Profile
      profile.verification_status = ProfessionalVerificationState.VERIFIED;
      profile.status = req.decision === VerificationDecision.RESTRICT ? ProfessionalState.RESTRICTED : ProfessionalState.ACTIVE;
      profile.updated_at = now;
      await this.repo.saveProfile(profile);

      // Synchronize Provider Registry
      let provider = await this.repo.findProviderByProfileId(profile.id);
      if (!provider) {
        provider = {
          id: generateUUIDv7(),
          professional_profile_id: profile.id,
          provider_type: profile.professional_type as any,
          status: ProviderStatus.ACTIVE,
          verification_status: ProfessionalVerificationState.VERIFIED,
          jurisdictions: profile.jurisdictions,
          organization_refs: profile.organization_refs,
          discoverability_status: DiscoverabilityStatus.DISCOVERABLE,
          created_at: now,
          updated_at: now
        };
      } else {
        provider.status = ProviderStatus.ACTIVE;
        provider.verification_status = ProfessionalVerificationState.VERIFIED;
        provider.discoverability_status = DiscoverabilityStatus.DISCOVERABLE;
        provider.updated_at = now;
      }
      await this.repo.saveProvider(provider);

      // Emit canonical event
      const eventType = req.decision === VerificationDecision.RESTRICT ? 'professional.restricted' : 'professional.verified';
      EventBus.enqueue(
        eventType,
        'professionals.verification_service',
        profile.id,
        DataClassification.RESTRICTED,
        {
          verification_case_id: vCase.id,
          professional_id: profile.id,
          reviewer_id: req.reviewerUserId,
          decision: req.decision,
          scope_id: derivedScope.id,
          provider_id: provider.id
        },
        { correlation_id: vCase.id, priority: EventPriority.HIGH }
      );
    } else if (req.decision === VerificationDecision.REJECT) {
      vCase.status = VerificationCaseStatus.REJECTED;
      profile.verification_status = ProfessionalVerificationState.REJECTED;
      profile.status = ProfessionalState.ACTION_REQUIRED;
      profile.updated_at = now;
      await this.repo.saveProfile(profile);
    } else if (req.decision === VerificationDecision.MORE_INFORMATION_REQUIRED) {
      vCase.status = VerificationCaseStatus.ACTION_REQUIRED;
      profile.verification_status = ProfessionalVerificationState.ACTION_REQUIRED;
      profile.status = ProfessionalState.ACTION_REQUIRED;
      profile.updated_at = now;
      await this.repo.saveProfile(profile);
    }

    await this.repo.saveVerificationCase(vCase);
    return vCase;
  }

  /**
   * Suspends a professional from the network due to safety, regulatory, or conduct cause (ADR-031).
   */
  public async suspendProfessional(
    professionalId: string,
    reasonCode: SuspensionReasonCode,
    details: string,
    authorizedByUserId: string
  ): Promise<void> {
    const profile = await this.repo.findProfileById(professionalId);
    if (!profile) {
      throw new ProfessionalProfileRequiredError(`Profile ${professionalId} not found`);
    }

    const now = new Date().toISOString();
    profile.status = ProfessionalState.SUSPENDED;
    profile.updated_at = now;
    await this.repo.saveProfile(profile);

    // Suspend active scope
    const scope = await this.repo.findActiveScopeByProfessionalId(profile.id);
    if (scope) {
      scope.status = 'SUSPENDED';
      scope.updated_at = now;
      await this.repo.saveScope(scope);
    }

    // Suspend provider and hide from directory
    const provider = await this.repo.findProviderByProfileId(profile.id);
    if (provider) {
      provider.status = ProviderStatus.SUSPENDED;
      provider.discoverability_status = DiscoverabilityStatus.SUSPENDED;
      provider.updated_at = now;
      await this.repo.saveProvider(provider);

      // Suspend all service offerings
      const services = await this.repo.listServiceOfferingsByProviderId(provider.id);
      for (const service of services) {
        if (service.status === ServiceOfferingStatus.ACTIVE) {
          service.status = ServiceOfferingStatus.SUSPENDED;
          service.updated_at = now;
          await this.repo.saveServiceOffering(service);

          // Emit service suspended
          EventBus.enqueue(
            'professional.service_suspended',
            'professionals.verification_service',
            service.id,
            DataClassification.INTERNAL,
            {
              service_id: service.id,
              provider_id: provider.id,
              reason: details
            },
            { correlation_id: professionalId, priority: EventPriority.HIGH }
          );
        }
      }
    }

    // Emit professional.suspended
    EventBus.enqueue(
      'professional.suspended',
      'professionals.verification_service',
      professionalId,
      DataClassification.RESTRICTED,
      {
        professional_id: professionalId,
        reason_code: reasonCode,
        details,
        suspended_by: authorizedByUserId
      },
      { correlation_id: professionalId, priority: EventPriority.CRITICAL }
    );
  }

  /**
   * Continuous Credential Expiry & Regulatory Lifecycle Audit.
   * ADR-027: Evaluates expiring and expired licenses and triggers scope recalculations.
   */
  public async evaluateCredentialExpirations(): Promise<{ expiringCount: number; expiredCount: number }> {
    const allRegistrations = await this.repo.listAllRegistrations();
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    let expiringCount = 0;
    let expiredCount = 0;

    for (const reg of allRegistrations) {
      const expiryTime = new Date(reg.expires_at).getTime();

      if (expiryTime <= now && reg.status !== 'EXPIRED') {
        // Expired!
        expiredCount++;
        reg.status = 'EXPIRED';
        reg.updated_at = new Date().toISOString();
        await this.repo.saveRegistration(reg);

        const profile = await this.repo.findProfileById(reg.professional_id);
        if (profile) {
          // If no other active registration exists, transition profile
          const allProRegs = await this.repo.listRegistrationsByProfessionalId(profile.id);
          const hasRemainingActive = allProRegs.some(r => r.id !== reg.id && r.status === 'ACTIVE' && new Date(r.expires_at).getTime() > now);

          if (!hasRemainingActive) {
            profile.status = ProfessionalState.EXPIRED;
            profile.updated_at = new Date().toISOString();
            await this.repo.saveProfile(profile);

            // Hide from directory
            const provider = await this.repo.findProviderByProfileId(profile.id);
            if (provider) {
              provider.discoverability_status = DiscoverabilityStatus.HIDDEN;
              provider.status = ProviderStatus.RESTRICTED;
              provider.updated_at = new Date().toISOString();
              await this.repo.saveProvider(provider);
            }
          }

          // Emit professional.credential_expired
          EventBus.enqueue(
            'professional.credential_expired',
            'professionals.verification_service',
            reg.id,
            DataClassification.INTERNAL,
            {
              registration_id: reg.id,
              professional_id: reg.professional_id,
              authority_id: reg.authority_id,
              expired_at: reg.expires_at
            },
            { correlation_id: reg.id, priority: EventPriority.CRITICAL }
          );
        }
      } else if (expiryTime > now && (expiryTime - now) <= thirtyDaysMs) {
        // Expiring within 30 days
        expiringCount++;
        EventBus.enqueue(
          'professional.credential_expiring',
          'professionals.verification_service',
          reg.id,
          DataClassification.INTERNAL,
          {
            registration_id: reg.id,
            professional_id: reg.professional_id,
            authority_id: reg.authority_id,
            expires_at: reg.expires_at,
            days_remaining: Math.ceil((expiryTime - now) / (24 * 60 * 60 * 1000))
          },
          { correlation_id: reg.id, priority: EventPriority.HIGH }
        );
      }
    }

    return { expiringCount, expiredCount };
  }
}
