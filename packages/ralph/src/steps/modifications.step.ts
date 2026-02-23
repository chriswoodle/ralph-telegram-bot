import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import { PrdService } from '../services/prd.service';
import { FormatService } from '../services/format.service';
import { State } from '../types/session.types';
import type { StepHandler, WorkflowContext } from '../types/workflow.types';

@Injectable()
export class ModificationsStep implements StepHandler {
    private readonly logger = new Logger(ModificationsStep.name);
    readonly state = State.AWAITING_MODIFICATIONS;

    constructor(
        private readonly sessionService: SessionService,
        private readonly projectService: ProjectService,
        private readonly prdService: PrdService,
        private readonly formatService: FormatService,
    ) {}

    async handleText(ctx: WorkflowContext, text: string): Promise<void> {
        return this.applyModifications(ctx, text);
    }

    async applyModifications(ctx: WorkflowContext, modification: string): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);

        await ctx.reply('✏️ Applying modifications...');

        try {
            const result = await this.prdService.modifyPrd(session.prdConversation!, modification);

            await this.projectService.writePrdMarkdown(
                session.projectDir!,
                session.projectName!,
                result.prd,
            );

            this.sessionService.updateSession(ctx.userId, {
                state: State.REVIEWING_PRD,
                prdMarkdown: result.prd,
                prdConversation: result.conversation,
            });

            const displayText = this.formatService.truncate(result.prd, 3800);
            await ctx.replyFormatted(`📋 *Updated PRD:*\n\n${displayText}`);
            await ctx.replyFormatted(
                'Reply *"approve"* to accept, send more modifications, or *"redo"* to start over.',
            );
        } catch (err) {
            this.sessionService.updateSession(ctx.userId, { state: State.REVIEWING_PRD });
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error applying modifications for user ${ctx.userId}:`, err);
            await ctx.reply(`❌ Error applying modifications: ${message}\n\nPlease try again.`);
        }
    }
}
