import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectService } from './project.service';
import { DatabaseService } from './database.service';
import { WorkflowStateMachineService } from './workflow-state-machine.service';
import { Database, createDefaultDatabase } from '../models/database.model';
import { Project } from '../models/project.model';

function createTestProject(overrides: Partial<Project> = {}): Project {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    displayName: 'Existing Project',
    internalName: 'existing-project-1234',
    prefix: 'EP',
    description: 'An existing project',
    state: 'created',
    projectDir: '/tmp/existing-project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ProjectService', () => {
  let service: ProjectService;
  let mockDb: Database;
  let tmpDir: string;
  let mockDatabaseService: jest.Mocked<Pick<DatabaseService, 'read' | 'update'>>;
  let mockWorkflowStateMachine: jest.Mocked<Pick<WorkflowStateMachineService, 'initializeState'>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-service-test-'));
    mockDb = createDefaultDatabase();
    mockDb.settings.projectsDir = tmpDir;

    mockDatabaseService = {
      read: jest.fn().mockImplementation(async () => mockDb),
      update: jest.fn().mockImplementation(async (fn) => {
        mockDb = await fn(mockDb);
        return mockDb;
      }),
    };

    mockWorkflowStateMachine = {
      initializeState: jest.fn().mockResolvedValue({
        projectId: 'test',
        currentState: 'created',
        previousState: null,
        transitionedAt: new Date().toISOString(),
        transitionHistory: [],
      }),
    };

    service = new ProjectService(
      mockDatabaseService as any,
      mockWorkflowStateMachine as any,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createProject', () => {
    it('should create a project with all required fields', async () => {
      const project = await service.createProject('My Test Project', 'A test description');

      expect(project.displayName).toBe('My Test Project');
      expect(project.description).toBe('A test description');
      expect(project.state).toBe('created');
      expect(project.id).toBeDefined();
      expect(project.internalName).toMatch(/^my-test-project-\d{4}$/);
      expect(project.prefix).toBe('MT');
      expect(project.createdAt).toBeDefined();
      expect(project.updatedAt).toBeDefined();
    });

    it('should create project directory with .anton subdirectory', async () => {
      const project = await service.createProject('Dir Test', 'desc');

      expect(fs.existsSync(project.projectDir)).toBe(true);
      expect(fs.existsSync(path.join(project.projectDir, '.anton'))).toBe(true);
    });

    it('should create anton.json in .anton directory', async () => {
      const project = await service.createProject('Json Test', 'desc');

      const antonJsonPath = path.join(project.projectDir, '.anton', 'anton.json');
      expect(fs.existsSync(antonJsonPath)).toBe(true);

      const antonJson = JSON.parse(fs.readFileSync(antonJsonPath, 'utf-8'));
      expect(antonJson.projectId).toBe(project.id);
      expect(antonJson.displayName).toBe('Json Test');
      expect(antonJson.internalName).toBe(project.internalName);
      expect(antonJson.prefix).toBe(project.prefix);
    });

    it('should register project in database', async () => {
      const project = await service.createProject('DB Test', 'desc');

      expect(mockDatabaseService.update).toHaveBeenCalled();
      expect(mockDb.projects[project.id]).toBeDefined();
      expect(mockDb.projects[project.id].displayName).toBe('DB Test');
    });

    it('should initialize workflow state', async () => {
      const project = await service.createProject('Workflow Test', 'desc');

      expect(mockWorkflowStateMachine.initializeState).toHaveBeenCalledWith(project.id);
    });

    it('should avoid prefix collisions', async () => {
      // Create first project with prefix 'MT'
      await service.createProject('My Thing', 'desc');
      expect(mockDb.projects[Object.keys(mockDb.projects)[0]].prefix).toBe('MT');

      // Create second project - 'MT' is taken, should use 'MY' (first two letters)
      const project2 = await service.createProject('My Stuff', 'desc');
      expect(project2.prefix).not.toBe('MT');
    });
  });

  describe('listProjects', () => {
    it('should return empty array when no projects exist', async () => {
      const projects = await service.listProjects();
      expect(projects).toEqual([]);
    });

    it('should return all projects', async () => {
      const p1 = createTestProject({ id: '00000000-0000-0000-0000-000000000001', prefix: 'P1' });
      const p2 = createTestProject({ id: '00000000-0000-0000-0000-000000000002', prefix: 'P2', displayName: 'Second' });
      mockDb.projects = { [p1.id]: p1, [p2.id]: p2 };

      const projects = await service.listProjects();
      expect(projects).toHaveLength(2);
    });
  });

  describe('getProject', () => {
    it('should return null for non-existent project', async () => {
      const project = await service.getProject('non-existent');
      expect(project).toBeNull();
    });

    it('should return project by ID', async () => {
      const p = createTestProject();
      mockDb.projects = { [p.id]: p };

      const project = await service.getProject(p.id);
      expect(project).toBeDefined();
      expect(project!.displayName).toBe('Existing Project');
    });
  });

  describe('generateInternalName', () => {
    it('should convert to kebab-case with 4-digit suffix', () => {
      const name = service.generateInternalName('My Project');
      expect(name).toMatch(/^my-project-\d{4}$/);
    });

    it('should strip special characters', () => {
      const name = service.generateInternalName('Hello, World! (Test)');
      expect(name).toMatch(/^hello-world-test-\d{4}$/);
    });

    it('should handle single word', () => {
      const name = service.generateInternalName('Anton');
      expect(name).toMatch(/^anton-\d{4}$/);
    });

    it('should handle extra whitespace', () => {
      const name = service.generateInternalName('  Lots   Of   Spaces  ');
      expect(name).toMatch(/^lots-of-spaces-\d{4}$/);
    });
  });

  describe('generatePrefix', () => {
    it('should use initials of first two words', () => {
      const prefix = service.generatePrefix('My Project', []);
      expect(prefix).toBe('MP');
    });

    it('should use first two letters for single word', () => {
      const prefix = service.generatePrefix('Anton', []);
      expect(prefix).toBe('AN');
    });

    it('should avoid collisions with existing prefixes', () => {
      const existing = [createTestProject({ prefix: 'MP' })];
      const prefix = service.generatePrefix('My Project', existing);
      expect(prefix).not.toBe('MP');
      // Should fall back to first two letters 'MY'
      expect(prefix).toBe('MY');
    });

    it('should fall back to iterating when both strategies collide', () => {
      const existing = [
        createTestProject({ prefix: 'MP' }),
        createTestProject({ prefix: 'MY' }),
      ];
      const prefix = service.generatePrefix('My Project', existing);
      expect(prefix).not.toBe('MP');
      expect(prefix).not.toBe('MY');
      expect(prefix).toHaveLength(2);
      expect(prefix).toMatch(/^[A-Z]{2}$/);
    });
  });
});
