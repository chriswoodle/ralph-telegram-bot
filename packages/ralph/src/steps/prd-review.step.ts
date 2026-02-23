import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import { PrdService } from '../services/prd.service';
import { FormatService } from '../services/format.service';
import { ModificationsStep } from './modifications.step';
import { State } from '../types/session.types';
import type { StepHandler, WorkflowContext } from '../types/workflow.types';

@Injectable()
export class PrdReviewStep implements StepHandler {
    private readonly logger = new Logger(PrdReviewStep.name);
    readonly state = State.REVIEWING_PRD;

    constructor(
        private readonly sessionService: SessionService,
        private readonly projectService: ProjectService,
        private readonly prdService: PrdService,
        private readonly formatService: FormatService,
        private readonly modificationsStep: ModificationsStep,
    ) {}

    async handleText(ctx: WorkflowContext, text: string): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        const lower = text.toLowerCase().trim();

        if (lower === 'approve' || lower === 'yes' || lower === 'ok' || lower === 'lgtm') {
            this.logger.log(`User ${ctx.userId} approved PRD for project ${session.projectName}`);
            return this.convertAndRun(ctx);
        }

        if (lower.startsWith('modify:') || lower.startsWith('change:') || lower.startsWith('edit:')) {
            const modification = text.slice(text.indexOf(':') + 1).trim();
            this.sessionService.updateSession(ctx.userId, { state: State.AWAITING_MODIFICATIONS });
            return this.modificationsStep.applyModifications(ctx, modification);
        }

        if (lower === 'redo') {
            this.logger.log(`User ${ctx.userId} requested redo for project ${session.projectName}`);
            this.sessionService.updateSession(ctx.userId, {
                state: State.AWAITING_PRD_SUMMARY,
                prdSummary: null,
                clarifyingQuestions: null,
                prdMarkdown: null,
                prdConversation: null,
            });
            await ctx.reply("🔄 OK, let's start over. Describe what you want to build.");
            return;
        }

        this.sessionService.updateSession(ctx.userId, { state: State.AWAITING_MODIFICATIONS });
        return this.modificationsStep.applyModifications(ctx, text);
    }

    private async convertAndRun(ctx: WorkflowContext): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);

        await ctx.reply('🔄 Converting PRD to Ralph format...');

        try {
            this.logger.log(
                `User ${ctx.userId} converting PRD to JSON for project ${session.projectName}`,
            );
            const prdJson = await this.prdService.convertPrdToJson(
                session.prdMarkdown!,
                session.projectName!,
            );

            await this.projectService.writePrdJson(session.projectDir!, prdJson);

            this.sessionService.updateSession(ctx.userId, { prdJson });

            await ctx.replyFormatted(this.formatService.formatPrd(prdJson));
            await ctx.replyFormatted(
                `✅ PRD converted! ${prdJson.userStories.length} stories ready.\n\n` +
                '🚀 Reply *"run"* to start Ralph.',
            );

            this.sessionService.updateSession(ctx.userId, { state: State.REVIEWING_PRD });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error converting PRD for user ${ctx.userId}:`, err);
            await ctx.reply(
                `❌ Error converting to Ralph format: ${message}\n\nPlease try approving again.`,
            );
        }
    }
}
