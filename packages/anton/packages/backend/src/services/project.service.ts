import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Project } from '../models/project.model';
import { DatabaseService } from './database.service';
import { WorkflowStateMachineService } from './workflow-state-machine.service';

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly workflowStateMachine: WorkflowStateMachineService,
  ) {}

  /**
   * Create a new project with kebab-case name, two-letter prefix, and directory setup.
   */
  async createProject(
    displayName: string,
    description: string,
  ): Promise<Project> {
    const db = await this.databaseService.read();

    const internalName = this.generateInternalName(displayName);
    const prefix = this.generatePrefix(displayName, Object.values(db.projects));
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const projectDir = path.resolve(db.settings.projectsDir, internalName);

    // Create project directory with .anton subdirectory
    fs.mkdirSync(path.join(projectDir, '.anton'), { recursive: true });

    // Create anton.json in .anton directory
    const antonJson = {
      projectId: id,
      displayName,
      internalName,
      prefix,
      createdAt: now,
    };
    fs.writeFileSync(
      path.join(projectDir, '.anton', 'anton.json'),
      JSON.stringify(antonJson, null, 2),
      'utf-8',
    );

    const project: Project = {
      id,
      displayName,
      internalName,
      prefix,
      description,
      state: 'created',
      projectDir,
      createdAt: now,
      updatedAt: now,
    };

    // Register project in database
    await this.databaseService.update((db) => ({
      ...db,
      projects: { ...db.projects, [id]: project },
    }));

    // Initialize workflow state
    await this.workflowStateMachine.initializeState(id);

    this.logger.log(
      `Created project "${displayName}" (${internalName}) with prefix ${prefix}`,
    );

    return project;
  }

  /**
   * List all projects.
   */
  async listProjects(): Promise<Project[]> {
    const db = await this.databaseService.read();
    return Object.values(db.projects);
  }

  /**
   * Get a project by ID.
   */
  async getProject(projectId: string): Promise<Project | null> {
    const db = await this.databaseService.read();
    return db.projects[projectId] ?? null;
  }

  /**
   * Generate a kebab-case internal name with 4-digit random suffix.
   */
  generateInternalName(displayName: string): string {
    const kebab = displayName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const suffix = Math.floor(1000 + Math.random() * 9000).toString();
    return `${kebab}-${suffix}`;
  }

  /**
   * Generate a unique two-letter prefix from the display name.
   * Tries initials first, then falls back to first two letters,
   * then iterates through available combinations.
   */
  generatePrefix(
    displayName: string,
    existingProjects: Project[],
  ): string {
    const usedPrefixes = new Set(
      existingProjects.map((p) => p.prefix.toUpperCase()),
    );

    // Try initials of first two words
    const words = displayName.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const initials = (words[0][0] + words[1][0]).toUpperCase();
      if (!usedPrefixes.has(initials)) return initials;
    }

    // Try first two letters of the name
    const cleaned = displayName.replace(/[^a-zA-Z]/g, '');
    if (cleaned.length >= 2) {
      const firstTwo = cleaned.substring(0, 2).toUpperCase();
      if (!usedPrefixes.has(firstTwo)) return firstTwo;
    }

    // Fallback: iterate through AA-ZZ until we find an unused one
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const candidate = String.fromCharCode(65 + i, 65 + j);
        if (!usedPrefixes.has(candidate)) return candidate;
      }
    }

    throw new Error('No available two-letter prefix');
  }
}
