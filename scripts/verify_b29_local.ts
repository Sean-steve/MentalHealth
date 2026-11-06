import assert from 'node:assert/strict';

import { DatabaseManager,getPool } from '../mindos/platform/database/index.js';
import { MigrationEngine } from '../mindos/platform/database/migrations.js';
import { generateUUIDv7 } from '../mindos/platform/database/uuid.js';
import { configureB29Runtime } from '../mindos/b29/runtime.js';
import { configureSprint24Runtime } from '../mindos/sprint24/runtime.js';
import { IdentityService } from '../mindos/identity/index.js';
import {
  ProfessionalService,ProfessionalType,ProfessionalState,ProfessionalVerificationState,
  DeliveryMode,ProfileVisibility,ProviderType,ProviderStatus,DiscoverabilityStatus,
  ServiceType,ServiceOfferingStatus,TargetPopulation,VerificationMethod
} from '../mindos/professionals/index.js';
import { AvailabilitySlotService } from '../mindos/availability/index.js';
import { AppointmentBookingService,AppointmentType,BookingSource } from '../mindos/appointments/index.js';
import { ConsentService } from '../mindos/consent/index.js';
import { AssessmentService } from '../mindos/assessments/index.js';
import { AssessmentPersistenceStore } from '../mindos/assessments/infrastructure/persistence.js';
import { ContentApplicationService } from '../mindos/content/index.js';
import { ContentPersistenceStore } from '../mindos/content/infrastructure/persistence.js';
import { Conversation } from '../mindos/ai/domain/conversation.js';
import { ConversationMessage } from '../mindos/ai/domain/message.js';
import { ConversationRepository } from '../mindos/ai/repositories/index.js';
import {
  NavigationSessionService,ReferralService,ProviderMatcher,CareLevel,ReferralUrgency,
  SupportNeedDomain,NeedAcuity,ServiceModality
} from '../mindos/care_navigation/index.js';
import {
  CareRelationshipService,CareRelationshipType,CareRelationshipOriginType,CareRelationshipPurpose
} from '../mindos/care_relationships/index.js';
import { ClinicalNoteService,ClinicalNoteType } from '../mindos/clinical_workspace/index.js';
import {
  getSafetyRepository,ResourceRegistryService,SafetyResourceType,ResourceVerificationStatus
} from '../mindos/safety/index.js';
import { ClinicalIncidentService,ClinicalOperationsRepository } from '../mindos/clinical_ops/index.js';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required for B29 local certification.');
process.env.MINDOS_DATABASE_DRIVER='postgres';
process.env.MINDOS_B29_STORAGE_MODE='postgres';
process.env.AI_PROVIDER='mock_sandbox';
process.env.PAYMENTS_PROVIDER='mock';
process.env.NOTIFICATIONS_PROVIDER='mock_console';
process.env.NOTIFICATIONS_REAL_DISPATCH='false';

const runRef=Date.now().toString(36);
const testOnly='TEST_ONLY_B29_LOCAL_CERTIFICATION';
const userEmail=`b29-user-${runRef}@example.invalid`;
const password='B29!Local-Test-Password-2026';
const professionalId=generateUUIDv7();
const serviceId=generateUUIDv7();
const secretMarker=`B29-CLINICAL-PLAINTEXT-${runRef}`;

await configureB29Runtime({usePostgres:true});
await configureSprint24Runtime({usePostgres:true});

const migrationStatus=await MigrationEngine.status();
const applied=migrationStatus.filter(x=>x.applied);
assert.equal(migrationStatus.length,27,'B29 expects 27 canonical migrations.');
assert.equal(applied.length,27,'All 27 canonical migrations must be applied.');

const identity=new IdentityService();
const registration=await identity.register({
  email:userEmail,password,deviceLabel:'B29 Local Certification',ipAddress:'127.0.0.1',userAgent:'B29'
});
await identity.verifyEmail(registration.verificationToken);
const authenticated=await identity.authenticate({
  email:userEmail,password,deviceLabel:'B29 Local Certification',ipAddress:'127.0.0.1',userAgent:'B29'
});
const userId=authenticated.account.id;
assert.equal(authenticated.account.account_state,'ACTIVE');

const now=new Date();
const nowIso=now.toISOString();
const expires=new Date(now.getTime()+30*24*60*60*1000).toISOString();
const profRepo=ProfessionalService.getRepository();

await profRepo.saveProfile({
  id:professionalId,user_id:`b29-professional-user-${runRef}`,
  professional_type:ProfessionalType.COUNSELLOR,display_name:'B29 Test-Only Counsellor',
  legal_name_reference:testOnly,status:ProfessionalState.ACTIVE,
  verification_status:ProfessionalVerificationState.VERIFIED,jurisdictions:['KE'],
  languages:['en'],specialties:['TEST_ONLY_GENERAL_COUNSELLING'],delivery_modes:[DeliveryMode.TELEHEALTH],
  organization_refs:[],profile_visibility:ProfileVisibility.INTERNAL_ONLY,created_at:nowIso,updated_at:nowIso
});
await profRepo.saveProvider({
  id:professionalId,professional_profile_id:professionalId,provider_type:ProviderType.INDIVIDUAL_PROFESSIONAL,
  status:ProviderStatus.ACTIVE,verification_status:ProfessionalVerificationState.VERIFIED,
  jurisdictions:['KE'],organization_refs:[],discoverability_status:DiscoverabilityStatus.HIDDEN,
  created_at:nowIso,updated_at:nowIso
});
await profRepo.saveRegistration({
  id:generateUUIDv7(),professional_id:professionalId,authority_id:'B29_TEST_ONLY_AUTHORITY',
  registration_type:'TEST_ONLY_LOCAL_CERTIFICATION',registration_number:`B29-${runRef}`,jurisdiction:'KE',
  issued_at:nowIso,expires_at:expires,status:'ACTIVE',verification_method:VerificationMethod.MANUAL,
  last_verified_at:nowIso,next_verification_at:expires,evidence_id:testOnly,created_at:nowIso,updated_at:nowIso
});
await profRepo.saveServiceOffering({
  id:serviceId,provider_id:professionalId,service_code:`B29-SERVICE-${runRef}`,
  service_type:ServiceType.COUNSELLING_SESSION,name:'B29 Test-Only Counselling',
  description:'Synthetic local certification service; not a real provider listing.',
  delivery_mode:DeliveryMode.TELEHEALTH,jurisdiction:'KE',population:TargetPopulation.ADULTS,
  duration_minutes:50,status:ServiceOfferingStatus.ACTIVE,clinical_scope_reference:testOnly,
  created_at:nowIso,updated_at:nowIso
});
assert.equal(await ProfessionalService.isVerifiedAsync(professionalId),true);

await ProviderMatcher.registerProviderProfileDurable({
  id:`match-${professionalId}`,professional_id:professionalId,title:'Test-Only Counsellor',
  full_name:'B29 Test-Only Counsellor',verification_state:ProfessionalVerificationState.VERIFIED,
  regulatory_body:'B29_TEST_ONLY_AUTHORITY',license_number:`B29-${runRef}`,license_expires_at:expires,
  specialties:['TEST_ONLY_GENERAL_COUNSELLING'],supported_care_levels:[CareLevel.LEVEL_2],
  modalities:[ServiceModality.TELEHEALTH],jurisdictions:['KE'],languages:['en'],capacity_status:'AVAILABLE',
  updated_at:nowIso
});

const consent=ConsentService.getInstance();
const professionalSharing=await consent.grantConsent(userId,'PROFESSIONAL_DATA_SHARING',{
  source:testOnly,recipients:[{recipient_type:'PROFESSIONAL',recipient_id:professionalId,recipient_name:'B29 Test-Only Counsellor',durationDays:1}]
});
await consent.grantConsent(userId,'CARE_REFERRAL_SHARING',{
  source:testOnly,recipients:[{recipient_type:'PROFESSIONAL',recipient_id:professionalId,recipient_name:'B29 Test-Only Counsellor',durationDays:1}]
});
await consent.grantConsent(userId,'ASSESSMENT_PROCESSING',{source:testOnly});
const aiConsent=await consent.grantConsent(userId,'AI_COMPANION_PROCESSING',{source:testOnly});

const assessment=await AssessmentService.startSession({userId,instrumentCode:'PHQ-9',hasConsent:true} as any);
assert.ok(assessment.session.id);

const contentResults=ContentApplicationService.searchContent({} as any);
assert.ok(contentResults.length>0,'Seeded psychoeducation content must be available.');
const contentId=contentResults[0].definition_id;
await ContentApplicationService.bookmarkContent(userId,contentId);
await ContentApplicationService.recordReadingProgress({userId,contentDefinitionId:contentId,percentage:35,lastPosition:1});

const conversation=Conversation.create({
  userId,purpose:'B29_LOCAL_CERTIFICATION',consentReceiptId:aiConsent.id,
  aiSystemId:'B29_TEST_ONLY_AI_SYSTEM',configurationVersionId:'B29_TEST_ONLY_CONFIG',
  metadata:{test_only:true}
});
await ConversationRepository.saveConversation(conversation);
const message=ConversationMessage.create({
  conversationId:conversation.id,sequenceNumber:1,role:'USER',
  content:`B29 test-only supportive message ${runRef}`
});
await ConversationRepository.saveMessage(message);

const navigation=await NavigationSessionService.startSession({
  userId,declaredNeeds:{concerns:['general wellbeing'],domain:'GENERAL_WELLBEING'}
});
const referral=await ReferralService.createReferral({
  userId,navigationSessionId:navigation.id,careLevel:CareLevel.LEVEL_2,
  receivingProviderId:professionalId,receivingServiceType:'COUNSELLING_SESSION',
  urgency:ReferralUrgency.ROUTINE,reasonCodes:['B29_TEST_ONLY_LOCAL_CERTIFICATION'],
  primaryNeed:SupportNeedDomain.GENERAL_WELLBEING,acuity:NeedAcuity.MILD,autoReady:true,actorId:userId
});

const startAt=new Date(Date.now()+48*60*60*1000).toISOString();
const endAt=new Date(Date.parse(startAt)+50*60*1000).toISOString();
const appointment=await AppointmentBookingService.book({
  subjectUserId:userId,providerId:professionalId,serviceOfferingId:serviceId,
  startAt,endAt,appointmentType:AppointmentType.ROUTINE,bookingSource:BookingSource.USER_SELF_SERVICE,
  referralId:referral.id,idempotencyKey:`B29-${runRef}`,actorId:userId,deliveryMode:'TELEHEALTH'
});
const sameAppointment=await AppointmentBookingService.book({
  subjectUserId:userId,providerId:professionalId,serviceOfferingId:serviceId,
  startAt,endAt,appointmentType:AppointmentType.ROUTINE,bookingSource:BookingSource.USER_SELF_SERVICE,
  referralId:referral.id,idempotencyKey:`B29-${runRef}`,actorId:userId,deliveryMode:'TELEHEALTH'
});
assert.equal(sameAppointment.id,appointment.id,'Appointment idempotency must converge.');

let overlapBlocked=false;
try{
  await AppointmentBookingService.book({
    subjectUserId:userId,providerId:professionalId,serviceOfferingId:serviceId,startAt,endAt,
    appointmentType:AppointmentType.ROUTINE,bookingSource:BookingSource.USER_SELF_SERVICE,
    referralId:referral.id,idempotencyKey:`B29-OVERLAP-${runRef}`,actorId:userId,deliveryMode:'TELEHEALTH'
  });
}catch{overlapBlocked=true;}
assert.equal(overlapBlocked,true,'PostgreSQL must block overlapping active provider appointments.');

const relationship=await CareRelationshipService.createRelationship({
  subjectUserId:userId,primaryProviderId:professionalId,relationshipType:CareRelationshipType.COUNSELLING,
  originType:CareRelationshipOriginType.APPOINTMENT,originReference:appointment.id,jurisdiction:'KE',
  purpose:CareRelationshipPurpose.CARE_DELIVERY,consentReference:professionalSharing.id,
  activateImmediately:true,actorId:professionalId
});

const note=await ClinicalNoteService.draftNote({
  relationshipId:relationship.id,authorProfessionalId:professionalId,authorRole:'PRIMARY_PROVIDER',
  noteType:ClinicalNoteType.SOAP_NOTE,
  structuredContent:{subjective:secretMarker,objective:'B29 TEST ONLY',assessment:'No diagnostic claim.',plan:'Local persistence verification only.'},
  actorId:professionalId
});
await ClinicalNoteService.signNote({noteId:note.id,signerProfessionalId:professionalId,actorId:professionalId});

const safetyRepo=getSafetyRepository();
await safetyRepo.saveResource({
  id:generateUUIDv7(),resource_code:`B29_TEST_RESOURCE_${runRef}`,
  resource_type:SafetyResourceType.GENERAL_SAFETY_RESOURCE,name:'B29 TEST-ONLY Local Safety Resource',
  description:'Synthetic CI/local fixture; not an authoritative real-world crisis resource.',jurisdiction:'KE',
  contact_method:'WEB',web:'https://example.invalid/b29-test-only',
  availability_json:{hours:'TEST_ONLY',free_of_charge:true},languages:['en'],population:['TEST_ONLY'],
  risk_applicability:['ALL'],verification_status:ResourceVerificationStatus.VERIFIED,
  verified_at:nowIso,expires_at:expires,status:'ACTIVE',source_reference:testOnly,created_at:nowIso,updated_at:nowIso
});
const resources=await new ResourceRegistryService(safetyRepo).getVerifiedResources({jurisdiction:'KE'});
assert.ok(resources.some(x=>x.resource_code===`B29_TEST_RESOURCE_${runRef}`));

const incident=await ClinicalIncidentService.open({
  incident_type:'B29_TEST_ONLY_LOCAL_CERTIFICATION',severity:'LOW',affected_component:'LOCAL_CERTIFICATION',
  evidence_references:[testOnly],created_by:'b29-certifier'
});

const pool=getPool();
const rawWorkspace=await pool.query('SELECT payload_ciphertext FROM clinical_workspace_runtime_entities WHERE entity_id=$1',[note.id]);
assert.equal(rawWorkspace.rows.length,1);
assert.equal(String(rawWorkspace.rows[0].payload_ciphertext).includes(secretMarker),false,'Clinical note plaintext leaked to PostgreSQL.');
const rawMutable=await pool.query("SELECT payload_ciphertext FROM b29_mutable_state WHERE domain='AI' AND entity_type='MESSAGE' AND entity_id=$1",[message.id]);
assert.equal(rawMutable.rows.length,1);
assert.equal(String(rawMutable.rows[0].payload_ciphertext).includes(message.content),false,'AI message plaintext leaked to PostgreSQL.');

// Process-style repository restart: replace Pg repositories and rehydrate mutable projections.
await configureB29Runtime({usePostgres:true});
await configureSprint24Runtime({usePostgres:true});

const loginAfterRestart=await identity.authenticate({
  email:userEmail,password,deviceLabel:'B29 Restart Verification',ipAddress:'127.0.0.1',userAgent:'B29'
});
assert.equal(loginAfterRestart.account.id,userId);
assert.equal((await ProfessionalService.getRepository().findProviderById(professionalId))?.id,professionalId);
assert.equal((await AppointmentBookingService.getRepository().getAppointmentById(appointment.id))?.id,appointment.id);
assert.equal((await CareRelationshipService.getRelationship(relationship.id))?.id,relationship.id);
assert.equal((await ClinicalNoteService.getNoteById(note.id,professionalId)).note.id,note.id);
assert.equal(ConsentService.hasActiveConsent(userId,'PROFESSIONAL_DATA_SHARING'),true);
assert.equal(AssessmentPersistenceStore.getSession(assessment.session.id)?.id,assessment.session.id);
assert.ok(ContentApplicationService.getUserBookmarks(userId).some(x=>x.definition_id===contentId));
assert.equal((await ConversationRepository.getConversation(conversation.id))?.id,conversation.id);
assert.equal(NavigationSessionService.getSession(navigation.id)?.id,navigation.id);
assert.equal(ReferralService.getReferral(referral.id)?.id,referral.id);
assert.equal((await ClinicalOperationsRepository.getIncident(incident.id))?.id,incident.id);

const certificationId=generateUUIDv7();
const buildSha=(process.env.GITHUB_SHA||'LOCAL').slice(0,128);
const domains=[
  'identity','consent','assessments','content','ai','safety','care_navigation','professionals',
  'availability','appointments','care_relationships','clinical_workspace','clinical_operations',
  'care_plans_tasks_messaging','outcomes','analytics','hardening','validation','launch_controls'
];
const goldenPath={
  identity_restart:true,consent_restart:true,assessment_restart:true,content_restart:true,ai_restart:true,
  navigation_referral_restart:true,provider_restart:true,appointment_restart:true,appointment_overlap_blocked:true,
  care_relationship_restart:true,encrypted_clinical_workspace:true,encrypted_ai_state:true,
  safety_resource_filtering:true,operations_incident_restart:true
};
await pool.query(`INSERT INTO local_certification_runs(id,build_sha,migration_count,postgres_domains,golden_path,safety_resource_mode,status,evidence,executed_at)
  VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8::jsonb,NOW())`,
  [certificationId,buildSha,27,JSON.stringify(domains),JSON.stringify(goldenPath),'TEST_ONLY_SYNTHETIC_FIXTURE','PASS',
   JSON.stringify({test_only:true,user_id:userId,professional_id:professionalId,appointment_id:appointment.id,relationship_id:relationship.id,note_id:note.id,incident_id:incident.id})]);

console.log('B29 LOCAL POSTGRES GOLDEN PATH PASSED',{
  migration_count:27,
  postgres_domains:domains.length,
  user_professional_operations:true,
  restart_persistence:true,
  appointment_overlap_blocked:true,
  clinical_plaintext_persisted:false,
  ai_message_plaintext_persisted:false,
  safety_resource_mode:'TEST_ONLY_SYNTHETIC_FIXTURE',
  note:'Synthetic fixtures validate mechanics only and assert no real professional/regulatory/crisis-resource approval.'
});

await DatabaseManager.shutdown();
