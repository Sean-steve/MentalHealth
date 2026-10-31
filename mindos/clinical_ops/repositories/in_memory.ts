import {
  ClinicalIncident,
  ClinicalOperationsCapability,
  ClinicalOperationsEscalation,
  ClinicalOperationsFollowUp
} from '../domain/types.js';
import { IClinicalOperationsRepository } from './interfaces.js';

export class InMemoryClinicalOperationsRepository implements IClinicalOperationsRepository {
  private capabilities = new Map<string, ClinicalOperationsCapability>();
  private escalations = new Map<string, ClinicalOperationsEscalation>();
  private followUps = new Map<string, ClinicalOperationsFollowUp>();
  private incidents = new Map<string, ClinicalIncident>();

  async saveCapability(value: ClinicalOperationsCapability): Promise<void> {
    this.capabilities.set(value.id, structuredClone(value));
  }
  async listCapabilities(jurisdiction?: string): Promise<ClinicalOperationsCapability[]> {
    return [...this.capabilities.values()]
      .filter(x => !jurisdiction || x.jurisdiction === jurisdiction)
      .map(x => structuredClone(x));
  }
  async saveEscalation(value: ClinicalOperationsEscalation): Promise<void> {
    this.escalations.set(value.id, structuredClone(value));
  }
  async getEscalation(id: string): Promise<ClinicalOperationsEscalation | undefined> {
    const value = this.escalations.get(id);
    return value ? structuredClone(value) : undefined;
  }
  async listEscalations(): Promise<ClinicalOperationsEscalation[]> {
    return [...this.escalations.values()].map(x => structuredClone(x));
  }
  async saveFollowUp(value: ClinicalOperationsFollowUp): Promise<void> {
    this.followUps.set(value.id, structuredClone(value));
  }
  async listFollowUps(escalationId?: string): Promise<ClinicalOperationsFollowUp[]> {
    return [...this.followUps.values()]
      .filter(x => !escalationId || x.escalation_id === escalationId)
      .map(x => structuredClone(x));
  }
  async saveIncident(value: ClinicalIncident): Promise<void> {
    this.incidents.set(value.id, structuredClone(value));
  }
  async getIncident(id: string): Promise<ClinicalIncident | undefined> {
    const value = this.incidents.get(id);
    return value ? structuredClone(value) : undefined;
  }
  async listIncidents(): Promise<ClinicalIncident[]> {
    return [...this.incidents.values()].map(x => structuredClone(x));
  }
  reset(): void {
    this.capabilities.clear();
    this.escalations.clear();
    this.followUps.clear();
    this.incidents.clear();
  }
}
