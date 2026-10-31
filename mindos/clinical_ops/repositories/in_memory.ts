import {
  ClinicalIncident,
  ClinicalOperationsCapability,
  ClinicalOperationsEscalation,
  ClinicalOperationsFollowUp
} from '../domain/types.js';

const capabilities = new Map<string, ClinicalOperationsCapability>();
const escalations = new Map<string, ClinicalOperationsEscalation>();
const followUps = new Map<string, ClinicalOperationsFollowUp>();
const incidents = new Map<string, ClinicalIncident>();

export const ClinicalOperationsRepository = {
  async saveCapability(value: ClinicalOperationsCapability): Promise<void> {
    capabilities.set(value.id, structuredClone(value));
  },
  async listCapabilities(jurisdiction?: string): Promise<ClinicalOperationsCapability[]> {
    return [...capabilities.values()]
      .filter(x => !jurisdiction || x.jurisdiction === jurisdiction)
      .map(x => structuredClone(x));
  },
  async saveEscalation(value: ClinicalOperationsEscalation): Promise<void> {
    escalations.set(value.id, structuredClone(value));
  },
  async getEscalation(id: string): Promise<ClinicalOperationsEscalation | undefined> {
    const value = escalations.get(id);
    return value ? structuredClone(value) : undefined;
  },
  async listEscalations(): Promise<ClinicalOperationsEscalation[]> {
    return [...escalations.values()].map(x => structuredClone(x));
  },
  async saveFollowUp(value: ClinicalOperationsFollowUp): Promise<void> {
    followUps.set(value.id, structuredClone(value));
  },
  async listFollowUps(escalationId?: string): Promise<ClinicalOperationsFollowUp[]> {
    return [...followUps.values()]
      .filter(x => !escalationId || x.escalation_id === escalationId)
      .map(x => structuredClone(x));
  },
  async saveIncident(value: ClinicalIncident): Promise<void> {
    incidents.set(value.id, structuredClone(value));
  },
  async getIncident(id: string): Promise<ClinicalIncident | undefined> {
    const value = incidents.get(id);
    return value ? structuredClone(value) : undefined;
  },
  async listIncidents(): Promise<ClinicalIncident[]> {
    return [...incidents.values()].map(x => structuredClone(x));
  },
  reset(): void {
    capabilities.clear();
    escalations.clear();
    followUps.clear();
    incidents.clear();
  }
};
