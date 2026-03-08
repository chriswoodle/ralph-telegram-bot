import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  bare: boolean;
}

@Injectable()
export class GitService {
  private readonly logger = new Logger(GitService.name);

  private async git(
    args: string[],
    cwd: string,
  ): Promise<{ stdout: string; stderr: string }> {
    this.logger.debug(`git ${args.join(' ')} [cwd: ${cwd}]`);
    return execFileAsync('git', args, { cwd });
  }

  async initRepo(dir: string): Promise<void> {
    fs.mkdirSync(dir, { recursive: true });
    await this.git(['init'], dir);
  }

  async createBranch(
    repoDir: string,
    branchName: string,
    startPoint?: string,
  ): Promise<void> {
    const args = ['checkout', '-b', branchName];
    if (startPoint) {
      args.push(startPoint);
    }
    await this.git(args, repoDir);
  }

  async createWorktree(
    repoDir: string,
    worktreePath: string,
    branchName: string,
  ): Promise<void> {
    const absolutePath = path.resolve(repoDir, worktreePath);
    await this.git(
      ['worktree', 'add', absolutePath, '-b', branchName],
      repoDir,
    );
  }

  async removeWorktree(
    repoDir: string,
    worktreePath: string,
  ): Promise<void> {
    const absolutePath = path.resolve(repoDir, worktreePath);
    await this.git(['worktree', 'remove', absolutePath, '--force'], repoDir);
  }

  async mergeBranch(
    repoDir: string,
    branchName: string,
    message?: string,
  ): Promise<void> {
    const args = ['merge', branchName];
    if (message) {
      args.push('-m', message);
    }
    await this.git(args, repoDir);
  }

  async deleteBranch(
    repoDir: string,
    branchName: string,
    force = false,
  ): Promise<void> {
    const flag = force ? '-D' : '-d';
    await this.git(['branch', flag, branchName], repoDir);
  }

  async listWorktrees(repoDir: string): Promise<WorktreeInfo[]> {
    const { stdout } = await this.git(
      ['worktree', 'list', '--porcelain'],
      repoDir,
    );

    const worktrees: WorktreeInfo[] = [];
    const blocks = stdout.split('\n\n').filter((b) => b.trim());

    for (const block of blocks) {
      const lines = block.split('\n');
      const info: Partial<WorktreeInfo> = { bare: false };

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          info.path = line.slice('worktree '.length);
        } else if (line.startsWith('HEAD ')) {
          info.head = line.slice('HEAD '.length);
        } else if (line.startsWith('branch ')) {
          info.branch = line.slice('branch '.length);
        } else if (line === 'bare') {
          info.bare = true;
        }
      }

      if (info.path) {
        worktrees.push({
          path: info.path,
          branch: info.branch ?? '',
          head: info.head ?? '',
          bare: info.bare ?? false,
        });
      }
    }

    return worktrees;
  }
}
