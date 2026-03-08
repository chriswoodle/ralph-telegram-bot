import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from './database.service';
import { GitService } from './git.service';
import { ClaudeCliService } from './claude-cli.service';
import { WorkflowStateMachineService } from './workflow-state-machine.service';
import { TelegramService } from './telegram.service';
import {
  Execution,
  WorktreeStatus,
  StoryProgress,
} from '../models/execution.model';
import { UserStory } from '../models/task.model';

interface RunningExecution {
  abortController: AbortController;
  startTime: number;
  worktreePromises: Promise<void>[];
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly runningExecutions = new Map<string, RunningExecution>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly gitService: GitService,
    private readonly claudeCliService: ClaudeCliService,
    private readonly workflowStateMachine: WorkflowStateMachineService,
    private readonly telegramService: TelegramService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Configure the parallel count for an execution (creates a new execution entry in configuring state).
   */
  async configureExecution(
    projectId: string,
    taskSetId: string,
    parallelCount: number,
  ): Promise<Execution> {
    if (parallelCount < 1 || parallelCount > 10) {
      throw new BadRequestException('parallelCount must be between 1 and 10');
    }

    const db = await this.databaseService.read();
    const project = db.projects[projectId];
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const taskSets = db.taskSets[projectId] ?? [];
    const taskSet = taskSets.find((t) => t.id === taskSetId);
    if (!taskSet) {
      throw new NotFoundException(`TaskSet ${taskSetId} not found`);
    }

    // Transition workflow to execution_config
    await this.workflowStateMachine.transition(
      projectId,
      'execution_config',
      'execution-service',
    );

    const now = new Date().toISOString();
    const execution: Execution = {
      id: crypto.randomUUID(),
      projectId,
      taskSetId,
      status: 'configuring',
      parallelCount,
      worktrees: [],
      startedAt: null,
      completedAt: null,
      winnerId: null,
      elapsedMs: 0,
      estimatedRemainingMs: null,
    };

    await this.databaseService.update((db) => {
      const existing = db.executions[projectId] ?? [];
      return {
        ...db,
        executions: {
          ...db.executions,
          [projectId]: [...existing, execution],
        },
      };
    });

    this.logger.log(
      `Created execution ${execution.id} for project ${projectId} with ${parallelCount} parallel sessions`,
    );
    return execution;
  }

  /**
   * Start execution: create worktrees, branches, and begin the Ralph loop for each worktree.
   */
  async startExecution(
    projectId: string,
    executionId: string,
  ): Promise<Execution> {
    const db = await this.databaseService.read();
    const project = db.projects[projectId];
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const executions = db.executions[projectId] ?? [];
    const execution = executions.find((e) => e.id === executionId);
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (execution.status !== 'configuring') {
      throw new ConflictException(
        `Execution is in "${execution.status}" state, expected "configuring"`,
      );
    }

    const taskSets = db.taskSets[projectId] ?? [];
    const taskSet = taskSets.find((t) => t.id === execution.taskSetId);
    if (!taskSet) {
      throw new NotFoundException(`TaskSet ${execution.taskSetId} not found`);
    }

    // Transition workflow to executing
    await this.workflowStateMachine.transition(
      projectId,
      'executing',
      'execution-service',
    );

    const now = new Date().toISOString();
    const worktrees: WorktreeStatus[] = [];

    // Create worktrees and branches
    for (let i = 0; i < execution.parallelCount; i++) {
      const worktreeId = `wt-${i + 1}`;
      const branchName = `${project.prefix}-exec-${executionId.slice(0, 8)}-${i + 1}`;
      const worktreePath = path.join(
        project.projectDir,
        '.anton',
        'worktrees',
        worktreeId,
      );

      try {
        await this.gitService.createWorktree(
          project.projectDir,
          worktreePath,
          branchName,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to create worktree ${worktreeId}: ${err}`,
        );
      }

      const storyProgress: StoryProgress[] = taskSet.userStories
        .filter((s) => !s.passes)
        .map((s) => ({
          storyId: s.id,
          status: 'queued' as const,
          startedAt: null,
          completedAt: null,
        }));

      const logDir = path.join(
        project.projectDir,
        '.anton',
        'logs',
        executionId,
        worktreeId,
      );
      fs.mkdirSync(logDir, { recursive: true });

      worktrees.push({
        id: worktreeId,
        branch: branchName,
        worktreePath,
        status: 'queued',
        storyProgress,
        elapsedMs: 0,
        estimatedRemainingMs: null,
        logPath: logDir,
        errors: [],
      });
    }

    // Update execution in database
    const startTime = Date.now();
    const updatedExecution: Execution = {
      ...execution,
      status: 'executing',
      worktrees,
      startedAt: now,
      elapsedMs: 0,
    };

    await this.updateExecution(projectId, executionId, updatedExecution);

    // Start the Ralph loop for each worktree (non-blocking)
    const abortController = new AbortController();
    const worktreePromises = worktrees.map((wt) =>
      this.runWorktreeLoop(
        projectId,
        executionId,
        wt,
        taskSet.userStories.filter((s) => !s.passes),
        abortController.signal,
        startTime,
      ),
    );

    this.runningExecutions.set(executionId, {
      abortController,
      startTime,
      worktreePromises,
    });

    // Monitor all worktrees and mark execution complete when done
    this.monitorExecution(projectId, executionId, worktreePromises);

    return updatedExecution;
  }

  /**
   * Get execution status with up-to-date elapsed time.
   */
  async getExecution(
    projectId: string,
    executionId: string,
  ): Promise<Execution> {
    const db = await this.databaseService.read();
    const executions = db.executions[projectId] ?? [];
    const execution = executions.find((e) => e.id === executionId);
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    // Update elapsed time for running executions
    const running = this.runningExecutions.get(executionId);
    if (running && execution.status === 'executing') {
      const elapsedMs = Date.now() - running.startTime;
      return { ...execution, elapsedMs };
    }

    return execution;
  }

  /**
   * List all executions for a project.
   */
  async listExecutions(projectId: string): Promise<Execution[]> {
    const db = await this.databaseService.read();
    return db.executions[projectId] ?? [];
  }

  /**
   * Abort a running execution. Kills all running Claude CLI processes.
   */
  async abortExecution(
    projectId: string,
    executionId: string,
  ): Promise<Execution> {
    const running = this.runningExecutions.get(executionId);
    if (running) {
      running.abortController.abort();
      // Wait briefly for worktrees to clean up
      await Promise.allSettled(running.worktreePromises);
      this.runningExecutions.delete(executionId);
    }

    const db = await this.databaseService.read();
    const executions = db.executions[projectId] ?? [];
    const execution = executions.find((e) => e.id === executionId);
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const now = new Date().toISOString();
    const updatedExecution: Execution = {
      ...execution,
      status: 'aborted',
      completedAt: now,
      worktrees: execution.worktrees.map((wt) => ({
        ...wt,
        status:
          wt.status === 'in_progress'
            ? ('error' as const)
            : wt.status,
        storyProgress: wt.storyProgress.map((sp) => ({
          ...sp,
          status:
            sp.status === 'in_progress'
              ? ('error' as const)
              : sp.status,
        })),
      })),
    };

    await this.updateExecution(projectId, executionId, updatedExecution);

    // Transition workflow back to execution_config
    try {
      await this.workflowStateMachine.transition(
        projectId,
        'execution_config',
        'execution-service',
      );
    } catch {
      this.logger.warn('Failed to transition workflow after abort');
    }

    this.logger.log(`Aborted execution ${executionId}`);
    return updatedExecution;
  }

  /**
   * Pick a winner worktree: merge its branch into the main project branch and clean up all worktrees.
   */
  async pickWinner(
    projectId: string,
    executionId: string,
    worktreeId: string,
  ): Promise<Execution> {
    const db = await this.databaseService.read();
    const project = db.projects[projectId];
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const executions = db.executions[projectId] ?? [];
    const execution = executions.find((e) => e.id === executionId);
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (
      execution.status !== 'completed' &&
      execution.status !== 'error'
    ) {
      throw new ConflictException(
        `Cannot pick winner for execution in "${execution.status}" state`,
      );
    }

    const winnerWt = execution.worktrees.find((wt) => wt.id === worktreeId);
    if (!winnerWt) {
      throw new NotFoundException(
        `Worktree ${worktreeId} not found in execution ${executionId}`,
      );
    }

    // Transition to merging
    await this.workflowStateMachine.transition(
      projectId,
      'execution_review',
      'execution-service',
    );

    await this.workflowStateMachine.transition(
      projectId,
      'merging',
      'execution-service',
    );

    // Merge the winner branch
    try {
      await this.gitService.mergeBranch(
        project.projectDir,
        winnerWt.branch,
        `Merge execution winner: ${winnerWt.branch}`,
      );
    } catch (err) {
      this.logger.error(`Failed to merge winner branch: ${err}`);
      throw new BadRequestException(
        `Failed to merge winner branch ${winnerWt.branch}: ${err}`,
      );
    }

    // Clean up all worktrees and branches
    for (const wt of execution.worktrees) {
      try {
        await this.gitService.removeWorktree(
          project.projectDir,
          wt.worktreePath,
        );
      } catch {
        this.logger.warn(`Failed to remove worktree ${wt.id}`);
      }
      try {
        await this.gitService.deleteBranch(
          project.projectDir,
          wt.branch,
          true,
        );
      } catch {
        this.logger.warn(`Failed to delete branch ${wt.branch}`);
      }
    }

    // Update execution with winner
    const updatedExecution: Execution = {
      ...execution,
      winnerId: worktreeId,
    };

    await this.updateExecution(projectId, executionId, updatedExecution);

    // Transition to idle
    await this.workflowStateMachine.transition(
      projectId,
      'idle',
      'execution-service',
    );

    await this.telegramService.notifyMergeComplete(
      project.displayName,
      winnerWt.branch,
    );

    this.logger.log(
      `Picked winner ${worktreeId} for execution ${executionId}, merged branch ${winnerWt.branch}`,
    );

    return updatedExecution;
  }

  /**
   * Run the Ralph loop for a single worktree: iterate through stories, executing each with Claude CLI.
   */
  private async runWorktreeLoop(
    projectId: string,
    executionId: string,
    worktree: WorktreeStatus,
    stories: UserStory[],
    signal: AbortSignal,
    executionStartTime: number,
  ): Promise<void> {
    const storiesToRun = stories.filter((s) => !s.passes);
    let completedCount = 0;
    const storyTimes: number[] = [];

    // Mark worktree as in_progress
    await this.updateWorktreeStatus(
      projectId,
      executionId,
      worktree.id,
      { status: 'in_progress' },
    );

    for (const story of storiesToRun) {
      if (signal.aborted) break;

      const storyStartTime = Date.now();

      // Mark story as in_progress
      await this.updateStoryProgress(
        projectId,
        executionId,
        worktree.id,
        story.id,
        {
          status: 'in_progress',
          startedAt: new Date().toISOString(),
        },
      );

      this.emitEvent(projectId, executionId, {
        type: 'story_status_change',
        worktreeId: worktree.id,
        storyId: story.id,
        data: { status: 'in_progress' },
      });

      try {
        const prompt = this.buildRalphPrompt(story);
        const logDir = worktree.logPath
          ? path.join(worktree.logPath, story.id)
          : undefined;

        await this.claudeCliService.run({
          cwd: worktree.worktreePath,
          prompt,
          signal,
          logDir,
        });

        const storyElapsed = Date.now() - storyStartTime;
        storyTimes.push(storyElapsed);
        completedCount++;

        // Mark story as completed
        await this.updateStoryProgress(
          projectId,
          executionId,
          worktree.id,
          story.id,
          {
            status: 'completed',
            completedAt: new Date().toISOString(),
          },
        );

        this.emitEvent(projectId, executionId, {
          type: 'story_status_change',
          worktreeId: worktree.id,
          storyId: story.id,
          data: { status: 'completed' },
        });

        // Recalculate ETA
        const avgTime =
          storyTimes.reduce((a, b) => a + b, 0) / storyTimes.length;
        const remaining = storiesToRun.length - completedCount;
        const estimatedRemainingMs = Math.round(avgTime * remaining);

        await this.updateWorktreeStatus(
          projectId,
          executionId,
          worktree.id,
          {
            elapsedMs: Date.now() - executionStartTime,
            estimatedRemainingMs,
          },
        );

        this.emitEvent(projectId, executionId, {
          type: 'eta_recalculation',
          worktreeId: worktree.id,
          data: { estimatedRemainingMs, completedCount, remaining },
        });
      } catch (err) {
        if (signal.aborted) break;

        const errorMsg =
          err instanceof Error ? err.message : String(err);

        await this.updateStoryProgress(
          projectId,
          executionId,
          worktree.id,
          story.id,
          {
            status: 'error',
            error: errorMsg,
          },
        );

        this.emitEvent(projectId, executionId, {
          type: 'error',
          worktreeId: worktree.id,
          storyId: story.id,
          data: { error: errorMsg },
        });

        // Add error to worktree
        await this.updateWorktreeStatus(
          projectId,
          executionId,
          worktree.id,
          (wt) => ({
            errors: [...wt.errors, `${story.id}: ${errorMsg}`],
          }),
        );

        // Continue to next story on error
        this.logger.warn(
          `Error executing story ${story.id} in worktree ${worktree.id}: ${errorMsg}`,
        );
      }
    }

    // Mark worktree as completed
    const finalStatus = signal.aborted ? 'error' : 'completed';
    await this.updateWorktreeStatus(
      projectId,
      executionId,
      worktree.id,
      {
        status: finalStatus as 'completed' | 'error',
        elapsedMs: Date.now() - executionStartTime,
        estimatedRemainingMs: 0,
      },
    );

    this.emitEvent(projectId, executionId, {
      type: 'worktree_completed',
      worktreeId: worktree.id,
      data: { status: finalStatus, completedCount },
    });
  }

  /**
   * Monitor all worktree promises and mark execution complete when all are done.
   */
  private async monitorExecution(
    projectId: string,
    executionId: string,
    worktreePromises: Promise<void>[],
  ): Promise<void> {
    try {
      await Promise.allSettled(worktreePromises);
    } catch {
      // Individual errors are handled in runWorktreeLoop
    }

    this.runningExecutions.delete(executionId);

    const db = await this.databaseService.read();
    const executions = db.executions[projectId] ?? [];
    const execution = executions.find((e) => e.id === executionId);
    if (!execution || execution.status === 'aborted') return;

    const now = new Date().toISOString();
    const hasErrors = execution.worktrees.some(
      (wt) => wt.status === 'error',
    );
    const finalStatus = hasErrors ? 'error' : 'completed';

    const updatedExecution: Execution = {
      ...execution,
      status: finalStatus as 'completed' | 'error',
      completedAt: now,
    };

    await this.updateExecution(projectId, executionId, updatedExecution);

    // Transition workflow to execution_review
    try {
      await this.workflowStateMachine.transition(
        projectId,
        'execution_review',
        'execution-service',
      );
    } catch {
      this.logger.warn(
        'Failed to transition to execution_review after completion',
      );
    }

    const project = db.projects[projectId];
    if (project) {
      await this.telegramService.notifyExecutionComplete(
        project.displayName,
        executionId,
        execution.worktrees.length,
      );
    }

    this.emitEvent(projectId, executionId, {
      type: 'execution_completed',
      data: { status: finalStatus },
    });

    this.logger.log(
      `Execution ${executionId} completed with status: ${finalStatus}`,
    );
  }

  /**
   * Build the Ralph prompt for a single user story execution.
   */
  private buildRalphPrompt(story: UserStory): string {
    return `You are an autonomous coding agent. Implement the following user story:

## Story: ${story.id} - ${story.title}

${story.description}

## Acceptance Criteria
${story.acceptanceCriteria.map((ac) => `- ${ac}`).join('\n')}

## Instructions
1. Implement the story following existing code patterns
2. Run quality checks (typecheck, lint, test) and fix any issues
3. Commit your changes with message: "feat: ${story.id} - ${story.title}"
4. If all checks pass, the story is complete

${story.notes ? `## Notes\n${story.notes}` : ''}`;
  }

  /**
   * Helper to update an execution in the database.
   */
  private async updateExecution(
    projectId: string,
    executionId: string,
    updated: Execution,
  ): Promise<void> {
    await this.databaseService.update((db) => {
      const entries = db.executions[projectId] ?? [];
      const index = entries.findIndex((e) => e.id === executionId);
      if (index === -1) return db;

      const updatedEntries = [...entries];
      updatedEntries[index] = updated;

      return {
        ...db,
        executions: {
          ...db.executions,
          [projectId]: updatedEntries,
        },
      };
    });
  }

  /**
   * Helper to update a worktree status within an execution.
   */
  private async updateWorktreeStatus(
    projectId: string,
    executionId: string,
    worktreeId: string,
    updater:
      | Partial<WorktreeStatus>
      | ((wt: WorktreeStatus) => Partial<WorktreeStatus>),
  ): Promise<void> {
    await this.databaseService.update((db) => {
      const entries = db.executions[projectId] ?? [];
      const execIndex = entries.findIndex((e) => e.id === executionId);
      if (execIndex === -1) return db;

      const execution = entries[execIndex];
      const wtIndex = execution.worktrees.findIndex(
        (wt) => wt.id === worktreeId,
      );
      if (wtIndex === -1) return db;

      const currentWt = execution.worktrees[wtIndex];
      const updates =
        typeof updater === 'function' ? updater(currentWt) : updater;

      const updatedWorktrees = [...execution.worktrees];
      updatedWorktrees[wtIndex] = { ...currentWt, ...updates };

      const updatedEntries = [...entries];
      updatedEntries[execIndex] = {
        ...execution,
        worktrees: updatedWorktrees,
      };

      return {
        ...db,
        executions: {
          ...db.executions,
          [projectId]: updatedEntries,
        },
      };
    });
  }

  /**
   * Helper to update a story progress within a worktree.
   */
  private async updateStoryProgress(
    projectId: string,
    executionId: string,
    worktreeId: string,
    storyId: string,
    updates: Partial<StoryProgress>,
  ): Promise<void> {
    await this.databaseService.update((db) => {
      const entries = db.executions[projectId] ?? [];
      const execIndex = entries.findIndex((e) => e.id === executionId);
      if (execIndex === -1) return db;

      const execution = entries[execIndex];
      const wtIndex = execution.worktrees.findIndex(
        (wt) => wt.id === worktreeId,
      );
      if (wtIndex === -1) return db;

      const worktree = execution.worktrees[wtIndex];
      const spIndex = worktree.storyProgress.findIndex(
        (sp) => sp.storyId === storyId,
      );
      if (spIndex === -1) return db;

      const updatedProgress = [...worktree.storyProgress];
      updatedProgress[spIndex] = {
        ...updatedProgress[spIndex],
        ...updates,
      };

      const updatedWorktrees = [...execution.worktrees];
      updatedWorktrees[wtIndex] = {
        ...worktree,
        storyProgress: updatedProgress,
      };

      const updatedEntries = [...entries];
      updatedEntries[execIndex] = {
        ...execution,
        worktrees: updatedWorktrees,
      };

      return {
        ...db,
        executions: {
          ...db.executions,
          [projectId]: updatedEntries,
        },
      };
    });
  }

  /**
   * Emit an execution event via EventEmitter2.
   */
  private emitEvent(
    projectId: string,
    executionId: string,
    event: {
      type: string;
      worktreeId?: string;
      storyId?: string;
      data?: Record<string, unknown>;
    },
  ): void {
    const executionEvent = {
      timestamp: new Date().toISOString(),
      ...event,
      worktreeId: event.worktreeId ?? null,
      storyId: event.storyId ?? null,
    };

    this.eventEmitter.emit('execution.event', {
      projectId,
      executionId,
      event: executionEvent,
    });
  }
}
