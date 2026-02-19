import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../config';

interface RunClaudeOpts {
  prompt: string;
  cwd: string;
  signal?: AbortSignal;
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);

  constructor(private readonly configService: ConfigService<AppConfig>) {}

  async runClaude(opts: RunClaudeOpts): Promise<string> {
    const { prompt, cwd, signal } = opts;

    this.logger.log(`Running in ${cwd}, prompt length: ${prompt.length}`);

    return new Promise((resolve, reject) => {
      const child = spawn('claude', ['--print', '--dangerously-skip-permissions'], {
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
