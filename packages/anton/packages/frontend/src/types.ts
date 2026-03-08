export type WorkflowState =
  | 'created'
  | 'prd_authoring'
  | 'prd_questions'
  | 'prd_review'
  | 'tasks_generated'
  | 'execution_config'
  | 'executing'
  | 'execution_review'
  | 'merging'
  | 'idle';

export interface Project {
  id: string;
  displayName: string;
  internalName: string;
  prefix: string;
  description: string;
  state: WorkflowState;
  projectDir: string;
  createdAt: string;
  updatedAt: string;
}

export const stateLabels: Record<WorkflowState, string> = {
  created: 'Created',
  prd_authoring: 'PRD Authoring',
  prd_questions: 'PRD Questions',
  prd_review: 'PRD Review',
  tasks_generated: 'Tasks Generated',
  execution_config: 'Execution Config',
  executing: 'Executing',
  execution_review: 'Execution Review',
  merging: 'Merging',
  idle: 'Idle',
};

export const stateColors: Record<WorkflowState, string> = {
  created: '#6b7280',
  prd_authoring: '#3b82f6',
  prd_questions: '#8b5cf6',
  prd_review: '#f59e0b',
  tasks_generated: '#10b981',
  execution_config: '#6366f1',
  executing: '#ef4444',
  execution_review: '#f97316',
  merging: '#ec4899',
  idle: '#22c55e',
};
