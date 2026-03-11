import { Injectable, Logger } from '@nestjs/common';
import { OpenRouterService } from './openrouter.service';
import { ResourceLoaderService } from './resource-loader.service';
import type { Conversation } from '../types/openrouter.types';
import type { PrdJson } from '../types/session.types';

@Injectable()
export class PrdService {
  private readonly logger = new Logger(PrdService.name);

  constructor(
    private readonly openRouter: OpenRouterService,
    private readonly resourceLoader: ResourceLoaderService,
  ) {}

  async generateClarifyingQuestions(
    summary: string,
    signal?: AbortSignal,
    projectContext?: string,
  ): Promise<{ questions: string; conversation: Conversation }> {
    const skill = await this.resourceLoader.loadResource('prd-skill.md');
    const conversation = this.openRouter.createConversation(skill);

    const contextBlock = projectContext
      ? `## Existing Project Context\n\nThis is a new feature for an existing project. Here's what's already built:\n\n${projectContext}\n\n---\n\n`
      : '';

    const userMessage = `${contextBlock}## User's feature description

${summary}

---

Follow Step 1 (Clarifying Questions) from the skill. Output ONLY the questions, nothing else. Make sure the output is valid markdown.`;

    const questions = await this.openRouter.chat(conversation, userMessage, signal);
    return { questions, conversation };
  }

  async generatePrd(
    conversation: Conversation,
    answers: string,
    projectName: string,
    signal?: AbortSignal,
  ): Promise<{ prd: string; conversation: Conversation }> {
    const userMessage = `## User's Answers
${answers}

---

Follow Step 2 (PRD Structure) from the skill. Title the PRD: "PRD: ${projectName}". Output ONLY the markdown PRD, nothing else.`;

    const prd = await this.openRouter.chat(conversation, userMessage, signal);
    return { prd, conversation };
  }

  async modifyPrd(
    conversation: Conversation,
    modification: string,
    signal?: AbortSignal,
  ): Promise<{ prd: string; conversation: Conversation }> {
    const userMessage = `## Modification Request

${modification}

---

Apply the requested modifications to the PRD. Output ONLY the full updated markdown PRD, nothing else.`;

    const prd = await this.openRouter.chat(conversation, userMessage, signal);
    return { prd, conversation };
  }

  async createConversationFromPrd(prdMarkdown: string): Promise<Conversation> {
    const skill = await this.resourceLoader.loadResource('prd-skill.md');
    const conversation = this.openRouter.createConversation(skill);

    conversation.messages.push(
      { role: 'user', content: 'The user has uploaded a PRD document directly. Here is the content.' },
      { role: 'assistant', content: prdMarkdown },
    );

    return conversation;
  }

  async convertPrdToJson(
    prdMarkdown: string,
    projectName: string,
    signal?: AbortSignal,
  ): Promise<PrdJson> {
    const skill = await this.resourceLoader.loadResource('ralph-skill.md');
    const conversation = this.openRouter.createConversation(skill);

    const userMessage = `## PRD to convert

${prdMarkdown}

---

## Project name
${projectName}

Convert the PRD above to prd.json format. Output ONLY valid JSON, no markdown fences, no explanation.`;

    this.logger.log(`Converting PRD to JSON for project ${projectName}`);
    const output = await this.openRouter.chat(conversation, userMessage, signal);

    let jsonStr = output.trim();

    // Extract JSON from markdown fences if present (handles extra text around fences)
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // As a last resort, try to extract a JSON object from the output
    if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
      const objectMatch = jsonStr.match(/(\{[\s\S]*\})/);
      if (objectMatch) {
        jsonStr = objectMatch[1];
      }
    }

    try {
      return JSON.parse(jsonStr) as PrdJson;
    } catch (e) {
      this.logger.error(`Failed to parse LLM output as JSON. Raw output:\n${output.substring(0, 500)}`);
      throw new Error('LLM returned invalid JSON. Please try again.');
    }
  }
}
