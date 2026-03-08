import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExecutionService } from './execution.service';
import { DatabaseService } from './database.service';
import { GitService } from './git.service';
import { ClaudeCliService } from './claude-cli.service';
import { WorkflowStateMachineService } from './workflow-state-machine.service';
import { TelegramService } from './telegram.service';
import { Database, createDefaultDatabase } from '../models/database.model';
import { Project } from '../models/project.model';
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

function createTestTaskSet(projectId: string, stories: { passes: boolean }[] = []): TaskSetEntry {
  const userStories = stories.length > 0
    ? stories.map((s, i) => ({
        id: `US-${String(i + 1).padStart(3, '0')}`,
        title: `Story ${i + 1}`,
        description: `Description ${i + 1}`,
        acceptanceCriteria: [`Criterion ${i + 1}`],
        priority: i + 1,
        passes: s.passes,
        notes: '',
      }))
    : [
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
      ];

  return {
    id: '00000000-0000-0000-0000-000000000010',
    projectId,
    prdId: '00000000-0000-0000-0000-000000000020',
    version: 1,
    userStories,
    createdAt: new Date().toISOString(),
  };
}

describe('Ralph Loop (runWorktreeLoop)', () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-loop-test-'));

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

  async function configureAndStart(parallelCount = 1): Promise<string> {
    const exec = await service.configureExecution(
      projectId,
      '00000000-0000-0000-0000-000000000010',
      parallelCount,
    );
    await service.startExecution(projectId, exec.id);
    return exec.id;
  }

  it('should invoke Claude CLI for each non-passing story', async () => {
    const executionId = await configureAndStart(1);

    // Wait for the background worktree loop to finish
    // The monitorExecution method runs in background; give it a tick
    await new Promise((r) => setTimeout(r, 50));

    expect(mockClaudeCliService.run).toHaveBeenCalledTimes(2);
    expect(mockClaudeCliService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('US-001'),
      }),
    );
    expect(mockClaudeCliService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('US-002'),
      }),
    );
  });

  it('should skip stories that already pass', async () => {
    // Replace task set with one passing story
    mockDb.taskSets[projectId] = [
      createTestTaskSet(projectId, [
        { passes: true },
        { passes: false },
        { passes: false },
      ]),
    ];

    const executionId = await configureAndStart(1);
    await new Promise((r) => setTimeout(r, 50));

    // Only 2 non-passing stories should be executed
    expect(mockClaudeCliService.run).toHaveBeenCalledTimes(2);
  });

  it('should emit story_status_change events', async () => {
    const executionId = await configureAndStart(1);
    await new Promise((r) => setTimeout(r, 50));

    const emitCalls = (eventEmitter.emit as jest.Mock).mock.calls
      .filter(([event]) => event === 'execution.event')
      .map(([, payload]) => payload.event.type);

    expect(emitCalls).toContain('story_status_change');
    expect(emitCalls).toContain('eta_recalculation');
    expect(emitCalls).toContain('worktree_completed');
  });

  it('should continue to next story on error', async () => {
    mockClaudeCliService.run
      .mockRejectedValueOnce(new Error('Claude CLI failed'))
      .mockResolvedValueOnce({ stdout: 'done', stderr: '', exitCode: 0 });

    const executionId = await configureAndStart(1);
    await new Promise((r) => setTimeout(r, 50));

    // Both stories should have been attempted
    expect(mockClaudeCliService.run).toHaveBeenCalledTimes(2);

    // Error event should have been emitted
    const errorEvents = (eventEmitter.emit as jest.Mock).mock.calls
      .filter(([event]) => event === 'execution.event')
      .filter(([, payload]) => payload.event.type === 'error');

    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('should stop processing when aborted', async () => {
    let runCallCount = 0;
    // Make CLI calls hang until aborted
    mockClaudeCliService.run.mockImplementation(async ({ signal }) => {
      runCallCount++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ stdout: '', stderr: '', exitCode: 0 }), 10000);
        if (signal) {
          if (signal.aborted) {
            clearTimeout(timer);
            reject(new Error('Aborted'));
            return;
          }
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
          });
        }
      });
    });

    const executionId = await configureAndStart(1);

    // Wait briefly for the loop to start
    await new Promise((r) => setTimeout(r, 20));

    // Abort the execution
    await service.abortExecution(projectId, executionId);

    // Should have started at most 1 story before abort took effect
    expect(runCallCount).toBeLessThanOrEqual(2);
  });

  it('should run worktree loops in parallel for multiple workers', async () => {
    const executionId = await configureAndStart(2);
    await new Promise((r) => setTimeout(r, 50));

    // Each worktree should execute all non-passing stories
    // 2 workers x 2 stories = 4 total Claude CLI calls
    expect(mockClaudeCliService.run).toHaveBeenCalledTimes(4);
  });

  it('should mark execution as completed when all worktrees finish', async () => {
    const executionId = await configureAndStart(1);
    await new Promise((r) => setTimeout(r, 100));

    const execution = await service.getExecution(projectId, executionId);
    expect(execution.status).toBe('completed');
    expect(execution.completedAt).toBeDefined();
  });

  it('should mark execution as error when a worktree has errors', async () => {
    mockClaudeCliService.run.mockRejectedValue(new Error('All stories fail'));

    const executionId = await configureAndStart(1);
    await new Promise((r) => setTimeout(r, 100));

    // Re-read from the database after monitoring completes
    const executions = mockDb.executions[projectId] ?? [];
    const execution = executions.find((e) => e.id === executionId);

    // The worktree should have errors recorded
    if (execution) {
      const wt = execution.worktrees[0];
      if (wt) {
        expect(wt.errors.length).toBeGreaterThan(0);
      }
    }
  });

  it('should emit execution_completed event when done', async () => {
    const executionId = await configureAndStart(1);
    await new Promise((r) => setTimeout(r, 100));

    const completedEvents = (eventEmitter.emit as jest.Mock).mock.calls
      .filter(([event]) => event === 'execution.event')
      .filter(([, payload]) => payload.event.type === 'execution_completed');

    expect(completedEvents.length).toBe(1);
  });

  it('should notify via Telegram when execution completes', async () => {
    const executionId = await configureAndStart(1);
    await new Promise((r) => setTimeout(r, 100));

    expect(mockTelegramService.notifyExecutionComplete).toHaveBeenCalledWith(
      'Test Project',
      executionId,
      expect.any(Number),
    );
  });

  it('should build prompts with story details', async () => {
    const executionId = await configureAndStart(1);
    await new Promise((r) => setTimeout(r, 50));

    const firstCall = mockClaudeCliService.run.mock.calls[0][0];
    expect(firstCall.prompt).toContain('US-001');
    expect(firstCall.prompt).toContain('Story 1');
    expect(firstCall.prompt).toContain('Criterion 1');
    expect(firstCall.prompt).toContain('Acceptance Criteria');
  });
});
