import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import { PrdService } from '../services/prd.service';
import { FormatService } from '../services/format.service';
import { State } from '../types/session.types';
import type { AppConfig } from '../config';
import type { StepHandler, WorkflowContext, IncomingDocument } from '../types/workflow.types';

@Injectable()
export class PrdSummaryStep implements StepHandler {
    private readonly logger = new Logger(PrdSummaryStep.name);
    private readonly botName: string;
    readonly state = State.AWAITING_PRD_SUMMARY;

    constructor(
        private readonly sessionService: SessionService,
        private readonly projectService: ProjectService,
        private readonly prdService: PrdService,
        private readonly formatService: FormatService,
        configService: ConfigService<AppConfig>,
    ) {
        this.botName = configService.get('BOT_NAME', 'Ralph');
    }

    async handleText(ctx: WorkflowContext, text: string): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);

        await ctx.reply('🤔 Analyzing your summary and generating clarifying questions...');

        try {
            this.logger.log(
                `User ${ctx.userId} generating clarifying questions for project ${session.projectName}`,
            );
            const result = await this.prdService.generateClarifyingQuestions(
                text,
                undefined,
                session.projectContext ?? undefined,
            );

            this.sessionService.updateSession(ctx.userId, {
                state: State.AWAITING_CLARIFICATIONS,
                prdSummary: text,
                clarifyingQuestions: result.questions,
                prdConversation: result.conversation,
            });

            await ctx.replyFormatted(
                `📝 *Clarifying Questions*\n\n${result.questions}\n\n` +
                '_Reply with your answers (e.g., "1A, 2C, 3B" or describe in full sentences)._',
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error generating questions for user ${ctx.userId}:`, err);
            await ctx.reply(`❌ Error generating questions: ${message}\n\nPlease try again.`);
        }
    }

    async handleDocument(ctx: WorkflowContext, document: IncomingDocument): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);

        if (!document.fileName.toLowerCase().endsWith('.md')) {
            await ctx.reply('Only `.md` (Markdown) files are accepted. Please upload a `.md` file.');
            return;
        }

        const MAX_SIZE = 512 * 1024;
        if (document.fileSize > MAX_SIZE) {
            await ctx.reply('File is too large (max 512 KB). Please upload a smaller file.');
            return;
        }

        try {
            const content = await document.fetchContent();

            if (!content.trim()) {
                await ctx.reply('The uploaded file is empty. Please upload a file with content.');
                return;
            }

            await this.projectService.writePrdMarkdown(
                session.projectDir!,
                session.projectName!,
                content,
            );

            const prdConversation = await this.prdService.createConversationFromPrd(content);

            this.sessionService.updateSession(ctx.userId, {
                state: State.REVIEWING_PRD,
                prdMarkdown: content,
                prdConversation,
            });

            const displayText = this.formatService.truncateMarkdown(content, 3800);
            await ctx.replyFormatted(`📋 *Uploaded PRD:*\n\n${displayText}`);
            await ctx.replyFormatted(
                '👆 Review the PRD above. Reply with one of:\n\n' +
                `✅ *"approve"* — Accept and convert to ${this.botName} format\n` +
                '✏️ *"modify: [your changes]"* — Request specific modifications\n' +
                '🔄 *"redo"* — Start over with a new summary',
            );

            this.logger.log(`User ${ctx.userId} uploaded PRD file "${document.fileName}" for project ${session.projectName}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error processing uploaded file for user ${ctx.userId}:`, err);
            await ctx.reply(`Failed to process the uploaded file: ${message}`);
        }
    }
}
