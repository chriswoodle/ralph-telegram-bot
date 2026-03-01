import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, writeFileSync } from 'node:fs';
import type { AppConfig } from '../config';
import {
  State,
  type Session,
  type PersistedSession,
  type SessionSnapshot,
  type SessionHistoryEntry,
} from '../types/session.types';

const MAX_HISTORY_ENTRIES = 100;

@Injectable()
export class SessionService implements OnModuleInit {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<number, Session>();
  private readonly sessionHistory = new Map<number, SessionHistoryEntry[]>();

  constructor(private readonly configService: ConfigService<AppConfig>) {}

  onModuleInit() {
    const restored = this.loadSessions();
    if (restored > 0) {
      this.logger.log(`Restored ${restored} session(s) from disk`);
    }
  }

  getSession(userId: number): Session {
    if (!this.sessions.has(userId)) {
      this.logger.log(`New session for user ${userId}`);
      this.sessions.set(userId, this.createFreshSession());
    }
    return this.sessions.get(userId)!;
  }

  updateSession(userId: number, updates: Partial<Session>): void {
    const session = this.getSession(userId);
    const entry: SessionHistoryEntry = {
      timestamp: Date.now(),
      updates: { ...updates },
      snapshot: this.toSnapshot({ ...session }),
    };
    let history = this.sessionHistory.get(userId);
    if (!history) {
      history = [];
      this.sessionHistory.set(userId, history);
    }
    history.push(entry);
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.shift();
    }
    Object.assign(session, updates);
    this.saveSessions();
  }

  getSessionHistory(userId: number): SessionHistoryEntry[] {
    return this.sessionHistory.get(userId) ?? [];
  }

  clearSessionHistory(userId: number): void {
    this.sessionHistory.set(userId, []);
  }

  resetSession(userId: number): void {
    this.logger.log(`Reset session for user ${userId}`);
    this.sessions.set(userId, this.createFreshSession());
    this.clearSessionHistory(userId);
    this.saveSessions();
  }

  getAllSessions(): Map<number, Session> {
    return this.sessions;
  }

  getSessionsToResume(): Map<number, Session> {
    const resumable = new Map<number, Session>();
    for (const [userId, session] of this.sessions) {
      if (session.state === State.RUNNING) {
        resumable.set(userId, session);
      }
    }
    return resumable;
  }

  private toSnapshot(session: Session): SessionSnapshot {
    return {
      state: session.state,
      projectName: session.projectName,
      projectDir: session.projectDir,
      prdSummary: session.prdSummary,
      clarifyingQuestions: session.clarifyingQuestions,
      clarifyingAnswers: session.clarifyingAnswers,
      prdJson: session.prdJson,
      prdMarkdown: session.prdMarkdown,
      currentIteration: session.currentIteration,
      currentStory: session.currentStory,
      completed: session.completed,
      projectContext: session.projectContext,
      startedAt: session.startedAt,
      estimatedEndAt: session.estimatedEndAt,
    };
  }

  private toPersistedSession(session: Session): PersistedSession {
    const { abortController: _, ...rest } = session;
    return rest;
  }

  private saveSessions(): void {
    try {
      const data: Record<string, PersistedSession> = {};
      for (const [userId, session] of this.sessions) {
        data[String(userId)] = this.toPersistedSession(session);
      }
      writeFileSync(this.configService.get('SESSION_STORE_PATH', './sessions.json'), JSON.stringify(data, null, 2));
    } catch (err) {
      this.logger.error('Failed to save sessions to disk:', err);
    }
  }

  private loadSessions(): number {
    let count = 0;
    try {
      const raw = readFileSync(this.configService.get('SESSION_STORE_PATH', './sessions.json'), 'utf-8');
      const data: Record<string, PersistedSession> = JSON.parse(raw);

      for (const [key, persisted] of Object.entries(data)) {
        const userId = Number(key);
        if (Number.isNaN(userId)) continue;

        if (persisted.state === State.RUNNING) {
          this.logger.log(`User ${userId} was RUNNING — will resume after startup`);
        }

        const session: Session = {
          ...persisted,
          abortController: null,
        };
        this.sessions.set(userId, session);
        count++;
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error('Failed to load sessions from disk:', err);
      }
    }
    return count;
  }

  private createFreshSession(): Session {
    return {
      state: State.IDLE,
      projectName: null,
      projectDir: null,
      prdSummary: null,
      clarifyingQuestions: null,
      clarifyingAnswers: null,
      prdJson: null,
      prdMarkdown: null,
      currentIteration: 0,
      currentStory: null,
      completed: false,
      projectContext: null,
      abortController: null,
      prdConversation: null,
      startedAt: null,
      estimatedEndAt: null,
    };
  }
}
