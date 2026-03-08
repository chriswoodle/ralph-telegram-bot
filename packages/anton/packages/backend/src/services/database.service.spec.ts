import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseService } from './database.service';
import { Database, createDefaultDatabase } from '../models/database.model';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-db-test-'));
    dbPath = path.join(tmpDir, 'test-db.json');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'DB_PATH' ? dbPath : undefined),
          },
        },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    await service.onModuleInit();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('auto-creation', () => {
    it('should create the database file with default structure on init', () => {
      expect(fs.existsSync(dbPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      expect(data.version).toBe(1);
      expect(data.projects).toEqual({});
      expect(data.settings).toBeDefined();
      expect(data.settings.projectsDir).toBe('./projects');
    });
  });

  describe('read', () => {
    it('should read the database file and return parsed data', async () => {
      const db = await service.read();
      expect(db.version).toBe(1);
      expect(db.projects).toEqual({});
      expect(db.settings.openRouterApiKey).toBe('');
    });

    it('should validate the data against the schema', async () => {
      // Write invalid data directly to the file
      fs.writeFileSync(dbPath, JSON.stringify({ invalid: true }), 'utf-8');
      await expect(service.read()).rejects.toThrow();
    });
  });

  describe('write', () => {
    it('should write data atomically', async () => {
      const data = createDefaultDatabase();
      data.settings.openRouterApiKey = 'test-key';
      await service.write(data);

      const raw = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      expect(raw.settings.openRouterApiKey).toBe('test-key');
    });

    it('should validate data before writing', async () => {
      const invalidData = { version: 2, projects: {} } as unknown as Database;
      await expect(service.write(invalidData)).rejects.toThrow();
    });

    it('should not leave temp files on successful write', async () => {
      const data = createDefaultDatabase();
      await service.write(data);

      const files = fs.readdirSync(tmpDir);
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should perform atomic read-modify-write', async () => {
      const result = await service.update((db) => ({
        ...db,
        settings: {
          ...db.settings,
          openRouterApiKey: 'updated-key',
        },
      }));

      expect(result.settings.openRouterApiKey).toBe('updated-key');

      const raw = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      expect(raw.settings.openRouterApiKey).toBe('updated-key');
    });

    it('should support async update functions', async () => {
      const result = await service.update(async (db) => {
        await new Promise((r) => setTimeout(r, 10));
        return {
          ...db,
          projects: { ...db.projects, 'test-project': { name: 'test' } },
        };
      });

      expect(result.projects['test-project']).toEqual({ name: 'test' });
    });

    it('should reject invalid updates', async () => {
      await expect(
        service.update(() => ({ version: 2, projects: {} }) as unknown as Database),
      ).rejects.toThrow();
    });
  });

  describe('concurrent access safety', () => {
    it('should serialize concurrent updates', async () => {
      const updates = Array.from({ length: 10 }, (_, i) =>
        service.update((db) => ({
          ...db,
          projects: {
            ...db.projects,
            [`project-${i}`]: { index: i },
          },
        })),
      );

      await Promise.all(updates);

      const db = await service.read();
      const projectKeys = Object.keys(db.projects);
      expect(projectKeys).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(db.projects[`project-${i}`]).toEqual({ index: i });
      }
    });

    it('should not corrupt data with concurrent reads and writes', async () => {
      const operations: Promise<unknown>[] = [];

      for (let i = 0; i < 5; i++) {
        operations.push(
          service.update((db) => ({
            ...db,
            projects: {
              ...db.projects,
              [`project-${i}`]: { index: i },
            },
          })),
        );
        operations.push(service.read());
      }

      await Promise.all(operations);

      const finalDb = await service.read();
      expect(finalDb.version).toBe(1);
      expect(typeof finalDb.projects).toBe('object');
    });
  });

  describe('schema validation', () => {
    it('should accept valid database structure', async () => {
      const data = createDefaultDatabase();
      await expect(service.write(data)).resolves.not.toThrow();
    });

    it('should reject database with wrong version', async () => {
      const data = { ...createDefaultDatabase(), version: 2 } as unknown as Database;
      await expect(service.write(data)).rejects.toThrow();
    });

    it('should reject database with missing settings', async () => {
      const data = { version: 1, projects: {} } as unknown as Database;
      await expect(service.write(data)).rejects.toThrow();
    });
  });
});
