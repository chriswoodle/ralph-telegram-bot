import { Injectable, Logger } from '@nestjs/common';
import { Bot, type Context } from 'grammy';
import { SessionService } from './services/session.service';
import { ProjectService } from './services/project.service';
import { FormatService } from './services/format.service';
import { State } from './types/session.types';

@Injectable()
export class CommandHandler {
  private readonly logger = new Logger(CommandHandler.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly projectService: ProjectService,
    private readonly formatService: FormatService,
  ) {}

  register(bot: Bot<Context>): void {
    bot.command('start', (ctx) => this.handleStart(ctx));
    bot.command('new', (ctx) => this.handleNew(ctx));
    bot.command('feature', (ctx) => this.handleFeature(ctx));
    bot.command('progress', (ctx) => this.handleProgress(ctx));
    bot.command('log', (ctx) => this.handleLog(ctx));
    bot.command('stop', (ctx) => this.handleStop(ctx));
    bot.command('status', (ctx) => this.handleStatus(ctx));
    bot.command('debug', (ctx) => this.handleDebug(ctx));
    bot.command('help', (ctx) => this.handleHelp(ctx));
  }

  private async handleStart(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    this.logger.log(`/start from user ${userId}`);
    this.sessionService.resetSession(userId);
    this.sessionService.updateSession(userId, { state: State.AWAITING_PROJECT_NAME });

    await ctx.reply(
      '🤖 *Ralph Wiggum Bot*\n\n' +
        "I'll help you plan and execute projects using AI agents.\n\n" +
        "Let's start a new project. What would you like to name it?\n\n" +
        '_Use lowercase letters, numbers, and hyphens (e.g., `task-manager`, `my-saas-app`)_',
      { parse_mode: 'Markdown' },
    );
  }

  private async handleNew(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    this.logger.log(`/new from user ${userId}`);
    this.sessionService.resetSession(userId);
    this.sessionService.updateSession(userId, { state: State.AWAITING_PROJECT_NAME });

    await ctx.reply(
      "📁 Starting a new project. What's the project name?\n\n" +
        '_Use kebab-case (e.g., `my-cool-app`)_',
      { parse_mode: 'Markdown' },
    );
  }

  private async handleFeature(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    this.logger.log(`/feature from user ${userId}`);

    const projects = await this.projectService.listProjects(this.projectService.projectsDir);
    if (projects.length === 0) {
      await ctx.reply('No existing projects found. Use /start to create one first.');
      return;
    }

    this.sessionService.resetSession(userId);
    this.sessionService.updateSession(userId, { state: State.AWAITING_PROJECT_SELECTION });

    const lines = projects.map((p, i) => `*${i + 1}.* \`${p.name}\` — ${p.description}`);

    await ctx.reply(
      '📂 *Select a project to add a feature to:*\n\n' +
        lines.join('\n') +
        '\n\n_Reply with the number or project name._',
      { parse_mode: 'Markdown' },
    );
  }

  private async handleProgress(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);
    this.logger.log(`/progress from user ${userId}, project: ${session.projectName ?? 'none'}`);

    if (!session.projectDir) {
      await ctx.reply('No active project. Use /start to begin a new one.');
      return;
    }

    const progress = await this.projectService.getProgress(session.projectDir);
    await ctx.reply(this.formatService.formatProgressForTelegram(progress), {
      parse_mode: 'Markdown',
    });
  }

  private async handleLog(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);
    this.logger.log(`/log from user ${userId}, project: ${session.projectName ?? 'none'}`);

    if (!session.projectDir) {
      await ctx.reply('No active project. Use /start to begin a new one.');
      return;
    }

    const log = await this.projectService.getProgressLog(session.projectDir);
    await ctx.reply(
      `📜 *Progress Log:*\n\n\`\`\`\n${this.formatService.truncate(log, 3800)}\n\`\`\``,
      { parse_mode: 'Markdown' },
    );
  }

  private async handleStop(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);
    this.logger.log(`/stop from user ${userId}, state: ${session.state}`);

    if (session.state !== State.RUNNING) {
      await ctx.reply('Ralph is not currently running.');
      return;
    }

    if (session.abortController) {
      session.abortController.abort();
      this.logger.log(`Abort requested for user ${userId}`);
      await ctx.reply('🛑 Stopping Ralph after current iteration completes...');
    }
  }

  private async handleStatus(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);
    this.logger.log(`/status from user ${userId}`);
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

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  }

  private async handleDebug(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const history = this.sessionService.getSessionHistory(userId);
    const session = this.sessionService.getSession(userId);
    this.logger.log(`/debug from user ${userId}, ${history.length} history entries`);

    const header = `🔧 *Session Debugger*\n\nCurrent state: \`${session.state}\`\n\n`;
    const historyText = this.formatService.formatSessionHistoryForDebug(history);
    const full = header + historyText;

    await ctx.reply(this.formatService.truncate(full, 3800), { parse_mode: 'Markdown' });
  }

  private async handleHelp(ctx: Context): Promise<void> {
    this.logger.log(`/help from user ${ctx.from?.id}`);
    await ctx.reply(
      '🤖 *Ralph Wiggum Bot — Commands*\n\n' +
        '/start — Start a new project\n' +
        '/new — Alias for /start\n' +
        '/feature — Add a new feature to an existing project\n' +
        '/progress — Check story completion status\n' +
        '/log — View raw progress log\n' +
        '/status — Current session state\n' +
        '/debug — View session state change history\n' +
        '/stop — Cancel a running Ralph loop\n' +
        '/help — Show this message',
      { parse_mode: 'Markdown' },
    );
  }
}
