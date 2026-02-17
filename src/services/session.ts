/**
 * SessionManager — tracks per-user conversation state.
 *
 * States flow:
 *   IDLE → AWAITING_PROJECT_NAME → AWAITING_PRD_SUMMARY → AWAITING_CLARIFICATIONS
 *        → REVIEWING_PRD → RUNNING → IDLE
 *
 * Session state history is tracked for debugging via getSessionHistory().
 *
 * Sessions are persisted to disk (SESSION_STORE_PATH) so state survives restarts.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { env } from "../env.js";
import type { Conversation } from "./openrouter.js";

const MAX_HISTORY_ENTRIES = 100;

/** Serializable snapshot of session state (excludes abortController). */
export interface SessionSnapshot {
  state: StateValue;
  projectName: string | null;
  projectDir: string | null;
  prdSummary: string | null;
  clarifyingQuestions: string | null;
  clarifyingAnswers: string | null;
  prdJson: PrdJson | null;
  prdMarkdown: string | null;
  currentIteration: number;
  currentStory: string | null;
  completed: boolean;
  projectContext: string | null;
}

/** Single entry in session state history. */
export interface SessionHistoryEntry {
  timestamp: number;
  updates: Partial<Session>;
  snapshot: SessionSnapshot;
}

export const State = {
  IDLE: "IDLE",
  AWAITING_PROJECT_NAME: "AWAITING_PROJECT_NAME",
  AWAITING_PROJECT_SELECTION: "AWAITING_PROJECT_SELECTION",
  AWAITING_PRD_SUMMARY: "AWAITING_PRD_SUMMARY",
  AWAITING_CLARIFICATIONS: "AWAITING_CLARIFICATIONS",
  REVIEWING_PRD: "REVIEWING_PRD",
  AWAITING_MODIFICATIONS: "AWAITING_MODIFICATIONS",
  RUNNING: "RUNNING",
} as const;

export type StateValue = (typeof State)[keyof typeof State];

export interface Session {
  state: StateValue;
  projectName: string | null;
  projectDir: string | null;
  prdSummary: string | null;
  clarifyingQuestions: string | null;
  clarifyingAnswers: string | null;
  prdJson: PrdJson | null;
  prdMarkdown: string | null;
  currentIteration: number;
  currentStory: string | null;
  completed: boolean;
  projectContext: string | null;
  abortController: AbortController | null;
  prdConversation: Conversation | null;
}

/** Session fields that can be serialized to JSON (excludes abortController). */
type PersistedSession = Omit<Session, "abortController">;

export interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  notes?: string;
}

export interface PrdJson {
  project: string;
  branchName: string;
  description: string;
  userStories: UserStory[];
}

const sessions = new Map<number, Session>();
const sessionHistory = new Map<number, SessionHistoryEntry[]>();

// ── Persistence ──────────────────────────────────────────────────────

function toPersistedSession(session: Session): PersistedSession {
  // Destructure out the non-serializable field
  const { abortController: _, ...rest } = session;
  return rest;
}

function saveSessions(): void {
  try {
    const data: Record<string, PersistedSession> = {};
    for (const [userId, session] of sessions) {
      data[String(userId)] = toPersistedSession(session);
    }
    writeFileSync(env.SESSION_STORE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[session] Failed to save sessions to disk:", err);
  }
}

export function loadSessions(): number {
  let count = 0;
  try {
    const raw = readFileSync(env.SESSION_STORE_PATH, "utf-8");
    const data: Record<string, PersistedSession> = JSON.parse(raw);

    for (const [key, persisted] of Object.entries(data)) {
      const userId = Number(key);
      if (Number.isNaN(userId)) continue;

      // RUNNING state can't be resumed (AbortController / child process lost),
      // so gracefully degrade to IDLE.
      if (persisted.state === State.RUNNING) {
        console.log(
          `[session] User ${userId} was RUNNING — resetting to IDLE`,
        );
        persisted.state = State.IDLE;
        persisted.completed = false;
      }

      const session: Session = {
        ...persisted,
        abortController: null,
      };
      sessions.set(userId, session);
      count++;
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[session] Failed to load sessions from disk:", err);
    }
  }
  return count;
}

// ── Snapshots & history ──────────────────────────────────────────────

function toSnapshot(session: Session): SessionSnapshot {
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
  };
}

// ── Public API ───────────────────────────────────────────────────────

export function getSession(userId: number): Session {
  if (!sessions.has(userId)) {
    console.log(`[session] New session for user ${userId}`);
    sessions.set(userId, createFreshSession());
  }
  return sessions.get(userId)!;
}

export function updateSession(userId: number, updates: Partial<Session>): void {
  const session = getSession(userId);
  const entry: SessionHistoryEntry = {
    timestamp: Date.now(),
    updates: { ...updates },
    snapshot: toSnapshot({ ...session }),
  };
  let history = sessionHistory.get(userId);
  if (!history) {
    history = [];
    sessionHistory.set(userId, history);
  }
  history.push(entry);
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.shift();
  }
  Object.assign(session, updates);
  saveSessions();
}

export function getSessionHistory(userId: number): SessionHistoryEntry[] {
  return sessionHistory.get(userId) ?? [];
}

export function clearSessionHistory(userId: number): void {
  sessionHistory.set(userId, []);
}

export function resetSession(userId: number): void {
  console.log(`[session] Reset session for user ${userId}`);
  sessions.set(userId, createFreshSession());
  clearSessionHistory(userId);
  saveSessions();
}

function createFreshSession(): Session {
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
  };
}
