import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  Database,
  DatabaseSchema,
  createDefaultDatabase,
} from '../models/database.model';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private dbPath: string;
  private mutex: Promise<void> = Promise.resolve();

  constructor(private readonly configService: ConfigService) {
    this.dbPath =
      this.configService.get<string>('DB_PATH') ?? './anton-db.json';
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDatabase();
  }

  async read(): Promise<Database> {
    return this.withLock(async () => {
      return this.readUnsafe();
    });
  }

  async write(data: Database): Promise<void> {
    return this.withLock(async () => {
      this.validate(data);
      await this.writeAtomic(data);
    });
  }

  async update(fn: (db: Database) => Database | Promise<Database>): Promise<Database> {
    return this.withLock(async () => {
      const current = await this.readUnsafe();
      const updated = await fn(current);
      this.validate(updated);
      await this.writeAtomic(updated);
      return updated;
    });
  }

  private async ensureDatabase(): Promise<void> {
    return this.withLock(async () => {
      const resolvedPath = path.resolve(this.dbPath);
      if (!fs.existsSync(resolvedPath)) {
        const dir = path.dirname(resolvedPath);
        fs.mkdirSync(dir, { recursive: true });
        await this.writeAtomic(createDefaultDatabase());
      }
    });
  }

  private async readUnsafe(): Promise<Database> {
    const resolvedPath = path.resolve(this.dbPath);
    if (!fs.existsSync(resolvedPath)) {
      const defaultDb = createDefaultDatabase();
      await this.writeAtomic(defaultDb);
      return defaultDb;
    }
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return DatabaseSchema.parse(parsed);
  }

  private validate(data: Database): void {
    DatabaseSchema.parse(data);
  }

  private async writeAtomic(data: Database): Promise<void> {
    const resolvedPath = path.resolve(this.dbPath);
    const dir = path.dirname(resolvedPath);
    const tmpFile = path.join(
      dir,
      `.anton-db-${crypto.randomBytes(8).toString('hex')}.tmp`,
    );

    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');

    try {
      fs.renameSync(tmpFile, resolvedPath);
    } catch {
      // Clean up temp file on rename failure
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(`Failed to atomically write database to ${resolvedPath}`);
    }
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.mutex = this.mutex
        .then(() => fn())
        .then(resolve)
        .catch(reject);
    });
  }
}
