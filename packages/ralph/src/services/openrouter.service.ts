import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config';
import type { Conversation } from '../types/openrouter.types';

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);

  constructor(private readonly configService: ConfigService<AppConfig>) {}

  createConversation(systemPrompt: string): Conversation {
    return {
      messages: [{ role: 'system', content: systemPrompt }],
    };
  }

  async chat(
    conversation: Conversation,
    userMessage: string,
    signal?: AbortSignal,
  ): Promise<string> {
    conversation.messages.push({ role: 'user', content: userMessage });

    const model = this.configService.get('OPENROUTER_MODEL', 'minimax/minimax-m2.5');
    this.logger.log(
      `Calling ${model}, ${conversation.messages.length} messages, last user msg length: ${userMessage.length}`,
    );

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.configService.getOrThrow('OPENROUTER_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: conversation.messages,
      }),
      signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `OpenRouter API error ${res.status}: ${res.statusText} — ${body}`,
      );
    }

    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned empty response');
    }

    this.logger.log(`Response length: ${content.length}`);
    conversation.messages.push({ role: 'assistant', content });

    return content;
  }
}
