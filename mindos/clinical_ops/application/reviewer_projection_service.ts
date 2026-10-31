import { NotFoundError } from '../../platform/errors/index.js';
import { getSafetyRepository } from '../../safety/repositories/index.js';
import { ClinicalOperationsRepository } from '../repositories/index.js';

export interface ClinicalOperationsReviewerCaseProjection {
  escalation:{
    id:string;
    level:string;
    state:string;
    jurisdiction:string;
    queue_key:string;
    risk_state:string;
    reason_codes:string[];
    risk_event_reference:string;
    source_summary_reference?:string;
    policy_version:string;
    created_at:string;
  };
  assignment:{
    assigned_reviewer_id?:string;
    assigned_reviewer_role?:string;
    triaged_at?:string;
    assigned_at?:string;
    review_started_at?:string;
  };
  policy_actions:Array<{
    id:string;
    action_type:string;
    priority:string;
    status:string;
    resource_reference?:string;
  }>;
  follow_ups:Array<{
    id:string;
    type:string;
    status:string;
    scheduled_for:string;
    responsible_actor_id?:string;
    channel?:string;
  }>;
  privacy_boundary:{
    full_journal_included:false;
    full_ai_history_included:false;
    full_clinical_history_included:false;
    raw_free_text_included:false;
  };
}

export class ClinicalOperationsReviewerProjectionService {
  static async getCase(escalationId:string):Promise<ClinicalOperationsReviewerCaseProjection>{
    const escalation=await ClinicalOperationsRepository.getEscalation(escalationId);
    if(!escalation) throw new NotFoundError('Clinical operations escalation not found.');
    const safetyRepo=getSafetyRepository();
    const actions=(await safetyRepo.getActionsByUser(escalation.subject_user_id))
      .filter(x=>x.status!=='CANCELLED'&&x.status!=='SUPERSEDED')
      .slice(0,10);
    const followUps=await ClinicalOperationsRepository.listFollowUps(escalation.id);

    return {
      escalation:{
        id:escalation.id,level:escalation.level,state:escalation.state,
        jurisdiction:escalation.jurisdiction,queue_key:escalation.queue_key,
        risk_state:escalation.risk_state,reason_codes:[...escalation.reason_codes],
        risk_event_reference:`risk-event:${escalation.risk_event_id}`,
        source_summary_reference:escalation.source_summary_reference,
        policy_version:escalation.policy_version,created_at:escalation.created_at
      },
      assignment:{
        assigned_reviewer_id:escalation.assigned_reviewer_id,
        assigned_reviewer_role:escalation.assigned_reviewer_role,
        triaged_at:escalation.triaged_at,assigned_at:escalation.assigned_at,
        review_started_at:escalation.review_started_at
      },
      policy_actions:actions.map(x=>({
        id:x.id,action_type:x.action_type,priority:x.priority,status:x.status,
        resource_reference:x.resource_reference
      })),
      follow_ups:followUps.map(x=>({
        id:x.id,type:x.type,status:x.status,scheduled_for:x.scheduled_for,
        responsible_actor_id:x.responsible_actor_id,channel:x.channel
      })),
      privacy_boundary:{
        full_journal_included:false,full_ai_history_included:false,
        full_clinical_history_included:false,raw_free_text_included:false
      }
    };
  }
}
