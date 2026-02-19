import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// --- Param DTOs ---

export const UserIdParamSchema = z.object({
  userId: z.string(),
});

export class UserIdParamDto extends createZodDto(UserIdParamSchema) {}

export const ProjectNameParamSchema = z.object({
  name: z.string(),
});

export class ProjectNameParamDto extends createZodDto(ProjectNameParamSchema) {}

// --- Shared schemas ---

const StateSchema = z.enum([
  'IDLE',
  'AWAITING_PROJECT_NAME',
  'AWAITING_PROJECT_SELECTION',
  'AWAITING_PRD_SUMMARY',
  'AWAITING_CLARIFICATIONS',
  'REVIEWING_PRD',
  'AWAITING_MODIFICATIONS',
  'RUNNING',
]);

const UserStorySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  priority: z.number(),
  passes: z.boolean(),
  notes: z.string().optional(),
});

const PrdJsonSchema = z.object({
  project: z.string(),
  branchName: z.string(),
  description: z.string(),
  userStories: z.array(UserStorySchema),
});

// --- GET /api/health ---

export const HealthResponseSchema = z.object({
  status: z.string(),
  uptime: z.number(),
});

export class HealthResponseDto extends createZodDto(HealthResponseSchema) {}

// --- GET /api/status ---

export const DashboardStatusResponseSchema = z.object({
  uptime: z.number(),
  sessions: z.object({
    total: z.number(),
    running: z.number(),
  }),
  projects: z.object({
    total: z.number(),
  }),
});

export class DashboardStatusResponseDto extends createZodDto(DashboardStatusResponseSchema) {}

// --- GET /api/sessions ---

export const SessionListItemSchema = z.object({
  userId: z.number(),
  state: StateSchema,
  projectName: z.string().nullable(),
  currentIteration: z.number(),
  totalStories: z.number(),
  currentStory: z.string().nullable(),
  completed: z.boolean(),
  startedAt: z.number().nullable(),
  estimatedEndAt: z.number().nullable(),
});

export class SessionListItemDto extends createZodDto(SessionListItemSchema) {}

export const SessionListResponseSchema = z.object({
  items: z.array(SessionListItemSchema),
});

export class SessionListResponseDto extends createZodDto(SessionListResponseSchema) {}

// --- GET /api/sessions/:userId ---

const HistoryEntrySchema = z.object({
  timestamp: z.number(),
  updates: z.array(z.string()),
  snapshotState: StateSchema,
});

export const SessionDetailResponseSchema = z.object({
  userId: z.number(),
  state: StateSchema,
  projectName: z.string().nullable(),
  projectDir: z.string().nullable(),
  currentIteration: z.number(),
  totalStories: z.number(),
  currentStory: z.string().nullable(),
  completed: z.boolean(),
  startedAt: z.number().nullable(),
  estimatedEndAt: z.number().nullable(),
  prdJson: PrdJsonSchema.nullable(),
  recentHistory: z.array(HistoryEntrySchema),
});

export class SessionDetailResponseDto extends createZodDto(SessionDetailResponseSchema) {}

// --- GET /api/projects ---

export const ProjectListItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  total: z.number(),
  done: z.number(),
  percent: z.number(),
});

export class ProjectListItemDto extends createZodDto(ProjectListItemSchema) {}

export const ProjectListResponseSchema = z.object({
  items: z.array(ProjectListItemSchema),
});

export class ProjectListResponseDto extends createZodDto(ProjectListResponseSchema) {}

// --- GET /api/projects/:name ---

export const ProjectDetailResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  progress: z.object({
    total: z.number(),
    done: z.number(),
    percent: z.number(),
    current: UserStorySchema.nullable(),
    stories: z.array(UserStorySchema),
  }),
});

export class ProjectDetailResponseDto extends createZodDto(ProjectDetailResponseSchema) {}

// --- GET /api/projects/:name/log ---

export const ProjectLogResponseSchema = z.object({
  name: z.string(),
  log: z.string(),
});

export class ProjectLogResponseDto extends createZodDto(ProjectLogResponseSchema) {}

// --- Error response ---

export const ErrorResponseSchema = z.object({
  error: z.string(),
});

export class ErrorResponseDto extends createZodDto(ErrorResponseSchema) {}
