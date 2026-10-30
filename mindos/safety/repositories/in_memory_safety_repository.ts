/**
 * MindOS In-Memory Safety Repository
 * For fast local unit and integration testing.
 */

import { ISafetyRepository } from './safety_repository.js';
import {
  SafetySignalEntity,
  RiskFactorEntity,
  ProtectiveFactorEntity,
  RiskStateEntity,
  SafetyActionEntity,
  SafetyEscalationEntity,
  SafetyReviewEntity,
  SafetyResourceEntity,
  SafetyIncidentEntity,
  SafetyBreakGlassSessionEntity
} from '../domain/types.js';
import { CANONICAL_SAFETY_RESOURCES } from '../resources/canonical_seed.js';

export class InMemorySafetyRepository implements ISafetyRepository {
  private signals: SafetySignalEntity[] = [];
  private riskStates: RiskStateEntity[] = [];
  private riskFactors: RiskFactorEntity[] = [];
  private protectiveFactors: ProtectiveFactorEntity[] = [];
  private actions: SafetyActionEntity[] = [];
  private escalations: SafetyEscalationEntity[] = [];
  private reviews: SafetyReviewEntity[] = [];
  private resources: SafetyResourceEntity[] = [...CANONICAL_SAFETY_RESOURCES];
  private incidents: SafetyIncidentEntity[] = [];
  private breakGlassSessions: SafetyBreakGlassSessionEntity[] = [];

  public async saveSignal(signal: SafetySignalEntity): Promise<void> {
    const idx = this.signals.findIndex(s => s.id === signal.id);
    if (idx >= 0) this.signals[idx] = signal;
    else this.signals.push(signal);
  }

  public async getSignalsByUser(userId: string): Promise<SafetySignalEntity[]> {
    return this.signals.filter(s => s.subject_user_id === userId);
  }

  public async saveRiskState(riskState: RiskStateEntity): Promise<void> {
    // Supersede any existing CURRENT state for this user
    for (const rs of this.riskStates) {
      if (rs.subject_user_id === riskState.subject_user_id && rs.status === 'CURRENT' && rs.id !== riskState.id) {
        rs.status = 'SUPERSEDED';
      }
    }
    const idx = this.riskStates.findIndex(r => r.id === riskState.id);
    if (idx >= 0) this.riskStates[idx] = riskState;
    else this.riskStates.push(riskState);
  }

  public async getCurrentRiskState(userId: string): Promise<RiskStateEntity | null> {
    const current = this.riskStates.find(r => r.subject_user_id === userId && r.status === 'CURRENT');
    return current || null;
  }

  public async saveRiskFactor(factor: RiskFactorEntity): Promise<void> {
    const idx = this.riskFactors.findIndex(f => f.id === factor.id);
    if (idx >= 0) this.riskFactors[idx] = factor;
    else this.riskFactors.push(factor);
  }

  public async getActiveRiskFactors(userId: string): Promise<RiskFactorEntity[]> {
    return this.riskFactors.filter(f => f.subject_user_id === userId && f.status === 'ACTIVE');
  }

  public async saveProtectiveFactor(factor: ProtectiveFactorEntity): Promise<void> {
    const idx = this.protectiveFactors.findIndex(f => f.id === factor.id);
    if (idx >= 0) this.protectiveFactors[idx] = factor;
    else this.protectiveFactors.push(factor);
  }

  public async getActiveProtectiveFactors(userId: string): Promise<ProtectiveFactorEntity[]> {
    return this.protectiveFactors.filter(f => f.subject_user_id === userId && f.status === 'ACTIVE');
  }

  public async saveAction(action: SafetyActionEntity): Promise<void> {
    const idx = this.actions.findIndex(a => a.id === action.id);
    if (idx >= 0) this.actions[idx] = action;
    else this.actions.push(action);
  }

  public async getActionsByUser(userId: string): Promise<SafetyActionEntity[]> {
    return this.actions.filter(a => a.subject_user_id === userId);
  }

  public async getActionById(id: string): Promise<SafetyActionEntity | null> {
    return this.actions.find(a => a.id === id) || null;
  }

  public async saveEscalation(escalation: SafetyEscalationEntity): Promise<void> {
    const idx = this.escalations.findIndex(e => e.id === escalation.id);
    if (idx >= 0) this.escalations[idx] = escalation;
    else this.escalations.push(escalation);
  }

  public async getEscalationById(id: string): Promise<SafetyEscalationEntity | null> {
    return this.escalations.find(e => e.id === id) || null;
  }

  public async getActiveEscalations(team?: string): Promise<SafetyEscalationEntity[]> {
    return this.escalations.filter(e => {
      const active = e.status !== 'RESOLVED' && e.status !== 'CANCELLED';
      if (!active) return false;
      if (team) return e.assigned_team === team;
      return true;
    });
  }

  public async saveReview(review: SafetyReviewEntity): Promise<void> {
    const idx = this.reviews.findIndex(r => r.id === review.id);
    if (idx >= 0) this.reviews[idx] = review;
    else this.reviews.push(review);
  }

  public async getReviewsByUser(userId: string): Promise<SafetyReviewEntity[]> {
    return this.reviews.filter(r => r.subject_user_id === userId);
  }

  public async saveResource(resource: SafetyResourceEntity): Promise<void> {
    const idx = this.resources.findIndex(r => r.id === resource.id);
    if (idx >= 0) this.resources[idx] = resource;
    else this.resources.push(resource);
  }

  public async getResources(jurisdiction?: string): Promise<SafetyResourceEntity[]> {
    if (!jurisdiction) return [...this.resources];
    return this.resources.filter(r => r.jurisdiction.toUpperCase() === jurisdiction.toUpperCase() || r.jurisdiction === 'GLOBAL_FALLBACK');
  }

  public async saveIncident(incident: SafetyIncidentEntity): Promise<void> {
    const idx = this.incidents.findIndex(i => i.id === incident.id);
    if (idx >= 0) this.incidents[idx] = incident;
    else this.incidents.push(incident);
  }

  public async getIncidents(status?: string): Promise<SafetyIncidentEntity[]> {
    if (!status) return [...this.incidents];
    return this.incidents.filter(i => i.status === status);
  }

  public async saveBreakGlassSession(session: SafetyBreakGlassSessionEntity): Promise<void> {
    const idx = this.breakGlassSessions.findIndex(s => s.id === session.id);
    if (idx >= 0) this.breakGlassSessions[idx] = session;
    else this.breakGlassSessions.push(session);
  }

  public async getActiveBreakGlassSession(userId: string, actorId: string): Promise<SafetyBreakGlassSessionEntity | null> {
    const nowMs = Date.now();
    const found = this.breakGlassSessions.find(
      s => s.subject_user_id === userId &&
           s.actor_id === actorId &&
           !s.terminated_at &&
           new Date(s.expires_at).getTime() > nowMs
    );
    return found || null;
  }

  public clearAll(): void {
    this.signals = [];
    this.riskStates = [];
    this.riskFactors = [];
    this.protectiveFactors = [];
    this.actions = [];
    this.escalations = [];
    this.reviews = [];
    this.resources = [...CANONICAL_SAFETY_RESOURCES];
    this.incidents = [];
    this.breakGlassSessions = [];
  }
}
