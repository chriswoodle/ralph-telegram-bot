import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService, DatabaseService, GitService, OpenRouterService, ClaudeCliService, TelegramService, WorkflowStateMachineService, ProjectService, PrdAuthoringService, TaskBuildingService, ExecutionService],
  exports: [DatabaseService, GitService, OpenRouterService, ClaudeCliService, TelegramService, WorkflowStateMachineService, ProjectService, PrdAuthoringService, TaskBuildingService, ExecutionService],
})
export class AppModule {}
