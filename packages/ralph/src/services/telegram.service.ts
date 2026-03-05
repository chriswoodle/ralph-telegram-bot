import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, type Context } from 'grammy';
import type { AppConfig } from '../config';
import { TelegramAuthGuard } from '../telegram.guard';
import { TelegramAdapter } from '../adapters/telegram.adapter';
import { SessionService } from './session.service';
import { RunStep } from '../steps/run.step';
import type { WorkflowContext } from '../types/workflow.types';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TelegramService.name);
    private bot: Bot<Context>;

    constructor(
        private readonly configService: ConfigService<AppConfig>,
        private readonly authGuard: TelegramAuthGuard,
        private readonly telegramAdapter: TelegramAdapter,
        private readonly sessionService: SessionService,
        private readonly runStep: RunStep,
    ) {
        if (this.configService.get('GENERATE_SPEC')) {
            this.bot = {
                use: () => {
                    return;
                },
                start: () => {
                    return;
                },
                stop: () => {
                    return;
                },
            } as any;
            return;
        }
        this.bot = new Bot(this.configService.getOrThrow('TELEGRAM_BOT_TOKEN'));
    }

    async onModuleInit(): Promise<void> {
        // Authorization middleware
        this.bot.use((ctx, next) => {
            if (!this.authGuard.isAuthorized(ctx.from?.id)) {
                this.logger.log(`Unauthorized user ${ctx.from?.id} blocked`);
                return ctx.reply('⛔ You are not authorized to use this bot.');
            }
            return next();
        });

        // Register all handlers via the adapter
        this.telegramAdapter.register(this.bot);

        this.logger.log(`Starting ${this.configService.get('BOT_NAME', 'Ralph')} Bot...`);

        this.bot
            .start({
                onStart: () => {
                    this.logger.log('Bot launched');
                    this.notifyStartup();
                },
            })
            .catch((err) => {
                this.logger.error('Failed to start:', err);
                process.exit(1);
            });
    }

    async onModuleDestroy(): Promise<void> {
        this.logger.log('Shutting down...');
        this.bot.stop();
    }

    private async notifyStartup(): Promise<void> {
        const allowed = this.configService.get('ALLOWED_USERS', '');
        if (!allowed) return;

        const userIds = allowed.split(',').map((s: string) => s.trim()).filter(Boolean);
        for (const userId of userIds) {
            try {
                const botName = this.configService.get('BOT_NAME', 'Ralph');
                await this.bot.api.sendMessage(userId, `🤖 ${botName} is back online and ready to go! Use /help to see available commands.`, { disable_notification: true });
                this.logger.log(`Sent startup message to user ${userId}`);
            } catch (err) {
                this.logger.warn(`Failed to send startup message to user ${userId}: ${err}`);
            }
        }

        await this.resumeRunningSessions();
    }

    private async resumeRunningSessions(): Promise<void> {
        const resumable = this.sessionService.getSessionsToResume();
        if (resumable.size === 0) return;

        this.logger.log(`Found ${resumable.size} session(s) to resume`);

        for (const [userId] of resumable) {
            const ctx = this.createSyntheticContext(userId);
            this.runStep.resumeRun(ctx).catch((err) => {
                this.logger.error(`Failed to resume session for user ${userId}:`, err);
            });
        }
    }

    private createSyntheticContext(userId: number): WorkflowContext {
        return {
            userId,
            reply: async (text: string) => {
                await this.bot.api.sendMessage(userId, text);
            },
            replyFormatted: async (text: string) => {
                await this.bot.api.sendMessage(userId, text, { parse_mode: 'Markdown' });
            },
            replySilent: async (text: string) => {
                await this.bot.api.sendMessage(userId, text, { disable_notification: true });
            },
        };
    }
}
