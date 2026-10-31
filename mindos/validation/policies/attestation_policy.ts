import { ValidationGate,ValidationRiskClass } from '../domain/types.js';

const ROLES:Partial<Record<ValidationGate,string[]>>={
  CLINICAL:['CLINICAL_REVIEWER','CLINICAL_ADMIN'],
  AI_SAFETY:['AI_SAFETY_REVIEWER'],
  PRIVACY_DPIA:['PRIVACY_OFFICER'],
  KENYA_REGULATORY:['REGULATORY_REVIEWER'],
  SECURITY_RED_TEAM:['SECURITY_REVIEWER','SECURITY_ADMIN']
};

export class ValidationAttestationPolicy{
  static rolesFor(gate:ValidationGate):string[]{return [...(ROLES[gate]||[])];}

  static requiresHuman(gate:ValidationGate,risk:ValidationRiskClass):boolean{
    if(['CLINICAL','AI_SAFETY','PRIVACY_DPIA','KENYA_REGULATORY'].includes(gate))return true;
    if(gate==='SECURITY_RED_TEAM'&&risk==='A')return true;
    return false;
  }

  static roleAllowed(gate:ValidationGate,role:string):boolean{
    return (ROLES[gate]||[]).includes(role.toUpperCase());
  }
}
