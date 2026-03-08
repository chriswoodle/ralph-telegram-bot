import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './services/database.service';
import { GitService } from './services/git.service';
import { OpenRouterService } from './services/openrouter.service';
import { ClaudeCliService } from './services/claude-cli.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService, DatabaseService, GitService, OpenRouterService, ClaudeCliService],
  exports: [DatabaseService, GitService, OpenRouterService, ClaudeCliService],
})
export class AppModule {}
