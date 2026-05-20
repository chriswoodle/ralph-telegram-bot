import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import { RalphLoopService, type RalphLoopResult } from '../services/ralph-loop.service';
import { FormatService } from '../services/format.service';
import { State } from '../types/session.types';
import type { UserStory } from '../types/session.types';
import type { AppConfig } from '../config';
import type { StepHandler, WorkflowContext } from '../types/workflow.types';

function parseResetTimestamp(resetTime: string): number | null {
  const match = resetTime.match(/(\d+):(\d+)(am|pm)\s*\(([^)]+)\)/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toLowerCase();
  const tz = match[4];

  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  try {
    const now = new Date();
    const dateDtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateParts = Object.fromEntries(dateDtf.formatToParts(now).map((p) => [p.type, p.value]));
    const year = parseInt(dateParts.year, 10);
    const month = parseInt(dateParts.month, 10) - 1;
    const day = parseInt(dateParts.day, 10);

    const naiveUTC = new Date(Date.UTC(year, month, day, hours, minutes));
    const timeDtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const timeParts = Object.fromEntries(timeDtf.formatToParts(naiveUTC).map((p) => [p.type, p.value]));
    const tzH = parseInt(timeParts.hour, 10) % 24;
    const tzM = parseInt(timeParts.minute, 10);

    const diffMs = ((hours - tzH) * 60 + (minutes - tzM)) * 60 * 1000;
    let targetMs = naiveUTC.getTime() + diffMs;
    if (targetMs <= Date.now()) targetMs += 24 * 60 * 60 * 1000;
    return targetMs;
  } catch {
    return null;
  }
}

@Injectable()
export class RunStep implements StepHandler {
    private readonly logger = new Logger(RunStep.name);
    private readonly botName: string;
    private readonly autoResumeTimers = new Map<number, NodeJS.Timeout>();
    readonly state = State.RUNNING;

    constructor(
        private readonly sessionService: SessionService,
        private readonly projectService: ProjectService,
        private readonly ralphLoopService: RalphLoopService,
        private readonly formatService: FormatService,
        configService: ConfigService<AppConfig>,
    ) {
        this.botName = configService.get('BOT_NAME', 'Ralph');
    }

    cancelAutoResume(userId: number): void {
        const timer = this.autoResumeTimers.get(userId);
        if (timer) {
            clearTimeout(timer);
            this.autoResumeTimers.delete(userId);
            this.logger.log(`Cancelled auto-resume timer for user ${userId}`);
        }
    }

    async handleText(ctx: WorkflowContext): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        if (session.state === State.PAUSED) {
            await ctx.reply(
                `⏸ ${this.botName} is paused. Use /resume to continue or /stop to cancel.`,
                'The bot is paused. Use /resume to continue or /stop to cancel.',
            );
            return;
        }
        await ctx.reply(
            `🔄 ${this.botName} is currently running. Use /progress to check status, /pause to pause, or /stop to cancel.`,
            'The bot is currently running. Use /progress, /pause, or /stop.',
        );
    }

    async resumeRun(ctx: WorkflowContext): Promise<void> {
        this.cancelAutoResume(ctx.userId);
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`Resuming run for user ${ctx.userId}, project ${session.projectName}`);

        if (!session.prdJson || !session.projectDir) {
            this.logger.warn(`Cannot resume user ${ctx.userId}: no PRD or project dir`);
            this.sessionService.updateSession(ctx.userId, { state: State.IDLE });
            await ctx.reply('Nothing to resume. Use /start to begin a new project.');
            return;
        }

        const projectDir = session.projectDir;
        const progress = await this.projectService.getProgress(projectDir);
        const stories = progress.stories.length > 0 ? progress.stories : session.prdJson.userStories;

        const firstUnfinishedIndex = stories.findIndex((s) => !s.passes);
        if (firstUnfinishedIndex === -1) {
            this.logger.log(`Nothing to resume — all ${stories.length} stories already complete`);
            this.sessionService.updateSession(ctx.userId, {
                state: State.IDLE,
                completed: true,
                pauseRequested: false,
                pauseReason: null,
                abortController: null,
                estimatedEndAt: null,
            });
            const summary = this.formatService.formatProgress(progress);
            await ctx.replyFormatted(
                `✅ *Nothing to resume — all ${stories.length} stories are complete.*\n\n${summary}`,
                'All stories are already complete. Nothing to resume.',
            );
            return;
        }

        const startFromIndex = firstUnfinishedIndex;

        const abortController = new AbortController();
        const startedAt = Date.now();

        this.sessionService.updateSession(ctx.userId, {
            state: State.RUNNING,
            abortController,
            startedAt,
            estimatedEndAt: null,
            pauseRequested: false,
            pauseReason: null,
            usageLimitResetTime: null,
        });

        this.logger.log(
            `Ralph loop resuming for user ${ctx.userId}, project ${projectDir}, from story ${startFromIndex + 1}/${stories.length}`,
        );

        await ctx.replyFormatted(
            `🔄 *${this.botName} is resuming from story ${startFromIndex + 1}/${stories.length}!*\n\n` +
            'Use /progress to check status, /pause to pause, /stop to cancel.',
            'Resuming the run. Use /progress to check status, /pause to pause, or /stop to cancel.',
        );

        this.dispatchLoop(ctx, projectDir, stories, abortController, startFromIndex);
    }

    async executeRun(ctx: WorkflowContext): Promise<void> {
        this.cancelAutoResume(ctx.userId);
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`User ${ctx.userId} triggered run for project ${session.projectName}`);

        if (!session.prdJson || !session.projectDir) {
            await ctx.reply('No PRD ready to run. Use /start to begin a project.');
            return;
        }

        if (session.state === State.RUNNING) {
            await ctx.reply(`${this.botName} is already running! Use /progress to check status.`, 'The bot is already running. Use /progress to check status.');
            return;
        }

        if (session.state === State.PAUSED) {
            await ctx.reply(`${this.botName} is paused. Use /resume to continue or /stop to cancel.`, 'The bot is paused. Use /resume to continue or /stop to cancel.');
            return;
        }

        const stories = session.prdJson.userStories;
        const abortController = new AbortController();
        const startedAt = Date.now();
        const projectDir = session.projectDir;
        this.sessionService.updateSession(ctx.userId, {
            state: State.RUNNING,
            currentIteration: 0,
            abortController,
            startedAt,
            estimatedEndAt: null,
            pauseRequested: false,
            pauseReason: null,
        });

        this.logger.log(
            `Ralph loop starting for user ${ctx.userId}, project ${projectDir}, ${stories.length} stories`,
        );

        await ctx.replyFormatted(
            `🚀 *${this.botName} is starting!*\n` +
            `Stories: ${stories.length}\n\n` +
            'Use /progress to check status, /pause to pause, /stop to cancel.',
            'Run started. Use /progress to check status, /pause to pause, or /stop to cancel.',
        );

        this.dispatchLoop(ctx, projectDir, stories, abortController, 0);
    }

    private dispatchLoop(
        ctx: WorkflowContext,
        projectDir: string,
        stories: UserStory[],
        abortController: AbortController,
        startFromIndex: number,
    ): void {
        this.ralphLoopService
            .runRalphLoop({
                projectDir,
                stories,
                signal: abortController.signal,
                startFromIndex,
                isPauseRequested: () => this.sessionService.getSession(ctx.userId).pauseRequested,
                onProgress: async (status) => {
                    this.sessionService.updateSession(ctx.userId, {
                        currentIteration: status.iteration,
                        currentStory: status.currentStory
                            ? `${status.currentStory.id}: ${status.currentStory.title}`
                            : null,
                        estimatedEndAt: status.estimatedEndAt,
                    });

                    try {
                        await ctx.replySilent(status.message, 'Status update unavailable.');
                    } catch (err) {
                        this.logger.warn('Failed to send progress to user:', err);
                    }
                },
            })
            .then((result) => this.handleLoopResult(ctx, projectDir, result))
            .catch(async (err) => {
                this.sessionService.updateSession(ctx.userId, {
                    state: State.IDLE,
                    abortController: null,
                    estimatedEndAt: null,
                    pauseRequested: false,
                    pauseReason: null,
                });
                const message = err instanceof Error ? err.message : String(err);

                this.logger.error(`Ralph fatal error for user ${ctx.userId}:`, err);
                await ctx.reply(`❌ ${this.botName} encountered a fatal error: ${message}`, 'A fatal error occurred. Use /start to begin again.');
            });
    }

    private async handleLoopResult(
        ctx: WorkflowContext,
        projectDir: string,
        result: RalphLoopResult,
    ): Promise<void> {
        if (result.paused) {
            const pausedAt = result.pausedAtIteration ?? 1;
            this.sessionService.updateSession(ctx.userId, {
                state: State.PAUSED,
                currentIteration: pausedAt,
                abortController: null,
                estimatedEndAt: null,
                pauseRequested: false,
                pauseReason: result.pauseReason ?? 'user',
                usageLimitResetTime: result.resetTime ?? null,
            });

            this.logger.log(
                `Ralph paused at story ${pausedAt} for user ${ctx.userId} (${result.pauseReason ?? 'user'})`,
            );

            if (result.pauseReason === 'usage_limit') {
                let resumeNote = 'Use /resume to retry sooner or /stop to cancel.';
                if (result.resetTime) {
                    const targetMs = parseResetTimestamp(result.resetTime);
                    if (targetMs !== null) {
                        const delayMs = targetMs - Date.now();
                        const timer = setTimeout(async () => {
                            this.autoResumeTimers.delete(ctx.userId);
                            const s = this.sessionService.getSession(ctx.userId);
                            if (s.state !== State.PAUSED || s.pauseReason !== 'usage_limit') return;
                            try {
                                await ctx.reply(`🔄 Usage limit reset — ${this.botName} is auto-resuming...`, 'Usage limit reset. Auto-resuming now.');
                                await this.resumeRun(ctx);
                            } catch (err) {
                                this.logger.error(`Auto-resume for user ${ctx.userId} failed:`, err);
                            }
                        }, delayMs);
                        this.autoResumeTimers.set(ctx.userId, timer);
                        resumeNote = `Will auto-resume at ${result.resetTime}. Use /stop to cancel.`;
                    }
                }
                await ctx.replyFormatted(
                    `⏸ *${this.botName} paused at story ${pausedAt}.*\nUsage limit reached. ${resumeNote}`,
                    'Run paused due to usage limit. Use /resume to retry or /stop to cancel.',
                );
            } else {
                await ctx.replyFormatted(
                    `⏸ *${this.botName} paused at story ${pausedAt}.*\nPause requested. Use /resume to continue or /stop to cancel.`,
                    'Run paused. Use /resume to continue or /stop to cancel.',
                );
            }
            return;
        }

        this.sessionService.updateSession(ctx.userId, {
            state: State.IDLE,
            completed: result.completed,
            abortController: null,
            estimatedEndAt: null,
            pauseRequested: false,
            pauseReason: null,
        });

        const finalProgress = await this.projectService.getProgress(projectDir);
        const summary = this.formatService.formatProgress(finalProgress);

        if (result.completed) {
            this.logger.log(`Ralph completed for user ${ctx.userId}, project ${projectDir}`);
            await ctx.replyFormatted(`🎉 *${this.botName} finished successfully!*\n\n${summary}`, 'Run finished successfully.');
        } else {
            this.logger.log(
                `Ralph stopped after ${result.iterations} stories for user ${ctx.userId}`,
            );
            await ctx.replyFormatted(
                `⚠️ *${this.botName} stopped after ${result.iterations} stories.*\n\n${summary}`,
                'Run stopped before completing all stories.',
            );
        }
    }
}
