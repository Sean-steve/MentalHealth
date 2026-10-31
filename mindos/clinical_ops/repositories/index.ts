import { IClinicalOperationsRepository } from './interfaces.js';
import { InMemoryClinicalOperationsRepository } from './in_memory.js';

let active: IClinicalOperationsRepository = new InMemoryClinicalOperationsRepository();

export const ClinicalOperationsRepository: IClinicalOperationsRepository = {
  saveCapability: value => active.saveCapability(value),
  listCapabilities: jurisdiction => active.listCapabilities(jurisdiction),
  saveEscalation: value => active.saveEscalation(value),
  getEscalation: id => active.getEscalation(id),
  listEscalations: () => active.listEscalations(),
  saveFollowUp: value => active.saveFollowUp(value),
  listFollowUps: escalationId => active.listFollowUps(escalationId),
  saveIncident: value => active.saveIncident(value),
  getIncident: id => active.getIncident(id),
  listIncidents: () => active.listIncidents(),
  saveSafetyPlanShare: value => active.saveSafetyPlanShare(value),
  listSafetyPlanShares: (subjectUserId,safetyPlanReference) => active.listSafetyPlanShares(subjectUserId,safetyPlanReference),
  reset: () => active.reset?.()
};

export function setClinicalOperationsRepository(repo:IClinicalOperationsRepository):void{active=repo;}
export function resetClinicalOperationsRepository():void{active=new InMemoryClinicalOperationsRepository();}

export * from './interfaces.js';
export * from './in_memory.js';
export * from './pg_clinical_operations_repository.js';
