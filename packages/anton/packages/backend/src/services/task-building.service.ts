import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { TaskSetEntry, UserStory } from '../models/task.model';
import { DatabaseService } from './database.service';
import { OpenRouterService } from './openrouter.service';
import { WorkflowStateMachineService } from './workflow-state-machine.service';
import { TelegramService } from './telegram.service';

@Injectable()
export class TaskBuildingService {
  private readonly logger = new Logger(TaskBuildingService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly openRouterService: OpenRouterService,
    private readonly workflowStateMachine: WorkflowStateMachineService,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Generate tasks from an approved PRD via LLM.
   * Creates a new TaskSetEntry and saves tasks-{version}.json to .anton directory.
   */
  async generateTasks(projectId: string, prdId: string): Promise<TaskSetEntry> {
    const db = await this.databaseService.read();
    const project = db.projects[projectId];
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const prdEntries = db.prdEntries[projectId] ?? [];
    const prdEntry = prdEntries.find((e) => e.id === prdId);
    if (!prdEntry) {
      throw new NotFoundException(`PRD ${prdId} not found in project ${projectId}`);
    }

    if (!prdEntry.prdMarkdown) {
      throw new BadRequestException('PRD has no content to generate tasks from');
    }

    const prompt = `You are a technical project manager. Break down the following PRD into user stories for implementation.

## PRD
{{prd_content}}

Generate a JSON array of user stories. Each story should have:
- "id": string in format "US-001", "US-002", etc.
- "title": short descriptive title
- "description": detailed description of what needs to be implemented
- "acceptanceCriteria": array of strings describing testable acceptance criteria
- "priority": integer starting from 1 (highest priority first)
- "passes": false (all start as not passing)
- "notes": empty string

Order stories by dependency and implementation priority. Earlier stories should be foundational.

Return ONLY a valid JSON array, no other text.`;

    const response = await this.openRouterService.sendPrompt(prompt, {
      prd_content: prdEntry.prdMarkdown,
    });

    let userStories: UserStory[];
    try {
      const parsed = JSON.parse(response.trim());
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }
      userStories = parsed.map((s: UserStory, i: number) => ({
        id: s.id || `US-${String(i + 1).padStart(3, '0')}`,
        title: s.title,
        description: s.description,
        acceptanceCriteria: Array.isArray(s.acceptanceCriteria) ? s.acceptanceCriteria : [],
        priority: s.priority ?? i + 1,
        passes: false,
        notes: s.notes ?? '',
      }));
    } catch {
      this.logger.error('Failed to parse task generation response');
      throw new BadRequestException('Failed to parse LLM response into user stories');
    }

    // Determine version number
    const existingEntries = db.taskSets[projectId] ?? [];
    const version = existingEntries.length + 1;

    const now = new Date().toISOString();
    const taskSetEntry: TaskSetEntry = {
      id: crypto.randomUUID(),
      projectId,
      prdId,
      version,
      userStories,
      createdAt: now,
    };

    // Save to database
    await this.databaseService.update((db) => {
      const existing = db.taskSets[projectId] ?? [];
      return {
        ...db,
        taskSets: {
          ...db.taskSets,
          [projectId]: [...existing, taskSetEntry],
        },
      };
    });

    // Save tasks-{version}.json to .anton directory
    this.saveTasksFile(project.projectDir, version, taskSetEntry);

    // Transition workflow state
    await this.workflowStateMachine.transition(projectId, 'tasks_generated', 'task-building-service');

    await this.telegramService.notifyTaskGenerationDone(
      project.displayName,
      userStories.length,
    );

    this.logger.log(`Generated ${userStories.length} user stories for project ${projectId}, version ${version}`);
    return taskSetEntry;
  }

  /**
   * Get a task set entry by project ID and task set ID.
   */
  async getTaskSet(projectId: string, taskSetId: string): Promise<TaskSetEntry> {
    const db = await this.databaseService.read();
    const entries = db.taskSets[projectId] ?? [];
    const entry = entries.find((e) => e.id === taskSetId);
    if (!entry) {
      throw new NotFoundException(`TaskSet ${taskSetId} not found in project ${projectId}`);
    }
    return entry;
  }

  /**
   * Get the latest task set for a project.
   */
  async getLatestTaskSet(projectId: string): Promise<TaskSetEntry> {
    const db = await this.databaseService.read();
    const entries = db.taskSets[projectId] ?? [];
    if (entries.length === 0) {
      throw new NotFoundException(`No task sets found for project ${projectId}`);
    }
    return entries[entries.length - 1];
  }

  /**
   * List all task sets for a project.
   */
  async listTaskSets(projectId: string): Promise<TaskSetEntry[]> {
    const db = await this.databaseService.read();
    return db.taskSets[projectId] ?? [];
  }

  /**
   * Delete a user story from a task set and re-number remaining story IDs.
   */
  async deleteStory(
    projectId: string,
    taskSetId: string,
    storyId: string,
  ): Promise<TaskSetEntry> {
    return this.updateTaskSetEntry(projectId, taskSetId, (entry) => {
      const storyIndex = entry.userStories.findIndex((s) => s.id === storyId);
      if (storyIndex === -1) {
        throw new NotFoundException(`Story ${storyId} not found in task set ${taskSetId}`);
      }

      const updatedStories = entry.userStories
        .filter((s) => s.id !== storyId)
        .map((s, i) => ({
          ...s,
          id: `US-${String(i + 1).padStart(3, '0')}`,
          priority: i + 1,
        }));

      return {
        ...entry,
        userStories: updatedStories,
      };
    });
  }

  /**
   * Edit a user story via LLM prompt. Sends the current story and modification request to LLM.
   */
  async editStory(
    projectId: string,
    taskSetId: string,
    storyId: string,
    editPrompt: string,
  ): Promise<TaskSetEntry> {
    const entry = await this.getTaskSet(projectId, taskSetId);
    const story = entry.userStories.find((s) => s.id === storyId);
    if (!story) {
      throw new NotFoundException(`Story ${storyId} not found in task set ${taskSetId}`);
    }

    const prompt = `You are a technical project manager. Modify the following user story based on the given instructions.

## Current User Story
${JSON.stringify(story, null, 2)}

## Modification Instructions
{{edit_instructions}}

Return ONLY the modified user story as a JSON object with the same fields (id, title, description, acceptanceCriteria, priority, passes, notes). Keep the same id and priority. Return ONLY valid JSON, no other text.`;

    const response = await this.openRouterService.sendPrompt(prompt, {
      edit_instructions: editPrompt,
    });

    let updatedStory: UserStory;
    try {
      const parsed = JSON.parse(response.trim());
      updatedStory = {
        id: story.id,
        title: parsed.title ?? story.title,
        description: parsed.description ?? story.description,
        acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria)
          ? parsed.acceptanceCriteria
          : story.acceptanceCriteria,
        priority: story.priority,
        passes: story.passes,
        notes: parsed.notes ?? story.notes ?? '',
      };
    } catch {
      this.logger.error('Failed to parse edit story response');
      throw new BadRequestException('Failed to parse LLM response for story edit');
    }

    return this.updateTaskSetEntry(projectId, taskSetId, (entry) => {
      const updatedStories = entry.userStories.map((s) =>
        s.id === storyId ? updatedStory : s,
      );
      return {
        ...entry,
        userStories: updatedStories,
      };
    });
  }

  /**
   * Reorder stories after deletion or manual reorder.
   * Re-assigns IDs (US-001, US-002, ...) and priorities based on array order.
   */
  async reorderStories(
    projectId: string,
    taskSetId: string,
    storyIds: string[],
  ): Promise<TaskSetEntry> {
    return this.updateTaskSetEntry(projectId, taskSetId, (entry) => {
      // Validate that all provided story IDs exist
      const storyMap = new Map(entry.userStories.map((s) => [s.id, s]));
      for (const id of storyIds) {
        if (!storyMap.has(id)) {
          throw new NotFoundException(`Story ${id} not found in task set ${taskSetId}`);
        }
      }

      if (storyIds.length !== entry.userStories.length) {
        throw new BadRequestException(
          `Expected ${entry.userStories.length} story IDs, got ${storyIds.length}`,
        );
      }

      const reorderedStories = storyIds.map((id, i) => ({
        ...storyMap.get(id)!,
        id: `US-${String(i + 1).padStart(3, '0')}`,
        priority: i + 1,
      }));

      return {
        ...entry,
        userStories: reorderedStories,
      };
    });
  }

  /**
   * Save tasks file to .anton directory.
   */
  private saveTasksFile(projectDir: string, version: number, entry: TaskSetEntry): void {
    const antonDir = path.join(projectDir, '.anton');
    fs.mkdirSync(antonDir, { recursive: true });
    const filePath = path.join(antonDir, `tasks-${version}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    this.logger.log(`Saved tasks file to ${filePath}`);
  }

  /**
   * Helper to update a TaskSetEntry within the database atomically.
   * Also saves updated tasks file to .anton directory.
   */
  private async updateTaskSetEntry(
    projectId: string,
    taskSetId: string,
    updater: (entry: TaskSetEntry) => TaskSetEntry,
  ): Promise<TaskSetEntry> {
    let updatedEntry: TaskSetEntry | undefined;

    await this.databaseService.update((db) => {
      const entries = db.taskSets[projectId] ?? [];
      const index = entries.findIndex((e) => e.id === taskSetId);
      if (index === -1) {
        throw new NotFoundException(`TaskSet ${taskSetId} not found in project ${projectId}`);
      }

      updatedEntry = updater(entries[index]);
      const updatedEntries = [...entries];
      updatedEntries[index] = updatedEntry;

      return {
        ...db,
        taskSets: {
          ...db.taskSets,
          [projectId]: updatedEntries,
        },
      };
    });

    // Save updated tasks file
    const db = await this.databaseService.read();
    const project = db.projects[projectId];
    if (project && updatedEntry) {
      this.saveTasksFile(project.projectDir, updatedEntry.version, updatedEntry);
    }

    return updatedEntry!;
  }
}
