import {
  ProfessionalService,PgProfessionalRepository
} from '../professionals/index.js';
import {
  AvailabilitySlotService,PgAvailabilityRepository
} from '../availability/index.js';
import {
  AppointmentBookingService,PgAppointmentRepository
} from '../appointments/index.js';
import {
  CareRelationshipService,CareTeamService,RelationshipAccessEvaluator,LifecycleTransitionService,
  CareTransferService,ContinuityReconciliationService,PgCareRelationshipRepository
} from '../care_relationships/index.js';
import {
  ClinicalEncounterService,ClinicalNoteService,PatientClinicalContextService,ProfessionalDashboardService,
  ProfessionalSafetyService,ClinicalTaskService as WorkspaceClinicalTaskService,CarePlanService as WorkspaceCarePlanService,
  PgClinicalWorkspaceRepository
} from '../clinical_workspace/index.js';

export interface B29RuntimeStatus{
  configured:boolean;
  persistence:'POSTGRES'|'LEGACY_IN_MEMORY';
  professionals:'POSTGRES'|'IN_MEMORY';
  availability:'POSTGRES'|'IN_MEMORY';
  appointments:'POSTGRES'|'IN_MEMORY';
  care_relationships:'POSTGRES'|'IN_MEMORY';
  clinical_workspace:'ENCRYPTED_POSTGRES'|'IN_MEMORY';
  synthetic_verified_professionals_seeded:boolean;
}

let status:B29RuntimeStatus={
  configured:false,persistence:'LEGACY_IN_MEMORY',professionals:'IN_MEMORY',availability:'IN_MEMORY',
  appointments:'IN_MEMORY',care_relationships:'IN_MEMORY',clinical_workspace:'IN_MEMORY',
  synthetic_verified_professionals_seeded:true
};

export function configureB29Runtime(options:{usePostgres?:boolean}={}):B29RuntimeStatus{
  const usePostgres=options.usePostgres
    ?? process.env.MINDOS_B29_STORAGE_MODE==='postgres'
    ?? process.env.NODE_ENV==='production';

  if(usePostgres){
    const professionals=new PgProfessionalRepository();
    ProfessionalService.setRepository(professionals);

    const availability=new PgAvailabilityRepository();
    AvailabilitySlotService.setRepository(availability);

    const appointments=new PgAppointmentRepository();
    AppointmentBookingService.setRepository(appointments);
    AvailabilitySlotService.setAppointmentFetcher(async(providerId,startRange,endRange)=>{
      const rows=await appointments.getAppointmentsByProvider(providerId,startRange,endRange);
      return rows.map(x=>({start_at:x.start_at,end_at:x.end_at,status:x.status}));
    });

    const relationships=new PgCareRelationshipRepository();
    CareRelationshipService.setRepository(relationships);
    CareTeamService.setRepository(relationships);
    RelationshipAccessEvaluator.setRepository(relationships);
    LifecycleTransitionService.setRepository(relationships);
    CareTransferService.setRepository(relationships);
    ContinuityReconciliationService.setRepository(relationships);

    const workspace=new PgClinicalWorkspaceRepository();
    ClinicalEncounterService.setRepository(workspace);
    ClinicalNoteService.setRepository(workspace);
    PatientClinicalContextService.setRepository(workspace);
    ProfessionalDashboardService.setRepository(workspace);
    ProfessionalSafetyService.setRepository(workspace);
    WorkspaceClinicalTaskService.setRepository(workspace);
    WorkspaceCarePlanService.setRepository(workspace);

    status={
      configured:true,persistence:'POSTGRES',professionals:'POSTGRES',availability:'POSTGRES',
      appointments:'POSTGRES',care_relationships:'POSTGRES',clinical_workspace:'ENCRYPTED_POSTGRES',
      synthetic_verified_professionals_seeded:false
    };
  }else{
    status={
      configured:true,persistence:'LEGACY_IN_MEMORY',professionals:'IN_MEMORY',availability:'IN_MEMORY',
      appointments:'IN_MEMORY',care_relationships:'IN_MEMORY',clinical_workspace:'IN_MEMORY',
      synthetic_verified_professionals_seeded:true
    };
  }
  return {...status};
}

export function getB29RuntimeStatus(){return {...status};}
