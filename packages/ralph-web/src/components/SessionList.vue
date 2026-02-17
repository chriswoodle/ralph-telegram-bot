<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { SessionSummary, StateValue } from '../types/api.types';

defineProps<{
  sessions: SessionSummary[];
}>();

const now = ref(Date.now());
let tickId: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  tickId = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (tickId) clearInterval(tickId);
});

const stateColors: Record<StateValue, string> = {
  IDLE: 'var(--foreground-dim)',
  AWAITING_PROJECT_NAME: 'var(--status-warning)',
  AWAITING_PROJECT_SELECTION: 'var(--status-warning)',
  AWAITING_PRD_SUMMARY: 'var(--status-warning)',
  AWAITING_CLARIFICATIONS: 'var(--status-warning)',
  REVIEWING_PRD: 'var(--status-info)',
  AWAITING_MODIFICATIONS: 'var(--status-warning)',
  RUNNING: 'var(--status-success)',
};

function formatState(state: StateValue): string {
  return state.replace(/_/g, ' ');
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getTimeProgress(session: SessionSummary) {
  if (!session.startedAt) return null;

  const elapsed = now.value - session.startedAt;
  const hasEstimate = session.estimatedEndAt != null && session.estimatedEndAt > session.startedAt;

  if (!hasEstimate) {
    return {
      elapsed,
      elapsedLabel: formatDuration(elapsed),
      percent: null,
      remainingLabel: null,
      estimatedTotalLabel: null,
    };
  }

  const totalEstimated = session.estimatedEndAt! - session.startedAt;
  const remaining = Math.max(0, session.estimatedEndAt! - now.value);
  const percent = Math.min(100, Math.max(0, (elapsed / totalEstimated) * 100));

  return {
    elapsed,
    elapsedLabel: formatDuration(elapsed),
    percent,
    remainingLabel: formatDuration(remaining),
    estimatedTotalLabel: formatDuration(totalEstimated),
  };
}
</script>

<template>
  <div class="session-list">
    <h2 class="section-title">Sessions</h2>

    <div v-if="sessions.length === 0" class="empty">No active sessions</div>

    <div v-else class="session-grid">
      <div
        v-for="session in sessions"
        :key="session.userId"
        class="session-card"
        :class="{ 'is-running': session.state === 'RUNNING' }"
      >
        <div class="session-header">
          <span class="user-id">User {{ session.userId }}</span>
          <span
            class="state-badge"
            :style="{ '--state-color': stateColors[session.state] ?? 'var(--foreground-dim)' }"
          >
            {{ formatState(session.state) }}
          </span>
        </div>

        <div class="session-details">
          <div v-if="session.projectName" class="detail-row">
            <span class="detail-label">Project</span>
            <span class="detail-value">{{ session.projectName }}</span>
          </div>
          <div v-if="session.currentStory" class="detail-row">
            <span class="detail-label">Story</span>
            <span class="detail-value">{{ session.currentStory }}</span>
          </div>
          <div v-if="session.currentIteration > 0" class="detail-row">
            <span class="detail-label">Progress</span>
            <span class="detail-value mono">{{ session.currentIteration }} / {{ session.totalStories }} stories</span>
          </div>
        </div>

        <!-- Running progress section -->
        <div v-if="session.state === 'RUNNING' && session.startedAt" class="progress-section">
          <div class="progress-track">
            <div
              class="progress-fill"
              :class="{ 'has-estimate': getTimeProgress(session)?.percent != null }"
              :style="{
                width: getTimeProgress(session)?.percent != null
                  ? getTimeProgress(session)!.percent + '%'
                  : '100%',
              }"
            />
          </div>

          <div class="time-row">
            <span class="time-label">
              {{ getTimeProgress(session)?.elapsedLabel }} elapsed
            </span>
            <span
              v-if="getTimeProgress(session)?.remainingLabel"
              class="time-label time-remaining"
            >
              ~{{ getTimeProgress(session)!.remainingLabel }} remaining
            </span>
            <span
              v-else
              class="time-label time-estimating"
            >
              Estimating...
            </span>
          </div>
        </div>

        <div v-if="session.completed" class="completed-badge">Completed</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
}

.section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--foreground-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.empty {
  font-size: var(--text-sm);
  color: var(--foreground-dim);
}

.session-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--gap-md);
}

.session-card {
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
  padding: var(--gap-md);
  background: var(--background-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color 0.3s ease;
}

.session-card.is-running {
  border-color: color-mix(in srgb, var(--status-success) 40%, var(--border));
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-sm);
}

.user-id {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--foreground);
  font-family: var(--font-mono);
}

.state-badge {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--state-color) 20%, transparent);
  color: var(--state-color);
  text-transform: capitalize;
  white-space: nowrap;
}

.session-details {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-sm);
}

.detail-label {
  font-size: var(--text-xs);
  color: var(--foreground-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
  flex-shrink: 0;
}

.detail-value {
  font-size: var(--text-sm);
  color: var(--foreground-muted);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-value.mono {
  font-family: var(--font-mono);
}

/* Progress section for running sessions */
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: var(--gap-xs);
}

.progress-track {
  width: 100%;
  height: 6px;
  background: var(--background-elevated);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 1s linear;
  position: relative;
}

/* When we have a real time estimate, show solid animated fill */
.progress-fill.has-estimate {
  background: linear-gradient(
    90deg,
    var(--status-success),
    color-mix(in srgb, var(--status-success) 80%, var(--accent))
  );
  animation: progress-pulse 2s ease-in-out infinite;
}

/* When estimating (no estimate yet), show indeterminate shimmer */
.progress-fill:not(.has-estimate) {
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--status-success) 30%,
    color-mix(in srgb, var(--status-success) 60%, var(--accent)) 50%,
    var(--status-success) 70%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: progress-shimmer 1.5s linear infinite;
  opacity: 0.5;
}

@keyframes progress-pulse {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 4px color-mix(in srgb, var(--status-success) 30%, transparent);
  }
  50% {
    opacity: 0.8;
    box-shadow: 0 0 8px color-mix(in srgb, var(--status-success) 50%, transparent);
  }
}

@keyframes progress-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-sm);
}

.time-label {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--foreground-dim);
}

.time-remaining {
  color: var(--status-success);
}

.time-estimating {
  color: var(--foreground-dim);
  font-style: italic;
  font-family: var(--font-sans);
  animation: fade-pulse 1.5s ease-in-out infinite;
}

@keyframes fade-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.completed-badge {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--status-success);
  padding: 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--status-success) 20%, transparent);
  align-self: flex-start;
}
</style>
