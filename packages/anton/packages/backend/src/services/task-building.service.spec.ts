import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TaskBuildingService } from './task-building.service';
import { DatabaseService } from './database.service';
import { OpenRouterService } from './openrouter.service';
import { WorkflowStateMachineService } from './workflow-state-machine.service';
import { TelegramService } from './telegram.service';
import { Database, createDefaultDatabase } from '../models/database.model';
import { Project } from '../models/project.model';
import { TaskSetEntry, UserStory } from '../models/task.model';
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

function createTestPrdEntry(projectId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000020',
    projectId,
    state: 'approved' as const,
    input: { text: 'Test PRD input', assets: [] as { fileName: string; filePath: string; mimeType?: string }[] },
    clarifyingQuestions: [] as { question: string; answer?: string }[],
    prdMarkdown: '# Test PRD\n\nThis is a test PRD.' as string | null,
    approvedAt: new Date().toISOString() as string | null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTestStories(count: number): UserStory[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `US-${String(i + 1).padStart(3, '0')}`,
    title: `Story ${i + 1}`,
    description: `Description for story ${i + 1}`,
    acceptanceCriteria: [`Criterion ${i + 1}a`, `Criterion ${i + 1}b`],
    priority: i + 1,
    passes: false,
    notes: '',
  }));
}

function createTestTaskSet(projectId: string, stories?: UserStory[]): TaskSetEntry {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    projectId,
    prdId: '00000000-0000-0000-0000-000000000020',
    version: 1,
    userStories: stories ?? createTestStories(3),
    createdAt: new Date().toISOString(),
  };
}

describe('TaskBuildingService', () => {
  let service: TaskBuildingService;
  let mockDb: Database;
  let tmpDir: string;
  let mockDatabaseService: jest.Mocked<Pick<DatabaseService, 'read' | 'update'>>;
  let mockOpenRouterService: jest.Mocked<Pick<OpenRouterService, 'sendPrompt'>>;
  let mockWorkflowStateMachine: jest.Mocked<Pick<WorkflowStateMachineService, 'transition'>>;
  let mockTelegramService: jest.Mocked<Pick<TelegramService, 'notifyTaskGenerationDone'>>;

  const projectId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-building-test-'));
    fs.mkdirSync(path.join(tmpDir, '.anton'), { recursive: true });

    mockDb = createDefaultDatabase();
    const project = createTestProject({ projectDir: tmpDir });
    mockDb.projects[project.id] = project;
    mockDb.prdEntries[projectId] = [createTestPrdEntry(projectId)];

    mockDatabaseService = {
      read: jest.fn().mockImplementation(async () => mockDb),
      update: jest.fn().mockImplementation(async (fn) => {
        mockDb = await fn(mockDb);
        return mockDb;
      }),
    };

    mockOpenRouterService = {
      sendPrompt: jest.fn().mockResolvedValue(
        JSON.stringify(createTestStories(3)),
      ),
    };

    mockWorkflowStateMachine = {
      transition: jest.fn().mockResolvedValue({
        projectId,
        currentState: 'tasks_generated',
        previousState: 'prd_review',
        transitionedAt: new Date().toISOString(),
        transitionHistory: [],
      }),
    };

    mockTelegramService = {
      notifyTaskGenerationDone: jest.fn().mockResolvedValue(undefined),
    };

    service = new TaskBuildingService(
      mockDatabaseService as any,
      mockOpenRouterService as any,
      mockWorkflowStateMachine as any,
      mockTelegramService as any,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('generateTasks', () => {
    it('should generate tasks from PRD and save to database', async () => {
      const result = await service.generateTasks(projectId, '00000000-0000-0000-0000-000000000020');

      expect(result.userStories).toHaveLength(3);
      expect(result.projectId).toBe(projectId);
      expect(result.version).toBe(1);
      expect(mockDatabaseService.update).toHaveBeenCalled();
      expect(mockDb.taskSets[projectId]).toHaveLength(1);
    });

    it('should save tasks file to .anton directory', async () => {
      await service.generateTasks(projectId, '00000000-0000-0000-0000-000000000020');

      const tasksFile = path.join(tmpDir, '.anton', 'tasks-1.json');
      expect(fs.existsSync(tasksFile)).toBe(true);

      const savedData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      expect(savedData.userStories).toHaveLength(3);
    });

    it('should call OpenRouter with PRD content', async () => {
      await service.generateTasks(projectId, '00000000-0000-0000-0000-000000000020');

      expect(mockOpenRouterService.sendPrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          prd_content: '# Test PRD\n\nThis is a test PRD.',
        }),
      );
    });

    it('should transition workflow to tasks_generated', async () => {
      await service.generateTasks(projectId, '00000000-0000-0000-0000-000000000020');

      expect(mockWorkflowStateMachine.transition).toHaveBeenCalledWith(
        projectId,
        'tasks_generated',
        'task-building-service',
      );
    });

    it('should notify via Telegram', async () => {
      await service.generateTasks(projectId, '00000000-0000-0000-0000-000000000020');

      expect(mockTelegramService.notifyTaskGenerationDone).toHaveBeenCalledWith(
        'Test Project',
        3,
      );
    });

    it('should throw NotFoundException for non-existent project', async () => {
      await expect(
        service.generateTasks('non-existent', '00000000-0000-0000-0000-000000000020'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent PRD', async () => {
      await expect(
        service.generateTasks(projectId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when PRD has no content', async () => {
      mockDb.prdEntries[projectId] = [
        createTestPrdEntry(projectId, { prdMarkdown: null as any }),
      ];

      await expect(
        service.generateTasks(projectId, '00000000-0000-0000-0000-000000000020'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when LLM returns invalid JSON', async () => {
      mockOpenRouterService.sendPrompt.mockResolvedValue('not valid json');

      await expect(
        service.generateTasks(projectId, '00000000-0000-0000-0000-000000000020'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should auto-increment version for multiple task sets', async () => {
      // First generation
      await service.generateTasks(projectId, '00000000-0000-0000-0000-000000000020');

      // Second generation
      const result = await service.generateTasks(projectId, '00000000-0000-0000-0000-000000000020');

      expect(result.version).toBe(2);
    });
  });

  describe('getTaskSet', () => {
    beforeEach(() => {
      mockDb.taskSets[projectId] = [createTestTaskSet(projectId)];
    });

    it('should return task set by ID', async () => {
      const result = await service.getTaskSet(projectId, '00000000-0000-0000-0000-000000000010');

      expect(result.id).toBe('00000000-0000-0000-0000-000000000010');
      expect(result.userStories).toHaveLength(3);
    });

    it('should throw NotFoundException for non-existent task set', async () => {
      await expect(
        service.getTaskSet(projectId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLatestTaskSet', () => {
    it('should return the latest task set', async () => {
      const taskSet1 = createTestTaskSet(projectId);
      const taskSet2: TaskSetEntry = {
        ...createTestTaskSet(projectId),
        id: '00000000-0000-0000-0000-000000000011',
        version: 2,
      };
      mockDb.taskSets[projectId] = [taskSet1, taskSet2];

      const result = await service.getLatestTaskSet(projectId);
      expect(result.id).toBe('00000000-0000-0000-0000-000000000011');
      expect(result.version).toBe(2);
    });

    it('should throw NotFoundException when no task sets exist', async () => {
      await expect(
        service.getLatestTaskSet(projectId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listTaskSets', () => {
    it('should return empty array when no task sets exist', async () => {
      const result = await service.listTaskSets(projectId);
      expect(result).toEqual([]);
    });

    it('should return all task sets for a project', async () => {
      mockDb.taskSets[projectId] = [
        createTestTaskSet(projectId),
        { ...createTestTaskSet(projectId), id: '00000000-0000-0000-0000-000000000011', version: 2 },
      ];

      const result = await service.listTaskSets(projectId);
      expect(result).toHaveLength(2);
    });
  });

  describe('deleteStory', () => {
    beforeEach(() => {
      mockDb.taskSets[projectId] = [createTestTaskSet(projectId)];
    });

    it('should delete a story and re-number remaining stories', async () => {
      const result = await service.deleteStory(projectId, '00000000-0000-0000-0000-000000000010', 'US-002');

      expect(result.userStories).toHaveLength(2);
      expect(result.userStories[0].id).toBe('US-001');
      expect(result.userStories[1].id).toBe('US-002'); // re-numbered from US-003
      expect(result.userStories[0].priority).toBe(1);
      expect(result.userStories[1].priority).toBe(2);
    });

    it('should save updated tasks file after deletion', async () => {
      await service.deleteStory(projectId, '00000000-0000-0000-0000-000000000010', 'US-001');

      const tasksFile = path.join(tmpDir, '.anton', 'tasks-1.json');
      expect(fs.existsSync(tasksFile)).toBe(true);

      const savedData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      expect(savedData.userStories).toHaveLength(2);
    });

    it('should throw NotFoundException for non-existent story', async () => {
      await expect(
        service.deleteStory(projectId, '00000000-0000-0000-0000-000000000010', 'US-999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('editStory', () => {
    beforeEach(() => {
      mockDb.taskSets[projectId] = [createTestTaskSet(projectId)];
    });

    it('should edit a story via LLM and update the task set', async () => {
      const editedStory: UserStory = {
        id: 'US-001',
        title: 'Edited Story',
        description: 'Edited description',
        acceptanceCriteria: ['New criterion'],
        priority: 1,
        passes: false,
        notes: 'edited',
      };
      mockOpenRouterService.sendPrompt.mockResolvedValue(JSON.stringify(editedStory));

      const result = await service.editStory(
        projectId,
        '00000000-0000-0000-0000-000000000010',
        'US-001',
        'Change the title to Edited Story',
      );

      expect(result.userStories[0].title).toBe('Edited Story');
      expect(result.userStories[0].description).toBe('Edited description');
      // Other stories should remain unchanged
      expect(result.userStories[1].title).toBe('Story 2');
    });

    it('should preserve original story id and priority', async () => {
      const editedStory = {
        id: 'US-999', // should be overridden
        title: 'Edited',
        description: 'Desc',
        acceptanceCriteria: ['C1'],
        priority: 99, // should be overridden
        passes: true, // should be overridden
        notes: '',
      };
      mockOpenRouterService.sendPrompt.mockResolvedValue(JSON.stringify(editedStory));

      const result = await service.editStory(
        projectId,
        '00000000-0000-0000-0000-000000000010',
        'US-001',
        'edit it',
      );

      expect(result.userStories[0].id).toBe('US-001');
      expect(result.userStories[0].priority).toBe(1);
      expect(result.userStories[0].passes).toBe(false);
    });

    it('should throw NotFoundException for non-existent story', async () => {
      await expect(
        service.editStory(projectId, '00000000-0000-0000-0000-000000000010', 'US-999', 'edit'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when LLM returns invalid JSON', async () => {
      mockOpenRouterService.sendPrompt.mockResolvedValue('not json');

      await expect(
        service.editStory(projectId, '00000000-0000-0000-0000-000000000010', 'US-001', 'edit'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reorderStories', () => {
    beforeEach(() => {
      mockDb.taskSets[projectId] = [createTestTaskSet(projectId)];
    });

    it('should reorder stories and re-assign IDs and priorities', async () => {
      // Reverse order: US-003, US-002, US-001
      const result = await service.reorderStories(
        projectId,
        '00000000-0000-0000-0000-000000000010',
        ['US-003', 'US-002', 'US-001'],
      );

      expect(result.userStories).toHaveLength(3);
      // First story should now be the original US-003, re-numbered as US-001
      expect(result.userStories[0].id).toBe('US-001');
      expect(result.userStories[0].title).toBe('Story 3');
      expect(result.userStories[0].priority).toBe(1);

      expect(result.userStories[2].id).toBe('US-003');
      expect(result.userStories[2].title).toBe('Story 1');
      expect(result.userStories[2].priority).toBe(3);
    });

    it('should throw NotFoundException for non-existent story ID', async () => {
      await expect(
        service.reorderStories(
          projectId,
          '00000000-0000-0000-0000-000000000010',
          ['US-001', 'US-002', 'US-999'],
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when story count mismatch', async () => {
      await expect(
        service.reorderStories(
          projectId,
          '00000000-0000-0000-0000-000000000010',
          ['US-001', 'US-002'], // missing US-003
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
