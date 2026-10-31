export interface AnalyticsEventContract{
  source_event_type:string;
  metric_codes:string[];
  purpose:string;
  allow_payload_properties:boolean;
}

const CONTRACTS:AnalyticsEventContract[]=[
  {source_event_type:'assessment.started',metric_codes:['ASSESSMENT_COMPLETION'],purpose:'assessment funnel measurement',allow_payload_properties:false},
  {source_event_type:'assessment.completed',metric_codes:['ASSESSMENT_COMPLETION'],purpose:'assessment funnel measurement',allow_payload_properties:false},
  {source_event_type:'appointment.created',metric_codes:['BOOKING_COMPLETION_RATE'],purpose:'booking funnel measurement',allow_payload_properties:false},
  {source_event_type:'appointment.confirmed',metric_codes:['BOOKING_COMPLETION_RATE','APPOINTMENT_ATTENDANCE'],purpose:'booking/attendance denominator measurement',allow_payload_properties:false},
  {source_event_type:'appointment.completed',metric_codes:['APPOINTMENT_ATTENDANCE'],purpose:'administrative attendance measurement',allow_payload_properties:false},
  {source_event_type:'content.completed',metric_codes:['MSC'],purpose:'qualifying support-action input',allow_payload_properties:false},
  {source_event_type:'ai.turn_completed',metric_codes:['AI_USEFULNESS','AI_ACTION_RATE','AI_SAFETY_INTERVENTION_RATE'],purpose:'AI denominator/support measurement',allow_payload_properties:false},
  {source_event_type:'ai.safety_intervention',metric_codes:['AI_SAFETY_INTERVENTION_RATE'],purpose:'AI safety intervention measurement',allow_payload_properties:false},
  {source_event_type:'ai.safety_intervened',metric_codes:['AI_SAFETY_INTERVENTION_RATE'],purpose:'AI safety intervention measurement',allow_payload_properties:false},
  {source_event_type:'care_navigation.session_started',metric_codes:['TIME_TO_SUPPORT','CARE_CONNECTION_RATE'],purpose:'care-seeking journey denominator',allow_payload_properties:false},
  {source_event_type:'referral.accepted',metric_codes:['CARE_CONNECTION_RATE'],purpose:'care connection measurement',allow_payload_properties:false},
  {source_event_type:'safety.state_changed',metric_codes:['SAFETY_WORKFLOW_COMPLETION'],purpose:'safety workflow operational measurement',allow_payload_properties:false},
  {source_event_type:'safety.escalation_created',metric_codes:['SAFETY_WORKFLOW_COMPLETION','SAFETY_FALSE_POSITIVE'],purpose:'safety escalation measurement',allow_payload_properties:false},
  {source_event_type:'professional.verified',metric_codes:['PRO_VERIFICATION_SLA'],purpose:'professional operations measurement',allow_payload_properties:false},
  {source_event_type:'professional.credential_expired',metric_codes:['PRO_CREDENTIAL_EXPIRY'],purpose:'professional safety measurement',allow_payload_properties:false},
  {source_event_type:'consent.withdrawn',metric_codes:['CONSENT_WITHDRAWAL_PROPAGATION'],purpose:'privacy operations measurement',allow_payload_properties:false}
];

export class AnalyticsEventContractRegistry{
  static get(eventType:string):AnalyticsEventContract|undefined{
    return CONTRACTS.find(x=>x.source_event_type===eventType);
  }
  static list():AnalyticsEventContract[]{return CONTRACTS.map(x=>({...x,metric_codes:[...x.metric_codes]}));}
}
