import { createConversation, chat } from "./openrouter.js";
import type { Conversation } from "./openrouter.js";
import type { PrdJson } from "./session.js";
import { loadResource } from "../utils/load-skill.js";

export async function generateClarifyingQuestions(
    summary: string,
    _cwd: string,
    signal?: AbortSignal,
    projectContext?: string
): Promise<{ questions: string; conversation: Conversation }> {
    const skill = await loadResource("prd-skill.md");
    const conversation = createConversation(skill);

    const contextBlock = projectContext
        ? `## Existing Project Context\n\nThis is a new feature for an existing project. Here's what's already built:\n\n${projectContext}\n\n---\n\n`
        : "";

    const userMessage = `${contextBlock}## User's feature description

${summary}

---

Follow Step 1 (Clarifying Questions) from the skill. Output ONLY the questions, nothing else.`;

    const questions = await chat(conversation, userMessage, signal);
    return { questions, conversation };
}

export async function generatePrd(
    conversation: Conversation,
    answers: string,
    projectName: string,
    signal?: AbortSignal
): Promise<{ prd: string; conversation: Conversation }> {
    const userMessage = `## User's Answers
${answers}

---

Follow Step 2 (PRD Structure) from the skill. Title the PRD: "PRD: ${projectName}". Output ONLY the markdown PRD, nothing else.`;

    const prd = await chat(conversation, userMessage, signal);
    return { prd, conversation };
}

export async function modifyPrd(
    conversation: Conversation,
    modification: string,
    signal?: AbortSignal
): Promise<{ prd: string; conversation: Conversation }> {
    const userMessage = `## Modification Request

${modification}

---

Apply the requested modifications to the PRD. Output ONLY the full updated markdown PRD, nothing else.`;

    const prd = await chat(conversation, userMessage, signal);
    return { prd, conversation };
}

export async function convertPrdToJson(
    prdMarkdown: string,
    projectName: string,
    _cwd: string,
    signal?: AbortSignal
): Promise<PrdJson> {
    const skill = await loadResource("ralph-skill.md");
    const conversation = createConversation(skill);

    const userMessage = `## PRD to convert

${prdMarkdown}

---

## Project name
${projectName}

Convert the PRD above to prd.json format. Output ONLY valid JSON, no markdown fences, no explanation.`;

    console.log(`[prd] Converting PRD to JSON for project ${projectName}`);
    const output = await chat(conversation, userMessage, signal);

    let jsonStr = output.trim();

    if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    return JSON.parse(jsonStr) as PrdJson;
}
