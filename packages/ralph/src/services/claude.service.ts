import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../config';

interface RunClaudeOpts {
  prompt: string;
  cwd: string;
  signal?: AbortSignal;
}

export class UsageLimitError extends Error {
  readonly name = 'UsageLimitError';
  readonly resetTime?: string;
  constructor(message: string, resetTime?: string) {
    super(message);
    this.resetTime = resetTime;
  }
}

const USAGE_LIMIT_PATTERNS = [
  /you.?ve hit your (usage |claude |daily |weekly |monthly )?limit/i,
  /claude.*usage.*limit.*reached/i,
  /claude.*rate.*limit.*exceeded/i,
  /your (claude |api )?usage has been (capped|exceeded|exhausted)/i,
  /5-?hour.*limit.*reached/i,
  /weekly.*limit.*reached/i,
  /claude pro.*limit/i,
];

function isUsageLimitMessage(text: string): boolean {
  if (!text) return false;
  return USAGE_LIMIT_PATTERNS.some((p) => p.test(text));
}

function extractResetTime(text: string): string | undefined {
  const match = text.match(/resets?\s+(.+)/i);
  return match ? match[1].trim() : undefined;
}

@Injectable()
export class ClaudeService implements OnModuleInit {
  private readonly logger = new Logger(ClaudeService.name);
  private claudePath!: string;

  constructor(private readonly configService: ConfigService<AppConfig>) {}

  onModuleInit() {
    try {
      this.claudePath = execSync('which claude', { encoding: 'utf-8' }).trim();
      this.logger.log(`Found claude at: ${this.claudePath}`);
    } catch {
      throw new Error(
        'claude CLI not found in PATH. Ensure claude is installed and available.',
      );
    }
  }

  async runClaude(opts: RunClaudeOpts): Promise<string> {
    const { prompt, cwd, signal } = opts;

    this.logger.log(`Running in ${cwd}, prompt length: ${prompt.length}`);

    return new Promise((resolve, reject) => {
      const child = spawn(this.claudePath, ['--print', '--dangerously-skip-permissions'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', async (code) => {
        if (code === 0 || stdout.length > 0) {
          this.logger.log(`Exited code ${code}, output length: ${stdout.length}`);
          await this.logToFile(prompt, stdout).catch((err) =>
            this.logger.error('Log write failed:', err),
          );
          resolve(stdout);
        } else {
          this.logger.error(`Exited with error code ${code}:`, stderr);
          await this.logToFile(prompt, `[ERROR] exit ${code}\n${stderr}`).catch((err) =>
            this.logger.error('Log write failed:', err),
          );
          if (isUsageLimitMessage(stderr) || isUsageLimitMessage(stdout)) {
            const snippet = (stderr || stdout).slice(0, 200).trim();
            this.logger.warn(`Usage limit detected: ${snippet}`);
            reject(new UsageLimitError(`Claude usage limit reached: ${snippet}`, extractResetTime(snippet)));
            return;
          }
          reject(new Error(`Claude exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        this.logger.error('Spawn error:', err);
        reject(err);
      });

      child.stdin!.write(prompt);
      child.stdin!.end();
    });
  }

  private async logToFile(input: string, output: string): Promise<void> {
    if (!this.configService.get('CLAUDE_LOG_IO')) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = this.configService.get('CLAUDE_LOG_DIR', './logs/claude');
    await mkdir(dir, { recursive: true });
    const path = join(dir, `claude-${ts}.log`);
    const content = `=== INPUT ===\n${input}\n\n=== OUTPUT ===\n${output}\n`;
    await writeFile(path, content, 'utf-8');
    this.logger.log(`Logged I/O to ${path}`);
  }
}
