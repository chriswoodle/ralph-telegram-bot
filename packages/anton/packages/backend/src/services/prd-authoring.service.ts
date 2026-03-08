import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrdEntry, PrdAsset, ClarifyingQuestion } from '../models/prd.model';
import { DatabaseService } from './database.service';
import { OpenRouterService } from './openrouter.service';
import { WorkflowStateMachineService } from './workflow-state-machine.service';
import { TelegramService } from './telegram.service';

@Injectable()
export class PrdAuthoringService {
  private readonly logger = new Logger(PrdAuthoringService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly openRouterService: OpenRouterService,
    private readonly workflowStateMachine: WorkflowStateMachineService,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Start PRD authoring for a project. Transitions workflow to prd_authoring.
   */
  async startAuthoring(projectId: string): Promise<PrdEntry> {
    const db = await this.databaseService.read();
    const project = db.projects[projectId];
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    await this.workflowStateMachine.transition(projectId, 'prd_authoring', 'prd-authoring-service');

    const now = new Date().toISOString();
    const prdEntry: PrdEntry = {
      id: crypto.randomUUID(),
      projectId,
      state: 'authoring',
      input: { text: '', assets: [] },
      clarifyingQuestions: [],
      prdMarkdown: null,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
    };

    await this.databaseService.update((db) => {
      const existing = db.prdEntries[projectId] ?? [];
      return {
        ...db,
        prdEntries: {
          ...db.prdEntries,
          [projectId]: [...existing, prdEntry],
        },
      };
    });

    this.logger.log(`Started PRD authoring for project ${projectId}, PRD ${prdEntry.id}`);
    return prdEntry;
  }

  /**
   * Submit input text and assets for a PRD entry.
   */
  async submitInput(
    projectId: string,
    prdId: string,
    text: string,
    assets: PrdAsset[],
  ): Promise<PrdEntry> {
    return this.updatePrdEntry(projectId, prdId, (entry) => {
      if (entry.state !== 'authoring') {
        throw new BadRequestException(`PRD is in state "${entry.state}", expected "authoring"`);
      }
      return {
        ...entry,
        input: { text, assets },
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Generate clarifying questions via OpenRouter LLM.
   * Transitions PRD state to questions_pending.
   */
  async generateClarifyingQuestions(
    projectId: string,
    prdId: string,
  ): Promise<ClarifyingQuestion[]> {
    const entry = await this.getPrdEntry(projectId, prdId);
    if (entry.state !== 'authoring') {
      throw new BadRequestException(`PRD is in state "${entry.state}", expected "authoring"`);
    }

    if (!entry.input.text.trim()) {
      throw new BadRequestException('PRD input text is empty');
    }

    const prompt = `You are a product manager helping to create a Product Requirements Document (PRD).

Given the following project description and requirements, generate 3-5 clarifying questions that would help create a more comprehensive PRD. Focus on areas that are ambiguous, missing, or need more detail.

Requirements:
{{input}}

Respond with a JSON array of objects, each with a "question" field. Example:
[{"question": "What is the target user persona?"}, {"question": "What are the performance requirements?"}]

Return ONLY the JSON array, no other text.`;

    const response = await this.openRouterService.sendPrompt(prompt, {
      input: entry.input.text,
    });

    let questions: ClarifyingQuestion[];
    try {
      const parsed = JSON.parse(response.trim());
      questions = Array.isArray(parsed)
        ? parsed.map((q: { question: string }) => ({ question: q.question }))
        : [];
    } catch {
      this.logger.warn('Failed to parse clarifying questions response, using fallback');
      questions = [{ question: 'Could you provide more details about the requirements?' }];
    }

    await this.workflowStateMachine.transition(projectId, 'prd_questions', 'prd-authoring-service');

    await this.updatePrdEntry(projectId, prdId, (entry) => ({
      ...entry,
      state: 'questions_pending',
      clarifyingQuestions: questions,
      updatedAt: new Date().toISOString(),
    }));

    const db2 = await this.databaseService.read();
    const projectName = db2.projects[projectId]?.displayName ?? projectId;
    await this.telegramService.notifyPrdQuestionsReady(projectName, questions.length);

    this.logger.log(`Generated ${questions.length} clarifying questions for PRD ${prdId}`);
    return questions;
  }

  /**
   * Submit answers to clarifying questions.
   */
  async answerQuestions(
    projectId: string,
    prdId: string,
    answers: Array<{ question: string; answer: string }>,
  ): Promise<PrdEntry> {
    return this.updatePrdEntry(projectId, prdId, (entry) => {
      if (entry.state !== 'questions_pending') {
        throw new BadRequestException(`PRD is in state "${entry.state}", expected "questions_pending"`);
      }

      const updatedQuestions = entry.clarifyingQuestions.map((q) => {
        const answerEntry = answers.find((a) => a.question === q.question);
        return answerEntry ? { ...q, answer: answerEntry.answer } : q;
      });

      return {
        ...entry,
        clarifyingQuestions: updatedQuestions,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Generate the PRD markdown from input and answers, then transition to review.
   */
  async generatePrd(
    projectId: string,
    prdId: string,
  ): Promise<PrdEntry> {
    const entry = await this.getPrdEntry(projectId, prdId);
    if (entry.state !== 'questions_pending') {
      throw new BadRequestException(`PRD is in state "${entry.state}", expected "questions_pending"`);
    }

    const qaPairs = entry.clarifyingQuestions
      .filter((q) => q.answer)
      .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
      .join('\n\n');

    const prompt = `You are a product manager. Create a comprehensive Product Requirements Document (PRD) in Markdown format.

Based on the following requirements and clarifying answers, generate a well-structured PRD.

## Requirements
{{input}}

## Clarifying Questions & Answers
{{qa_pairs}}

Generate a complete PRD with the following sections:
- Overview
- Goals & Objectives
- User Stories
- Requirements (Functional & Non-functional)
- Technical Considerations
- Success Metrics
- Out of Scope

Return ONLY the Markdown content.`;

    const prdMarkdown = await this.openRouterService.sendPrompt(prompt, {
      input: entry.input.text,
      qa_pairs: qaPairs || 'No clarifying questions were answered.',
    });

    await this.workflowStateMachine.transition(projectId, 'prd_review', 'prd-authoring-service');

    return this.updatePrdEntry(projectId, prdId, (entry) => ({
      ...entry,
      state: 'review_pending',
      prdMarkdown,
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Modify the PRD based on feedback. Regenerates via LLM and stays in review state.
   */
  async modifyPrd(
    projectId: string,
    prdId: string,
    modificationRequest: string,
  ): Promise<PrdEntry> {
    const entry = await this.getPrdEntry(projectId, prdId);
    if (entry.state !== 'review_pending') {
      throw new BadRequestException(`PRD is in state "${entry.state}", expected "review_pending"`);
    }

    if (!entry.prdMarkdown) {
      throw new BadRequestException('No PRD content to modify');
    }

    const prompt = `You are a product manager. Modify the following PRD based on the given feedback.

## Current PRD
{{current_prd}}

## Modification Request
{{modification}}

Return the COMPLETE updated PRD in Markdown format. Return ONLY the Markdown content.`;

    const updatedMarkdown = await this.openRouterService.sendPrompt(prompt, {
      current_prd: entry.prdMarkdown,
      modification: modificationRequest,
    });

    return this.updatePrdEntry(projectId, prdId, (entry) => ({
      ...entry,
      prdMarkdown: updatedMarkdown,
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Approve the PRD. Saves markdown to .anton directory.
   */
  async approvePrd(
    projectId: string,
    prdId: string,
  ): Promise<PrdEntry> {
    const entry = await this.getPrdEntry(projectId, prdId);
    if (entry.state !== 'review_pending') {
      throw new BadRequestException(`PRD is in state "${entry.state}", expected "review_pending"`);
    }

    if (!entry.prdMarkdown) {
      throw new BadRequestException('No PRD content to approve');
    }

    // Save PRD markdown to project .anton directory
    const db = await this.databaseService.read();
    const project = db.projects[projectId];
    if (project) {
      const antonDir = path.join(project.projectDir, '.anton');
      fs.mkdirSync(antonDir, { recursive: true });
      const prdFileName = `prd-${prdId}.md`;
      fs.writeFileSync(
        path.join(antonDir, prdFileName),
        entry.prdMarkdown,
        'utf-8',
      );
      this.logger.log(`Saved PRD markdown to ${path.join(antonDir, prdFileName)}`);
    }

    const now = new Date().toISOString();
    return this.updatePrdEntry(projectId, prdId, (entry) => ({
      ...entry,
      state: 'approved',
      approvedAt: now,
      updatedAt: now,
    }));
  }

  /**
   * Cancel the PRD authoring process.
   */
  async cancelPrd(
    projectId: string,
    prdId: string,
  ): Promise<PrdEntry> {
    return this.updatePrdEntry(projectId, prdId, (entry) => {
      if (entry.state === 'approved' || entry.state === 'cancelled') {
        throw new BadRequestException(`Cannot cancel PRD in state "${entry.state}"`);
      }
      return {
        ...entry,
        state: 'cancelled',
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * List all PRD entries for a project.
   */
  async listPrds(projectId: string): Promise<PrdEntry[]> {
    const db = await this.databaseService.read();
    return db.prdEntries[projectId] ?? [];
  }

  /**
   * Get a specific PRD entry.
   */
  async getPrdEntry(projectId: string, prdId: string): Promise<PrdEntry> {
    const db = await this.databaseService.read();
    const entries = db.prdEntries[projectId] ?? [];
    const entry = entries.find((e) => e.id === prdId);
    if (!entry) {
      throw new NotFoundException(`PRD ${prdId} not found in project ${projectId}`);
    }
    return entry;
  }

  /**
   * Upload an asset file for a PRD. Stores the file in the project's .anton/assets directory.
   */
  async uploadAsset(
    projectId: string,
    prdId: string,
    fileName: string,
    fileBuffer: Buffer,
    mimeType?: string,
  ): Promise<PrdAsset> {
    const entry = await this.getPrdEntry(projectId, prdId);
    if (entry.state !== 'authoring') {
      throw new BadRequestException(`PRD is in state "${entry.state}", expected "authoring"`);
    }

    const db = await this.databaseService.read();
    const project = db.projects[projectId];
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const assetsDir = path.join(project.projectDir, '.anton', 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });

    // Add unique prefix to avoid filename collisions
    const uniqueName = `${crypto.randomBytes(4).toString('hex')}-${fileName}`;
    const filePath = path.join(assetsDir, uniqueName);
    fs.writeFileSync(filePath, fileBuffer);

    const asset: PrdAsset = {
      fileName,
      filePath,
      ...(mimeType && { mimeType }),
    };

    await this.updatePrdEntry(projectId, prdId, (entry) => ({
      ...entry,
      input: {
        ...entry.input,
        assets: [...entry.input.assets, asset],
      },
      updatedAt: new Date().toISOString(),
    }));

    this.logger.log(`Uploaded asset "${fileName}" for PRD ${prdId}`);
    return asset;
  }

  /**
   * Helper to update a PRD entry within the database atomically.
   */
  private async updatePrdEntry(
    projectId: string,
    prdId: string,
    updater: (entry: PrdEntry) => PrdEntry,
  ): Promise<PrdEntry> {
    let updatedEntry: PrdEntry | undefined;

    await this.databaseService.update((db) => {
      const entries = db.prdEntries[projectId] ?? [];
      const index = entries.findIndex((e) => e.id === prdId);
      if (index === -1) {
        throw new NotFoundException(`PRD ${prdId} not found in project ${projectId}`);
      }

      updatedEntry = updater(entries[index]);
      const updatedEntries = [...entries];
      updatedEntries[index] = updatedEntry;

      return {
        ...db,
        prdEntries: {
          ...db.prdEntries,
          [projectId]: updatedEntries,
        },
      };
    });

    return updatedEntry!;
  }
}
