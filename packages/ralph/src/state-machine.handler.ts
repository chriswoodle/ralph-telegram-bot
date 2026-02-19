import { Injectable, Logger } from '@nestjs/common';
import { Bot, type Context } from 'grammy';
import { SessionService } from './services/session.service';
import { ProjectService } from './services/project.service';
import { PrdService } from './services/prd.service';
import { RalphLoopService } from './services/ralph-loop.service';
import { FormatService } from './services/format.service';
import { State } from './types/session.types';

@Injectable()
export class StateMachineHandler {
  private readonly logger = new Logger(StateMachineHandler.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly projectService: ProjectService,
    private readonly prdService: PrdService,
    private readonly ralphLoopService: RalphLoopService,
    private readonly formatService: FormatService,
  ) {}

  register(bot: Bot<Context>): void {
    // "run" handler must be registered before the generic text handler
    bot.hears(/^run$/i, (ctx) => this.handleRun(ctx));

    bot.on('message:text', (ctx) => this.handleText(ctx));
  }

  private async handleText(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);
    const text = ctx.message!.text!.trim();

    switch (session.state) {
      case State.AWAITING_PROJECT_NAME:
        return this.handleProjectName(ctx, text);

      case State.AWAITING_PROJECT_SELECTION:
        return this.handleProjectSelection(ctx, text);

      case State.AWAITING_PRD_SUMMARY:
        return this.handlePrdSummary(ctx, text);

      case State.AWAITING_CLARIFICATIONS:
        return this.handleClarifications(ctx, text);

      case State.REVIEWING_PRD:
        return this.handlePrdReview(ctx, text);

      case State.AWAITING_MODIFICATIONS:
        return this.handleModifications(ctx, text);

      case State.RUNNING:
        await ctx.reply(
          '🔄 Ralph is currently running. Use /progress to check status or /stop to cancel.',
        );
        return;

      default:
        await ctx.reply(
          "I'm not sure what to do with that. Use /start to begin a new project, /feature to add to an existing one, or /help for commands.",
        );
        return;
    }
  }

  private async handleProjectName(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    const projectName = text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    if (!projectName || projectName.length < 2) {
      await ctx.reply(
        '❌ Invalid project name. Use at least 2 characters with only letters, numbers, and hyphens.',
      );
      return;
    }

    try {
      this.logger.log(`User ${userId} creating project: ${projectName}`);
      const projectDir = await this.projectService.initProject(
        this.projectService.projectsDir,
        projectName,
      );
      this.sessionService.updateSession(userId, {
        state: State.AWAITING_PRD_SUMMARY,
        projectName,
        projectDir,
      });

      await ctx.reply(
        `✅ Project *${projectName}* initialized!\n` +
          `📁 Directory: \`${projectDir}\`\n\n` +
          'Now describe what you want to build. Give me a summary of the feature/product — ' +
          "as detailed as you like. I'll ask clarifying questions before generating the PRD.",
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to init project ${projectName} for user ${userId}:`, err);
      await ctx.reply(`❌ Failed to initialize project: ${message}`);
    }
  }

  private async handleProjectSelection(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    const projects = await this.projectService.listProjects(this.projectService.projectsDir);
    if (projects.length === 0) {
      await ctx.reply('No projects found. Use /start to create one.');
      return;
    }

    let selected = projects.find((_, i) => text.trim() === String(i + 1));
    if (!selected) {
      const lower = text.trim().toLowerCase();
      selected = projects.find((p) => p.name.toLowerCase() === lower);
    }

    if (!selected) {
      await ctx.reply(
        '❌ Could not match a project. Reply with a number or exact project name.',
      );
      return;
    }

    try {
      this.logger.log(`User ${userId} selected project: ${selected.name}`);
      const context = await this.projectService.gatherProjectContext(selected.projectDir);

      this.sessionService.updateSession(userId, {
        state: State.AWAITING_PRD_SUMMARY,
        projectName: selected.name,
        projectDir: selected.projectDir,
        projectContext: context,
      });

      await ctx.reply(
        `✅ Selected project *${selected.name}*\n\n` +
          "Describe the new feature you want to add. I'll ask clarifying questions " +
          "before generating a PRD that builds on what's already there.",
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error gathering context for ${selected.name}:`, err);
      await ctx.reply(`❌ Error loading project: ${message}`);
    }
  }

  private async handlePrdSummary(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);

    await ctx.reply('🤔 Analyzing your summary and generating clarifying questions...');

    try {
      this.logger.log(
        `User ${userId} generating clarifying questions for project ${session.projectName}`,
      );
      const result = await this.prdService.generateClarifyingQuestions(
        text,
        undefined,
        session.projectContext ?? undefined,
      );

      this.sessionService.updateSession(userId, {
        state: State.AWAITING_CLARIFICATIONS,
        prdSummary: text,
        clarifyingQuestions: result.questions,
        prdConversation: result.conversation,
      });

      await ctx.reply(
        `📝 *Clarifying Questions*\n\n${result.questions}\n\n` +
          '_Reply with your answers (e.g., "1A, 2C, 3B" or describe in full sentences)._',
        { parse_mode: 'MarkdownV2' },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error generating questions for user ${userId}:`, err);
      await ctx.reply(`❌ Error generating questions: ${message}\n\nPlease try again.`);
    }
  }

  private async handleClarifications(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);

    await ctx.reply('📄 Generating your PRD... This may take a minute.');

    try {
      this.logger.log(`User ${userId} generating PRD for project ${session.projectName}`);
      const result = await this.prdService.generatePrd(
        session.prdConversation!,
        text,
        session.projectName!,
      );

      await this.projectService.writePrdMarkdown(
        session.projectDir!,
        session.projectName!,
        result.prd,
      );

      this.sessionService.updateSession(userId, {
        state: State.REVIEWING_PRD,
        clarifyingAnswers: text,
        prdMarkdown: result.prd,
        prdConversation: result.conversation,
      });

      const displayText = this.formatService.truncate(result.prd, 3800);
      await ctx.reply(`📋 *Generated PRD:*\n\n${displayText}`, { parse_mode: 'Markdown' });
      await ctx.reply(
        '👆 Review the PRD above. Reply with one of:\n\n' +
          '✅ *"approve"* — Accept and convert to Ralph format\n' +
          '✏️ *"modify: [your changes]"* — Request specific modifications\n' +
          '🔄 *"redo"* — Start over with a new summary',
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error generating PRD for user ${userId}:`, err);
      await ctx.reply(
        `❌ Error generating PRD: ${message}\n\nPlease try sending your answers again.`,
      );
    }
  }

  private async handlePrdReview(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);
    const lower = text.toLowerCase().trim();

    if (lower === 'approve' || lower === 'yes' || lower === 'ok' || lower === 'lgtm') {
      this.logger.log(`User ${userId} approved PRD for project ${session.projectName}`);
      return this.convertAndRun(ctx);
    }

    if (lower.startsWith('modify:') || lower.startsWith('change:') || lower.startsWith('edit:')) {
      const modification = text.slice(text.indexOf(':') + 1).trim();
      this.sessionService.updateSession(userId, { state: State.AWAITING_MODIFICATIONS });
      return this.applyModifications(ctx, modification);
    }

    if (lower === 'redo') {
      this.logger.log(`User ${userId} requested redo for project ${session.projectName}`);
      this.sessionService.updateSession(userId, {
        state: State.AWAITING_PRD_SUMMARY,
        prdSummary: null,
        clarifyingQuestions: null,
        prdMarkdown: null,
        prdConversation: null,
      });
      await ctx.reply("🔄 OK, let's start over. Describe what you want to build.");
      return;
    }

    this.sessionService.updateSession(userId, { state: State.AWAITING_MODIFICATIONS });
    return this.applyModifications(ctx, text);
  }

  private async handleModifications(ctx: Context, text: string): Promise<void> {
    return this.applyModifications(ctx, text);
  }

  private async applyModifications(ctx: Context, modification: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);

    await ctx.reply('✏️ Applying modifications...');

    try {
      const result = await this.prdService.modifyPrd(session.prdConversation!, modification);

      await this.projectService.writePrdMarkdown(
        session.projectDir!,
        session.projectName!,
        result.prd,
      );

      this.sessionService.updateSession(userId, {
        state: State.REVIEWING_PRD,
        prdMarkdown: result.prd,
        prdConversation: result.conversation,
      });

      const displayText = this.formatService.truncate(result.prd, 3800);
      await ctx.reply(`📋 *Updated PRD:*\n\n${displayText}`, { parse_mode: 'Markdown' });
      await ctx.reply(
        'Reply *"approve"* to accept, send more modifications, or *"redo"* to start over.',
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      this.sessionService.updateSession(userId, { state: State.REVIEWING_PRD });
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error applying modifications for user ${userId}:`, err);
      await ctx.reply(`❌ Error applying modifications: ${message}\n\nPlease try again.`);
    }
  }

  private async convertAndRun(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);

    await ctx.reply('🔄 Converting PRD to Ralph format...');

    try {
      this.logger.log(
        `User ${userId} converting PRD to JSON for project ${session.projectName}`,
      );
      const prdJson = await this.prdService.convertPrdToJson(
        session.prdMarkdown!,
        session.projectName!,
      );

      await this.projectService.writePrdJson(session.projectDir!, prdJson);

      this.sessionService.updateSession(userId, { prdJson });

      await ctx.reply(this.formatService.formatPrdForTelegram(prdJson), {
        parse_mode: 'Markdown',
      });
      await ctx.reply(
        `✅ PRD converted! ${prdJson.userStories.length} stories ready.\n\n` +
          '🚀 Reply *"run"* to start Ralph.',
        { parse_mode: 'Markdown' },
      );

      this.sessionService.updateSession(userId, { state: State.REVIEWING_PRD });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error converting PRD for user ${userId}:`, err);
      await ctx.reply(
        `❌ Error converting to Ralph format: ${message}\n\nPlease try approving again.`,
      );
    }
  }

  private async handleRun(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = this.sessionService.getSession(userId);
    this.logger.log(`User ${userId} triggered run for project ${session.projectName}`);

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
    this.sessionService.updateSession(userId, {
      state: State.RUNNING,
      currentIteration: 0,
      abortController,
      startedAt,
      estimatedEndAt: null,
    });

    this.logger.log(
      `Ralph loop starting for user ${userId}, project ${session.projectDir}, ${stories.length} stories`,
    );

    await ctx.reply(
      `🚀 *Ralph is starting!*\n` +
        `Stories: ${stories.length}\n\n` +
        'Use /progress to check status, /stop to cancel.',
      { parse_mode: 'Markdown' },
    );

    this.ralphLoopService
      .runRalphLoop({
        projectDir: session.projectDir,
        stories,
        signal: abortController.signal,
        onProgress: async (status) => {
          this.sessionService.updateSession(userId, {
            currentIteration: status.iteration,
            currentStory: status.currentStory
              ? `${status.currentStory.id}: ${status.currentStory.title}`
              : null,
            estimatedEndAt: status.estimatedEndAt,
          });

          try {
            await ctx.reply(status.message, {
                disable_notification: true 
            });
          } catch (err) {
            this.logger.warn('Failed to send progress to user:', err);
          }
        },
      })
      .then(async (result) => {
        this.sessionService.updateSession(userId, {
          state: State.IDLE,
          completed: result.completed,
          abortController: null,
          estimatedEndAt: null,
        });

        const finalProgress = await this.projectService.getProgress(session.projectDir!);
        const summary = this.formatService.formatProgressForTelegram(finalProgress);

        if (result.completed) {
          this.logger.log(
            `Ralph completed for user ${userId}, project ${session.projectDir}`,
          );
          await ctx.reply(`🎉 *Ralph finished successfully\!*\n\n${summary}`, {
            parse_mode: 'MarkdownV2',
          });
        } else {
          this.logger.log(
            `Ralph stopped after ${result.iterations} stories for user ${userId}`,
          );
          await ctx.reply(
            `⚠️ *Ralph stopped after ${result.iterations} stories.*\n\n${summary}`,
            { parse_mode: 'Markdown' },
          );
        }
      })
      .catch(async (err) => {
        this.sessionService.updateSession(userId, {
          state: State.IDLE,
          abortController: null,
          estimatedEndAt: null,
        });
        const message = err instanceof Error ? err.message : String(err);

        this.logger.error(`Ralph fatal error for user ${userId}:`, err);
        await ctx.reply(`❌ Ralph encountered a fatal error: ${message}`);
      });
  }
}
