import type { PrdJson, SessionHistoryEntry } from "./session.js";
import type { ProgressResult } from "./ralph-project.js";

export function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export function formatPrdForTelegram(prdJson: PrdJson): string {
  const lines: string[] = [];
  lines.push(`📋 *PRD: ${prdJson.project}*`);
  lines.push(`Branch: \`${prdJson.branchName}\``);
  lines.push(`${prdJson.description}`);
  lines.push("");
  lines.push("*User Stories:*");

  for (const story of prdJson.userStories) {
    const status = story.passes ? "✅" : "⬜";
    lines.push(`${status} *${story.id}:* ${story.title}`);
    lines.push(`   _${story.description}_`);
    lines.push(`   Criteria: ${story.acceptanceCriteria.length} items`);
    lines.push("");
  }

  return lines.join("\n");
}

export function formatProgressForTelegram(progress: ProgressResult): string {
  const lines: string[] = [];
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  lines.push(`📊 *Progress: ${progress.project}*`);
  lines.push(`${progressBar(pct)} ${pct}% (${progress.done}/${progress.total} stories)`);
  lines.push("");

  for (const story of progress.stories) {
    const icon = story.passes ? "✅" : "⬜";
    lines.push(`${icon} ${story.id}: ${story.title}`);
    if (story.notes) {
      lines.push(`   📝 ${story.notes}`);
    }
  }

  if (progress.current) {
    lines.push("");
    lines.push(`🔄 *Currently working on:* ${progress.current.id}: ${progress.current.title}`);
  }

  return lines.join("\n");
}

function progressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

export function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 20) + "\n\n... (truncated)";
}

/** Format session history for debug display. */
export function formatSessionHistoryForDebug(
  history: SessionHistoryEntry[],
  maxEntries = 20
): string {
  if (history.length === 0) {
    return "No session history (session is fresh or was reset).";
  }

  const entries = history.slice(-maxEntries);
  const lines: string[] = [
    `📜 *Session State History* (${history.length} total, showing last ${entries.length})`,
    "",
  ];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const time = new Date(e.timestamp).toISOString();
    const updateKeys = Object.keys(e.updates).filter((k) => k !== "abortController");
    const updatesStr =
      updateKeys.length > 0
        ? updateKeys
            .map((k) => {
              const v = (e.updates as Record<string, unknown>)[k];
              if (typeof v === "string" && v.length > 40) return `${k}: "${v.slice(0, 37)}..."`;
              return `${k}: ${JSON.stringify(v)}`;
            })
            .join(", ")
        : "(no changes)";

    lines.push(`*${i + 1}.* \`${time}\``);
    lines.push(`   Before: state=\`${e.snapshot.state}\`${e.snapshot.projectName ? `, project=${e.snapshot.projectName}` : ""}`);
    lines.push(`   Updates: ${updatesStr}`);
    lines.push("");
  }

  return lines.join("\n");
}
