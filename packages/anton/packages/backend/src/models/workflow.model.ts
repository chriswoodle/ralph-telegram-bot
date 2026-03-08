import { z } from 'zod';

export const WorkflowStateEnum = z.enum([
  'created',
  'prd_authoring',
  'prd_questions',
  'prd_review',
  'tasks_generated',
  'execution_config',
  'executing',
  'execution_review',
  'merging',
  'idle',
]);

export type WorkflowStateEnum = z.infer<typeof WorkflowStateEnum>;

export const WorkflowTransitionSchema = z.object({
  fromState: WorkflowStateEnum,
  toState: WorkflowStateEnum,
  timestamp: z.string().datetime(),
  triggeredBy: z.string(),
});

export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;

export const WorkflowStateSchema = z.object({
  projectId: z.string().uuid(),
  currentState: WorkflowStateEnum,
  previousState: WorkflowStateEnum.nullable(),
  transitionedAt: z.string().datetime(),
  transitionHistory: z.array(WorkflowTransitionSchema),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
