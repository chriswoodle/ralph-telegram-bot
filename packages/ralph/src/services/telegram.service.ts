import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, type Context } from 'grammy';
import type { AppConfig } from '../config';
import { TelegramAuthGuard } from '../telegram.guard';
import { TelegramAdapter } from '../adapters/telegram.adapter';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TelegramService.name);
    private bot: Bot<Context>;

    constructor(
        private readonly configService: ConfigService<AppConfig>,
        private readonly authGuard: TelegramAuthGuard,
        private readonly telegramAdapter: TelegramAdapter,
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

        this.logger.log('Starting Ralph Bot...');

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
                await this.bot.api.sendMessage(userId, '🤖 Ralph is back online and ready to go! Use /help to see available commands.', { disable_notification: true });
                this.logger.log(`Sent startup message to user ${userId}`);
            } catch (err) {
                this.logger.warn(`Failed to send startup message to user ${userId}: ${err}`);
            }
        }
    }
}
