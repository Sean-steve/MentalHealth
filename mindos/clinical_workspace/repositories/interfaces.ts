/**
 * MindOS Clinical Workspace Repository Interfaces
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 */

import {
  ClinicalEncounter,
  ClinicalNote,
  ClinicalTask,
  CarePlan,
  ProfessionalSafetyConcern
} from '../domain/entities.js';
import { ClinicalEncounterState, ClinicalNoteState, ClinicalTaskStatus } from '../domain/types.js';

export interface IClinicalWorkspaceRepository {
  // Encounters
  saveEncounter(encounter: ClinicalEncounter): Promise<void>;
  findEncounterById(id: string): Promise<ClinicalEncounter | null>;
  findEncountersByRelationshipId(relationshipId: string, status?: ClinicalEncounterState): Promise<ClinicalEncounter[]>;
  findEncountersByProfessionalId(professionalId: string, status?: ClinicalEncounterState): Promise<ClinicalEncounter[]>;

  // Clinical Notes
  saveNote(note: ClinicalNote): Promise<void>;
  findNoteById(id: string): Promise<ClinicalNote | null>;
  findNotesByRelationshipId(relationshipId: string, status?: ClinicalNoteState): Promise<ClinicalNote[]>;
  findNotesByEncounterId(encounterId: string): Promise<ClinicalNote[]>;
  findAmendments(originalNoteId: string): Promise<ClinicalNote[]>;

  // Clinical Tasks
  saveTask(task: ClinicalTask): Promise<void>;
  findTaskById(id: string): Promise<ClinicalTask | null>;
  findTasksByRelationshipId(relationshipId: string, status?: ClinicalTaskStatus): Promise<ClinicalTask[]>;

  // Care Plans
  saveCarePlan(plan: CarePlan): Promise<void>;
  findCarePlanById(id: string): Promise<CarePlan | null>;
  findCarePlanByRelationshipId(relationshipId: string): Promise<CarePlan | null>;

  // Safety Concerns
  saveSafetyConcern(concern: ProfessionalSafetyConcern): Promise<void>;
  findSafetyConcernsByRelationshipId(relationshipId: string): Promise<ProfessionalSafetyConcern[]>;

  // Reset
  clear(): Promise<void>;
}
