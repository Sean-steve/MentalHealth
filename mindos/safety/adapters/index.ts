/**
 * MindOS Safety Adapters: AI, Assessment, Community, Professional, Trusted Contact, and Emergency Services
 * Authority: Volumes I, V, XII, XV & Appendices B / C / Q
 */

import {
  SafetyMode,
  SignalSourceType,
  SignalProvenance,
  SignalSeverity,
  SignalConfidence,
  RiskState
} from '../domain/types.js';
import { CrisisResponseOrchestrator } from '../application/crisis_response_orchestrator.js';
import { RawSignalInput } from '../signals/normalizer.js';
import { RoleCode } from '../../platform/authorization/domain/types.js';
import { SafetyAccessDeniedError } from '../domain/errors.js';

/**
 * 1. AI Safety Adapter: Contract with AI Assistant & Conversation pipelines.
 */
export class AISafetyAdapter {
  constructor(private orchestrator: CrisisResponseOrchestrator) {}

  /**
   * Scans candidate AI conversation message. If safety triggers match, ingests signal and assesses override.
   */
  public async interceptMessage(params: {
    userId: string;
    conversationId: string;
    messageText: string;
    jurisdiction?: string;
  }): Promise<{
    shouldOverride: boolean;
    overrideMessage?: string;
    safetyMode: SafetyMode;
    crisisResources?: any[];
  }> {
    const text = params.messageText.toLowerCase();

    // Check for acute crisis keywords (suicidal intent / plan / acute attempt)
    let candidateCode: string | null = null;
    let customSeverity = SignalSeverity.LOW;
    let customConfidence = SignalConfidence.HIGH;

    if (
      text.includes('kill myself') ||
      text.includes('end my life') ||
      text.includes('want to die') ||
      text.includes('suicide') ||
      text.includes('take all my pills') ||
      text.includes('hang myself')
    ) {
      candidateCode = 'SIG_SUICIDAL_INTENT_ACTIVE';
      customSeverity = SignalSeverity.CRITICAL;
      customConfidence = SignalConfidence.HIGH;
    } else if (text.includes('hurt myself') || text.includes('cut myself') || text.includes('bleeding')) {
      candidateCode = 'SIG_SELF_HARM_ACTIVE_URGE';
      customSeverity = SignalSeverity.HIGH;
      customConfidence = SignalConfidence.MEDIUM;
    } else if (text.includes('cannot go on') || text.includes('hopeless') || text.includes('unbearable')) {
      candidateCode = 'SIG_SEVERE_DISTRESS_OVERWHELM';
      customSeverity = SignalSeverity.MEDIUM;
      customConfidence = SignalConfidence.MEDIUM;
    }

    if (candidateCode) {
      const packet = await this.orchestrator.handleSafetySignal({
        subject_user_id: params.userId,
        signal_code: candidateCode,
        source_type: SignalSourceType.AI_INTERACTION,
        source_reference: params.conversationId,
        provenance: SignalProvenance.AI_INFERRED,
        raw_text: params.messageText,
        jurisdiction: params.jurisdiction || 'KE',
        custom_severity: customSeverity,
        custom_confidence: customConfidence
      });

      if (packet.safetyMode === SafetyMode.CRITICAL_SAFETY || packet.safetyMode === SafetyMode.HIGH_RISK) {
        return {
          shouldOverride: true,
          overrideMessage: packet.deterministicSafetySupportMessage || 'We are here with you. Confidential crisis support is available right now.',
          safetyMode: packet.safetyMode,
          crisisResources: packet.crisisResources
        };
      }

      return {
        shouldOverride: false,
        safetyMode: packet.safetyMode,
        crisisResources: packet.crisisResources
      };
    }

    // Default posture check
    const posture = await this.orchestrator.getUserSafetyPosture(params.userId, params.jurisdiction);
    if (posture.safetyMode === SafetyMode.CRITICAL_SAFETY) {
      return {
        shouldOverride: true,
        overrideMessage: 'Your safety is our top priority. Please connect with our verified crisis resources immediately.',
        safetyMode: posture.safetyMode,
        crisisResources: posture.crisisResources
      };
    }

    return {
      shouldOverride: false,
      safetyMode: posture.safetyMode
    };
  }
}

/**
 * 2. Assessment Safety Port: Immediate acute item extraction from clinical instruments.
 */
export class AssessmentSafetyPort {
  constructor(private orchestrator: CrisisResponseOrchestrator) {}

  /**
   * Processes an item response from PHQ-9, Columbia, or other clinical assessment.
   * R-SAFE-001: Triggers Safety Kernel immediately on acute item without waiting for full assessment completion!
   */
  public async processAssessmentItem(params: {
    userId: string;
    assessmentId: string;
    instrumentCode: string;
    itemNumber: number;
    score: number;
    jurisdiction?: string;
  }): Promise<void> {
    // PHQ-9 Question 9: "Thoughts that you would be better off dead, or of hurting yourself"
    if (params.instrumentCode === 'PHQ-9' && params.itemNumber === 9 && params.score > 0) {
      let code = 'SIG_SUICIDAL_IDEATION_PASSIVE';
      let severity = SignalSeverity.HIGH;

      if (params.score >= 2) {
        // More than half the days or nearly every day
        code = 'SIG_SUICIDAL_INTENT_ACTIVE';
        severity = SignalSeverity.CRITICAL;
      }

      await this.orchestrator.handleSafetySignal({
        subject_user_id: params.userId,
        signal_code: code,
        source_type: SignalSourceType.ASSESSMENT,
        source_reference: `${params.instrumentCode}:${params.assessmentId}:Q${params.itemNumber}`,
        provenance: SignalProvenance.CLINICALLY_ASSESSED,
        jurisdiction: params.jurisdiction || 'KE',
        custom_severity: severity,
        custom_confidence: SignalConfidence.CONFIRMED
      });
    }
  }
}

/**
 * 3. Community Safety Port: Translates urgent post/chat flags to safety signals.
 */
export class CommunitySafetyPort {
  constructor(private orchestrator: CrisisResponseOrchestrator) {}

  public async processFlaggedCommunityContent(params: {
    authorUserId: string;
    contentId: string;
    flagReason: string;
    flaggedText?: string;
    jurisdiction?: string;
  }): Promise<void> {
    await this.orchestrator.handleSafetySignal({
      subject_user_id: params.authorUserId,
      signal_code: 'SIG_SUICIDAL_INTENT_ACTIVE',
      source_type: SignalSourceType.COMMUNITY_CONTENT,
      source_reference: params.contentId,
      provenance: SignalProvenance.USER_REPORTED,
      raw_text: params.flaggedText,
      jurisdiction: params.jurisdiction || 'KE',
      custom_severity: SignalSeverity.CRITICAL,
      custom_confidence: SignalConfidence.MEDIUM
    });
  }
}

/**
 * 4. Professional Safety Port: Allows verified clinicians to record observations.
 */
export class ProfessionalSafetyPort {
  constructor(private orchestrator: CrisisResponseOrchestrator) {}

  public async recordClinicianObservation(params: {
    clinicianId: string;
    clinicianRole: string;
    subjectUserId: string;
    signalCode: string;
    clinicalNotes: string;
    severity: SignalSeverity;
    jurisdiction?: string;
  }): Promise<void> {
    if (
      params.clinicianRole !== RoleCode.CLINICAL_REVIEWER &&
      params.clinicianRole !== RoleCode.PROFESSIONAL &&
      params.clinicianRole !== RoleCode.VERIFIED_PROFESSIONAL
    ) {
      throw new SafetyAccessDeniedError('Only verified clinicians may record formal clinical safety observations.');
    }

    await this.orchestrator.handleSafetySignal({
      subject_user_id: params.subjectUserId,
      signal_code: params.signalCode,
      source_type: SignalSourceType.PROFESSIONAL_REPORT,
      source_reference: `CLINICIAN:${params.clinicianId}`,
      provenance: SignalProvenance.PROFESSIONAL_RECORDED,
      jurisdiction: params.jurisdiction || 'KE',
      custom_severity: params.severity,
      custom_confidence: SignalConfidence.CONFIRMED,
      indicators: {
        intent: 'ACTIVE',
        is_negated_or_academic: false
      }
    });
  }
}

/**
 * 5. Trusted Contact Safety Port: Guarded dispatch with explicit consent check.
 */
export class TrustedContactSafetyPort {
  public static evaluateEligibility(userConsentConfig: {
    hasTrustedContactConfigured: boolean;
    hasExplicitCrisisConsent: boolean;
    isDeceasedOrRevoked: boolean;
  }): { eligible: boolean; blockReason?: string } {
    if (!userConsentConfig.hasTrustedContactConfigured) {
      return { eligible: false, blockReason: 'No trusted contact registered for user.' };
    }
    if (!userConsentConfig.hasExplicitCrisisConsent) {
      return { eligible: false, blockReason: 'User has not granted explicit consent for trusted contact crisis notification.' };
    }
    if (userConsentConfig.isDeceasedOrRevoked) {
      return { eligible: false, blockReason: 'Trusted contact consent has been revoked or suspended.' };
    }
    return { eligible: true };
  }
}
