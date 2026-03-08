import { Injectable, Logger } from '@nestjs/common';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface ClaudeCliResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ClaudeCliOptions {
  /** Working directory for the claude process */
  cwd: string;
  /** The prompt to send via stdin */
  prompt: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Directory to write input/output log files */
  logDir?: string;
  /** Additional CLI arguments */
  extraArgs?: string[];
}

@Injectable()
export class ClaudeCliService {
  private readonly logger = new Logger(ClaudeCliService.name);
  private claudePath: string | null = null;

  /**
   * Discover the claude binary path using `which`.
   * Caches the result for subsequent calls.
   */
  async findClaudeBinary(): Promise<string> {
    if (this.claudePath) {
      return this.claudePath;
    }

    try {
      const { stdout } = await execFileAsync('which', ['claude']);
      this.claudePath = stdout.trim();
      this.logger.log(`Found claude binary at: ${this.claudePath}`);
      return this.claudePath;
    } catch {
      throw new Error(
        'Claude CLI binary not found. Ensure "claude" is installed and in PATH.',
      );
    }
  }

  /**
   * Spawn a Claude Code CLI process with --print --dangerously-skip-permissions,
   * pipe a prompt via stdin, and capture stdout/stderr.
   */
  async run(options: ClaudeCliOptions): Promise<ClaudeCliResult> {
    const claudeBin = await this.findClaudeBinary();
    const { cwd, prompt, signal, logDir, extraArgs = [] } = options;

    const args = ['--print', '--dangerously-skip-permissions', ...extraArgs];

    this.logger.debug(`Spawning claude ${args.join(' ')} [cwd: ${cwd}]`);

    // Write input log if logDir is specified
    if (logDir) {
      fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(
        path.join(logDir, 'input.txt'),
        prompt,
        'utf-8',
      );
    }

    return new Promise<ClaudeCliResult>((resolve, reject) => {
      const child = spawn(claudeBin, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let aborted = false;

      // Handle abort signal
      if (signal) {
        if (signal.aborted) {
          child.kill('SIGTERM');
          aborted = true;
          reject(new Error('Claude CLI execution was aborted'));
          return;
        }

        const onAbort = () => {
          aborted = true;
          child.kill('SIGTERM');
        };
        signal.addEventListener('abort', onAbort, { once: true });

        child.on('close', () => {
          signal.removeEventListener('abort', onAbort);
        });
      }

      child.stdout!.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr!.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Pipe prompt to stdin and close
      child.stdin!.write(prompt);
      child.stdin!.end();

      child.on('error', (err) => {
        if (!aborted) {
          reject(err);
        }
      });

      child.on('close', (exitCode) => {
        // Write output logs if logDir is specified
        if (logDir) {
          try {
            fs.writeFileSync(
              path.join(logDir, 'stdout.txt'),
              stdout,
              'utf-8',
            );
            fs.writeFileSync(
              path.join(logDir, 'stderr.txt'),
              stderr,
              'utf-8',
            );
          } catch (err) {
            this.logger.warn(`Failed to write log files: ${err}`);
          }
        }

        if (aborted) {
          reject(new Error('Claude CLI execution was aborted'));
          return;
        }

        this.logger.debug(`Claude CLI exited with code ${exitCode}`);
        resolve({ stdout, stderr, exitCode });
      });
    });
  }
}
