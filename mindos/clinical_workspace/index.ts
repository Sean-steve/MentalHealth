/**
 * MindOS Professional Clinical Workspace Bounded Context
 * Sprint 21 Bounded Context
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 */

import { InMemoryWorkspaceRepository } from './repositories/in_memory_workspace_repository.js';
import { ClinicalEncounterService } from './encounters/clinical_encounter_service.js';
import { ClinicalNoteService } from './notes/clinical_note_service.js';
import { PatientClinicalContextService } from './user_context/patient_clinical_context_service.js';
import { ProfessionalDashboardService } from './dashboard/professional_dashboard_service.js';
import { ProfessionalSafetyService } from './safety/professional_safety_service.js';
import { ClinicalTaskService } from './tasks/clinical_task_service.js';
import { CarePlanService } from './tasks/care_plan_service.js';

// Initialize default in-memory repository instance
const defaultRepository = new InMemoryWorkspaceRepository();
ClinicalEncounterService.setRepository(defaultRepository);
ClinicalNoteService.setRepository(defaultRepository);
PatientClinicalContextService.setRepository(defaultRepository);
ProfessionalDashboardService.setRepository(defaultRepository);
ProfessionalSafetyService.setRepository(defaultRepository);
ClinicalTaskService.setRepository(defaultRepository);
CarePlanService.setRepository(defaultRepository);

export * from './domain/types.js';
export * from './domain/entities.js';
export * from './repositories/interfaces.js';
export * from './repositories/in_memory_workspace_repository.js';
export * from './encounters/clinical_encounter_service.js';
export * from './notes/clinical_note_service.js';
export * from './user_context/patient_clinical_context_service.js';
export * from './dashboard/professional_dashboard_service.js';
export * from './safety/professional_safety_service.js';
export * from './tasks/clinical_task_service.js';
export * from './tasks/care_plan_service.js';
export * from './assessments/workspace_assessment_service.js';

export function resetClinicalWorkspaceForTesting(): void {
  defaultRepository.clear();
}
