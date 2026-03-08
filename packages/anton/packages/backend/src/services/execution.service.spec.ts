import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { DatabaseService } from './database.service';
import { GitService } from './git.service';
import { ClaudeCliService } from './claude-cli.service';
import { WorkflowStateMachineService } from './workflow-state-machine.service';
import { TelegramService } from './telegram.service';
import { Database, createDefaultDatabase } from '../models/database.model';
import { Project } from '../models/project.model';
import { Execution } from '../models/execution.model';
import { TaskSetEntry } from '../models/task.model';

function createTestProject(overrides: Partial<Project> = {}): Project {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    displayName: 'Test Project',
    internalName: 'test-project-1234',
    prefix: 'TP',
    description: 'A test project',
    state: 'created',
    projectDir: '/tmp/test-project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTestTaskSet(projectId: string, overrides: Partial<TaskSetEntry> = {}): TaskSetEntry {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    projectId,
    prdId: '00000000-0000-0000-0000-000000000020',
    version: 1,
    userStories: [
      {
        id: 'US-001',
        title: 'Story 1',
        description: 'First story',
        acceptanceCriteria: ['Criterion 1'],
        priority: 1,
        passes: false,
        notes: '',
      },
      {
        id: 'US-002',
        title: 'Story 2',
        description: 'Second story',
        acceptanceCriteria: ['Criterion 2'],
        priority: 2,
        passes: false,
        notes: '',
      },
    ],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTestExecution(projectId: string, overrides: Partial<Execution> = {}): Execution {
  return {
    id: '00000000-0000-0000-0000-000000000100',
    projectId,
    taskSetId: '00000000-0000-0000-0000-000000000010',
    status: 'configuring',
    parallelCount: 1,
    worktrees: [],
    startedAt: null,
    completedAt: null,
    winnerId: null,
    elapsedMs: 0,
    estimatedRemainingMs: null,
    ...overrides,
  };
}

describe('ExecutionService', () => {
  let service: ExecutionService;
  let mockDb: Database;
  let tmpDir: string;
  let mockDatabaseService: jest.Mocked<Pick<DatabaseService, 'read' | 'update'>>;
  let mockGitService: jest.Mocked<Pick<GitService, 'createWorktree' | 'removeWorktree' | 'mergeBranch' | 'deleteBranch'>>;
  let mockClaudeCliService: jest.Mocked<Pick<ClaudeCliService, 'run'>>;
  let mockWorkflowStateMachine: jest.Mocked<Pick<WorkflowStateMachineService, 'transition'>>;
  let mockTelegramService: jest.Mocked<Pick<TelegramService, 'notifyExecutionComplete' | 'notifyMergeComplete' | 'notifyError'>>;
  let eventEmitter: EventEmitter2;

  const projectId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-service-test-'));

    mockDb = createDefaultDatabase();
    const project = createTestProject({ projectDir: tmpDir });
    mockDb.projects[project.id] = project;
    const taskSet = createTestTaskSet(projectId);
    mockDb.taskSets[projectId] = [taskSet];

    mockDatabaseService = {
      read: jest.fn().mockImplementation(async () => mockDb),
      update: jest.fn().mockImplementation(async (fn) => {
        mockDb = await fn(mockDb);
        return mockDb;
      }),
    };

    mockGitService = {
      createWorktree: jest.fn().mockResolvedValue(undefined),
      removeWorktree: jest.fn().mockResolvedValue(undefined),
      mergeBranch: jest.fn().mockResolvedValue(undefined),
      deleteBranch: jest.fn().mockResolvedValue(undefined),
    };

    mockClaudeCliService = {
      run: jest.fn().mockResolvedValue({ stdout: 'done', stderr: '', exitCode: 0 }),
    };

    mockWorkflowStateMachine = {
      transition: jest.fn().mockResolvedValue({
        projectId,
        currentState: 'executing',
        previousState: 'execution_config',
        transitionedAt: new Date().toISOString(),
        transitionHistory: [],
      }),
    };

    mockTelegramService = {
      notifyExecutionComplete: jest.fn().mockResolvedValue(undefined),
      notifyMergeComplete: jest.fn().mockResolvedValue(undefined),
      notifyError: jest.fn().mockResolvedValue(undefined),
    };

    eventEmitter = new EventEmitter2();
    jest.spyOn(eventEmitter, 'emit');

    service = new ExecutionService(
      mockDatabaseService as any,
      mockGitService as any,
      mockClaudeCliService as any,
      mockWorkflowStateMachine as any,
      mockTelegramService as any,
      eventEmitter,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('configureExecution', () => {
    it('should create an execution with configuring status', async () => {
      const exec = await service.configureExecution(
        projectId,
        '00000000-0000-0000-0000-000000000010',
        2,
      );

      expect(exec.status).toBe('configuring');
      expect(exec.parallelCount).toBe(2);
      expect(exec.projectId).toBe(projectId);
      expect(exec.worktrees).toEqual([]);
      expect(exec.id).toBeDefined();
    });

    it('should transition workflow to execution_config', async () => {
      await service.configureExecution(
        projectId,
        '00000000-0000-0000-0000-000000000010',
        1,
      );

      expect(mockWorkflowStateMachine.transition).toHaveBeenCalledWith(
        projectId,
        'execution_config',
        'execution-service',
      );
    });

    it('should save execution to database', async () => {
      const exec = await service.configureExecution(
        projectId,
        '00000000-0000-0000-0000-000000000010',
        1,
      );

      expect(mockDatabaseService.update).toHaveBeenCalled();
      expect(mockDb.executions[projectId]).toHaveLength(1);
      expect(mockDb.executions[projectId][0].id).toBe(exec.id);
    });

    it('should throw BadRequestException for invalid parallelCount', async () => {
      await expect(
        service.configureExecution(projectId, '00000000-0000-0000-0000-000000000010', 0),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.configureExecution(projectId, '00000000-0000-0000-0000-000000000010', 11),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent project', async () => {
      await expect(
        service.configureExecution('non-existent', '00000000-0000-0000-0000-000000000010', 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent task set', async () => {
      await expect(
        service.configureExecution(projectId, 'non-existent', 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('startExecution', () => {
    let executionId: string;

    beforeEach(async () => {
      const exec = await service.configureExecution(
        projectId,
        '00000000-0000-0000-0000-000000000010',
        2,
      );
      executionId = exec.id;
    });

    it('should transition execution to executing state', async () => {
      const exec = await service.startExecution(projectId, executionId);

      expect(exec.status).toBe('executing');
      expect(exec.startedAt).toBeDefined();
    });

    it('should create worktrees for each parallel session', async () => {
      const exec = await service.startExecution(projectId, executionId);

      expect(exec.worktrees).toHaveLength(2);
      expect(mockGitService.createWorktree).toHaveBeenCalledTimes(2);
    });

    it('should set up story progress for non-passing stories', async () => {
      const exec = await service.startExecution(projectId, executionId);

      for (const wt of exec.worktrees) {
        expect(wt.storyProgress).toHaveLength(2);
        expect(wt.storyProgress[0].status).toBe('queued');
        expect(wt.storyProgress[1].status).toBe('queued');
      }
    });

    it('should create log directories for each worktree', async () => {
      const exec = await service.startExecution(projectId, executionId);

      for (const wt of exec.worktrees) {
        expect(fs.existsSync(wt.logPath!)).toBe(true);
      }
    });

    it('should throw ConflictException if execution is not in configuring state', async () => {
      // Start it once
      await service.startExecution(projectId, executionId);

      // Try to start again — the DB now has status 'executing'
      await expect(
        service.startExecution(projectId, executionId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for non-existent execution', async () => {
      await expect(
        service.startExecution(projectId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getExecution', () => {
    it('should return execution by ID', async () => {
      const exec = await service.configureExecution(
        projectId,
        '00000000-0000-0000-0000-000000000010',
        1,
      );

      const result = await service.getExecution(projectId, exec.id);
      expect(result.id).toBe(exec.id);
      expect(result.status).toBe('configuring');
    });

    it('should throw NotFoundException for non-existent execution', async () => {
      await expect(
        service.getExecution(projectId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listExecutions', () => {
    it('should return empty array when no executions exist', async () => {
      const result = await service.listExecutions(projectId);
      expect(result).toEqual([]);
    });

    it('should return all executions for a project', async () => {
      await service.configureExecution(projectId, '00000000-0000-0000-0000-000000000010', 1);
      await service.configureExecution(projectId, '00000000-0000-0000-0000-000000000010', 2);

      const result = await service.listExecutions(projectId);
      expect(result).toHaveLength(2);
    });
  });

  describe('abortExecution', () => {
    it('should mark execution as aborted', async () => {
      const exec = await service.configureExecution(
        projectId,
        '00000000-0000-0000-0000-000000000010',
        1,
      );
      await service.startExecution(projectId, exec.id);

      const aborted = await service.abortExecution(projectId, exec.id);
      expect(aborted.status).toBe('aborted');
      expect(aborted.completedAt).toBeDefined();
    });

    it('should mark in_progress worktrees and stories as error', async () => {
      const exec = await service.configureExecution(
        projectId,
        '00000000-0000-0000-0000-000000000010',
        1,
      );
      await service.startExecution(projectId, exec.id);

      const aborted = await service.abortExecution(projectId, exec.id);

      for (const wt of aborted.worktrees) {
        for (const sp of wt.storyProgress) {
          expect(sp.status).not.toBe('in_progress');
        }
      }
    });

    it('should throw NotFoundException for non-existent execution', async () => {
      await expect(
        service.abortExecution(projectId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pickWinner', () => {
    it('should throw NotFoundException for non-existent project', async () => {
      await expect(
        service.pickWinner('non-existent', 'exec-id', 'wt-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent execution', async () => {
      await expect(
        service.pickWinner(projectId, 'non-existent', 'wt-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if execution is not completed', async () => {
      const exec = createTestExecution(projectId, { status: 'executing' });
      mockDb.executions[projectId] = [exec];

      await expect(
        service.pickWinner(projectId, exec.id, 'wt-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should merge winner branch and clean up worktrees', async () => {
      const exec = createTestExecution(projectId, {
        status: 'completed',
        worktrees: [
          {
            id: 'wt-1',
            branch: 'TP-exec-00000000-1',
            worktreePath: path.join(tmpDir, '.anton', 'worktrees', 'wt-1'),
            status: 'completed',
            storyProgress: [],
            elapsedMs: 1000,
            estimatedRemainingMs: 0,
            logPath: null,
            errors: [],
          },
        ],
      });
      mockDb.executions[projectId] = [exec];

      const result = await service.pickWinner(projectId, exec.id, 'wt-1');

      expect(result.winnerId).toBe('wt-1');
      expect(mockGitService.mergeBranch).toHaveBeenCalledWith(
        tmpDir,
        'TP-exec-00000000-1',
        expect.any(String),
      );
      expect(mockGitService.removeWorktree).toHaveBeenCalled();
      expect(mockGitService.deleteBranch).toHaveBeenCalled();
      expect(mockTelegramService.notifyMergeComplete).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent worktree', async () => {
      const exec = createTestExecution(projectId, {
        status: 'completed',
        worktrees: [],
      });
      mockDb.executions[projectId] = [exec];

      await expect(
        service.pickWinner(projectId, exec.id, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
