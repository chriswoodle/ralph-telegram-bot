import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config';
import { StatusController } from './controllers/status.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { SessionService } from './services/session.service';
import { OpenRouterService } from './services/openrouter.service';
import { ResourceLoaderService } from './services/resource-loader.service';
import { PrdService } from './services/prd.service';
import { ClaudeService } from './services/claude.service';
import { ProjectService } from './services/project.service';
import { RalphLoopService } from './services/ralph-loop.service';
import { TelegramService } from './services/telegram.service';
import { TelegramAuthGuard } from './telegram.guard';
import { FormatService } from './services/format.service';
import { CommandHandler } from './command.handler';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { WorkflowRouter } from './workflow.router';
import { ProjectNameStep } from './steps/project-name.step';
import { ProjectSelectionStep } from './steps/project-selection.step';
import { PrdSummaryStep } from './steps/prd-summary.step';
import { ClarificationsStep } from './steps/clarifications.step';
import { PrdReviewStep } from './steps/prd-review.step';
import { ModificationsStep } from './steps/modifications.step';
import { RunStep } from './steps/run.step';
import { ImportUrlStep } from './steps/import-url.step';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [configuration],
            envFilePath: '../../.env',
        }),
    ],
    controllers: [StatusController, DashboardController],
    providers: [
        SessionService,
        OpenRouterService,
        ResourceLoaderService,
        PrdService,
        ClaudeService,
        ProjectService,
        RalphLoopService,
        TelegramService,
        TelegramAuthGuard,
        FormatService,
        CommandHandler,
        TelegramAdapter,
        WorkflowRouter,
        ProjectNameStep,
        ProjectSelectionStep,
        PrdSummaryStep,
        ClarificationsStep,
        PrdReviewStep,
        ModificationsStep,
        RunStep,
        ImportUrlStep,
    ],
})
export class AppModule { }
