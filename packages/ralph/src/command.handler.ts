import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionService } from './services/session.service';
import { ProjectService } from './services/project.service';
import { FormatService } from './services/format.service';
import { RunStep } from './steps/run.step';
import { State } from './types/session.types';
import type { AppConfig } from './config';
import type { WorkflowContext } from './types/workflow.types';

@Injectable()
export class CommandHandler {
    private readonly logger = new Logger(CommandHandler.name);
    private readonly botName: string;

    constructor(
        private readonly sessionService: SessionService,
        private readonly projectService: ProjectService,
        private readonly formatService: FormatService,
        private readonly runStep: RunStep,
        configService: ConfigService<AppConfig>,
    ) {
        this.botName = configService.get('BOT_NAME', 'Ralph');
    }

    async handleStart(ctx: WorkflowContext): Promise<void> {
        this.logger.log(`/start from user ${ctx.userId}`);
        this.sessionService.resetSession(ctx.userId);
        this.sessionService.updateSession(ctx.userId, { state: State.AWAITING_PROJECT_NAME });

        await ctx.replyFormatted(
            `🤖 *${this.botName} Bot*\n\n` +
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

        if (session.state !== State.RUNNING && session.state !== State.PAUSED) {
            await ctx.reply(`${this.botName} is not currently running.`);
            return;
        }

        if (session.state === State.PAUSED) {
            this.runStep.cancelAutoResume(ctx.userId);
            this.sessionService.updateSession(ctx.userId, {
                state: State.IDLE,
                pauseRequested: false,
                pauseReason: null,
                usageLimitResetTime: null,
                abortController: null,
                estimatedEndAt: null,
            });
            await ctx.reply(`🛑 Cleared paused ${this.botName} session.`);
            return;
        }

        if (session.abortController) {
            this.sessionService.updateSession(ctx.userId, { pauseRequested: false, pauseReason: null });
            session.abortController.abort();
            this.logger.log(`Abort requested for user ${ctx.userId}`);
            await ctx.reply(`🛑 Stopping ${this.botName} after current iteration completes...`);
        }
    }

    async handlePause(ctx: WorkflowContext): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`/pause from user ${ctx.userId}, state: ${session.state}`);

        if (session.state === State.PAUSED) {
            await ctx.reply(`${this.botName} is already paused. Use /resume to continue.`);
            return;
        }

        if (session.state !== State.RUNNING) {
            await ctx.reply(`${this.botName} is not currently running.`);
            return;
        }

        this.sessionService.updateSession(ctx.userId, {
            pauseRequested: true,
            pauseReason: 'user',
        });

        if (session.abortController) {
            session.abortController.abort();
            this.logger.log(`Pause requested for user ${ctx.userId}`);
            await ctx.reply(`⏸ Pausing ${this.botName} after current iteration completes. Use /resume to continue.`);
        }
    }

    async handleResume(ctx: WorkflowContext, projectArg?: string): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        this.logger.log(`/resume from user ${ctx.userId}, state: ${session.state}, arg: ${projectArg ?? '(none)'}`);

        if (session.state === State.RUNNING) {
            await ctx.reply(`${this.botName} is already running.`);
            return;
        }

        if (projectArg) {
            const loaded = await this.loadProjectIntoSession(ctx, projectArg);
            if (!loaded) return;
        } else if (!session.prdJson || !session.projectDir) {
            await this.listResumableProjects(ctx);
            return;
        }

        if (session.state !== State.PAUSED && session.state !== State.IDLE) {
            await ctx.reply(`Cannot resume from state \`${session.state}\`. Use /start or /feature.`);
            return;
        }

        await this.runStep.resumeRun(ctx);
    }

    private async loadProjectIntoSession(ctx: WorkflowContext, identifier: string): Promise<boolean> {
        const projects = await this.projectService.listProjects(this.projectService.projectsDir);
        const needle = identifier.toLowerCase();

        const exact = projects.find((p) => p.name.toLowerCase() === needle);
        const candidates = exact
            ? [exact]
            : projects.filter((p) => p.name.toLowerCase().includes(needle));

        if (candidates.length === 0) {
            await ctx.reply(`No project matched \`${identifier}\`. Use /resume with no argument to list resumable projects.`);
            return false;
        }
        if (candidates.length > 1) {
            const names = candidates.map((p) => `\`${p.name}\``).join(', ');
            await ctx.replyFormatted(`Multiple projects matched \`${identifier}\`: ${names}. Be more specific.`);
            return false;
        }

        const project = candidates[0];
        const prdJson = await this.projectService.readPrdJson(project.projectDir);
        if (!prdJson || !Array.isArray(prdJson.userStories) || prdJson.userStories.length === 0) {
            await ctx.reply(`Project \`${project.name}\` has no PRD or user stories — cannot resume.`);
            return false;
        }

        this.sessionService.resetSession(ctx.userId);
        this.sessionService.updateSession(ctx.userId, {
            state: State.IDLE,
            projectName: project.name,
            projectDir: project.projectDir,
            prdJson,
        });

        this.logger.log(`Loaded project ${project.name} for user ${ctx.userId} from ${project.projectDir}`);
        return true;
    }

    private async listResumableProjects(ctx: WorkflowContext): Promise<void> {
        const projects = await this.projectService.listProjects(this.projectService.projectsDir);
        const resumable: { name: string; done: number; total: number }[] = [];

        for (const p of projects) {
            const progress = await this.projectService.getProgress(p.projectDir);
            if (progress.total > 0 && progress.done < progress.total) {
                resumable.push({ name: p.name, done: progress.done, total: progress.total });
            }
        }

        if (resumable.length === 0) {
            await ctx.reply('Nothing to resume — all known projects are complete or have no PRD. Use /start to begin a new project.');
            return;
        }

        const lines = resumable
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => `• \`${p.name}\` — ${p.done}/${p.total} stories done`);

        await ctx.replyFormatted(
            `📂 *Projects with pending work:*\n${lines.join('\n')}\n\n_Run \`/resume <name>\` to continue one._`,
        );
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

        if (session.state === State.RUNNING || session.state === State.PAUSED) {
            const totalStories = session.prdJson?.userStories.length ?? 0;
            lines.push(`Story: ${session.currentIteration}/${totalStories}`);
            if (session.currentStory) {
                lines.push(`Current Story: ${session.currentStory}`);
            }
            if (session.state === State.PAUSED && session.pauseReason) {
                if (session.pauseReason === 'usage_limit') {
                    const resetInfo = session.usageLimitResetTime ? ` — resets ${session.usageLimitResetTime}` : '';
                    lines.push(`Paused: usage limit reached${resetInfo}`);
                } else {
                    lines.push(`Paused: by user`);
                }
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

    async handleImport(ctx: WorkflowContext): Promise<void> {
        this.logger.log(`/import from user ${ctx.userId}`);
        this.sessionService.resetSession(ctx.userId);
        this.sessionService.updateSession(ctx.userId, { state: State.AWAITING_IMPORT_URL });

        await ctx.replyFormatted(
            '📥 *Import a Git Repository*\n\n' +
            'Please provide the Git SSH URL of the repository you want to import.\n\n' +
            '_Example: `git@github.com:username/repo-name.git`_',
        );
    }

    async handleHelp(ctx: WorkflowContext): Promise<void> {
        this.logger.log(`/help from user ${ctx.userId}`);
        await ctx.replyFormatted(
            `🤖 *${this.botName} Bot — Commands*\n\n` +
            '/start — Start a new project\n' +
            '/new — Alias for /start\n' +
            '/import — Import an existing Git repository\n' +
            '/feature — Add a new feature to an existing project\n' +
            '/progress — Check story completion status\n' +
            '/log — View raw progress log\n' +
            '/status — Current session state\n' +
            '/debug — View session state change history\n' +
            `/stop — Cancel a running ${this.botName} loop\n` +
            `/pause — Pause ${this.botName} after the current story\n` +
            `/resume [project] — Resume a paused/stopped loop, or pick up an existing project\n` +
            '/help — Show this message',
        );
    }
}
