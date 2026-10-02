/**
 * MindOS Platform Server Entry Point
 * Authority: Master Architecture Index, Volume III & Framework Specs
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { HealthService } from './mindos/platform/observability/health.js';
import { CorrelationManager } from './mindos/platform/shared/correlation.js';
import { logger } from './mindos/platform/observability/logger.js';
import { MindOSError } from './mindos/platform/errors/index.js';
import { SafetyKernel, createSafetyRouter } from './mindos/safety/index.js';
import { IdentityService } from './mindos/identity/index.js';
import { ContentService } from './mindos/content/index.js';
import { AuditService } from './mindos/platform/audit/index.js';
import { AuthorizationEngine } from './mindos/platform/authorization/index.js';
import { EventBus } from './mindos/platform/events/index.js';
import { ClinicalGovernanceService } from './mindos/clinical_governance/index.js';
import { ConfigurationManager } from './mindos/platform/configuration/index.js';
import { FeatureFlagService } from './mindos/platform/features/index.js';
import { generateBuildMetadata } from './scripts/build_metadata.js';
import { createConsentRouter } from './mindos/consent/routes/consent_routes.js';
import { regulatoryRouter } from './mindos/regulatory_governance/index.js';
import { contentRouter } from './mindos/content/index.js';
import { aiRouter } from './mindos/ai/routes.js';
import { careNavigationRouter, referralRouter } from './mindos/care_navigation/index.js';
import { sprint22Router, configureSprint22Runtime } from './mindos/sprint22/index.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const sprint22UsePostgres =
    process.env.MINDOS_SPRINT22_STORAGE_MODE === 'postgres' ||
    process.env.NODE_ENV === 'production';
  const sprint22Runtime = configureSprint22Runtime({ usePostgres: sprint22UsePostgres });
  logger.info('MindOS Sprint 22 runtime configured', sprint22Runtime);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId =
      (req.headers['x-request-id'] as string) ||
      (req.headers['x-correlation-id'] as string) ||
      undefined;

    CorrelationManager.runWithContext({ requestId }, () => {
      res.setHeader('x-correlation-id', CorrelationManager.getCorrelationId());
      res.setHeader('x-request-id', CorrelationManager.getRequestId());
      next();
    });
  });

  app.get('/livez', (req: Request, res: Response) => {
    const health = HealthService.getLiveness();
    res.status(health.status === 'UP' ? 200 : 503).json(health);
  });

  app.get('/readyz', async (req: Request, res: Response) => {
    const readiness = await HealthService.getReadiness();
    res.status(readiness.status === 'READY' ? 200 : 503).json(readiness);
  });

  app.get('/healthz', async (req: Request, res: Response) => {
    const health = await HealthService.getHealthSummary();
    res.json(health);
  });

  app.get('/api/v1/health', async (req: Request, res: Response) => {
    const healthSummary = await HealthService.getHealthSummary();
    res.json({
      status: 'operational',
      platform: 'MindOS',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      health: healthSummary
    });
  });

  const formatCrisisResource = (r: any) => {
    const phones: string[] = [];
    if (r.contact_json?.phone) phones.push(r.contact_json.phone);
    if (r.contact_json?.sms) phones.push(`SMS: ${r.contact_json.sms}`);
    if (r.contact_json?.whatsapp) phones.push(`WhatsApp: ${r.contact_json.whatsapp}`);
    if (phones.length === 0 && r.contact_json?.address) phones.push(r.contact_json.address);
    if (phones.length === 0) phones.push('Referral Facility');

    return {
      ...r,
      phone_numbers:
        Array.isArray(r.phone_numbers) && r.phone_numbers.length > 0
          ? r.phone_numbers
          : phones,
      operating_hours:
        r.operating_hours || r.availability_json?.hours || '24/7',
      is_toll_free:
        r.is_toll_free !== undefined
          ? r.is_toll_free
          : Boolean(r.availability_json?.free_of_charge),
      is_verified:
        r.is_verified !== undefined
          ? r.is_verified
          : r.verification_status === 'VERIFIED',
      category:
        r.category ||
        (r.resource_type
          ? r.resource_type.replace(/_/g, ' ')
          : 'Crisis Resource')
    };
  };

  app.use('/api/v1/safety', createSafetyRouter());

  app.get('/api/v1/safety/crisis-resources', (req: Request, res: Response) => {
    const country = (req.query.country as string) || 'KE';
    const rawResources = SafetyKernel.getVerifiedCrisisResources(country);
    const resources = rawResources.map(formatCrisisResource);
    res.json({ country_code: country, total: resources.length, resources });
  });

  app.post('/api/v1/safety/evaluate-signal', (req: Request, res: Response) => {
    const { userId, sourceDomain, riskCategory, signals } = req.body;
    const result = SafetyKernel.evaluateRiskSignal({
      userId: userId || 'anon-safety-check',
      sourceDomain: sourceDomain || 'CLIENT_TRIGGER',
      riskCategory: riskCategory || 'GENERAL_DISTRESS',
      signals: signals || {}
    });
    res.json({
      ...result,
      urgentResources: result.urgentResources.map(formatCrisisResource)
    });
  });

  app.get('/api/v1/audit/ledger', (req: Request, res: Response) => {
    const entries = AuditService.getLedger();
    const verification = AuditService.verifyChainIntegrity();
    res.json({
      total_entries: entries.length,
      verification,
      entries: entries.slice(-50)
    });
  });

  app.post('/api/v1/audit/verify', (req: Request, res: Response) => {
    const verification = AuditService.verifyChainIntegrity();
    res.json({ verification, timestamp: new Date().toISOString() });
  });

  app.post('/api/v1/authorization/evaluate', (req: Request, res: Response) => {
    const {
      subjectId,
      subjectRoles,
      action,
      resourceType,
      resourceId,
      purpose,
      context
    } = req.body;

    const decision = AuthorizationEngine.evaluate({
      subjectId: subjectId || 'anon-test',
      subjectRoles: subjectRoles || ['USER'],
      action: action || 'records.read',
      resourceType: resourceType || 'clinical_records',
      resourceId: resourceId || 'rec-1',
      purpose: purpose || 'Verification Test',
      context: context || {}
    });
    res.json(decision);
  });

  app.get('/api/v1/events/outbox', (req: Request, res: Response) => {
    const outbox = EventBus.getOutbox();
    res.json({ count: outbox.length, records: outbox.slice(-20) });
  });

  app.get('/api/v1/governance/status', (req: Request, res: Response) => {
    const artifacts = ClinicalGovernanceService.listArtifacts();
    res.json({
      fourEyeEnforced: true,
      clinicalReviewPolicy: 'R-GOV-002',
      dpiaStatus: 'VALIDATED',
      clinicalArtifactsCount: artifacts.length
    });
  });

  app.use('/api/v1/content', contentRouter);
  app.use('/api/content', contentRouter);

  app.use('/api/v1/ai', aiRouter);

  app.use('/api/v1/care-navigation', careNavigationRouter);
  app.use('/api/v1/referrals', referralRouter);

  // Sprint 22: Care Plans, Clinical Tasks & Professional Messaging
  app.use('/api/v1', sprint22Router);

  app.get('/api/v1/content/articles', (req: Request, res: Response) => {
    const lang = (req.query.lang as string) || 'en';
    const articles = ContentService.getArticles(lang);
    res.json({ articles });
  });

  app.post(
    '/api/v1/identity/register',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { email, countryCode } = req.body;
        const user = await IdentityService.registerUser(email, countryCode);
        res.status(201).json({
          user_id: user.id,
          account_state: user.account_state,
          created_at: user.created_at
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.use('/api/v1', createConsentRouter());
  app.use('/api/v1/regulatory', regulatoryRouter);

  app.get(
    ['/api/v1/version', '/api/v1/build-info'],
    (req: Request, res: Response) => {
      const meta = generateBuildMetadata();
      res.json(meta);
    }
  );

  app.get('/api/v1/feature-flags', (req: Request, res: Response) => {
    const flags = FeatureFlagService.listAll();
    res.json({ total: flags.length, flags });
  });

  app.post('/api/v1/feature-flags/kill', (req: Request, res: Response) => {
    const { key, reason, actor } = req.body;
    if (!key || !reason) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: "key" and "reason"' });
    }

    FeatureFlagService.triggerEmergencyKill(
      key,
      reason,
      actor || 'sec-ops-officer'
    );

    res.json({
      status: 'KILLED',
      key,
      reason,
      killed_at: new Date().toISOString()
    });
  });

  app.post('/api/v1/feature-flags/restore', (req: Request, res: Response) => {
    const { key, actor } = req.body;
    if (!key) {
      return res
        .status(400)
        .json({ error: 'Missing required field: "key"' });
    }

    FeatureFlagService.restoreFlag(key, actor || 'sec-ops-officer');
    res.json({
      status: 'RESTORED',
      key,
      restored_at: new Date().toISOString()
    });
  });

  app.get('/api/v1/configuration/diagnostics', (req: Request, res: Response) => {
    const config = ConfigurationManager.get();
    const grouped = ConfigurationManager.getGrouped();

    const sanitizedGrouped = {
      ...grouped,
      DATABASE: {
        ...grouped.DATABASE,
        url: grouped.DATABASE.url.replace(/:[^:@]+@/, ':***@')
      },
      AUTH: {
        ...grouped.AUTH,
        jwtSecret: '***REDACTED (AES/KMS Managed)***',
        sessionSecret: '***REDACTED (AES/KMS Managed)***'
      },
      SECURITY: {
        ...grouped.SECURITY,
        encryptionKmsKeyRef:
          grouped.SECURITY.encryptionKmsKeyRef
            .split('/')
            .slice(0, 3)
            .join('/') + '/***',
        auditIntegritySalt: '***REDACTED***'
      },
      AI: {
        ...grouped.AI,
        geminiApiKey: grouped.AI.geminiApiKey ? '***CONFIGURED***' : 'NONE'
      }
    };

    res.json({
      environment: config.env,
      port: config.port,
      appUrl: config.appUrl,
      safetyPolicyVersion: config.safetyPolicyVersion,
      groups: sanitizedGrouped
    });
  });

  app.use(
    (err: unknown, req: Request, res: Response, next: NextFunction) => {
      if (err instanceof MindOSError) {
        logger.warn('API Domain Error Handled', {
          error_code: err.errorCode,
          status_code: err.statusCode,
          message: err.message
        });
        return res.status(err.statusCode).json(err.toRFC7807());
      }

      const unexpected = err as Error;
      logger.error('Unhandled API Exception', {
        error: unexpected.message,
        stack: unexpected.stack
      });

      return res.status(500).json({
        type: 'https://mindos.dev/errors/INTERNAL_ERROR',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected system error occurred. Please retry later.',
        instance: req.path,
        correlation_id: CorrelationManager.getCorrelationId()
      });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`MindOS Platform Server active at http://localhost:${PORT}`, {
      port: PORT,
      env: process.env.NODE_ENV || 'development'
    });
  });
}

startServer().catch(err => {
  console.error('Fatal Server Startup Error:', err);
  process.exit(1);
});
