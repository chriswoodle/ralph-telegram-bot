import { env } from "../env.js";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Conversation {
  messages: Message[];
}

export function createConversation(systemPrompt: string): Conversation {
  return {
    messages: [{ role: "system", content: systemPrompt }],
  };
}

export async function chat(
  conversation: Conversation,
  userMessage: string,
  signal?: AbortSignal
): Promise<string> {
  conversation.messages.push({ role: "user", content: userMessage });

  const model = env.OPENROUTER_MODEL;
  console.log(
    `[openrouter] Calling ${model}, ${conversation.messages.length} messages, last user msg length: ${userMessage.length}`
  );

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: conversation.messages,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter API error ${res.status}: ${res.statusText} — ${body}`
    );
  }

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned empty response");
  }

  console.log(`[openrouter] Response length: ${content.length}`);
  conversation.messages.push({ role: "assistant", content });

  return content;
}
