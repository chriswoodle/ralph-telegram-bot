import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from './services/session.service';
import { ProjectNameStep } from './steps/project-name.step';
import { ProjectSelectionStep } from './steps/project-selection.step';
import { PrdSummaryStep } from './steps/prd-summary.step';
import { ClarificationsStep } from './steps/clarifications.step';
import { PrdReviewStep } from './steps/prd-review.step';
import { ModificationsStep } from './steps/modifications.step';
import { RunStep } from './steps/run.step';
import { ImportUrlStep } from './steps/import-url.step';
import { State } from './types/session.types';
import type { StateValue } from './types/session.types';
import type { StepHandler, WorkflowContext, IncomingDocument } from './types/workflow.types';

@Injectable()
export class WorkflowRouter {
    private readonly logger = new Logger(WorkflowRouter.name);
    private readonly steps: Map<StateValue, StepHandler>;

    constructor(
        private readonly sessionService: SessionService,
        projectNameStep: ProjectNameStep,
        projectSelectionStep: ProjectSelectionStep,
        prdSummaryStep: PrdSummaryStep,
        clarificationsStep: ClarificationsStep,
        prdReviewStep: PrdReviewStep,
        modificationsStep: ModificationsStep,
        private readonly runStep: RunStep,
        importUrlStep: ImportUrlStep,
    ) {
        this.steps = new Map<StateValue, StepHandler>([
            [State.AWAITING_PROJECT_NAME, projectNameStep],
            [State.AWAITING_PROJECT_SELECTION, projectSelectionStep],
            [State.AWAITING_PRD_SUMMARY, prdSummaryStep],
            [State.AWAITING_CLARIFICATIONS, clarificationsStep],
            [State.REVIEWING_PRD, prdReviewStep],
            [State.AWAITING_MODIFICATIONS, modificationsStep],
            [State.RUNNING, runStep],
            [State.AWAITING_IMPORT_URL, importUrlStep],
        ]);
    }

    async handleText(ctx: WorkflowContext, text: string): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        const step = this.steps.get(session.state);
        if (step) {
            return step.handleText(ctx, text);
        }
        await ctx.reply(
            "I'm not sure what to do with that. Use /start to begin a new project, /feature to add to an existing one, or /help for commands.",
        );
    }

    async handleDocument(ctx: WorkflowContext, document: IncomingDocument): Promise<void> {
        const session = this.sessionService.getSession(ctx.userId);
        const step = this.steps.get(session.state);
        if (step?.handleDocument) {
            return step.handleDocument(ctx, document);
        }
        await ctx.reply(
            'I can only accept `.md` file uploads when waiting for a PRD summary.\n' +
            'Use /start to begin a new project or /help for available commands.',
        );
    }

    async handleRun(ctx: WorkflowContext): Promise<void> {
        return this.runStep.executeRun(ctx);
    }
}
