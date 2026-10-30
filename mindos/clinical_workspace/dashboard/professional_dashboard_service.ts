/**
 * MindOS Professional Workspace Dashboard Service
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV & Appendices B / C / Q
 * 
 * Invariant:
 * - Clinicians can only see patients with whom they have a governed care relationship.
 * - Platform admins/moderators NEVER appear as patient list viewers.
 */

import { CareRelationshipService, CareRelationshipState } from '../../care_relationships/index.js';
import { IClinicalWorkspaceRepository } from '../repositories/interfaces.js';
import { ClinicalEncounterState, ClinicalNoteState, ClinicalTaskStatus } from '../domain/types.js';
import { ProfessionalService } from '../../professionals/index.js';
import { AuthorizationError } from '../../platform/errors/index.js';

export interface PatientSummaryCard {
  relationshipId: string;
  userId: string;
  patientPseudonym: string;
  relationshipStatus: string;
  relationshipType: string;
  startedAt: string;
  upcomingEncountersCount: number;
  pendingTasksCount: number;
  unsignedNotesCount: number;
}

export interface WorkspaceDashboardSummary {
  professionalId: string;
  totalActivePatients: number;
  scheduledEncountersCount: number;
  unsignedDraftNotesCount: number;
  activeSafetyConcernsCount: number;
  patientSummaries: PatientSummaryCard[];
}

export class ProfessionalDashboardService {
  private static repository: IClinicalWorkspaceRepository;

  public static setRepository(repo: IClinicalWorkspaceRepository): void {
    ProfessionalDashboardService.repository = repo;
  }

  public static async getProfessionalPatientList(
    professionalId: string
  ): Promise<PatientSummaryCard[]> {
    // Check professional is verified
    const isVerified = ProfessionalService.isVerified(professionalId);
    if (!isVerified) {
      throw new AuthorizationError(
        'Verified healthcare professional status required to access clinical patient lists.',
        { errorCode: 'AUTHZ_003' }
      );
    }

    // Only fetch relationships where this professional is primary or active team member
    const relationships = await CareRelationshipService.listProfessionalRelationships(professionalId);

    const summaries: PatientSummaryCard[] = [];

    for (const rel of relationships) {
      // Find upcoming encounters
      const encounters = await ProfessionalDashboardService.repository.findEncountersByRelationshipId(
        rel.id,
        ClinicalEncounterState.SCHEDULED
      );

      // Find pending tasks
      const tasks = await ProfessionalDashboardService.repository.findTasksByRelationshipId(
        rel.id,
        ClinicalTaskStatus.PENDING
      );

      // Find unsigned draft notes
      const notes = await ProfessionalDashboardService.repository.findNotesByRelationshipId(
        rel.id,
        ClinicalNoteState.DRAFT
      );

      summaries.push({
        relationshipId: rel.id,
        userId: rel.subject_user_id,
        patientPseudonym: `PT-${rel.subject_user_id.substring(0, 8).toUpperCase()}`,
        relationshipStatus: rel.status,
        relationshipType: rel.relationship_type,
        startedAt: rel.started_at,
        upcomingEncountersCount: encounters.length,
        pendingTasksCount: tasks.length,
        unsignedNotesCount: notes.length
      });
    }

    return summaries;
  }

  public static async getDashboardSummary(
    professionalId: string
  ): Promise<WorkspaceDashboardSummary> {
    const patientSummaries = await ProfessionalDashboardService.getProfessionalPatientList(professionalId);

    const scheduledEncounters = await ProfessionalDashboardService.repository.findEncountersByProfessionalId(
      professionalId,
      ClinicalEncounterState.SCHEDULED
    );

    let unsignedDraftNotesCount = 0;
    let activeSafetyConcernsCount = 0;

    for (const p of patientSummaries) {
      unsignedDraftNotesCount += p.unsignedNotesCount;
      const concerns = await ProfessionalDashboardService.repository.findSafetyConcernsByRelationshipId(
        p.relationshipId
      );
      activeSafetyConcernsCount += concerns.length;
    }

    const activePatients = patientSummaries.filter(
      p => p.relationshipStatus === CareRelationshipState.ACTIVE
    ).length;

    return {
      professionalId,
      totalActivePatients: activePatients,
      scheduledEncountersCount: scheduledEncounters.length,
      unsignedDraftNotesCount,
      activeSafetyConcernsCount,
      patientSummaries
    };
  }
}
