import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClaudeService, UsageLimitError } from './claude.service';
import { ResourceLoaderService } from './resource-loader.service';
import { ProjectService } from './project.service';
import type { AppConfig } from '../config';
import type { UserStory } from '../types/session.types';

export interface RalphStatus {
  type: string;
  iteration: number;
  totalStories: number;
  currentStory?: UserStory | null;
  message: string;
  startedAt: number;
  estimatedEndAt: number | null;
}

export interface RalphLoopResult {
  completed: boolean;
  iterations: number;
  paused?: boolean;
  pauseReason?: 'user' | 'usage_limit';
  pausedAtIteration?: number;
  resetTime?: string;
}

interface RunRalphLoopOpts {
  projectDir: string;
  stories: UserStory[];
  signal?: AbortSignal;
  startFromIndex?: number;
  isPauseRequested?: () => boolean;
  onProgress: (status: RalphStatus) => void | Promise<void>;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const h = Math.floor(min / 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (min % 60 > 0) parts.push(`${min % 60}m`);
  if (sec % 60 > 0 || parts.length === 0) parts.push(`${sec % 60}s`);
  return parts.join(' ');
}

function formatTimeInfo(elapsedMs: number, eteMs?: number): string {
  const elapsed = formatDuration(elapsedMs);
  if (eteMs == null || eteMs <= 0) return `⏱ Elapsed: ${elapsed}`;
  return `⏱ Elapsed: ${elapsed} | ETE: ~${formatDuration(eteMs)} remaining`;
}

@Injectable()
export class RalphLoopService {
  private readonly logger = new Logger(RalphLoopService.name);
  private readonly botName: string;

  constructor(
    private readonly claude: ClaudeService,
    private readonly resourceLoader: ResourceLoaderService,
    private readonly projectService: ProjectService,
    configService: ConfigService<AppConfig>,
  ) {
    this.botName = configService.get('BOT_NAME', 'Ralph');
  }

  async runRalphLoop(opts: RunRalphLoopOpts): Promise<RalphLoopResult> {
    const { projectDir, stories, signal, startFromIndex = 0, isPauseRequested, onProgress } = opts;
    const totalStories = stories.length;

    this.logger.log(`Starting loop for ${projectDir}, ${totalStories} stories (claude), from index ${startFromIndex}`);

    await this.projectService.ensureProgressFile(projectDir);

    const loopStartTime = Date.now();
    const iterationDurations: number[] = [];

    for (let i = startFromIndex; i < totalStories; i++) {
      const storyNum = i + 1;
      const story = stories[i];

      if (signal?.aborted) {
        const paused = isPauseRequested?.() ?? false;
        const elapsed = Date.now() - loopStartTime;
        if (paused) {
          this.logger.log(`Loop paused at story ${storyNum}`);
          await onProgress({
            type: 'paused',
            iteration: storyNum,
            totalStories,
            currentStory: story,
            message: `⏸ ${this.botName} paused at story ${storyNum}/${totalStories}. Use /resume to continue.\n${formatTimeInfo(elapsed)}`,
            startedAt: loopStartTime,
            estimatedEndAt: null,
          });
          return { completed: false, iterations: i, paused: true, pauseReason: 'user', pausedAtIteration: storyNum };
        }
        this.logger.log(`Loop aborted at story ${storyNum}`);
        await onProgress({
          type: 'aborted',
          iteration: storyNum,
          totalStories,
          message: `${this.botName} loop was cancelled.\n${formatTimeInfo(elapsed)}`,
          startedAt: loopStartTime,
          estimatedEndAt: null,
        });
        return { completed: false, iterations: i };
      }

      const elapsedBeforeIter = Date.now() - loopStartTime;
      const avgMs =
        iterationDurations.length > 0
          ? iterationDurations.reduce((a, b) => a + b, 0) / iterationDurations.length
          : 0;
      const remainingIters = totalStories - i;
      const etaMs = avgMs > 0 ? avgMs * remainingIters : undefined;

      const estimatedEndAt = etaMs != null ? Date.now() + etaMs : null;

      await onProgress({
        type: 'iteration_start',
        iteration: storyNum,
        totalStories,
        currentStory: story,
        message: `🔄 Story ${storyNum}/${totalStories} — ${story.id}: ${story.title}\n${formatTimeInfo(elapsedBeforeIter, etaMs)}`,
        startedAt: loopStartTime,
        estimatedEndAt,        
      });

      const iterStartTime = Date.now();

      try {
        const { completed } = await this.runRalphIteration(projectDir, storyNum, signal);

        const iterDuration = Date.now() - iterStartTime;
        iterationDurations.push(iterDuration);
        const elapsed = Date.now() - loopStartTime;

        if (completed) {
          this.logger.log(`All tasks complete at story ${storyNum}`);
          await onProgress({
            type: 'complete',
            iteration: storyNum,
            totalStories,
            message: `✅ ${this.botName} completed all tasks at story ${storyNum}/${totalStories}!\n${formatTimeInfo(elapsed)}`,
            startedAt: loopStartTime,
            estimatedEndAt: null,
          });
          return { completed: true, iterations: storyNum };
        }
      } catch (err) {
        const iterDuration = Date.now() - iterStartTime;
        iterationDurations.push(iterDuration);
        const elapsed = Date.now() - loopStartTime;

        const error = err as Error & { name?: string };

        if (err instanceof UsageLimitError) {
          this.logger.warn(`Usage limit hit at story ${storyNum} — pausing`);
          const resetSuffix = err.resetTime ? ` Resets ${err.resetTime}.` : '';
          await onProgress({
            type: 'paused_usage_limit',
            iteration: storyNum,
            totalStories,
            currentStory: story,
            message: `⏸ Usage limit reached at story ${storyNum}/${totalStories} (${story.id}).${resetSuffix} ${this.botName} is paused — use /resume to retry this story when limits reset.\n${formatTimeInfo(elapsed)}`,
            startedAt: loopStartTime,
            estimatedEndAt: null,
          });
          return {
            completed: false,
            iterations: i,
            paused: true,
            pauseReason: 'usage_limit',
            pausedAtIteration: storyNum,
            resetTime: err.resetTime,
          };
        }

        if (error.name === 'AbortError') {
          const paused = isPauseRequested?.() ?? false;
          if (paused) {
            await onProgress({
              type: 'paused',
              iteration: storyNum,
              totalStories,
              currentStory: story,
              message: `⏸ ${this.botName} paused at story ${storyNum}/${totalStories}. Use /resume to continue.\n${formatTimeInfo(elapsed)}`,
              startedAt: loopStartTime,
              estimatedEndAt: null,
            });
            return { completed: false, iterations: i, paused: true, pauseReason: 'user', pausedAtIteration: storyNum };
          }
          await onProgress({
            type: 'aborted',
            iteration: storyNum,
            totalStories,
            message: `${this.botName} loop was cancelled.\n${formatTimeInfo(elapsed)}`,
            startedAt: loopStartTime,
            estimatedEndAt: null,
          });
          return { completed: false, iterations: i };
        }

        this.logger.error(`Error in story ${storyNum} (${story.id}):`, error);
        const avgMsAfter =
          iterationDurations.reduce((a, b) => a + b, 0) / iterationDurations.length;
        const remainingItersAfter = totalStories - storyNum;
        const etaMsAfter = remainingItersAfter > 0 ? avgMsAfter * remainingItersAfter : 0;

        const estimatedEndAtAfter = etaMsAfter > 0 ? Date.now() + etaMsAfter : null;

        await onProgress({
          type: 'error',
          iteration: storyNum,
          totalStories,
          message: `⚠️ Error in story ${storyNum} (${story.id}): ${error.message}. Continuing...\n${formatTimeInfo(elapsed, etaMsAfter)}`,
          startedAt: loopStartTime,
          estimatedEndAt: estimatedEndAtAfter,
        });
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    const elapsed = Date.now() - loopStartTime;
    this.logger.log(`All ${totalStories} stories processed`);
    await onProgress({
      type: 'all_stories_done',
      iteration: totalStories,
      totalStories,
      message: `✅ ${this.botName} processed all ${totalStories} stories.\n${formatTimeInfo(elapsed)}`,
      startedAt: loopStartTime,
      estimatedEndAt: null,
    });

    return { completed: true, iterations: totalStories };
  }

  private async runRalphIteration(
    projectDir: string,
    iteration: number,
    signal?: AbortSignal,
  ): Promise<{ output: string; completed: boolean }> {
    this.logger.log(`Story ${iteration} for ${projectDir}`);
    const prompt = await this.resourceLoader.loadResource('CLAUDE.md');
    const output = await this.claude.runClaude({ prompt, cwd: projectDir, signal });
    const completed = output.includes('<promise>COMPLETE</promise>');
    this.logger.log(`Story ${iteration} complete, all done: ${completed}`);
    return { output, completed };
  }
}
