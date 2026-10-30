/**
 * MindOS In-Memory Clinical Workspace Repository
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 */

import { IClinicalWorkspaceRepository } from './interfaces.js';
import {
  ClinicalEncounter,
  ClinicalNote,
  ClinicalTask,
  CarePlan,
  ProfessionalSafetyConcern
} from '../domain/entities.js';
import { ClinicalEncounterState, ClinicalNoteState, ClinicalTaskStatus } from '../domain/types.js';

export class InMemoryWorkspaceRepository implements IClinicalWorkspaceRepository {
  private encounters: Map<string, ClinicalEncounter> = new Map();
  private notes: Map<string, ClinicalNote> = new Map();
  private tasks: Map<string, ClinicalTask> = new Map();
  private carePlans: Map<string, CarePlan> = new Map();
  private safetyConcerns: Map<string, ProfessionalSafetyConcern> = new Map();

  public async saveEncounter(encounter: ClinicalEncounter): Promise<void> {
    this.encounters.set(encounter.id, { ...encounter });
  }

  public async findEncounterById(id: string): Promise<ClinicalEncounter | null> {
    const enc = this.encounters.get(id);
    return enc ? { ...enc } : null;
  }

  public async findEncountersByRelationshipId(
    relationshipId: string,
    status?: ClinicalEncounterState
  ): Promise<ClinicalEncounter[]> {
    const results: ClinicalEncounter[] = [];
    for (const enc of this.encounters.values()) {
      if (enc.care_relationship_id === relationshipId) {
        if (!status || enc.status === status) {
          results.push({ ...enc });
        }
      }
    }
    return results;
  }

  public async findEncountersByProfessionalId(
    professionalId: string,
    status?: ClinicalEncounterState
  ): Promise<ClinicalEncounter[]> {
    const results: ClinicalEncounter[] = [];
    for (const enc of this.encounters.values()) {
      const isLead = enc.lead_professional_id === professionalId;
      const isParticipant = enc.participants.some(p => p.professional_id === professionalId);
      if (isLead || isParticipant) {
        if (!status || enc.status === status) {
          results.push({ ...enc });
        }
      }
    }
    return results;
  }

  public async saveNote(note: ClinicalNote): Promise<void> {
    this.notes.set(note.id, { ...note });
  }

  public async findNoteById(id: string): Promise<ClinicalNote | null> {
    const note = this.notes.get(id);
    return note ? { ...note } : null;
  }

  public async findNotesByRelationshipId(
    relationshipId: string,
    status?: ClinicalNoteState
  ): Promise<ClinicalNote[]> {
    const results: ClinicalNote[] = [];
    for (const n of this.notes.values()) {
      if (n.care_relationship_id === relationshipId) {
        if (!status || n.status === status) {
          results.push({ ...n });
        }
      }
    }
    return results;
  }

  public async findNotesByEncounterId(encounterId: string): Promise<ClinicalNote[]> {
    const results: ClinicalNote[] = [];
    for (const n of this.notes.values()) {
      if (n.encounter_id === encounterId) {
        results.push({ ...n });
      }
    }
    return results;
  }

  public async findAmendments(originalNoteId: string): Promise<ClinicalNote[]> {
    const results: ClinicalNote[] = [];
    for (const n of this.notes.values()) {
      if (n.amendment_of_id === originalNoteId) {
        results.push({ ...n });
      }
    }
    return results;
  }

  public async saveTask(task: ClinicalTask): Promise<void> {
    this.tasks.set(task.id, { ...task });
  }

  public async findTaskById(id: string): Promise<ClinicalTask | null> {
    const t = this.tasks.get(id);
    return t ? { ...t } : null;
  }

  public async findTasksByRelationshipId(
    relationshipId: string,
    status?: ClinicalTaskStatus
  ): Promise<ClinicalTask[]> {
    const results: ClinicalTask[] = [];
    for (const t of this.tasks.values()) {
      if (t.care_relationship_id === relationshipId) {
        if (!status || t.status === status) {
          results.push({ ...t });
        }
      }
    }
    return results;
  }

  public async saveCarePlan(plan: CarePlan): Promise<void> {
    this.carePlans.set(plan.id, { ...plan });
  }

  public async findCarePlanById(id: string): Promise<CarePlan | null> {
    const cp = this.carePlans.get(id);
    return cp ? { ...cp } : null;
  }

  public async findCarePlanByRelationshipId(relationshipId: string): Promise<CarePlan | null> {
    for (const cp of this.carePlans.values()) {
      if (cp.care_relationship_id === relationshipId) {
        return { ...cp };
      }
    }
    return null;
  }

  public async saveSafetyConcern(concern: ProfessionalSafetyConcern): Promise<void> {
    this.safetyConcerns.set(concern.id, { ...concern });
  }

  public async findSafetyConcernsByRelationshipId(
    relationshipId: string
  ): Promise<ProfessionalSafetyConcern[]> {
    const results: ProfessionalSafetyConcern[] = [];
    for (const c of this.safetyConcerns.values()) {
      if (c.care_relationship_id === relationshipId) {
        results.push({ ...c });
      }
    }
    return results;
  }

  public async clear(): Promise<void> {
    this.encounters.clear();
    this.notes.clear();
    this.tasks.clear();
    this.carePlans.clear();
    this.safetyConcerns.clear();
  }
}
