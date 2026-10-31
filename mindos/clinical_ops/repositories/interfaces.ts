import {
  ClinicalIncident,
  ClinicalOperationsCapability,
  ClinicalOperationsEscalation,
  ClinicalOperationsFollowUp
} from '../domain/types.js';

export interface IClinicalOperationsRepository {
  saveCapability(value: ClinicalOperationsCapability): Promise<void>;
  listCapabilities(jurisdiction?: string): Promise<ClinicalOperationsCapability[]>;
  saveEscalation(value: ClinicalOperationsEscalation): Promise<void>;
  getEscalation(id: string): Promise<ClinicalOperationsEscalation | undefined>;
  listEscalations(): Promise<ClinicalOperationsEscalation[]>;
  saveFollowUp(value: ClinicalOperationsFollowUp): Promise<void>;
  listFollowUps(escalationId?: string): Promise<ClinicalOperationsFollowUp[]>;
  saveIncident(value: ClinicalIncident): Promise<void>;
  getIncident(id: string): Promise<ClinicalIncident | undefined>;
  listIncidents(): Promise<ClinicalIncident[]>;
  reset?(): void | Promise<void>;
}
