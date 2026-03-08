import { ClaudeCliService } from './claude-cli.service';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    execFile: jest.fn(),
    spawn: jest.fn(),
  };
});

function createMockProcess() {
  const proc = new EventEmitter() as any;
  proc.stdin = { write: jest.fn(), end: jest.fn() };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  return proc;
}

/** Helper: schedule mock process events after event listeners are attached */
function emitLater(fn: () => void) {
  // Use setImmediate to ensure the promise's listeners are set up first
  setImmediate(fn);
}

describe('ClaudeCliService', () => {
  let service: ClaudeCliService;

  beforeEach(() => {
    service = new ClaudeCliService();
    jest.clearAllMocks();
    // Reset cached path
    (service as any).claudePath = null;
  });

  describe('findClaudeBinary', () => {
    it('should discover claude binary via which', async () => {
      (child_process.execFile as unknown as jest.Mock).mockImplementation(
        (_cmd: string, _args: string[], cb: Function) => {
          cb(null, { stdout: '/usr/local/bin/claude\n', stderr: '' });
        },
      );

      const result = await service.findClaudeBinary();
      expect(result).toBe('/usr/local/bin/claude');
      expect(child_process.execFile).toHaveBeenCalledWith(
        'which',
        ['claude'],
        expect.any(Function),
      );
    });

    it('should cache the binary path on subsequent calls', async () => {
      (child_process.execFile as unknown as jest.Mock).mockImplementation(
        (_cmd: string, _args: string[], cb: Function) => {
          cb(null, { stdout: '/usr/bin/claude\n', stderr: '' });
        },
      );

      await service.findClaudeBinary();
      await service.findClaudeBinary();

      expect(child_process.execFile).toHaveBeenCalledTimes(1);
    });

    it('should throw if claude binary is not found', async () => {
      (child_process.execFile as unknown as jest.Mock).mockImplementation(
        (_cmd: string, _args: string[], cb: Function) => {
          cb(new Error('not found'));
        },
      );

      await expect(service.findClaudeBinary()).rejects.toThrow(
        'Claude CLI binary not found',
      );
    });
  });

  describe('run', () => {
    beforeEach(() => {
      (service as any).claudePath = '/usr/local/bin/claude';
    });

    it('should spawn claude with --print --dangerously-skip-permissions', async () => {
      const mockProc = createMockProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockProc);

      const promise = service.run({ cwd: '/tmp/test', prompt: 'Hello' });

      emitLater(() => {
        mockProc.stdout.emit('data', Buffer.from('Response text'));
        mockProc.emit('close', 0);
      });

      const result = await promise;

      expect(child_process.spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        ['--print', '--dangerously-skip-permissions'],
        { cwd: '/tmp/test', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      expect(result.stdout).toBe('Response text');
      expect(result.exitCode).toBe(0);
    });

    it('should pipe prompt to stdin', async () => {
      const mockProc = createMockProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockProc);

      const promise = service.run({ cwd: '/tmp/test', prompt: 'Implement feature X' });

      emitLater(() => mockProc.emit('close', 0));
      await promise;

      expect(mockProc.stdin.write).toHaveBeenCalledWith('Implement feature X');
      expect(mockProc.stdin.end).toHaveBeenCalled();
    });

    it('should capture stdout and stderr', async () => {
      const mockProc = createMockProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockProc);

      const promise = service.run({ cwd: '/tmp/test', prompt: 'test' });

      emitLater(() => {
        mockProc.stdout.emit('data', Buffer.from('part1'));
        mockProc.stdout.emit('data', Buffer.from('part2'));
        mockProc.stderr.emit('data', Buffer.from('warning'));
        mockProc.emit('close', 0);
      });

      const result = await promise;
      expect(result.stdout).toBe('part1part2');
      expect(result.stderr).toBe('warning');
    });

    it('should pass extra args', async () => {
      const mockProc = createMockProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockProc);

      const promise = service.run({
        cwd: '/tmp/test',
        prompt: 'test',
        extraArgs: ['--model', 'opus'],
      });

      emitLater(() => mockProc.emit('close', 0));
      await promise;

      expect(child_process.spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        ['--print', '--dangerously-skip-permissions', '--model', 'opus'],
        expect.any(Object),
      );
    });

    it('should support cancellation via AbortSignal', async () => {
      const mockProc = createMockProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockProc);

      const controller = new AbortController();

      const promise = service.run({
        cwd: '/tmp/test',
        prompt: 'test',
        signal: controller.signal,
      });

      emitLater(() => {
        controller.abort();
        mockProc.emit('close', null);
      });

      await expect(promise).rejects.toThrow('aborted');
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should reject immediately if signal is already aborted', async () => {
      const mockProc = createMockProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockProc);

      const controller = new AbortController();
      controller.abort();

      const promise = service.run({
        cwd: '/tmp/test',
        prompt: 'test',
        signal: controller.signal,
      });

      await expect(promise).rejects.toThrow('aborted');
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should write log files when logDir is specified', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cli-test-'));
      const logDir = path.join(tmpDir, 'logs');

      const mockProc = createMockProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockProc);

      const promise = service.run({
        cwd: '/tmp/test',
        prompt: 'my prompt',
        logDir,
      });

      emitLater(() => {
        mockProc.stdout.emit('data', Buffer.from('output text'));
        mockProc.stderr.emit('data', Buffer.from('err text'));
        mockProc.emit('close', 0);
      });

      await promise;

      expect(fs.readFileSync(path.join(logDir, 'input.txt'), 'utf-8')).toBe('my prompt');
      expect(fs.readFileSync(path.join(logDir, 'stdout.txt'), 'utf-8')).toBe('output text');
      expect(fs.readFileSync(path.join(logDir, 'stderr.txt'), 'utf-8')).toBe('err text');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('should handle spawn errors', async () => {
      const mockProc = createMockProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockProc);

      const promise = service.run({ cwd: '/tmp/test', prompt: 'test' });

      emitLater(() => {
        mockProc.emit('error', new Error('spawn failed'));
      });

      await expect(promise).rejects.toThrow('spawn failed');
    });

    it('should return non-zero exit code without rejecting', async () => {
      const mockProc = createMockProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockProc);

      const promise = service.run({ cwd: '/tmp/test', prompt: 'test' });

      emitLater(() => {
        mockProc.stderr.emit('data', Buffer.from('error output'));
        mockProc.emit('close', 1);
      });

      const result = await promise;
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('error output');
    });
  });
});
