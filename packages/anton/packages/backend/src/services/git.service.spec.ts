import { GitService, WorktreeInfo } from './git.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

describe('GitService', () => {
  let service: GitService;
  let tmpDir: string;
  let repoDir: string;

  function git(args: string[], cwd: string): string {
    return execFileSync('git', args, { cwd, encoding: 'utf-8' });
  }

  beforeEach(() => {
    service = new GitService();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-service-test-'));
    repoDir = path.join(tmpDir, 'repo');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('initRepo', () => {
    it('should initialize a git repository', async () => {
      await service.initRepo(repoDir);
      expect(fs.existsSync(path.join(repoDir, '.git'))).toBe(true);
    });

    it('should create parent directories', async () => {
      const nestedDir = path.join(tmpDir, 'deep', 'nested', 'repo');
      await service.initRepo(nestedDir);
      expect(fs.existsSync(path.join(nestedDir, '.git'))).toBe(true);
    });
  });

  describe('createBranch', () => {
    beforeEach(async () => {
      await service.initRepo(repoDir);
      // Create initial commit so branches work
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'init'], repoDir);
    });

    it('should create and checkout a new branch', async () => {
      await service.createBranch(repoDir, 'feature/test');
      const branch = git(['branch', '--show-current'], repoDir).trim();
      expect(branch).toBe('feature/test');
    });

    it('should create a branch from a start point', async () => {
      const headSha = git(['rev-parse', 'HEAD'], repoDir).trim();
      // Make another commit
      fs.writeFileSync(path.join(repoDir, 'file2.txt'), 'content');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'second'], repoDir);

      await service.createBranch(repoDir, 'from-first', headSha);
      const currentHead = git(['rev-parse', 'HEAD'], repoDir).trim();
      expect(currentHead).toBe(headSha);
    });
  });

  describe('createWorktree and removeWorktree', () => {
    beforeEach(async () => {
      await service.initRepo(repoDir);
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'init'], repoDir);
    });

    it('should create a worktree with a new branch', async () => {
      const worktreePath = path.join(tmpDir, 'wt1');
      await service.createWorktree(repoDir, worktreePath, 'wt-branch');

      expect(fs.existsSync(worktreePath)).toBe(true);
      expect(fs.existsSync(path.join(worktreePath, 'README.md'))).toBe(true);

      const branch = git(['branch', '--show-current'], worktreePath).trim();
      expect(branch).toBe('wt-branch');
    });

    it('should remove a worktree', async () => {
      const worktreePath = path.join(tmpDir, 'wt-remove');
      await service.createWorktree(repoDir, worktreePath, 'wt-remove-branch');
      expect(fs.existsSync(worktreePath)).toBe(true);

      await service.removeWorktree(repoDir, worktreePath);
      expect(fs.existsSync(worktreePath)).toBe(false);
    });
  });

  describe('mergeBranch', () => {
    beforeEach(async () => {
      await service.initRepo(repoDir);
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'init'], repoDir);
    });

    it('should merge a branch into the current branch', async () => {
      // Create feature branch with a commit
      git(['checkout', '-b', 'feature'], repoDir);
      fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'feature work');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'feature work'], repoDir);

      // Switch back to main
      const mainBranch = git(['branch', '--list', 'main', 'master'], repoDir)
        .trim()
        .split('\n')[0]
        .trim();
      git(['checkout', mainBranch], repoDir);

      await service.mergeBranch(repoDir, 'feature', 'Merge feature');

      expect(fs.existsSync(path.join(repoDir, 'feature.txt'))).toBe(true);
    });
  });

  describe('deleteBranch', () => {
    beforeEach(async () => {
      await service.initRepo(repoDir);
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'init'], repoDir);
    });

    it('should delete a merged branch', async () => {
      git(['branch', 'to-delete'], repoDir);
      await service.deleteBranch(repoDir, 'to-delete');

      const branches = git(['branch', '--list'], repoDir);
      expect(branches).not.toContain('to-delete');
    });

    it('should force delete an unmerged branch', async () => {
      git(['checkout', '-b', 'unmerged'], repoDir);
      fs.writeFileSync(path.join(repoDir, 'unmerged.txt'), 'data');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'unmerged work'], repoDir);

      const mainBranch = git(['branch', '--list', 'main', 'master'], repoDir)
        .trim()
        .split('\n')[0]
        .trim();
      git(['checkout', mainBranch], repoDir);

      await service.deleteBranch(repoDir, 'unmerged', true);

      const branches = git(['branch', '--list'], repoDir);
      expect(branches).not.toContain('unmerged');
    });
  });

  describe('listWorktrees', () => {
    beforeEach(async () => {
      await service.initRepo(repoDir);
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'init'], repoDir);
    });

    it('should list the main worktree', async () => {
      const worktrees = await service.listWorktrees(repoDir);
      expect(worktrees.length).toBe(1);
      expect(worktrees[0].path).toBe(fs.realpathSync(repoDir));
    });

    it('should list multiple worktrees', async () => {
      const wt1 = path.join(tmpDir, 'wt-list-1');
      const wt2 = path.join(tmpDir, 'wt-list-2');
      await service.createWorktree(repoDir, wt1, 'branch-1');
      await service.createWorktree(repoDir, wt2, 'branch-2');

      const worktrees = await service.listWorktrees(repoDir);
      expect(worktrees.length).toBe(3);

      const paths = worktrees.map((w) => w.path);
      expect(paths).toContain(fs.realpathSync(wt1));
      expect(paths).toContain(fs.realpathSync(wt2));
    });

    it('should include branch and head info', async () => {
      const wt = path.join(tmpDir, 'wt-info');
      await service.createWorktree(repoDir, wt, 'info-branch');

      const worktrees = await service.listWorktrees(repoDir);
      const wtInfo = worktrees.find(
        (w) => w.path === fs.realpathSync(wt),
      );
      expect(wtInfo).toBeDefined();
      expect(wtInfo!.branch).toBe('refs/heads/info-branch');
      expect(wtInfo!.head).toMatch(/^[0-9a-f]{40}$/);
    });
  });
});
