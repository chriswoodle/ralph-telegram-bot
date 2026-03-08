import { z } from 'zod';

export const PrdStateEnum = z.enum([
  'authoring',
  'questions_pending',
  'review_pending',
  'approved',
  'cancelled',
]);

export type PrdStateEnum = z.infer<typeof PrdStateEnum>;

export const PrdAssetSchema = z.object({
  fileName: z.string(),
  filePath: z.string(),
  mimeType: z.string().optional(),
});

export type PrdAsset = z.infer<typeof PrdAssetSchema>;

export const PrdInputSchema = z.object({
  text: z.string(),
  assets: z.array(PrdAssetSchema),
});

export type PrdInput = z.infer<typeof PrdInputSchema>;

export const ClarifyingQuestionSchema = z.object({
  question: z.string(),
  answer: z.string().optional(),
});

export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;

export const PrdEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  state: PrdStateEnum,
  input: PrdInputSchema,
  clarifyingQuestions: z.array(ClarifyingQuestionSchema),
  prdMarkdown: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
});

export type PrdEntry = z.infer<typeof PrdEntrySchema>;
