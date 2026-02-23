import { Injectable } from '@nestjs/common';
import type { PrdJson, SessionHistoryEntry } from '../types/session.types';
import type { ProgressResult } from '../types/project.types';

@Injectable()
export class FormatService {
    formatPrd(prdJson: PrdJson): string {
        const lines: string[] = [];
        lines.push(`📋 *PRD: ${prdJson.project}*`);
        lines.push(`Branch: \`${prdJson.branchName}\``);
        lines.push(prdJson.description);
        lines.push('');
        lines.push('*User Stories:*');

        for (const story of prdJson.userStories) {
            const status = story.passes ? '✅' : '⬜';
            lines.push(`${status} *${story.id}:* ${story.title}`);
            lines.push(`   _${story.description}_`);
            lines.push(`   Criteria: ${story.acceptanceCriteria?.length} items`);
            lines.push('');
        }

        return this.truncate(lines.join('\n'), 3800);
    }

    formatProgress(progress: ProgressResult): string {
        const lines: string[] = [];
        for (const story of progress.stories) {
            const icon = story.passes ? '✅' : '⬜';
            lines.push(`${icon} ${story.id}: ${story.title}`);
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

        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const time = new Date(e.timestamp).toISOString();
            const updateKeys = Object.keys(e.updates).filter((k) => k !== 'abortController');
            const updatesStr =
                updateKeys.length > 0
                    ? updateKeys
                        .map((k) => {
                            const v = (e.updates as Record<string, unknown>)[k];
                            if (typeof v === 'string' && v.length > 40) return `${k}: "${v.slice(0, 37)}..."`;
                            return `${k}: ${JSON.stringify(v)}`;
                        })
                        .join(', ')
                    : '(no changes)';

            lines.push(`*${i + 1}.* \`${time}\``);
            lines.push(
                `   Before: state=\`${e.snapshot.state}\`${e.snapshot.projectName ? `, project=${e.snapshot.projectName}` : ''}`,
            );
            lines.push(`   Updates: ${updatesStr}`);
            lines.push('');
        }

        return lines.join('\n');
    }
}
