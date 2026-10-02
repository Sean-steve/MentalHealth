import { Router, Request, Response } from 'express';
import { carePlanRouter } from '../care_plans/api/routes.js';
import { clinicalTaskRouter } from '../clinical_tasks/api/routes.js';
import { professionalMessagingRouter } from '../professional_messaging/api/routes.js';
import { getSprint22RuntimeStatus } from './runtime.js';

export const sprint22Router = Router();

sprint22Router.use('/care-plans', carePlanRouter);
sprint22Router.use('/clinical-tasks', clinicalTaskRouter);
sprint22Router.use('/care-messages', professionalMessagingRouter);

sprint22Router.get('/sprint-22/status', (_req: Request, res: Response) => {
  res.json({
    sprint: 22,
    domains: {
      care_plans: 'CONFIGURED',
      clinical_tasks: 'CONFIGURED',
      professional_messaging: 'CONFIGURED'
    },
    runtime: getSprint22RuntimeStatus()
  });
});

export * from './runtime.js';
