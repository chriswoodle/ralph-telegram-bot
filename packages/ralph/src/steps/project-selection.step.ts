import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import { State } from '../types/session.types';
import type { StepHandler, WorkflowContext } from '../types/workflow.types';

@Injectable()
export class ProjectSelectionStep implements StepHandler {
    private readonly logger = new Logger(ProjectSelectionStep.name);
    readonly state = State.AWAITING_PROJECT_SELECTION;

    constructor(
        private readonly sessionService: SessionService,
        private readonly projectService: ProjectService,
    ) {}

    async handleText(ctx: WorkflowContext, text: string): Promise<void> {
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
            this.logger.log(`User ${ctx.userId} selected project: ${selected.name}`);
            const context = await this.projectService.gatherProjectContext(selected.projectDir);

            this.sessionService.updateSession(ctx.userId, {
                state: State.AWAITING_PRD_SUMMARY,
                projectName: selected.name,
                projectDir: selected.projectDir,
                projectContext: context,
            });

            await ctx.replyFormatted(
                `✅ Selected project *${selected.name}*\n\n` +
                "Describe the new feature you want to add. I'll ask clarifying questions " +
                "before generating a PRD that builds on what's already there.\n\n" +
                'Or upload a `.md` file with your PRD to skip straight to review.',
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error gathering context for ${selected.name}:`, err);
            await ctx.reply(`❌ Error loading project: ${message}`);
        }
    }
}
