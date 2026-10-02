/**
 * MindOS Care Plans Repository Interfaces
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 */

import {
  CarePlan,
  CarePlanVersion,
  CareGoal,
  CareGoalReview,
  CareIntervention,
  CarePlanReview,
  ContentAssignment,
  AssessmentAssignment
} from '../domain/entities.js';
import { CarePlanState, CareGoalStatus } from '../domain/types.js';

export interface ICarePlanRepository {
  createPlanWithInitialVersion(plan: CarePlan, version: CarePlanVersion): Promise<void>;
  savePlan(plan: CarePlan): Promise<void>;
  findPlanById(id: string): Promise<CarePlan | null>;
  findPlanByRelationshipId(relationshipId: string): Promise<CarePlan | null>;
  findPlansByUserId(userId: string, status?: CarePlanState): Promise<CarePlan[]>;
  findPlansByProfessionalId(professionalId: string, status?: CarePlanState): Promise<CarePlan[]>;

  saveVersion(version: CarePlanVersion): Promise<void>;
  findVersionById(id: string): Promise<CarePlanVersion | null>;
  findVersionsByPlanId(planId: string): Promise<CarePlanVersion[]>;
  findActiveVersion(planId: string): Promise<CarePlanVersion | null>;

  saveGoal(goal: CareGoal): Promise<void>;
  findGoalById(id: string): Promise<CareGoal | null>;
  findGoalsByVersionId(versionId: string, status?: CareGoalStatus): Promise<CareGoal[]>;
  saveGoalReview(review: CareGoalReview): Promise<void>;
  findGoalReviews(goalId: string): Promise<CareGoalReview[]>;

  saveIntervention(intervention: CareIntervention): Promise<void>;
  findInterventionById(id: string): Promise<CareIntervention | null>;
  findInterventionsByVersionId(versionId: string): Promise<CareIntervention[]>;

  savePlanReview(review: CarePlanReview): Promise<void>;
  findPlanReviewById(id: string): Promise<CarePlanReview | null>;
  findPlanReviewsByPlanId(planId: string): Promise<CarePlanReview[]>;

  saveContentAssignment(assignment: ContentAssignment): Promise<void>;
  findContentAssignmentById(id: string): Promise<ContentAssignment | null>;
  findContentAssignmentsByPlanId(planId: string): Promise<ContentAssignment[]>;

  saveAssessmentAssignment(assignment: AssessmentAssignment): Promise<void>;
  findAssessmentAssignmentById(id: string): Promise<AssessmentAssignment | null>;
  findAssessmentAssignmentsByPlanId(planId: string): Promise<AssessmentAssignment[]>;

  clear(): Promise<void>;
}
