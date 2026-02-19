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
import { StateMachineHandler } from './state-machine.handler';

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
        StateMachineHandler,
    ],
})
export class AppModule { }
