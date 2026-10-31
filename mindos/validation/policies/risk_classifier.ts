import { ReleaseRiskSignals,ValidationGate,ValidationRiskClass } from '../domain/types.js';

const BASE:ValidationGate[]=['AUTOMATED_QA','SECURITY_RED_TEAM','ACCESSIBILITY','PERFORMANCE','RELIABILITY_DR','INCIDENT_READINESS'];

export class ValidationRiskClassifier{
  static classify(s:ReleaseRiskSignals):ValidationRiskClass{
    if(s.safety_critical||s.authorization_or_consent||s.clinical_governance||s.ai_governance||s.professional_verification)return 'A';
    if(s.assessment_or_ai_recommendation||s.booking_or_moderation_or_payments)return 'B';
    if(s.cosmetic_only)return 'D';
    return 'C';
  }

  static requiredGates(risk:ValidationRiskClass,s:ReleaseRiskSignals):ValidationGate[]{
    if(risk==='D')return ['AUTOMATED_QA','ACCESSIBILITY'];
    const out=new Set<ValidationGate>(BASE);
    if(risk==='A'||risk==='B'){
      if(s.clinical_governance||s.safety_critical||s.assessment_or_ai_recommendation)out.add('CLINICAL');
      if(s.ai_governance||s.assessment_or_ai_recommendation)out.add('AI_SAFETY');
      if(s.authorization_or_consent||s.clinical_governance||s.ai_governance||s.safety_critical)out.add('PRIVACY_DPIA');
      out.add('KENYA_REGULATORY');
    }
    return [...out];
  }
}
