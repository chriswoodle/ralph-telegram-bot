import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import { State } from '../types/session.types';
import type { StepHandler, WorkflowContext } from '../types/workflow.types';

@Injectable()
export class ProjectNameStep implements StepHandler {
    private readonly logger = new Logger(ProjectNameStep.name);
    readonly state = State.AWAITING_PROJECT_NAME;

    constructor(
        private readonly sessionService: SessionService,
        private readonly projectService: ProjectService,
    ) {}

    async handleText(ctx: WorkflowContext, text: string): Promise<void> {
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
            this.logger.log(`User ${ctx.userId} creating project: ${projectName}`);
            const projectDir = await this.projectService.initProject(
                this.projectService.projectsDir,
                projectName,
            );
            this.sessionService.updateSession(ctx.userId, {
                state: State.AWAITING_PRD_SUMMARY,
                projectName,
                projectDir,
            });

            await ctx.replyFormatted(
                `✅ Project *${projectName}* initialized!\n` +
                `📁 Directory: \`${projectDir}\`\n\n` +
                'Now describe what you want to build. Give me a summary of the feature/product — ' +
                "as detailed as you like. I'll ask clarifying questions before generating the PRD.\n\n" +
                'Or upload a `.md` file with your PRD to skip straight to review.',
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to init project ${projectName} for user ${ctx.userId}:`, err);
            await ctx.reply(`❌ Failed to initialize project: ${message}`);
        }
    }
}
