/**
 * MindOS Regulatory Governance REST API Routes
 * Authority: Volumes III, XV & Appendix I
 * Endpoints for Jurisdictions, Authorities, Sources, Requirements, Controls,
 * Classifications, Assessments, Gaps, and Production Release Gates.
 */

import { Router, Request, Response } from 'express';
import { RegulatoryGovernanceService } from './service.js';
import { formatErrorResponse } from '../../platform/errors/index.js';
import { CorrelationManager } from '../../platform/shared/correlation.js';

export const regulatoryRouter = Router();

// 1. Jurisdictions
regulatoryRouter.get('/jurisdictions', (_req: Request, res: Response) => {
  try {
    const jurisdictions = RegulatoryGovernanceService.listJurisdictions();
    res.json({ data: jurisdictions });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

regulatoryRouter.get('/jurisdictions/:code', (req: Request, res: Response) => {
  try {
    const jur = RegulatoryGovernanceService.getJurisdiction(req.params.code);
    if (!jur) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Jurisdiction ${req.params.code} not found` } });
      return;
    }
    res.json({ data: jur });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

// 2. Authorities & Sources
regulatoryRouter.get('/authorities', (req: Request, res: Response) => {
  try {
    const jurCode = (req.query.jurisdiction as string) || 'KE';
    const authorities = RegulatoryGovernanceService.listAuthorities(jurCode);
    res.json({ data: authorities });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

regulatoryRouter.get('/sources', (req: Request, res: Response) => {
  try {
    const jurCode = (req.query.jurisdiction as string) || 'KE';
    const sources = RegulatoryGovernanceService.listSources(jurCode);
    res.json({ data: sources });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

// 3. Requirements & Controls
regulatoryRouter.get('/requirements', (req: Request, res: Response) => {
  try {
    const jurCode = (req.query.jurisdiction as string) || 'KE';
    const reqs = RegulatoryGovernanceService.listRequirements(jurCode);
    res.json({ data: reqs });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

regulatoryRouter.get('/controls', (req: Request, res: Response) => {
  try {
    const jurCode = (req.query.jurisdiction as string) || 'KE';
    const controls = RegulatoryGovernanceService.listControls(jurCode);
    res.json({ data: controls });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

// 4. Classifications
regulatoryRouter.post('/classify', (req: Request, res: Response) => {
  try {
    const classification = RegulatoryGovernanceService.classifyResource(req.body);
    res.status(201).json({ data: classification });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

regulatoryRouter.get('/classifications/:resourceId', (req: Request, res: Response) => {
  try {
    const jurCode = (req.query.jurisdiction as string) || 'KE';
    const classification = RegulatoryGovernanceService.getClassification(req.params.resourceId, jurCode);
    if (!classification) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Classification not found' } });
      return;
    }
    res.json({ data: classification });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

// 5. Assessments & Approvals
regulatoryRouter.post('/assessments', async (req: Request, res: Response) => {
  try {
    const assessment = await RegulatoryGovernanceService.initiateAssessment(req.body);
    res.status(201).json({ data: assessment });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

regulatoryRouter.get('/assessments/:id', (req: Request, res: Response) => {
  try {
    const assessment = RegulatoryGovernanceService.getAssessment(req.params.id);
    if (!assessment) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
      return;
    }
    res.json({ data: assessment });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

regulatoryRouter.post('/assessments/:id/decide', async (req: Request, res: Response) => {
  try {
    const result = await RegulatoryGovernanceService.decideAssessment({
      assessmentId: req.params.id,
      reviewerId: req.body.reviewerId,
      decision: req.body.decision,
      reason: req.body.reason,
      conditions: req.body.conditions,
      validityDays: req.body.validityDays
    });
    res.json({ data: result });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

regulatoryRouter.get('/approvals/:resourceId', (req: Request, res: Response) => {
  try {
    const jurCode = (req.query.jurisdiction as string) || 'KE';
    const approval = RegulatoryGovernanceService.getApproval(req.params.resourceId, jurCode);
    if (!approval) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Active approval not found' } });
      return;
    }
    res.json({ data: approval });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

regulatoryRouter.post('/approvals/:id/revoke', (req: Request, res: Response) => {
  try {
    const approval = RegulatoryGovernanceService.revokeApproval({
      approvalId: req.params.id,
      revokedBy: req.body.revokedBy,
      reason: req.body.reason
    });
    res.json({ data: approval });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

// 6. Gaps & Remediation
regulatoryRouter.post('/gaps', (req: Request, res: Response) => {
  try {
    const gap = RegulatoryGovernanceService.createGap(req.body);
    res.status(201).json({ data: gap });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

regulatoryRouter.post('/gaps/:id/resolve', async (req: Request, res: Response) => {
  try {
    const gap = await RegulatoryGovernanceService.resolveGap({
      gapId: req.params.id,
      verifiedBy: req.body.verifiedBy,
      resolutionEvidenceSummary: req.body.resolutionEvidenceSummary,
      rawEvidenceContent: req.body.rawEvidenceContent
    });
    res.json({ data: gap });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

// 7. Source Amendments
regulatoryRouter.post('/sources/:code/amend', async (req: Request, res: Response) => {
  try {
    const result = await RegulatoryGovernanceService.assessSourceChange({
      sourceCode: req.params.code,
      newVersion: req.body.newVersion,
      newContentText: req.body.newContentText,
      amendmentSummary: req.body.amendmentSummary,
      verifiedBy: req.body.verifiedBy
    });
    res.json({ data: result });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});

// 8. Release Gate Evaluation
regulatoryRouter.post('/gate/evaluate', async (req: Request, res: Response) => {
  try {
    const result = await RegulatoryGovernanceService.evaluateReleaseGate({
      resourceId: req.body.resourceId,
      jurisdictionCode: req.body.jurisdictionCode,
      resourceType: req.body.resourceType,
      targetEnvironment: req.body.targetEnvironment
    });
    res.json({ data: result });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json(envelope);
  }
});
