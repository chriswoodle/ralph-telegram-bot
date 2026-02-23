import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import { RalphLoopService } from '../services/ralph-loop.service';
import { FormatService } from '../services/format.service';
import { State } from '../types/session.types';
import type { StepHandler, WorkflowContext } from '../types/workflow.types';

@Injectable()
export class RunStep implements StepHandler {
    private readonly logger = new Logger(RunStep.name);
    readonly state = State.RUNNING;

    constructor(
        private readonly sessionService: SessionService,
        private readonly projectService: ProjectService,
        private readonly ralphLoopService: RalphLoopService,
        private readonly formatService: FormatService,
    ) {}

    async handleText(ctx: WorkflowContext): Promise<void> {
        await ctx.reply(
            '🔄 Ralph is currently running. Use /progress to check status or /stop to cancel.',
        );
    }

    async executeRun(ctx: WorkflowContext): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`User ${ctx.userId} triggered run for project ${session.projectName}`);

        if (!session.prdJson || !session.projectDir) {
            await ctx.reply('No PRD ready to run. Use /start to begin a project.');
            return;
        }

        if (session.state === State.RUNNING) {
            await ctx.reply('Ralph is already running! Use /progress to check status.');
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
            `🚀 *Ralph is starting!*\n` +
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
                    await ctx.replyFormatted(`🎉 *Ralph finished successfully!*\n\n${summary}`);
                } else {
                    this.logger.log(
                        `Ralph stopped after ${result.iterations} stories for user ${ctx.userId}`,
                    );
                    await ctx.replyFormatted(
                        `⚠️ *Ralph stopped after ${result.iterations} stories.*\n\n${summary}`,
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
                await ctx.reply(`❌ Ralph encountered a fatal error: ${message}`);
            });
    }
}
