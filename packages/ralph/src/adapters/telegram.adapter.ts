import { Injectable, Logger } from '@nestjs/common';
import { Bot, type Context } from 'grammy';
import { WorkflowRouter } from '../workflow.router';
import { CommandHandler } from '../command.handler';
import type { WorkflowContext, IncomingDocument } from '../types/workflow.types';

@Injectable()
export class TelegramAdapter {
    private readonly logger = new Logger(TelegramAdapter.name);

    constructor(
        private readonly workflowRouter: WorkflowRouter,
        private readonly commandHandler: CommandHandler,
    ) {}

    register(bot: Bot<Context>): void {
        // Commands
        bot.command('start', (ctx) => this.commandHandler.handleStart(this.createContext(ctx)));
        bot.command('new', (ctx) => this.commandHandler.handleNew(this.createContext(ctx)));
        bot.command('feature', (ctx) => this.commandHandler.handleFeature(this.createContext(ctx)));
        bot.command('progress', (ctx) => this.commandHandler.handleProgress(this.createContext(ctx)));
        bot.command('log', (ctx) => this.commandHandler.handleLog(this.createContext(ctx)));
        bot.command('stop', (ctx) => this.commandHandler.handleStop(this.createContext(ctx)));
        bot.command('status', (ctx) => this.commandHandler.handleStatus(this.createContext(ctx)));
        bot.command('debug', (ctx) => this.commandHandler.handleDebug(this.createContext(ctx)));
        bot.command('help', (ctx) => this.commandHandler.handleHelp(this.createContext(ctx)));

        // "run" must be registered before generic text handler
        bot.hears(/^run$/i, (ctx) => this.workflowRouter.handleRun(this.createContext(ctx)));

        // Document uploads
        bot.on('message:document', (ctx) => this.handleDocument(ctx));

        // Generic text
        bot.on('message:text', (ctx) =>
            this.workflowRouter.handleText(this.createContext(ctx), ctx.message!.text!.trim()),
        );
    }

    escapeMarkdownV2(text: string): string {
        return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    }

    private createContext(grammyCtx: Context): WorkflowContext {
        const userId = grammyCtx.from?.id;
        if (!userId) throw new Error('No user ID in context');

        return {
            userId,
            reply: async (text: string) => {
                await grammyCtx.reply(text);
            },
            replyFormatted: async (text: string) => {
                await grammyCtx.reply(text, { parse_mode: 'Markdown' });
            },
            replySilent: async (text: string) => {
                await grammyCtx.reply(text, { disable_notification: true });
            },
        };
    }

    private async handleDocument(grammyCtx: Context): Promise<void> {
        const ctx = this.createContext(grammyCtx);
        const doc = grammyCtx.message?.document;

        if (!doc) {
            await ctx.reply('No document found in the message.');
            return;
        }

        const document: IncomingDocument = {
            fileName: doc.file_name ?? '',
            fileSize: doc.file_size ?? 0,
            fetchContent: async () => {
                const file = await grammyCtx.getFile();
                const fileUrl = `https://api.telegram.org/file/bot${grammyCtx.api.token}/${file.file_path}`;
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    throw new Error('Failed to download file from Telegram');
                }
                return response.text();
            },
        };

        await this.workflowRouter.handleDocument(ctx, document);
    }
}
