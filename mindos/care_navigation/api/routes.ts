/**
 * MindOS Canonical Care Navigation & Referral API Router
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * API Catalogue & Clinical Safety Policy Catalogue (R-SAFE-001, R-NAV-001..010)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { NavigationSessionService } from '../navigation/session_service.js';
import { CarePathwayRegistry } from '../registry/pathway_registry.js';
import { ProviderMatcher } from '../matching/provider_matcher.js';
import { ReferralService } from '../referrals/referral_service.js';
import { HandoffService } from '../referrals/handoff_service.js';
import { CareAssessmentAdapter } from '../ports/assessment_adapter.js';
import { CareLevel, SupportNeedDomain, ReferralUrgency, ReferralState } from '../domain/types.js';

export const careNavigationRouter = Router();

// ==========================================
// 1. Care Pathways
// ==========================================

careNavigationRouter.get('/pathways', (req: Request, res: Response, next: NextFunction) => {
  try {
    const careLevel = req.query.care_level as CareLevel | undefined;
    const needDomain = req.query.need_domain as SupportNeedDomain | undefined;
    const pathways = CarePathwayRegistry.listPathways({ careLevel, needDomain });
    res.json({ total: pathways.length, pathways });
  } catch (err) {
    next(err);
  }
});

careNavigationRouter.get('/pathways/:idOrCode', (req: Request, res: Response, next: NextFunction) => {
  try {
    const pathway = CarePathwayRegistry.requirePathway(req.params.idOrCode);
    res.json({ pathway });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. Care Navigation Sessions
// ==========================================

careNavigationRouter.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, declaredNeeds, assessmentResultIds } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const session = await NavigationSessionService.startSession({
      userId,
      declaredNeeds,
      assessmentResultIds
    });

    res.status(201).json({ session });
  } catch (err) {
    next(err);
  }
});

careNavigationRouter.get('/sessions/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = NavigationSessionService.requireSession(req.params.id);
    res.json({ session });
  } catch (err) {
    next(err);
  }
});

careNavigationRouter.get('/sessions/user/:userId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = NavigationSessionService.listUserSessions(req.params.userId);
    res.json({ total: sessions.length, sessions });
  } catch (err) {
    next(err);
  }
});

careNavigationRouter.post('/sessions/:id/evaluate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { declaredDomain, declaredConcerns, userPreferences, loadBaselinesFromHistory } = req.body;
    const session = NavigationSessionService.requireSession(req.params.id);

    let assessmentBaselines = req.body.assessmentBaselines || [];
    if (loadBaselinesFromHistory || assessmentBaselines.length === 0) {
      const storedBaselines = await CareAssessmentAdapter.getBaselinesForUser(
        session.user_id,
        session.assessment_result_ids
      );
      if (storedBaselines.length > 0) {
        assessmentBaselines = storedBaselines;
      }
    }

    const updatedSession = await NavigationSessionService.evaluateSession(session.id, {
      declaredDomain,
      declaredConcerns,
      assessmentBaselines,
      userPreferences
    });

    res.json({ session: updatedSession });
  } catch (err) {
    next(err);
  }
});

careNavigationRouter.post('/sessions/:id/select-pathway', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pathwayId } = req.body;
    if (!pathwayId) {
      return res.status(400).json({ error: 'pathwayId is required' });
    }

    const result = await NavigationSessionService.selectPathway(req.params.id, pathwayId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3. Provider Matching Readiness
// ==========================================

careNavigationRouter.post('/providers/match-readiness', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { care_level, need_domain, modality, jurisdiction, language, requires_available_capacity } = req.body;
    if (!care_level) {
      return res.status(400).json({ error: 'care_level is required' });
    }

    const providers = ProviderMatcher.findMatchingProviders({
      care_level,
      need_domain,
      modality,
      jurisdiction,
      language,
      requires_available_capacity
    });

    res.json({
      total: providers.length,
      verified_and_ready: true,
      providers: providers.map(p => ({
        professional_id: p.professional_id,
        title: p.title,
        full_name: p.full_name,
        verification_state: p.verification_state,
        regulatory_body: p.regulatory_body,
        license_number: p.license_number,
        specialties: p.specialties,
        modalities: p.modalities,
        jurisdictions: p.jurisdictions,
        languages: p.languages,
        capacity_status: p.capacity_status
      }))
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 4. Referral Orchestration Router
// ==========================================

export const referralRouter = Router();

referralRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      userId,
      navigationSessionId,
      pathwayId,
      careLevel,
      urgency,
      receivingProviderId,
      receivingOrganizationId,
      receivingServiceType,
      reasonCodes,
      clinicalSummaryNotes,
      primaryNeed,
      acuity,
      screeningSummaries,
      autoReady
    } = req.body;

    if (!userId || !careLevel || !receivingServiceType) {
      return res.status(400).json({ error: 'userId, careLevel, and receivingServiceType are required' });
    }

    const referral = await ReferralService.createReferral({
      userId,
      navigationSessionId,
      pathwayId,
      careLevel,
      urgency,
      receivingProviderId,
      receivingOrganizationId,
      receivingServiceType,
      reasonCodes: reasonCodes || ['SUPPORT_MATCH'],
      clinicalSummaryNotes,
      primaryNeed,
      acuity,
      screeningSummaries,
      autoReady
    });

    res.status(201).json({ referral });
  } catch (err) {
    next(err);
  }
});

referralRouter.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const referral = ReferralService.requireReferral(req.params.id);
    res.json({ referral });
  } catch (err) {
    next(err);
  }
});

referralRouter.get('/user/:userId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const referrals = ReferralService.listReferralsForUser(req.params.userId);
    res.json({ total: referrals.length, referrals });
  } catch (err) {
    next(err);
  }
});

referralRouter.get('/provider/:providerId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const referrals = ReferralService.listReferralsForProvider(req.params.providerId);
    res.json({ total: referrals.length, referrals });
  } catch (err) {
    next(err);
  }
});

referralRouter.post('/:id/transition', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { targetState, actorId, reason, actionNotes } = req.body;
    if (!targetState) {
      return res.status(400).json({ error: 'targetState is required' });
    }

    const referral = await ReferralService.transitionReferral({
      referralId: req.params.id,
      targetState: targetState as ReferralState,
      actorId,
      reason,
      actionNotes
    });

    res.json({ referral });
  } catch (err) {
    next(err);
  }
});

referralRouter.get('/:id/handoff-package', (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestingActorId = (req.query.actor_id as string) || (req.headers['x-actor-id'] as string) || 'RECEIVING_PROVIDER';
    const pkg = HandoffService.accessHandoffPackage({
      packageIdOrReferralId: req.params.id,
      requestingActorId
    });

    res.json({ handoff_package: pkg });
  } catch (err) {
    next(err);
  }
});

referralRouter.post('/:id/handoff-package/revoke', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actorId, reason } = req.body;
    const pkg = HandoffService.revokeHandoffPackage({
      packageIdOrReferralId: req.params.id,
      actorId: actorId || 'USER',
      reason
    });

    res.json({ handoff_package: pkg });
  } catch (err) {
    next(err);
  }
});
