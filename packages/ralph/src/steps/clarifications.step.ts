import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import { PrdService } from '../services/prd.service';
import { FormatService } from '../services/format.service';
import { State } from '../types/session.types';
import type { AppConfig } from '../config';
import type { StepHandler, WorkflowContext } from '../types/workflow.types';

@Injectable()
export class ClarificationsStep implements StepHandler {
    private readonly logger = new Logger(ClarificationsStep.name);
    private readonly botName: string;
    readonly state = State.AWAITING_CLARIFICATIONS;

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

        await ctx.reply('📄 Generating your PRD... This may take a minute.');

        try {
            this.logger.log(`User ${ctx.userId} generating PRD for project ${session.projectName}`);
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

            this.sessionService.updateSession(ctx.userId, {
                state: State.REVIEWING_PRD,
                clarifyingAnswers: text,
                prdMarkdown: result.prd,
                prdConversation: result.conversation,
            });

            const displayText = this.formatService.truncate(result.prd, 3800);
            await ctx.replyFormatted(`📋 *Generated PRD:*\n\n${displayText}`);
            await ctx.replyFormatted(
                '👆 Review the PRD above. Reply with one of:\n\n' +
                `✅ *"approve"* — Accept and convert to ${this.botName} format\n` +
                '✏️ *"modify: [your changes]"* — Request specific modifications\n' +
                '🔄 *"redo"* — Start over with a new summary',
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error generating PRD for user ${ctx.userId}:`, err);
            await ctx.reply(
                `❌ Error generating PRD: ${message}\n\nPlease try sending your answers again.`,
            );
        }
    }
}
