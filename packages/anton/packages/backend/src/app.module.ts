import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './services/database.service';
import { GitService } from './services/git.service';
import { OpenRouterService } from './services/openrouter.service';
import { ClaudeCliService } from './services/claude-cli.service';
import { TelegramService } from './services/telegram.service';
import { WorkflowStateMachineService } from './services/workflow-state-machine.service';
import { ProjectService } from './services/project.service';
import { PrdAuthoringService } from './services/prd-authoring.service';
import { TaskBuildingService } from './services/task-building.service';
import { ExecutionService } from './services/execution.service';
import { ProjectController } from './controllers/project.controller';
import { PrdController } from './controllers/prd.controller';
import { TaskController } from './controllers/task.controller';
import { ExecutionController } from './controllers/execution.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
  ],
  controllers: [AppController, ProjectController, PrdController, TaskController, ExecutionController],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    AppService, DatabaseService, GitService, OpenRouterService, ClaudeCliService, TelegramService, WorkflowStateMachineService, ProjectService, PrdAuthoringService, TaskBuildingService, ExecutionService,
  ],
  exports: [DatabaseService, GitService, OpenRouterService, ClaudeCliService, TelegramService, WorkflowStateMachineService, ProjectService, PrdAuthoringService, TaskBuildingService, ExecutionService],
})
export class AppModule {}
