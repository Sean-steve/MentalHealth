import { createHash } from 'node:crypto';
import { DomainInvariantError,NotFoundError } from '../../platform/errors/index.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { AuditService } from '../../platform/audit/index.js';
import { LaunchParticipant,ParticipantType } from '../domain/types.js';
import { LaunchRepository } from '../repositories/index.js';

function subjectHash(subjectRef:string):string{
  const salt=process.env.LAUNCH_PARTICIPANT_HASH_SALT||process.env.DATA_LIFECYCLE_HASH_SALT||'';
  if(process.env.NODE_ENV==='production'&&!salt)throw new DomainInvariantError('LAUNCH_PARTICIPANT_HASH_SALT is required in production.');
  return createHash('sha256').update(`${salt}:launch:${subjectRef}`).digest('hex');
}

export class BetaCohortService{
  static hashSubjectReference(subjectRef:string):string{return subjectHash(subjectRef);}

  static async inviteAndEnroll(input:{
    program_id:string;subject_ref:string;participant_type:ParticipantType;jurisdiction:string;
    invitation_ref:string;consent_receipt_ref:string;eligibility_evidence_refs:string[];actor_id:string;
  }):Promise<LaunchParticipant>{
    const p=await LaunchRepository.getProgram(input.program_id);
    if(!p)throw new NotFoundError('Launch program not found.');
    if(input.jurisdiction.toUpperCase()!=='KE'||p.jurisdiction!=='KE')throw new DomainInvariantError('Sprint 28 limited rollout is Kenya-only.');
    if(!['BETA_READY','BETA_ACTIVE','LIMITED_LAUNCH_AUTHORIZED','LIMITED_LAUNCH_ACTIVE'].includes(p.state))throw new DomainInvariantError('Cohort enrollment is not open in the current launch state.');
    if(input.participant_type==='PROFESSIONAL'&&!p.scope.professional)throw new DomainInvariantError('Professional enrollment is outside this launch scope.');
    if(input.participant_type==='USER'&&!p.scope.consumer)throw new DomainInvariantError('Consumer enrollment is outside this launch scope.');
    if(!input.invitation_ref||!input.consent_receipt_ref||!input.eligibility_evidence_refs.length)throw new DomainInvariantError('Enrollment requires invitation, consent receipt, and explicit eligibility evidence references.');
    const hash=subjectHash(input.subject_ref);
    const existing=await LaunchRepository.getParticipantByHash(p.id,hash);
    if(existing&&existing.state==='ENROLLED')return existing;
    const participants=await LaunchRepository.listParticipants(p.id);
    const active=participants.filter(x=>x.state==='ENROLLED').length;
    const limit=p.state==='LIMITED_LAUNCH_AUTHORIZED'||p.state==='LIMITED_LAUNCH_ACTIVE'
      ?p.limited_launch_max_participants:p.beta_max_participants;
    if(active>=limit)throw new DomainInvariantError('Launch cohort capacity reached; expanding the cohort requires a new/updated authorization.');
    const now=new Date().toISOString();
    const participant:LaunchParticipant={
      id:existing?.id||generateUUIDv7(),program_id:p.id,subject_ref_hash:hash,participant_type:input.participant_type,
      jurisdiction:'KE',state:'ENROLLED',invitation_ref:input.invitation_ref,consent_receipt_ref:input.consent_receipt_ref,
      eligibility_evidence_refs:[...new Set(input.eligibility_evidence_refs)],enrolled_at:now,created_at:existing?.created_at||now,updated_at:now
    };
    await LaunchRepository.saveParticipant(participant);
    AuditService.record({
      actor_type:'STAFF',actor_id:input.actor_id,action:'LAUNCH.COHORT_ENROLLED',resource_type:'launch_participant',
      resource_id:participant.id,purpose:'Controlled Beta Cohort Enrollment',
      authorization_basis:{program_id:p.id,invitation_ref:input.invitation_ref,consent_receipt_ref:input.consent_receipt_ref},result:'ALLOWED',
      metadata:{participant_type:participant.participant_type,jurisdiction:'KE',raw_subject_stored:false}
    });
    return participant;
  }

  static async withdraw(programId:string,subjectRef:string,actorId:string):Promise<LaunchParticipant>{
    const p=await LaunchRepository.getProgram(programId);if(!p)throw new NotFoundError('Launch program not found.');
    const item=await LaunchRepository.getParticipantByHash(p.id,subjectHash(subjectRef));
    if(!item)throw new NotFoundError('Launch participant not found.');
    if(item.state==='WITHDRAWN')return item;
    item.state='WITHDRAWN';item.withdrawn_at=new Date().toISOString();item.updated_at=item.withdrawn_at;
    await LaunchRepository.saveParticipant(item);
    AuditService.record({actor_type:'USER',actor_id:actorId,action:'LAUNCH.COHORT_WITHDRAWN',resource_type:'launch_participant',resource_id:item.id,purpose:'Controlled Beta Withdrawal',authorization_basis:{program_id:p.id},result:'ALLOWED',metadata:{raw_subject_stored:false}});
    return item;
  }

  static async assertFeatureAccess(programId:string,subjectRef:string,featureKey:string,jurisdiction='KE'):Promise<{allowed:true;phase:'BETA'|'LIMITED_LAUNCH'}>{
    const p=await LaunchRepository.getProgram(programId);if(!p)throw new NotFoundError('Launch program not found.');
    if(jurisdiction.toUpperCase()!=='KE')throw new DomainInvariantError('Launch access denied outside the authorized Kenya jurisdiction.');
    if(!p.feature_keys.includes(featureKey))throw new DomainInvariantError('Feature is outside the authorized launch scope.');
    if(!['BETA_ACTIVE','LIMITED_LAUNCH_ACTIVE'].includes(p.state))throw new DomainInvariantError('Launch program is not active.');
    const item=await LaunchRepository.getParticipantByHash(p.id,subjectHash(subjectRef));
    if(!item||item.state!=='ENROLLED')throw new DomainInvariantError('Subject is not enrolled in the active controlled cohort.');
    return {allowed:true,phase:p.state==='BETA_ACTIVE'?'BETA':'LIMITED_LAUNCH'};
  }
}
