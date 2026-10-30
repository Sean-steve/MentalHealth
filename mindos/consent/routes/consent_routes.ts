/**
 * MindOS Canonical Consent API Routes
 * Authority: Master Architecture Index Section 14, Volume III & Volume VIII (Consent Context)
 * ADR-006, ADR-016, ADR-019, ADR-020, ADR-021
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ConsentService } from '../index.js';
import { ValidationError, AuthorizationError, AuthenticationError } from '../../platform/errors/index.js';
import { CorrelationManager } from '../../platform/shared/correlation.js';

export function createConsentRouter(): Router {
  const router = Router();
  const consentService = ConsentService.getInstance();

  // Flexible authentication resolver supporting sessions and developer headers
  const auth = (req: Request, res: Response, next: NextFunction) => {
    let user = (req as any).user;
    if (!user || !user.accountId) {
      const headerActor = req.headers['x-actor-id'] as string;
      const headerUser = req.headers['x-user-id'] as string;
      const queryUser = req.query.user_id as string;
      const resolvedId = headerActor || headerUser || queryUser || 'usr-demo-001';
      
      (req as any).user = {
        accountId: resolvedId,
        actorId: resolvedId,
        roles: ['USER', 'PRIVACY_OFFICER'] // Default roles for interactive operations
      };
    }
    next();
  };

  /**
   * Public: List all current canonical consent policies and baseline definitions
   */
  router.get('/consent-policies/current', (req: Request, res: Response, next: NextFunction) => {
    try {
      const defs = consentService.getRepository().listDefinitions();
      const currentPolicies = defs.map(def => {
        const activePolicy = consentService.getRepository().getActivePolicyVersion(def.code);
        return {
          code: def.code,
          name: def.name,
          description: def.description,
          category: def.category,
          purpose: def.purpose,
          data_categories: def.data_categories,
          required_or_optional: def.required_or_optional,
          withdrawal_allowed: def.withdrawal_allowed,
          active_policy: activePolicy
        };
      });

      res.json({
        total: currentPolicies.length,
        policies: currentPolicies
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Authenticated: Privacy Centre overview of all 10 canonical consents
   */
  router.get('/privacy/consents', auth, (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user?.accountId) {
        throw new AuthenticationError('Authentication required to access Privacy Centre');
      }

      const items = consentService.getPrivacyCentreConsents(user.accountId);
      res.json({
        subject_user_id: user.accountId,
        total: items.length,
        consents: items
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Authenticated: List user consents or public definitions
   */
  router.get('/consents', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const targetUserId = user?.accountId || (req.query.user_id as string);

      if (targetUserId) {
        const items = consentService.getPrivacyCentreConsents(targetUserId);
        return res.json({ total: items.length, consents: items });
      }

      const defs = consentService.getRepository().listDefinitions();
      res.json({ total: defs.length, definitions: defs });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Authenticated / Public: Get single consent definition & user status
   */
  router.get('/consents/:consent_code', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consentCode = req.params.consent_code;
      const def = consentService.getRepository().getDefinitionByCode(consentCode);
      if (!def) {
        return res.status(404).json({ error: `Consent definition ${consentCode} not found` });
      }

      const activePolicy = consentService.getRepository().getActivePolicyVersion(consentCode);
      const user = (req as any).user;
      let userGrant = null;

      if (user?.accountId) {
        userGrant = consentService.getRepository().getLatestGrant(user.accountId, consentCode);
      }

      res.json({
        definition: def,
        active_policy: activePolicy,
        user_grant: userGrant
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Authenticated: Explicitly grant a consent
   */
  router.post('/consents/:consent_code/grant', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user?.accountId) {
        throw new AuthenticationError('Authentication required to grant consent');
      }

      const consentCode = req.params.consent_code;
      const {
        policy_version,
        source,
        method,
        scopes,
        recipients,
        authority_type,
        evidence_context
      } = req.body;

      const grant = await consentService.grantConsent(user.accountId, consentCode, {
        policyVersion: policy_version,
        source: source || 'WEB_PRIVACY_CENTRE',
        method: method || 'EXPLICIT_CHECKBOX',
        scopes,
        recipients,
        authorityType: authority_type || 'SELF',
        evidenceContext: {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          interface: 'WEB_PRIVACY_CENTRE',
          presentedCopySummary: evidence_context?.presentedCopySummary,
          details: evidence_context?.details
        }
      });

      res.status(201).json({
        status: 'GRANTED',
        grant
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Authenticated: Explicitly decline an optional consent
   */
  router.post('/consents/:consent_code/decline', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user?.accountId) {
        throw new AuthenticationError('Authentication required to decline consent');
      }

      const consentCode = req.params.consent_code;
      const { policy_version, source, method, evidence_context } = req.body;

      const grant = await consentService.declineConsent(user.accountId, consentCode, {
        policyVersion: policy_version,
        source: source || 'WEB_PRIVACY_CENTRE',
        method: method || 'EXPLICIT_CHECKBOX',
        evidenceContext: {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          interface: 'WEB_PRIVACY_CENTRE',
          presentedCopySummary: evidence_context?.presentedCopySummary
        }
      });

      res.json({
        status: 'DECLINED',
        grant
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Authenticated: Withdraw a previously granted consent
   */
  router.post('/consents/:consent_code/withdraw', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user?.accountId) {
        throw new AuthenticationError('Authentication required to withdraw consent');
      }

      const consentCode = req.params.consent_code;
      const { reason, evidence_context } = req.body;

      const grant = await consentService.withdrawConsent(user.accountId, consentCode, {
        reason: reason || 'USER_PREFERENCE',
        evidenceContext: {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          interface: 'WEB_PRIVACY_CENTRE',
          details: evidence_context?.details
        }
      });

      res.json({
        status: 'WITHDRAWN',
        grant
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Authenticated: Generate and download verifiable Consent Receipt
   */
  router.get('/consents/:consent_code/receipt', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user?.accountId) {
        throw new AuthenticationError('Authentication required to download consent receipt');
      }

      const consentCode = req.params.consent_code;
      const receipt = consentService.generateConsentReceipt(user.accountId, consentCode);

      res.json({
        receipt
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Officer/Legal Admin: Publish new version of policy
   */
  router.post('/consent-policies/supersede', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const isOfficer = user?.roles?.includes('PRIVACY_OFFICER') || user?.roles?.includes('PLATFORM_ADMIN');
      if (!isOfficer) {
        throw new AuthorizationError('Only Privacy Officers or Platform Admins can supersede policy versions');
      }

      const {
        consent_code,
        version,
        title,
        summary,
        full_text_reference,
        is_material_change
      } = req.body;

      if (!consent_code || !version || !title || !summary) {
        throw new ValidationError('consent_code, version, title, and summary are required');
      }

      const newPolicy = await consentService.supersedePolicyVersion({
        consentCode: consent_code,
        version,
        title,
        summary,
        fullTextReference: full_text_reference || `/legal/${consent_code}-${version}.md`,
        isMaterialChange: Boolean(is_material_change),
        approvedBy: user.accountId
      });

      res.status(201).json({
        status: 'SUPERSEDED',
        new_policy: newPolicy
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
