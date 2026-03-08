import { z } from 'zod';
import { WorkflowStateEnum } from './workflow.model';

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1),
  internalName: z.string(),
  prefix: z.string().length(2),
  description: z.string(),
  state: WorkflowStateEnum,
  projectDir: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Project = z.infer<typeof ProjectSchema>;
