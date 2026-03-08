import { z } from 'zod';

export const UserStorySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  priority: z.number().int().positive(),
  passes: z.boolean(),
  notes: z.string().optional(),
});

export type UserStory = z.infer<typeof UserStorySchema>;

export const TaskSetEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  prdId: z.string().uuid(),
  version: z.number().int().positive(),
  userStories: z.array(UserStorySchema),
  createdAt: z.string().datetime(),
});

export type TaskSetEntry = z.infer<typeof TaskSetEntrySchema>;

export const TaskSetSchema = z.object({
  entries: z.array(TaskSetEntrySchema),
});

export type TaskSet = z.infer<typeof TaskSetSchema>;
