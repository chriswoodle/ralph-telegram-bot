import { z } from 'zod';

export const SettingsSchema = z.object({
  projectsDir: z.string(),
  openRouterApiKey: z.string(),
  openRouterModel: z.string().default('anthropic/claude-sonnet-4'),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  claudeLogEnabled: z.boolean().default(false),
  claudeLogDir: z.string().default('./logs/claude'),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DatabaseSchema = z.object({
  version: z.literal(1),
  projects: z.record(z.string(), z.unknown()),
  settings: SettingsSchema,
});

export type Database = z.infer<typeof DatabaseSchema>;

export function createDefaultDatabase(): Database {
  return {
    version: 1,
    projects: {},
    settings: {
      projectsDir: './projects',
      openRouterApiKey: '',
      openRouterModel: 'anthropic/claude-sonnet-4',
      claudeLogEnabled: false,
      claudeLogDir: './logs/claude',
    },
  };
}
