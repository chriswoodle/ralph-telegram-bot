import { z } from 'zod';

export const StoryExecutionStatusEnum = z.enum([
  'queued',
  'in_progress',
  'completed',
  'error',
]);

export type StoryExecutionStatusEnum = z.infer<typeof StoryExecutionStatusEnum>;

export const StoryProgressSchema = z.object({
  storyId: z.string(),
  status: StoryExecutionStatusEnum,
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  error: z.string().nullable().optional(),
});

export type StoryProgress = z.infer<typeof StoryProgressSchema>;

export const WorktreeStatusSchema = z.object({
  id: z.string(),
  branch: z.string(),
  worktreePath: z.string(),
  status: StoryExecutionStatusEnum,
  storyProgress: z.array(StoryProgressSchema),
  elapsedMs: z.number().int().nonnegative(),
  estimatedRemainingMs: z.number().int().nonnegative().nullable(),
  logPath: z.string().nullable(),
  errors: z.array(z.string()),
});

export type WorktreeStatus = z.infer<typeof WorktreeStatusSchema>;

export const ExecutionStatusEnum = z.enum([
  'configuring',
  'executing',
  'completed',
  'aborted',
  'error',
]);

export type ExecutionStatusEnum = z.infer<typeof ExecutionStatusEnum>;

export const ExecutionEventSchema = z.object({
  timestamp: z.string().datetime(),
  type: z.enum([
    'story_status_change',
    'eta_recalculation',
    'worktree_completed',
    'execution_completed',
    'error',
  ]),
  worktreeId: z.string().nullable().optional(),
  storyId: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;

export const ExecutionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  taskSetId: z.string().uuid(),
  status: ExecutionStatusEnum,
  parallelCount: z.number().int().min(1).max(10),
  worktrees: z.array(WorktreeStatusSchema),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  winnerId: z.string().nullable(),
  elapsedMs: z.number().int().nonnegative(),
  estimatedRemainingMs: z.number().int().nonnegative().nullable(),
});

export type Execution = z.infer<typeof ExecutionSchema>;
