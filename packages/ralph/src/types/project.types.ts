import type { UserStory } from './session.types';

export interface RalphProjectPaths {
  projectDir: string;
  tasksDir: string;
  archiveDir: string;
  progressTxt: string;
  gitignore: string;
  prdJson: string;
  lastBranch: string;
  prdMarkdown: string;
}

export interface ProgressResult {
  project: string;
  total: number;
  done: number;
  current: UserStory | null;
  stories: UserStory[];
}

export interface ProjectInfo {
  name: string;
  projectDir: string;
  description: string;
}
