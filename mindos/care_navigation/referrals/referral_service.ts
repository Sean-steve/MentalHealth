/**
 * MindOS Referral Orchestration Service
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Clinical Safety Policy Catalogue (R-SAFE-001, R-NAV-001..010)
 * Kenya Data Protection Act 2019, Digital Health Act 2023
 */

import {
  ReferralEntity,
  ReferralState,
  ReferralUrgency,
  CareLevel,
  SupportNeedDomain,
  NeedAcuity
} from '../domain/types.js';
import { CareNavigationInvariants } from '../domain/invariants.js';
import { HandoffService } from './handoff_service.js';
import { ProviderMatcher } from '../matching/provider_matcher.js';
import { ConsentService, ConsentCode } from '../../consent/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { AuditService } from '../../platform/audit/index.js';
import { NotFoundError, AuthorizationError } from '../../platform/errors/index.js';
import { B29MutableStateStore } from '../../b29/mutable_state_store.js';
import { ProfessionalService } from '../../professionals/index.js';
import { isSystemPostgresPersistenceEnabled } from '../../platform/database/persistence_mode.js';

export interface CreateReferralParams {
  userId: string;
  navigationSessionId?: string;
  pathwayId?: string;
  careLevel: CareLevel;
  urgency?: ReferralUrgency;
  receivingProviderId?: string;
  receivingOrganizationId?: string;
  receivingServiceType: string;
  reasonCodes?: string[];
  clinicalSummaryNotes?: string;
  primaryNeed?: SupportNeedDomain;
  acuity?: NeedAcuity;
  screeningSummaries?: Array<{
    instrument: string;
    band: string;
    score: number;
    disclaimer: string;
  }>;
  actorId?: string;
  autoReady?: boolean;
}

export class ReferralService {
  private static referrals: Map<string, ReferralEntity> = new Map();
  private static durablePersistenceEnabled = false;

  public static async enableDurablePersistence(): Promise<void> {
    this.durablePersistenceEnabled=true;
    this.referrals.clear();
    for(const record of await B29MutableStateStore.list<ReferralEntity>('CARE_NAVIGATION','REFERRAL')){
      const referral=record.payload;
      this.referrals.set(referral.id,referral);
    }
  }

  public static disableDurablePersistenceForTesting(): void {
    this.durablePersistenceEnabled=false;
  }

  private static async persist(referral:ReferralEntity):Promise<void>{
    this.referrals.set(referral.id,referral);
    if(this.durablePersistenceEnabled){
      await B29MutableStateStore.put({
        domain:'CARE_NAVIGATION',entity_type:'REFERRAL',entity_id:referral.id,
        owner_id:referral.user_id,parent_id:referral.navigation_session_id,
        status:String(referral.state),payload:referral
      });
    }
  }

  /**
   * Creates a canonical referral with explicit consent gate & minimum-necessary handoff package
   */
  public static async createReferral(params: CreateReferralParams): Promise<ReferralEntity> {
    const actorId = params.actorId || params.userId;

    // 1. Consent Gate (R-NAV-003)
    const sharingGrant = ConsentService.getInstance().getRepository()
      .getActiveGrant(params.userId, ConsentCode.PROFESSIONAL_DATA_SHARING);
    const recipientAuthorized = Boolean(
      sharingGrant && (
        !params.receivingProviderId ||
        (sharingGrant.recipients || []).some(
          recipient => recipient.recipient_type === 'PROFESSIONAL' &&
                       recipient.recipient_id === params.receivingProviderId &&
                       (!recipient.expires_at || Date.parse(recipient.expires_at) > Date.now())
        )
      )
    );
    const referralConsent = ConsentService.getConsentReceipt(params.userId, 'CARE_REFERRAL') ||
                            ConsentService.getConsentReceipt(params.userId, 'REFERRAL_SHARING') ||
                            ConsentService.getConsentReceipt(params.userId, 'CLINICAL_CONSULTATION') ||
                            ConsentService.getConsentReceipt(params.userId, 'TERMS_OF_SERVICE');

    const hasConsent = recipientAuthorized || Boolean(referralConsent);
    CareNavigationInvariants.assertReferralConsent(hasConsent);

    // 2. Verified Provider Gate (R-NAV-004)
    if (params.receivingProviderId) {
      const fullPersistence=isSystemPostgresPersistenceEnabled();
      if(fullPersistence){
        const verified=await ProfessionalService.isVerifiedAsync(params.receivingProviderId);
        if(!verified)throw new AuthorizationError('Receiving provider is not durably verified and active for referral.');
      }else{
        ProviderMatcher.assertProviderReadyForReferral(params.receivingProviderId);
      }
    }

    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const urgency = params.urgency || ReferralUrgency.ROUTINE;
    const initialState = params.autoReady ? ReferralState.READY : ReferralState.DRAFT;

    // Expiration: Emergency 24h, Urgent 3d, Routine 14d
    const ttlDays = urgency === ReferralUrgency.EMERGENCY ? 1 : (urgency === ReferralUrgency.URGENT ? 3 : 14);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

    const referral: ReferralEntity = {
      id,
      user_id: params.userId,
      navigation_session_id: params.navigationSessionId,
      pathway_id: params.pathwayId,
      care_level: params.careLevel,
      urgency,
      state: initialState,
      receiving_provider_id: params.receivingProviderId,
      receiving_organization_id: params.receivingOrganizationId,
      receiving_service_type: params.receivingServiceType,
      reason_codes: params.reasonCodes,
      consent_grant_id: recipientAuthorized ? sharingGrant?.id : referralConsent?.id,
      history: [
        {
          from_state: ReferralState.DRAFT,
          to_state: initialState,
          actor_id: actorId,
          timestamp: now,
          reason: 'Referral initialized'
        }
      ],
      expires_at: expiresAt,
      created_at: now,
      updated_at: now
    };

    // 3. Create Tamper-Evident Minimum Necessary Handoff Package
    const pseudonym = `PT-${params.userId.substring(0, 8).toUpperCase()}`;
    const handoffPkg = await HandoffService.createHandoffPackageDurable({
      referral,
      payloadData: {
        patient_pseudonym: pseudonym,
        care_level: params.careLevel,
        primary_need: params.primaryNeed || SupportNeedDomain.GENERAL_WELLBEING,
        acuity: params.acuity || NeedAcuity.MODERATE,
        urgency,
        screening_summaries: params.screeningSummaries || [],
        referral_reason: (params.reasonCodes && params.reasonCodes.length > 0) ? params.reasonCodes.join(', ') : ((params as any).referralReason || 'Clinical support referral')
      },
      ttlDays
    });

    referral.clinical_summary_hash = handoffPkg.evidence_hash;
    referral.handoff_package_id = handoffPkg.id;
    referral.status = referral.state;
    await ReferralService.persist(referral);

    // 4. Events & Audit
    EventBus.enqueue(
      'referral.created',
      'referrals',
      id,
      DataClassification.SENSITIVE,
      {
        referral_id: id,
        user_id: params.userId,
        care_level: params.careLevel,
        urgency,
        initial_state: initialState,
        receiving_provider_id: params.receivingProviderId
      }
    );

    AuditService.record({
      actor_type: 'USER',
      actor_id: actorId,
      action: 'REFERRAL.CREATED',
      resource_type: 'referrals',
      resource_id: id,
      purpose: 'Care Transition Creation',
      authorization_basis: { consent_receipt_id: referralConsent?.id },
      result: 'ALLOWED'
    });

    return referral;
  }

  /**
   * Transitions referral through canonical state machine
   */
  public static async transitionReferral(params: {
    referralId: string;
    targetState: ReferralState;
    actorId?: string;
    reason?: string;
    actionNotes?: string;
  }): Promise<ReferralEntity> {
    const referral = ReferralService.requireReferral(params.referralId);
    const now = new Date().toISOString();
    const actorId = params.actorId || 'SYSTEM';

    // 1. Enforce State Machine Invariant
    CareNavigationInvariants.validateReferralTransition(referral, params.targetState, actorId);

    const fromState = referral.state;
    referral.state = params.targetState;
    referral.status = params.targetState;
    referral.updated_at = now;

    if (params.targetState === (ReferralState as any).TRANSMITTED || params.targetState === ReferralState.SUBMITTED) {
      referral.transmitted_at = now;
    }
    if (params.targetState === ReferralState.COMPLETED) {
      referral.completed_at = now;
    }

    if (params.actionNotes) {
      referral.action_notes = params.actionNotes;
    }
    if (params.targetState === ReferralState.DECLINED && params.reason) {
      referral.rejection_reason = params.reason;
    }
    if (params.targetState === ReferralState.COMPLETED || params.targetState === ReferralState.CANCELLED || params.targetState === ReferralState.DECLINED) {
      referral.closed_at = now;
    }

    referral.history.push({
      from_state: fromState,
      to_state: params.targetState,
      actor_id: actorId,
      timestamp: now,
      reason: params.reason
    });

    await ReferralService.persist(referral);

    // 2. Automatic Privacy Revocation on Cancellation or Decline
    if (params.targetState === ReferralState.CANCELLED || params.targetState === ReferralState.DECLINED) {
      try {
        await HandoffService.revokeHandoffPackageDurable({
          packageIdOrReferralId: referral.id,
          actorId,
          reason: `Referral transitioned to ${params.targetState}`
        });
      } catch {
        // Handoff package might already be revoked
      }
    }

    // 3. Domain Events
    EventBus.enqueue(
      'referral.status_changed',
      'referrals',
      referral.id,
      DataClassification.SENSITIVE,
      {
        referral_id: referral.id,
        from_state: fromState,
        to_state: params.targetState,
        actor_id: actorId
      }
    );

    if (params.targetState === ReferralState.SUBMITTED) {
      EventBus.enqueue('referral.submitted', 'referrals', referral.id, DataClassification.SENSITIVE, { referral_id: referral.id });
    } else if (params.targetState === ReferralState.ACCEPTED) {
      EventBus.enqueue('referral.accepted', 'referrals', referral.id, DataClassification.SENSITIVE, { referral_id: referral.id });
    } else if (params.targetState === ReferralState.DECLINED) {
      EventBus.enqueue('referral.declined', 'referrals', referral.id, DataClassification.SENSITIVE, { referral_id: referral.id, reason: params.reason });
    } else if (params.targetState === ReferralState.CANCELLED) {
      EventBus.enqueue('referral.cancelled', 'referrals', referral.id, DataClassification.SENSITIVE, { referral_id: referral.id });
    }

    AuditService.record({
      actor_type: 'USER',
      actor_id: actorId,
      action: 'REFERRAL.TRANSITION',
      resource_type: 'referrals',
      resource_id: referral.id,
      purpose: 'Referral Lifecycle Progression',
      authorization_basis: { from_state: fromState, to_state: params.targetState },
      result: 'ALLOWED'
    });

    return referral;
  }

  public static getReferral(id: string): ReferralEntity | undefined {
    return ReferralService.referrals.get(id);
  }

  public static requireReferral(id: string): ReferralEntity {
    const r = ReferralService.getReferral(id);
    if (!r) {
      throw new NotFoundError(`Referral "${id}" not found.`);
    }
    return r;
  }

  public static listReferralsForUser(userId: string): ReferralEntity[] {
    return Array.from(ReferralService.referrals.values())
      .filter(r => r.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public static listReferralsForProvider(providerId: string): ReferralEntity[] {
    return Array.from(ReferralService.referrals.values())
      .filter(r => r.receiving_provider_id === providerId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public static reset(): void {
    ReferralService.referrals.clear();
  }

  public static resetForTesting(): void {
    ReferralService.referrals.clear();
  }
}
