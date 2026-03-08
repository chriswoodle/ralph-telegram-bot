import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import { DatabaseService } from './database.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Send a raw message via Telegram Bot API.
   * No-ops gracefully if Telegram is not configured.
   */
  async sendMessage(text: string): Promise<void> {
    const db = await this.databaseService.read();
    const { telegramBotToken, telegramChatId } = db.settings;

    if (!telegramBotToken || !telegramChatId) {
      this.logger.debug('Telegram not configured, skipping notification');
      return;
    }

    try {
      await this.callTelegramApi(telegramBotToken, 'sendMessage', {
        chat_id: telegramChatId,
        text,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      this.logger.warn(`Failed to send Telegram message: ${err}`);
    }
  }

  /** Notify that PRD clarifying questions are ready for review */
  async notifyPrdQuestionsReady(
    projectName: string,
    questionCount: number,
  ): Promise<void> {
    await this.sendMessage(
      `📋 *PRD Questions Ready*\nProject: ${projectName}\n${questionCount} clarifying question(s) need your answers.`,
    );
  }

  /** Notify that task generation is complete */
  async notifyTaskGenerationDone(
    projectName: string,
    storyCount: number,
  ): Promise<void> {
    await this.sendMessage(
      `✅ *Tasks Generated*\nProject: ${projectName}\n${storyCount} user stories created and ready for review.`,
    );
  }

  /** Notify that execution is complete */
  async notifyExecutionComplete(
    projectName: string,
    executionId: string,
    worktreeCount: number,
  ): Promise<void> {
    await this.sendMessage(
      `🏁 *Execution Complete*\nProject: ${projectName}\nExecution: ${executionId}\n${worktreeCount} worktree(s) finished. Pick a winner!`,
    );
  }

  /** Notify about an error */
  async notifyError(
    projectName: string,
    error: string,
  ): Promise<void> {
    await this.sendMessage(
      `❌ *Error*\nProject: ${projectName}\n${error}`,
    );
  }

  /** Notify that merge is complete */
  async notifyMergeComplete(
    projectName: string,
    branchName: string,
  ): Promise<void> {
    await this.sendMessage(
      `🔀 *Merge Complete*\nProject: ${projectName}\nBranch \`${branchName}\` merged successfully.`,
    );
  }

  private callTelegramApi(
    token: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = https.request(
        {
          hostname: 'api.telegram.org',
          path: `/bot${token}/${method}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let responseBody = '';
          res.on('data', (chunk: Buffer) => {
            responseBody += chunk.toString();
          });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(responseBody);
            } else {
              reject(
                new Error(
                  `Telegram API error ${res.statusCode}: ${responseBody}`,
                ),
              );
            }
          });
        },
      );

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}
