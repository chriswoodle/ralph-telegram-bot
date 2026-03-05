import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import { RalphLoopService } from '../services/ralph-loop.service';
import { FormatService } from '../services/format.service';
import { State } from '../types/session.types';
import type { AppConfig } from '../config';
import type { StepHandler, WorkflowContext } from '../types/workflow.types';

@Injectable()
export class RunStep implements StepHandler {
    private readonly logger = new Logger(RunStep.name);
    private readonly botName: string;
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

    async handleText(ctx: WorkflowContext): Promise<void> {
        await ctx.reply(
            `🔄 ${this.botName} is currently running. Use /progress to check status or /stop to cancel.`,
        );
    }

    async resumeRun(ctx: WorkflowContext): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`Resuming run for user ${ctx.userId}, project ${session.projectName}`);

        if (!session.prdJson || !session.projectDir) {
            this.logger.warn(`Cannot resume user ${ctx.userId}: no PRD or project dir`);
            this.sessionService.updateSession(ctx.userId, { state: State.IDLE });
            return;
        }

        const stories = session.prdJson.userStories;
        const abortController = new AbortController();
        const startFromIndex = Math.max(0, session.currentIteration - 1);
        const startedAt = Date.now();

        this.sessionService.updateSession(ctx.userId, {
            abortController,
            startedAt,
            estimatedEndAt: null,
        });

        this.logger.log(
            `Ralph loop resuming for user ${ctx.userId}, project ${session.projectDir}, from story ${startFromIndex + 1}/${stories.length}`,
        );

        await ctx.replyFormatted(
            `🔄 *${this.botName} is resuming from story ${startFromIndex + 1}/${stories.length}!*\n\n` +
            'Use /progress to check status, /stop to cancel.',
        );

        this.ralphLoopService
            .runRalphLoop({
                projectDir: session.projectDir,
                stories,
                signal: abortController.signal,
                startFromIndex,
                onProgress: async (status) => {
                    this.sessionService.updateSession(ctx.userId, {
                        currentIteration: status.iteration,
                        currentStory: status.currentStory
                            ? `${status.currentStory.id}: ${status.currentStory.title}`
                            : null,
                        estimatedEndAt: status.estimatedEndAt,
                    });

                    try {
                        await ctx.replySilent(status.message);
                    } catch (err) {
                        this.logger.warn('Failed to send progress to user:', err);
                    }
                },
            })
            .then(async (result) => {
                this.sessionService.updateSession(ctx.userId, {
                    state: State.IDLE,
                    completed: result.completed,
                    abortController: null,
                    estimatedEndAt: null,
                });

                const finalProgress = await this.projectService.getProgress(session.projectDir!);
                const summary = this.formatService.formatProgress(finalProgress);

                if (result.completed) {
                    this.logger.log(
                        `Ralph completed for user ${ctx.userId}, project ${session.projectDir}`,
                    );
                    await ctx.replyFormatted(`🎉 *${this.botName} finished successfully!*\n\n${summary}`);
                } else {
                    this.logger.log(
                        `Ralph stopped after ${result.iterations} stories for user ${ctx.userId}`,
                    );
                    await ctx.replyFormatted(
                        `⚠️ *${this.botName} stopped after ${result.iterations} stories.*\n\n${summary}`,
                    );
                }
            })
            .catch(async (err) => {
                this.sessionService.updateSession(ctx.userId, {
                    state: State.IDLE,
                    abortController: null,
                    estimatedEndAt: null,
                });
                const message = err instanceof Error ? err.message : String(err);

                this.logger.error(`Ralph fatal error for user ${ctx.userId}:`, err);
                await ctx.reply(`❌ ${this.botName} encountered a fatal error: ${message}`);
            });
    }

    async executeRun(ctx: WorkflowContext): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`User ${ctx.userId} triggered run for project ${session.projectName}`);

        if (!session.prdJson || !session.projectDir) {
            await ctx.reply('No PRD ready to run. Use /start to begin a project.');
            return;
        }

        if (session.state === State.RUNNING) {
            await ctx.reply(`${this.botName} is already running! Use /progress to check status.`);
            return;
        }

        const stories = session.prdJson.userStories;
        const abortController = new AbortController();
        const startedAt = Date.now();
        this.sessionService.updateSession(ctx.userId, {
            state: State.RUNNING,
            currentIteration: 0,
            abortController,
            startedAt,
            estimatedEndAt: null,
        });

        this.logger.log(
            `Ralph loop starting for user ${ctx.userId}, project ${session.projectDir}, ${stories.length} stories`,
        );

        await ctx.replyFormatted(
            `🚀 *${this.botName} is starting!*\n` +
            `Stories: ${stories.length}\n\n` +
            'Use /progress to check status, /stop to cancel.',
        );

        this.ralphLoopService
            .runRalphLoop({
                projectDir: session.projectDir,
                stories,
                signal: abortController.signal,
                onProgress: async (status) => {
                    this.sessionService.updateSession(ctx.userId, {
                        currentIteration: status.iteration,
                        currentStory: status.currentStory
                            ? `${status.currentStory.id}: ${status.currentStory.title}`
                            : null,
                        estimatedEndAt: status.estimatedEndAt,
                    });

                    try {
                        await ctx.replySilent(status.message);
                    } catch (err) {
                        this.logger.warn('Failed to send progress to user:', err);
                    }
                },
            })
            .then(async (result) => {
                this.sessionService.updateSession(ctx.userId, {
                    state: State.IDLE,
                    completed: result.completed,
                    abortController: null,
                    estimatedEndAt: null,
                });

                const finalProgress = await this.projectService.getProgress(session.projectDir!);
                const summary = this.formatService.formatProgress(finalProgress);

                if (result.completed) {
                    this.logger.log(
                        `Ralph completed for user ${ctx.userId}, project ${session.projectDir}`,
                    );
                    await ctx.replyFormatted(`🎉 *${this.botName} finished successfully!*\n\n${summary}`);
                } else {
                    this.logger.log(
                        `Ralph stopped after ${result.iterations} stories for user ${ctx.userId}`,
                    );
                    await ctx.replyFormatted(
                        `⚠️ *${this.botName} stopped after ${result.iterations} stories.*\n\n${summary}`,
                    );
                }
            })
            .catch(async (err) => {
                this.sessionService.updateSession(ctx.userId, {
                    state: State.IDLE,
                    abortController: null,
                    estimatedEndAt: null,
                });
                const message = err instanceof Error ? err.message : String(err);

                this.logger.error(`Ralph fatal error for user ${ctx.userId}:`, err);
                await ctx.reply(`❌ ${this.botName} encountered a fatal error: ${message}`);
            });
    }
}
