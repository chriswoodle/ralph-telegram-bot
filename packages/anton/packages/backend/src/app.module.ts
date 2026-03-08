import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './services/database.service';
import { GitService } from './services/git.service';
import { OpenRouterService } from './services/openrouter.service';
import { ClaudeCliService } from './services/claude-cli.service';
import { TelegramService } from './services/telegram.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService, DatabaseService, GitService, OpenRouterService, ClaudeCliService, TelegramService],
  exports: [DatabaseService, GitService, OpenRouterService, ClaudeCliService, TelegramService],
})
export class AppModule {}
