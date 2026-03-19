import type { Conversation } from './openrouter.types';

export const State = {
  IDLE: 'IDLE',
  AWAITING_PROJECT_NAME: 'AWAITING_PROJECT_NAME',
  AWAITING_PROJECT_SELECTION: 'AWAITING_PROJECT_SELECTION',
  AWAITING_PRD_SUMMARY: 'AWAITING_PRD_SUMMARY',
  AWAITING_CLARIFICATIONS: 'AWAITING_CLARIFICATIONS',
  REVIEWING_PRD: 'REVIEWING_PRD',
  AWAITING_MODIFICATIONS: 'AWAITING_MODIFICATIONS',
  RUNNING: 'RUNNING',
  AWAITING_IMPORT_URL: 'AWAITING_IMPORT_URL',
} as const;

export type StateValue = (typeof State)[keyof typeof State];

export interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  notes?: string;
}

export interface PrdJson {
  project: string;
  branchName: string;
  description: string;
  userStories: UserStory[];
}

export interface Session {
  state: StateValue;
  projectName: string | null;
  projectDir: string | null;
  prdSummary: string | null;
  clarifyingQuestions: string | null;
  clarifyingAnswers: string | null;
  prdJson: PrdJson | null;
  prdMarkdown: string | null;
  currentIteration: number;
  currentStory: string | null;
  completed: boolean;
  projectContext: string | null;
  abortController: AbortController | null;
  prdConversation: Conversation | null;
  startedAt: number | null;
  estimatedEndAt: number | null;
}

export type PersistedSession = Omit<Session, 'abortController'>;

export interface SessionSnapshot {
  state: StateValue;
  projectName: string | null;
  projectDir: string | null;
  prdSummary: string | null;
  clarifyingQuestions: string | null;
  clarifyingAnswers: string | null;
  prdJson: PrdJson | null;
  prdMarkdown: string | null;
  currentIteration: number;
  currentStory: string | null;
  completed: boolean;
  projectContext: string | null;
  startedAt: number | null;
  estimatedEndAt: number | null;
}

export interface SessionHistoryEntry {
  timestamp: number;
  updates: Partial<Session>;
  snapshot: SessionSnapshot;
}
