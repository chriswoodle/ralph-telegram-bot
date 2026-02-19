import { Injectable } from '@nestjs/common';
import type { PrdJson, SessionHistoryEntry } from '../types/session.types';
import type { ProgressResult } from '../types/project.types';

@Injectable()
export class FormatService {
    escapeMarkdownV2(text: string): string {
        return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    }

    formatPrdForTelegram(prdJson: PrdJson): string {
        const lines: string[] = [];
        const esc = (s: string) => this.escapeMarkdownV2(s);
        lines.push(`📋 *PRD: ${esc(prdJson.project)}*`);
        lines.push(`Branch: \`${esc(prdJson.branchName)}\``);
        lines.push(esc(prdJson.description));
        lines.push('');
        lines.push('*User Stories:*');

        for (const story of prdJson.userStories) {
            const status = story.passes ? '✅' : '⬜';
            lines.push(`${status} *${esc(story.id)}:* ${esc(story.title)}`);
            lines.push(`   _${esc(story.description)}_`);
            lines.push(`   Criteria: ${story.acceptanceCriteria.length} items`);
            lines.push('');
        }

        return lines.join('\n');
    }

    formatProgressForTelegram(progress: ProgressResult): string {
        const lines: string[] = [];
        const esc = (s: string) => this.escapeMarkdownV2(s);
        for (const story of progress.stories) {
            const icon = story.passes ? '✅' : '⬜';
            lines.push(`${icon} ${esc(story.id)}: ${esc(story.title)}`);
        }
        return lines.join('\n');
    }

    truncate(text: string, max = 4000): string {
        if (text.length <= max) return text;
        return text.slice(0, max - 20) + '\n\n... (truncated)';
    }

    formatSessionHistoryForDebug(
        history: SessionHistoryEntry[],
        maxEntries = 20,
    ): string {
        if (history.length === 0) {
            return 'No session history (session is fresh or was reset).';
        }

        const entries = history.slice(-maxEntries);
        const lines: string[] = [
            `📜 *Session State History* (${history.length} total, showing last ${entries.length})`,
            '',
        ];

        const esc = (s: string) => this.escapeMarkdownV2(s);
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const time = new Date(e.timestamp).toISOString();
            const updateKeys = Object.keys(e.updates).filter((k) => k !== 'abortController');
            const updatesStr =
                updateKeys.length > 0
                    ? updateKeys
                        .map((k) => {
                            const v = (e.updates as Record<string, unknown>)[k];
                            if (typeof v === 'string' && v.length > 40) return `${esc(k)}: "${esc(v.slice(0, 37))}..."`;
                            return `${esc(k)}: ${esc(JSON.stringify(v))}`;
                        })
                        .join(', ')
                    : '(no changes)';

            lines.push(`*${i + 1}.* \`${esc(time)}\``);
            lines.push(
                `   Before: state=\`${esc(e.snapshot.state)}\`${e.snapshot.projectName ? `, project=${esc(e.snapshot.projectName)}` : ''}`,
            );
            lines.push(`   Updates: ${updatesStr}`);
            lines.push('');
        }

        return lines.join('\n');
    }

    private progressBar(percent: number): string {
        const filled = Math.round(percent / 10);
        const empty = 10 - filled;
        return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
    }
}
