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

export type PrdState = 'authoring' | 'questions_pending' | 'review_pending' | 'approved' | 'cancelled';

export interface PrdEntry {
  id: string;
  projectId: string;
  state: PrdState;
  input: { text: string; assets: { fileName: string; filePath: string }[] };
  clarifyingQuestions: { question: string; answer?: string }[];
  prdMarkdown: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  notes?: string;
}

export interface TaskSetEntry {
  id: string;
  projectId: string;
  prdId: string;
  version: number;
  userStories: UserStory[];
  createdAt: string;
}

export type ExecutionStatus = 'configuring' | 'executing' | 'completed' | 'aborted' | 'error';

export type StoryExecutionStatus = 'queued' | 'in_progress' | 'completed' | 'error';

export interface StoryProgress {
  storyId: string;
  status: StoryExecutionStatus;
  startedAt: string | null;
  completedAt: string | null;
  error?: string | null;
}

export interface WorktreeStatus {
  id: string;
  branch: string;
  worktreePath: string;
  status: StoryExecutionStatus;
  storyProgress: StoryProgress[];
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  logPath: string | null;
  errors: string[];
}

export interface Execution {
  id: string;
  projectId: string;
  taskSetId: string;
  status: ExecutionStatus;
  parallelCount: number;
  worktrees: WorktreeStatus[];
  startedAt: string | null;
  completedAt: string | null;
  winnerId: string | null;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
}

export const prdStateLabels: Record<PrdState, string> = {
  authoring: 'Authoring',
  questions_pending: 'Questions Pending',
  review_pending: 'Review Pending',
  approved: 'Approved',
  cancelled: 'Cancelled',
};

export const prdStateColors: Record<PrdState, string> = {
  authoring: '#3b82f6',
  questions_pending: '#8b5cf6',
  review_pending: '#f59e0b',
  approved: '#22c55e',
  cancelled: '#6b7280',
};

export const executionStatusLabels: Record<ExecutionStatus, string> = {
  configuring: 'Configuring',
  executing: 'Executing',
  completed: 'Completed',
  aborted: 'Aborted',
  error: 'Error',
};

export const executionStatusColors: Record<ExecutionStatus, string> = {
  configuring: '#6366f1',
  executing: '#ef4444',
  completed: '#22c55e',
  aborted: '#f59e0b',
  error: '#f38ba8',
};

export const storyStatusColors: Record<StoryExecutionStatus, string> = {
  queued: '#6c7086',
  in_progress: '#89b4fa',
  completed: '#a6e3a1',
  error: '#f38ba8',
};

export const storyStatusLabels: Record<StoryExecutionStatus, string> = {
  queued: 'Queued',
  in_progress: 'In Progress',
  completed: 'Completed',
  error: 'Error',
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
