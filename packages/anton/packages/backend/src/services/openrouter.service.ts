import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from './database.service';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  messages: OpenRouterMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface OpenRouterResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);
  private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000;

  constructor(private readonly databaseService: DatabaseService) {}

  async sendRequest(request: OpenRouterRequest): Promise<OpenRouterResponse> {
    const settings = (await this.databaseService.read()).settings;
    const apiKey = settings.openRouterApiKey;
    const model = request.model ?? settings.openRouterModel;

    if (!apiKey) {
      throw new Error('OpenRouter API key is not configured');
    }

    const body = {
      model,
      messages: request.messages,
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.maxTokens !== undefined && { max_tokens: request.maxTokens }),
    };

    if (settings.claudeLogEnabled) {
      this.logToFile(settings.claudeLogDir, 'request', body);
    }

    const response = await this.sendWithRetry(apiKey, body);

    if (settings.claudeLogEnabled) {
      this.logToFile(settings.claudeLogDir, 'response', response);
    }

    return response;
  }

  replaceTemplateVariables(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      if (key in variables) {
        return variables[key];
      }
      return match;
    });
  }

  async sendPrompt(
    promptTemplate: string,
    variables: Record<string, string>,
    options?: { systemPrompt?: string; temperature?: number; maxTokens?: number; model?: string },
  ): Promise<string> {
    const userContent = this.replaceTemplateVariables(promptTemplate, variables);

    const messages: OpenRouterMessage[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: userContent });

    const response = await this.sendRequest({
      messages,
      model: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });

    return response.content;
  }

  private async sendWithRetry(
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<OpenRouterResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.makeRequest(apiKey, body);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          const delay = this.baseDelayMs * Math.pow(2, attempt);
          this.logger.warn(
            `OpenRouter request failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms: ${lastError.message}`,
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('OpenRouter request failed after retries');
  }

  private makeRequest(
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<OpenRouterResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl);
      const payload = JSON.stringify(body);

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(
                new Error(
                  `OpenRouter API error ${res.statusCode}: ${data}`,
                ),
              );
              return;
            }

            const parsed = JSON.parse(data) as {
              choices?: Array<{ message?: { content?: string } }>;
              model?: string;
              usage?: {
                prompt_tokens?: number;
                completion_tokens?: number;
                total_tokens?: number;
              };
            };

            const content = parsed.choices?.[0]?.message?.content;
            if (content === undefined || content === null) {
              reject(new Error('No content in OpenRouter response'));
              return;
            }

            resolve({
              content,
              model: parsed.model ?? String(body.model ?? 'unknown'),
              usage: {
                promptTokens: parsed.usage?.prompt_tokens ?? 0,
                completionTokens: parsed.usage?.completion_tokens ?? 0,
                totalTokens: parsed.usage?.total_tokens ?? 0,
              },
            });
          } catch (parseError) {
            reject(
              new Error(
                `Failed to parse OpenRouter response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
              ),
            );
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`OpenRouter request error: ${error.message}`));
      });

      req.write(payload);
      req.end();
    });
  }

  private logToFile(
    logDir: string,
    type: 'request' | 'response',
    data: unknown,
  ): void {
    try {
      const resolvedDir = path.resolve(logDir);
      fs.mkdirSync(resolvedDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${timestamp}-${type}.json`;
      fs.writeFileSync(
        path.join(resolvedDir, filename),
        JSON.stringify(data, null, 2),
        'utf-8',
      );
    } catch (error) {
      this.logger.warn(
        `Failed to log ${type}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
