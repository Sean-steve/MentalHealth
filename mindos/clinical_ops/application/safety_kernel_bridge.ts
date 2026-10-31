import { EventBus } from '../../platform/events/index.js';
import { RiskState } from '../../platform/shared/state_machines.js';
import { ClinicalOperationsEscalationService } from './escalation_service.js';

let unsubscribe:(()=>void)|undefined;

function levelForRisk(risk:RiskState):'L0'|'L1'|'L2'|'L3'{
  if(risk===RiskState.URGENT)return 'L3';
  if(risk===RiskState.HIGH||risk===RiskState.ELEVATED)return 'L2';
  if(risk===RiskState.POTENTIAL_CONCERN)return 'L1';
  return 'L0';
}

export class ClinicalOperationsSafetyKernelBridge {
  static async handleRiskTransition(input:{
    subject_user_id:string;
    risk_event_id:string;
    risk_state:RiskState;
    jurisdiction?:string;
    reason_codes?:string[];
    policy_version:string;
  }):Promise<void>{
    const level=levelForRisk(input.risk_state);
    if(level==='L0'||level==='L1')return;
    await ClinicalOperationsEscalationService.createIfStaffed({
      subject_user_id:input.subject_user_id,
      risk_event_id:input.risk_event_id,
      risk_state:input.risk_state,
      level,
      jurisdiction:input.jurisdiction||'KE',
      reason_codes:input.reason_codes||[],
      policy_version:input.policy_version,
      source_summary_reference:`risk-event:${input.risk_event_id}`
    });
  }

  static start():void{
    if(unsubscribe)return;
    unsubscribe=EventBus.subscribe<any>('safety.state_changed',async(event)=>{
      const p:any=event.payload||{};
      const userId=String(p.user_id||p.subject_user_id||event.aggregate_id||'');
      const newState=String(p.to_state||p.newState||p.new_state||'') as RiskState;
      const riskEventId=String(p.risk_event_id||p.riskStateId||p.risk_state_id||event.event_id);
      const policyVersion=String(p.policy_version||p.policyVersion||'unknown');
      const reasonCodes=Array.isArray(p.reason_codes)?p.reason_codes:Array.isArray(p.reasonCodes)?p.reasonCodes:[];
      if(!userId||!Object.values(RiskState).includes(newState))return;
      await this.handleRiskTransition({
        subject_user_id:userId,
        risk_event_id:riskEventId,
        risk_state:newState,
        jurisdiction:String(event.jurisdiction||'KE'),
        reason_codes:reasonCodes,
        policy_version:policyVersion
      });
    });
  }

  static stop():void{
    if(unsubscribe){unsubscribe();unsubscribe=undefined;}
  }
}
