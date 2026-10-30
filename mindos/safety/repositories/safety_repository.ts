/**
 * MindOS Safety Repository Interface
 * Authority: Volumes I, V, IX & Appendix G
 */

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

export interface ISafetyRepository {
  // Signals
  saveSignal(signal: SafetySignalEntity): Promise<void>;
  getSignalsByUser(userId: string): Promise<SafetySignalEntity[]>;
  
  // Risk States
  saveRiskState(riskState: RiskStateEntity): Promise<void>;
  getCurrentRiskState(userId: string): Promise<RiskStateEntity | null>;
  
  // Factors
  saveRiskFactor(factor: RiskFactorEntity): Promise<void>;
  getActiveRiskFactors(userId: string): Promise<RiskFactorEntity[]>;
  saveProtectiveFactor(factor: ProtectiveFactorEntity): Promise<void>;
  getActiveProtectiveFactors(userId: string): Promise<ProtectiveFactorEntity[]>;
  
  // Actions
  saveAction(action: SafetyActionEntity): Promise<void>;
  getActionsByUser(userId: string): Promise<SafetyActionEntity[]>;
  getActionById(id: string): Promise<SafetyActionEntity | null>;
  
  // Escalations
  saveEscalation(escalation: SafetyEscalationEntity): Promise<void>;
  getEscalationById(id: string): Promise<SafetyEscalationEntity | null>;
  getActiveEscalations(team?: string): Promise<SafetyEscalationEntity[]>;
  
  // Reviews
  saveReview(review: SafetyReviewEntity): Promise<void>;
  getReviewsByUser(userId: string): Promise<SafetyReviewEntity[]>;
  
  // Resources
  saveResource(resource: SafetyResourceEntity): Promise<void>;
  getResources(jurisdiction?: string): Promise<SafetyResourceEntity[]>;
  
  // Incidents
  saveIncident(incident: SafetyIncidentEntity): Promise<void>;
  getIncidents(status?: string): Promise<SafetyIncidentEntity[]>;
  
  // Break-Glass
  saveBreakGlassSession(session: SafetyBreakGlassSessionEntity): Promise<void>;
  getActiveBreakGlassSession(userId: string, actorId: string): Promise<SafetyBreakGlassSessionEntity | null>;
}
