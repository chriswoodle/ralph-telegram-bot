import { Injectable, Logger } from '@nestjs/common';
import * as os from 'node:os';
import { ClaudeService } from './claude.service';
import { ResourceLoaderService } from './resource-loader.service';
import type { Conversation } from '../types/openrouter.types';
import type { PrdJson } from '../types/session.types';

@Injectable()
export class PrdService {
  private readonly logger = new Logger(PrdService.name);

  constructor(
    private readonly claude: ClaudeService,
    private readonly resourceLoader: ResourceLoaderService,
  ) {}

  private createConversation(systemPrompt: string): Conversation {
    return {
      messages: [{ role: 'system', content: systemPrompt }],
    };
  }

  private formatPrompt(conversation: Conversation, userMessage: string): string {
    const [system, ...history] = conversation.messages;
    const parts: string[] = [];

    if (system?.content) {
      parts.push(system.content);
      parts.push('');
      parts.push('---');
      parts.push('');
    }

    if (history.length > 0) {
      parts.push('# Conversation so far');
      parts.push('');
      for (const msg of history) {
        const label = msg.role === 'user' ? 'User' : 'Assistant';
        parts.push(`## ${label}`);
        parts.push('');
        parts.push(msg.content);
        parts.push('');
      }
      parts.push('---');
      parts.push('');
    }

    parts.push('# New user message');
    parts.push('');
    parts.push(userMessage);
    parts.push('');
    parts.push('---');
    parts.push('');
    parts.push(
      'Respond as the assistant following the skill instructions above. Do not use any tools, do not explore the filesystem, and do not write or read files. Output only the final assistant response as plain text — nothing else, no preamble, no trailing commentary.',
    );

    return parts.join('\n');
  }

  private async chat(
    conversation: Conversation,
    userMessage: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const prompt = this.formatPrompt(conversation, userMessage);
    this.logger.log(
      `Calling claude, ${conversation.messages.length} messages, last user msg length: ${userMessage.length}`,
    );

    const response = await this.claude.runClaude({
      prompt,
      cwd: os.tmpdir(),
      signal,
    });

    const content = response.trim();
    if (!content) {
      throw new Error('Claude returned empty response');
    }

    conversation.messages.push({ role: 'user', content: userMessage });
    conversation.messages.push({ role: 'assistant', content });

    this.logger.log(`Response length: ${content.length}`);
    return content;
  }

  async generateClarifyingQuestions(
    summary: string,
    signal?: AbortSignal,
    projectContext?: string,
  ): Promise<{ questions: string; conversation: Conversation }> {
    const skill = await this.resourceLoader.loadResource('prd-skill.md');
    const conversation = this.createConversation(skill);

    const contextBlock = projectContext
      ? `## Existing Project Context\n\nThis is a new feature for an existing project. Here's what's already built:\n\n${projectContext}\n\n---\n\n`
      : '';

    const userMessage = `${contextBlock}## User's feature description

${summary}

---

Follow Step 1 (Clarifying Questions) from the skill. Output ONLY the questions, nothing else. Make sure the output is valid markdown.`;

    const questions = await this.chat(conversation, userMessage, signal);
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

    const prd = await this.chat(conversation, userMessage, signal);
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

    const prd = await this.chat(conversation, userMessage, signal);
    return { prd, conversation };
  }

  async createConversationFromPrd(prdMarkdown: string): Promise<Conversation> {
    const skill = await this.resourceLoader.loadResource('prd-skill.md');
    const conversation = this.createConversation(skill);

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
    const conversation = this.createConversation(skill);

    const userMessage = `## PRD to convert

${prdMarkdown}

---

## Project name
${projectName}

Convert the PRD above to prd.json format. Output ONLY valid JSON, no markdown fences, no explanation.`;

    this.logger.log(`Converting PRD to JSON for project ${projectName}`);
    const output = await this.chat(conversation, userMessage, signal);

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
