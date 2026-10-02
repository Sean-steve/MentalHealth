import {
  ClinicalTaskState,
  ClinicalTaskType,
  ClinicalTaskAssigneeType,
  ClinicalTaskPriority,
  ClinicalTaskCompletionAuthority,
  ClinicalTaskDependencyType,
  ClinicalTaskEvidenceType
} from './types.js';

export interface ClinicalTask {
  id: string;
  subject_user_id: string;
  care_relationship_id: string;
  care_plan_id?: string;
  care_goal_id?: string;
  task_type: ClinicalTaskType;
  assigned_to_type: ClinicalTaskAssigneeType;
  assigned_to_id: string;
  status: ClinicalTaskState;
  priority: ClinicalTaskPriority;
  title: string;
  instruction_reference: string;
  created_at: string;
  due_at?: string;
  started_at?: string;
  completed_at?: string;
  recurrence_rule?: string;
  recurrence_parent_task_id?: string;
  recurrence_sequence?: number;
  created_by_professional_id: string;
  source_type: string;
  source_reference: string;
  completion_authority: ClinicalTaskCompletionAuthority;
  owner_domain?: string;
  policy_version: string;
  idempotency_key?: string;
  updated_at: string;
}

export interface ClinicalTaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: ClinicalTaskDependencyType;
  created_at: string;
}

export interface ClinicalTaskEvidence {
  id: string;
  task_id: string;
  evidence_type: ClinicalTaskEvidenceType;
  evidence_reference: string;
  recorded_by: string;
  recorded_at: string;
}

export interface ClinicalTaskReminderReceipt {
  id: string;
  task_id: string;
  reminder_key: string;
  notification_reference?: string;
  sent_at: string;
}
