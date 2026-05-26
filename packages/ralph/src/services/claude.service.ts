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

export class TimeoutError extends Error {
  readonly name = 'TimeoutError';
  readonly logContent: string;
  readonly logPath: string;
  constructor(message: string, logContent: string, logPath: string) {
    super(message);
    this.logContent = logContent;
    this.logPath = logPath;
  }
}

export class AuthError extends Error {
  readonly name = 'AuthError';
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
    const timeoutMs = this.configService.get('CLAUDE_TIMEOUT_MS', 1800000);

    this.logger.log(`Running in ${cwd}, prompt length: ${prompt.length}`);

    return new Promise((resolve, reject) => {
      const child = spawn(this.claudePath, ['--print', '--dangerously-skip-permissions'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        this.logger.warn(`Claude timed out after ${timeoutMs}ms in ${cwd}, killing process`);
        child.kill('SIGTERM');
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', async (code) => {
        clearTimeout(timeoutHandle);
        if (timedOut) {
          const logContent = `[TIMEOUT after ${timeoutMs}ms]\n=== STDOUT ===\n${stdout}\n=== STDERR ===\n${stderr}`;
          const logPath = await this.logToFile(prompt, logContent, true).catch((e) => {
            this.logger.error('Log write failed:', e);
            return undefined;
          });
          reject(new TimeoutError(`Claude timed out after ${timeoutMs}ms`, logContent, logPath ?? ''));
          return;
        }
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
        clearTimeout(timeoutHandle);
        this.logger.error('Spawn error:', err);
        reject(err);
      });

      child.stdin!.write(prompt);
      child.stdin!.end();
    });
  }

  async healthCheck(cwd: string): Promise<void> {
    const timeoutMs = 30_000;
    this.logger.log(`Running Claude health check in ${cwd}`);

    return new Promise((resolve, reject) => {
      const child = spawn(this.claudePath, ['--print', '--dangerously-skip-permissions'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let hasOutput = false;
      let resolved = false;

      const handle = setTimeout(() => {
        child.kill('SIGTERM');
      }, timeoutMs);

      const onOutput = () => {
        if (!hasOutput) {
          hasOutput = true;
          clearTimeout(handle);
          resolved = true;
          child.kill('SIGTERM');
          resolve();
        }
      };

      child.stdout.on('data', onOutput);
      child.stderr.on('data', onOutput);

      child.on('close', () => {
        clearTimeout(handle);
        if (!resolved) {
          reject(new AuthError('Claude health check: no output produced'));
        }
      });

      child.on('error', (err) => {
        clearTimeout(handle);
        if (!resolved) reject(err);
      });

      child.stdin!.write('reply with only the word: ok');
      child.stdin!.end();
    });
  }

  private async logToFile(input: string, output: string, force = false): Promise<string | undefined> {
    if (!force && !this.configService.get('CLAUDE_LOG_IO')) return undefined;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = this.configService.get('CLAUDE_LOG_DIR', './logs/claude');
    await mkdir(dir, { recursive: true });
    const path = join(dir, `claude-${ts}.log`);
    const content = `=== INPUT ===\n${input}\n\n=== OUTPUT ===\n${output}\n`;
    await writeFile(path, content, 'utf-8');
    this.logger.log(`Logged I/O to ${path}`);
    return path;
  }
}
