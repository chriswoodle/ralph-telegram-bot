export interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  notes?: string;
}

export type StateValue =
  | 'IDLE'
  | 'AWAITING_PROJECT_NAME'
  | 'AWAITING_PROJECT_SELECTION'
  | 'AWAITING_PRD_SUMMARY'
  | 'AWAITING_CLARIFICATIONS'
  | 'REVIEWING_PRD'
  | 'AWAITING_MODIFICATIONS'
  | 'RUNNING';

export interface StatusResponse {
  uptime: number;
  sessions: {
    total: number;
    running: number;
  };
  projects: {
    total: number;
  };
}

export interface SessionSummary {
  userId: number;
  state: StateValue;
  projectName: string | null;
  currentIteration: number;
  totalStories: number;
  currentStory: string | null;
  completed: boolean;
  startedAt: number | null;
  estimatedEndAt: number | null;
}

export interface ProjectSummary {
  name: string;
  description: string;
  total: number;
  done: number;
  percent: number;
}

export interface ProjectDetail {
  name: string;
  description: string;
  progress: {
    total: number;
    done: number;
    percent: number;
    current: UserStory | null;
    stories: UserStory[];
  };
}

export interface ProjectLog {
  name: string;
  log: unknown;
}

export interface ProjectCard {
  type: 'project';
  id: string;
  name: string;
  description: string;
  total: number;
  done: number;
  percent: number;
  stories: UserStory[];
}

export interface StoryKanbanCard {
  type: 'story';
  story: UserStory;
  projectName: string;
  isCurrent: boolean;
}

export type KanbanCard = ProjectCard | StoryKanbanCard;

export interface StoryColumn {
  title: string;
  cards: KanbanCard[];
  accent?: boolean;
}
