/**
 * MindOS In-Memory Care Plan Repository
 */
import { ICarePlanRepository } from './interfaces.js';
import {
  CarePlan, CarePlanVersion, CareGoal, CareGoalReview, CareIntervention,
  CarePlanReview, ContentAssignment, AssessmentAssignment
} from '../domain/entities.js';
import { CarePlanState, CareGoalStatus, CarePlanVersionStatus } from '../domain/types.js';

export class InMemoryCarePlanRepository implements ICarePlanRepository {
  private plans = new Map<string, CarePlan>();
  private versions = new Map<string, CarePlanVersion>();
  private goals = new Map<string, CareGoal>();
  private goalReviews = new Map<string, CareGoalReview[]>();
  private interventions = new Map<string, CareIntervention>();
  private planReviews = new Map<string, CarePlanReview>();
  private contentAssignments = new Map<string, ContentAssignment>();
  private assessmentAssignments = new Map<string, AssessmentAssignment>();

  public async createPlanWithInitialVersion(plan: CarePlan, version: CarePlanVersion): Promise<void> {
    if (version.care_plan_id !== plan.id || plan.current_version_id !== version.id) {
      throw new Error('Initial CarePlan and CarePlanVersion references are inconsistent.');
    }
    this.plans.set(plan.id, { ...plan });
    this.versions.set(version.id, { ...version });
  }

  public async savePlan(plan: CarePlan): Promise<void> { this.plans.set(plan.id, { ...plan }); }
  public async findPlanById(id: string): Promise<CarePlan | null> { const p=this.plans.get(id); return p?{...p}:null; }

  public async findPlanByRelationshipId(relationshipId: string): Promise<CarePlan | null> {
    for (const p of this.plans.values()) if (p.care_relationship_id === relationshipId) return { ...p };
    return null;
  }

  public async findPlansByUserId(userId: string, status?: CarePlanState): Promise<CarePlan[]> {
    return Array.from(this.plans.values()).filter(p=>p.subject_user_id===userId && (!status||p.status===status)).map(p=>({...p}));
  }

  public async findPlansByProfessionalId(professionalId: string, status?: CarePlanState): Promise<CarePlan[]> {
    return Array.from(this.plans.values()).filter(p=>p.primary_professional_id===professionalId && (!status||p.status===status)).map(p=>({...p}));
  }

  public async saveVersion(version: CarePlanVersion): Promise<void> { this.versions.set(version.id,{...version}); }
  public async findVersionById(id: string): Promise<CarePlanVersion | null> { const v=this.versions.get(id); return v?{...v}:null; }
  public async findVersionsByPlanId(planId: string): Promise<CarePlanVersion[]> {
    return Array.from(this.versions.values()).filter(v=>v.care_plan_id===planId).map(v=>({...v})).sort((a,b)=>a.version-b.version);
  }
  public async findActiveVersion(planId: string): Promise<CarePlanVersion | null> {
    for (const v of this.versions.values()) if(v.care_plan_id===planId&&v.status===CarePlanVersionStatus.ACTIVE) return {...v};
    return null;
  }

  public async saveGoal(goal: CareGoal): Promise<void> { this.goals.set(goal.id,{...goal}); }
  public async findGoalById(id: string): Promise<CareGoal | null> { const g=this.goals.get(id); return g?{...g}:null; }
  public async findGoalsByVersionId(versionId: string,status?: CareGoalStatus): Promise<CareGoal[]> {
    return Array.from(this.goals.values()).filter(g=>g.care_plan_version_id===versionId&&(!status||g.status===status)).map(g=>({...g}));
  }
  public async saveGoalReview(review: CareGoalReview): Promise<void> {
    const list=this.goalReviews.get(review.goal_id)||[]; list.push({...review}); this.goalReviews.set(review.goal_id,list);
  }
  public async findGoalReviews(goalId: string): Promise<CareGoalReview[]> { return (this.goalReviews.get(goalId)||[]).map(r=>({...r})); }

  public async saveIntervention(i: CareIntervention): Promise<void> { this.interventions.set(i.id,{...i}); }
  public async findInterventionById(id: string): Promise<CareIntervention | null> { const i=this.interventions.get(id); return i?{...i}:null; }
  public async findInterventionsByVersionId(versionId: string): Promise<CareIntervention[]> {
    return Array.from(this.interventions.values()).filter(i=>i.care_plan_version_id===versionId).map(i=>({...i}));
  }

  public async savePlanReview(review: CarePlanReview): Promise<void> { this.planReviews.set(review.id,{...review}); }
  public async findPlanReviewById(id: string): Promise<CarePlanReview | null> { const r=this.planReviews.get(id); return r?{...r}:null; }
  public async findPlanReviewsByPlanId(planId: string): Promise<CarePlanReview[]> {
    return Array.from(this.planReviews.values()).filter(r=>r.care_plan_id===planId).map(r=>({...r}))
      .sort((a,b)=>new Date(a.scheduled_for).getTime()-new Date(b.scheduled_for).getTime());
  }

  public async saveContentAssignment(a: ContentAssignment): Promise<void> { this.contentAssignments.set(a.id,{...a}); }
  public async findContentAssignmentById(id: string): Promise<ContentAssignment | null> { const a=this.contentAssignments.get(id); return a?{...a}:null; }
  public async findContentAssignmentsByPlanId(planId: string): Promise<ContentAssignment[]> {
    return Array.from(this.contentAssignments.values()).filter(a=>a.care_plan_id===planId).map(a=>({...a}));
  }

  public async saveAssessmentAssignment(a: AssessmentAssignment): Promise<void> { this.assessmentAssignments.set(a.id,{...a}); }
  public async findAssessmentAssignmentById(id: string): Promise<AssessmentAssignment | null> { const a=this.assessmentAssignments.get(id); return a?{...a}:null; }
  public async findAssessmentAssignmentsByPlanId(planId: string): Promise<AssessmentAssignment[]> {
    return Array.from(this.assessmentAssignments.values()).filter(a=>a.care_plan_id===planId).map(a=>({...a}));
  }

  public async clear(): Promise<void> {
    this.plans.clear(); this.versions.clear(); this.goals.clear(); this.goalReviews.clear();
    this.interventions.clear(); this.planReviews.clear(); this.contentAssignments.clear(); this.assessmentAssignments.clear();
  }
}
