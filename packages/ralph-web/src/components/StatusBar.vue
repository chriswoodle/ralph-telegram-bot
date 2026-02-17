<script setup lang="ts">
import { computed } from 'vue';
import type { StatusResponse, SessionSummary, StateValue } from '../types/api.types';

const props = defineProps<{
  status: StatusResponse | null;
  session: SessionSummary | null;
}>();

const uptime = computed(() => {
  if (!props.status) return '--';
  const s = Math.floor(props.status.uptime);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
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

const stateLabel = computed(() => {
  if (!props.session) return 'No Session';
  return props.session.state.replace(/_/g, ' ');
});

const stateColor = computed(() => {
  if (!props.session) return 'var(--foreground-dim)';
  return stateColors[props.session.state] ?? 'var(--foreground-dim)';
});
</script>

<template>
  <div class="status-bar">
    <div class="status-item">
      <span class="status-label">Uptime</span>
      <span class="status-value">{{ uptime }}</span>
    </div>

    <div class="status-item">
      <span class="status-label">State</span>
      <span class="state-badge" :style="{ '--state-color': stateColor }">
        {{ stateLabel }}
      </span>
    </div>

    <div v-if="status" class="status-item">
      <span class="status-label">Sessions</span>
      <span class="status-value">
        {{ status.sessions.running }} / {{ status.sessions.total }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: var(--gap-lg);
  padding: var(--gap-sm) var(--gap-lg);
  background: var(--background-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}

.status-item {
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
}

.status-label {
  font-size: var(--text-xs);
  color: var(--foreground-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
}

.status-value {
  font-size: var(--text-sm);
  color: var(--foreground);
  font-weight: 500;
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
}
</style>
