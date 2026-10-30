/**
 * MindOS Safety Bounded Context REST Endpoints
 * Authority: Volumes I, V, IX, XV & Clinical Safety Policy Catalogue
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getSafetyRepository } from '../repositories/index.js';
import { CrisisResponseOrchestrator } from '../application/crisis_response_orchestrator.js';
import { ResourceRegistryService } from '../application/resource_registry_service.js';
import { SafetyEscalationService } from '../application/escalation_service.js';
import { SafetyBreakGlassService } from '../application/break_glass_service.js';
import { SafetyReconciliationService } from '../application/reconciliation_service.js';
import { SafetyReviewHandler } from '../review/review_handler.js';
import { RiskState, SignalSourceType, SignalProvenance } from '../domain/types.js';
import { MindOSError } from '../../platform/errors/index.js';

export function createSafetyRouter(): Router {
  const router = Router();
  const repo = getSafetyRepository();

  const crisisOrchestrator = new CrisisResponseOrchestrator(repo);
  const resourceService = new ResourceRegistryService(repo);
  const escalationService = new SafetyEscalationService(repo);
  const breakGlassService = new SafetyBreakGlassService(repo);
  const reconciliationService = new SafetyReconciliationService(repo);

  /**
   * Helper to format crisis resource for clients safely (R-SAFE-003)
   */
  const formatCrisisResource = (r: any) => {
    const phones: string[] = [];
    if (r.phone) phones.push(r.phone);
    if (r.sms) phones.push(`SMS: ${r.sms}`);
    if (r.contact_json?.phone) phones.push(r.contact_json.phone);
    if (r.contact_json?.sms) phones.push(`SMS: ${r.contact_json.sms}`);
    if (r.contact_json?.whatsapp) phones.push(`WhatsApp: ${r.contact_json.whatsapp}`);
    if (phones.length === 0 && r.physical_reference) phones.push(r.physical_reference);
    if (phones.length === 0 && r.contact_json?.address) phones.push(r.contact_json.address);
    if (phones.length === 0) phones.push('Referral Facility');

    return {
      ...r,
      phone_numbers: Array.isArray(r.phone_numbers) && r.phone_numbers.length > 0 ? r.phone_numbers : phones,
      operating_hours: r.availability_json?.hours || '24/7',
      is_toll_free: Boolean(r.availability_json?.free_of_charge ?? true),
      is_verified: r.verification_status === 'VERIFIED',
      category: r.resource_type ? r.resource_type.replace(/_/g, ' ') : 'Crisis Resource'
    };
  };

  /**
   * Ingest Signal and Orchestrate Crisis Response
   * POST /api/v1/safety/signals
   */
  router.post('/signals', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        subject_user_id,
        signal_code,
        source_type = SignalSourceType.USER_SELF_REPORT,
        source_reference,
        provenance = SignalProvenance.USER_REPORTED,
        raw_text,
        jurisdiction = 'KE',
        custom_severity,
        custom_confidence,
        indicators
      } = req.body;

      if (!subject_user_id || !signal_code) {
        return res.status(400).json({
          error: 'Validation failed: subject_user_id and signal_code are required.'
        });
      }

      const packet = await crisisOrchestrator.handleSafetySignal({
        subject_user_id,
        signal_code,
        source_type,
        source_reference,
        provenance,
        raw_text,
        jurisdiction,
        custom_severity,
        custom_confidence,
        indicators
      });

      return res.status(200).json({
        ...packet,
        crisisResources: packet.crisisResources.map(formatCrisisResource)
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Get Active User Safety Posture
   * GET /api/v1/safety/posture/:userId
   */
  router.get('/posture/:userId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const jurisdiction = (req.query.jurisdiction as string) || 'KE';
      const posture = await crisisOrchestrator.getUserSafetyPosture(userId, jurisdiction);

      return res.status(200).json({
        ...posture,
        crisisResources: posture.crisisResources.map(formatCrisisResource)
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Query Verified, Unexpired Crisis Resources (Kenya-first)
   * GET /api/v1/safety/resources
   */
  router.get('/resources', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jurisdiction = (req.query.country as string) || (req.query.jurisdiction as string) || 'KE';
      const category = req.query.category as string | undefined;

      const rawResources = await resourceService.getVerifiedResources({
        jurisdiction,
        riskCategory: category
      });

      const formatted = rawResources.map(formatCrisisResource);
      return res.status(200).json({
        country_code: jurisdiction.toUpperCase(),
        total: formatted.length,
        resources: formatted
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * List Active Safety Escalations
   * GET /api/v1/safety/escalations
   */
  router.get('/escalations', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const team = req.query.team as string | undefined;
      const escalations = await repo.getActiveEscalations(team);
      return res.status(200).json({
        total: escalations.length,
        escalations
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Reviewer Acknowledges Escalation
   * POST /api/v1/safety/escalations/:id/acknowledge
   */
  router.post('/escalations/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { reviewer_id, reviewer_role } = req.body;

      if (!reviewer_id || !reviewer_role) {
        return res.status(400).json({
          error: 'reviewer_id and reviewer_role are required.'
        });
      }

      const updated = await escalationService.acknowledgeEscalation(id, {
        actor_id: reviewer_id,
        role: reviewer_role
      });

      return res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Reviewer Resolves Escalation
   * POST /api/v1/safety/escalations/:id/resolve
   */
  router.post('/escalations/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { reviewer_id, reviewer_role, outcome } = req.body;

      if (!reviewer_id || !reviewer_role || !outcome) {
        return res.status(400).json({
          error: 'reviewer_id, reviewer_role, and substantive outcome are required.'
        });
      }

      const updated = await escalationService.resolveEscalation(
        id,
        { actor_id: reviewer_id, role: reviewer_role },
        outcome
      );

      return res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Clinical Safety Review Submission
   * POST /api/v1/safety/reviews
   */
  router.post('/reviews', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        subject_user_id,
        escalation_id,
        reviewer_id,
        reviewer_role,
        qualification_reference,
        decision,
        proposed_risk_level,
        rationale,
        evidence_refs,
        clinical_artifact_ref,
        policy_version
      } = req.body;

      // Current risk state
      const current = await repo.getCurrentRiskState(subject_user_id);
      const currentLevel = current ? current.level : RiskState.UNKNOWN;

      const reviewResult = SafetyReviewHandler.handleReview({
        subject_user_id,
        escalation_id,
        current_risk_state: currentLevel,
        reviewer_id,
        reviewer_role,
        qualification_reference,
        decision,
        proposed_risk_level,
        rationale,
        evidence_refs,
        clinical_artifact_ref,
        policy_version
      });

      await repo.saveReview(reviewResult.review);

      // If state changed, update authoritative risk state
      if (reviewResult.stateChanged && proposed_risk_level) {
        await repo.saveRiskState({
          id: reviewResult.review.id,
          subject_user_id,
          level: proposed_risk_level,
          state_version: (current?.state_version || 0) + 1,
          effective_at: new Date().toISOString(),
          previous_state: currentLevel,
          reason_codes: ['CLINICAL_REVIEW_OVERRIDE'],
          evidence_refs: evidence_refs || [],
          policy_version: policy_version || '2.0.0',
          clinical_artifact_ref: clinical_artifact_ref || 'ART-SAFE-001',
          source_summary: { reviewer_id, decision, rationale },
          fresh_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          status: 'CURRENT',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      return res.status(201).json(reviewResult);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Emergency Break-Glass Override
   * POST /api/v1/safety/break-glass/initiate
   */
  router.post('/break-glass/initiate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subject_user_id, actor_id, actor_role, justification, durationMinutes } = req.body;

      const session = await breakGlassService.initiateSession({
        subject_user_id,
        actor_id,
        actor_role,
        justification,
        durationMinutes
      });

      return res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Terminate Break-Glass Session
   * POST /api/v1/safety/break-glass/terminate
   */
  router.post('/break-glass/terminate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subject_user_id, actor_id } = req.body;
      await breakGlassService.terminateSession(subject_user_id, actor_id);
      return res.status(200).json({ status: 'TERMINATED', subject_user_id, actor_id });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Safety Integrity Reconciliation
   * POST /api/v1/safety/reconcile
   */
  router.post('/reconcile', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sampleUserIds = [] } = req.body;
      const report = await reconciliationService.reconcile(sampleUserIds);
      return res.status(200).json(report);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Incident Ledger
   * GET /api/v1/safety/incidents
   */
  router.get('/incidents', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status as string | undefined;
      const incidents = await repo.getIncidents(status);
      return res.status(200).json({ total: incidents.length, incidents });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
