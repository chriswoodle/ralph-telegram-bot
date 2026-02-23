import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from './services/session.service';
import { ProjectService } from './services/project.service';
import { FormatService } from './services/format.service';
import { State } from './types/session.types';
import type { WorkflowContext } from './types/workflow.types';

@Injectable()
export class CommandHandler {
    private readonly logger = new Logger(CommandHandler.name);

    constructor(
        private readonly sessionService: SessionService,
        private readonly projectService: ProjectService,
        private readonly formatService: FormatService,
    ) {}

    async handleStart(ctx: WorkflowContext): Promise<void> {
        this.logger.log(`/start from user ${ctx.userId}`);
        this.sessionService.resetSession(ctx.userId);
        this.sessionService.updateSession(ctx.userId, { state: State.AWAITING_PROJECT_NAME });

        await ctx.replyFormatted(
            '🤖 *Ralph Bot*\n\n' +
            "I'll help you plan and execute projects using AI agents.\n\n" +
            "Let's start a new project. What would you like to name it?\n\n" +
            '_Use lowercase letters, numbers, and hyphens (e.g., `task-manager`, `my-saas-app`)_',
        );
    }

    async handleNew(ctx: WorkflowContext): Promise<void> {
        this.logger.log(`/new from user ${ctx.userId}`);
        this.sessionService.resetSession(ctx.userId);
        this.sessionService.updateSession(ctx.userId, { state: State.AWAITING_PROJECT_NAME });

        await ctx.replyFormatted(
            "📁 Starting a new project. What's the project name?\n\n" +
            '_Use kebab-case (e.g., `my-cool-app`)_',
        );
    }

    async handleFeature(ctx: WorkflowContext): Promise<void> {
        this.logger.log(`/feature from user ${ctx.userId}`);

        const projects = await this.projectService.listProjects(this.projectService.projectsDir);
        if (projects.length === 0) {
            await ctx.reply('No existing projects found. Use /start to create one first.');
            return;
        }

        this.sessionService.resetSession(ctx.userId);
        this.sessionService.updateSession(ctx.userId, { state: State.AWAITING_PROJECT_SELECTION });

        const lines = projects.map((p, i) => `*${i + 1}.* \`${p.name}\` — ${p.description}`);

        await ctx.replyFormatted(
            '📂 *Select a project to add a feature to:*\n\n' +
            lines.join('\n') +
            '\n\n_Reply with the number or project name._',
        );
    }

    async handleProgress(ctx: WorkflowContext): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`/progress from user ${ctx.userId}, project: ${session.projectName ?? 'none'}`);

        if (!session.projectDir) {
            await ctx.reply('No active project. Use /start to begin a new one.');
            return;
        }

        const progress = await this.projectService.getProgress(session.projectDir);
        await ctx.replyFormatted(this.formatService.formatProgress(progress));
    }

    async handleLog(ctx: WorkflowContext): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`/log from user ${ctx.userId}, project: ${session.projectName ?? 'none'}`);

        if (!session.projectDir) {
            await ctx.reply('No active project. Use /start to begin a new one.');
            return;
        }

        const log = await this.projectService.getProgressLog(session.projectDir);
        await ctx.replyFormatted(
            `📜 *Progress Log:*\n\n\`\`\`\n${this.formatService.truncate(log, 3800)}\n\`\`\``,
        );
    }

    async handleStop(ctx: WorkflowContext): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`/stop from user ${ctx.userId}, state: ${session.state}`);

        if (session.state !== State.RUNNING) {
            await ctx.reply('Ralph is not currently running.');
            return;
        }

        if (session.abortController) {
            session.abortController.abort();
            this.logger.log(`Abort requested for user ${ctx.userId}`);
            await ctx.reply('🛑 Stopping Ralph after current iteration completes...');
        }
    }

    async handleStatus(ctx: WorkflowContext): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`/status from user ${ctx.userId}`);
        const lines = [
            `📊 *Session Status*`,
            `State: \`${session.state}\``,
            `Project: ${session.projectName || 'None'}`,
            `Directory: \`${session.projectDir || 'N/A'}\``,
        ];

        if (session.state === State.RUNNING) {
            const totalStories = session.prdJson?.userStories.length ?? 0;
            lines.push(`Story: ${session.currentIteration}/${totalStories}`);
            if (session.currentStory) {
                lines.push(`Current Story: ${session.currentStory}`);
            }
        }

        await ctx.replyFormatted(lines.join('\n'));
    }

    async handleDebug(ctx: WorkflowContext): Promise<void> {
        const history = this.sessionService.getSessionHistory(ctx.userId);
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`/debug from user ${ctx.userId}, ${history.length} history entries`);

        const header = `🔧 *Session Debugger*\n\nCurrent state: \`${session.state}\`\n\n`;
        const historyText = this.formatService.formatSessionHistoryForDebug(history);
        const full = header + historyText;

        await ctx.replyFormatted(this.formatService.truncate(full, 3800));
    }

    async handleHelp(ctx: WorkflowContext): Promise<void> {
        this.logger.log(`/help from user ${ctx.userId}`);
        await ctx.replyFormatted(
            '🤖 *Ralph Bot — Commands*\n\n' +
            '/start — Start a new project\n' +
            '/new — Alias for /start\n' +
            '/feature — Add a new feature to an existing project\n' +
            '/progress — Check story completion status\n' +
            '/log — View raw progress log\n' +
            '/status — Current session state\n' +
            '/debug — View session state change history\n' +
            '/stop — Cancel a running Ralph loop\n' +
            '/help — Show this message',
        );
    }
}
