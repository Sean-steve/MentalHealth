import { Router,Request,Response } from 'express';
import { sprint23Router as domainRouter } from './routes.js';
import { getSprint23RuntimeStatus } from './runtime.js';

export const sprint23Router=Router();
sprint23Router.use(domainRouter);
sprint23Router.get('/sprint-23/status',(_req:Request,res:Response)=>res.json({
  sprint:23,
  domains:{clinical_record:'CONFIGURED',outcomes:'CONFIGURED'},
  runtime:getSprint23RuntimeStatus()
}));

export * from './runtime.js';
